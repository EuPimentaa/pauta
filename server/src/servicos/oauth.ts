/**
 * O Pauta como servidor de autorização OAuth 2.1 do MCP (F7, API.md §F.2 a §F.4; banco: 100_oauth.sql): metadados,
 * registro dinâmico (RFC 7591) com a lista fechada de redirect_uri, pedido de autorização amarrado ao navegador (cookie
 * do pedido), decisão na tela /autorizar, concessões ("conexões") e a revogação delas, inclusive quando a senha, o papel
 * ou o estado da pessoa mudam (as conexões seguem as sessões). Os tokens ficam em oauth-tokens.ts.
 *
 * Nada aqui loga o corpo, a query, um token, um código, o state ou o cookie do pedido.
 */
import { createHash, randomBytes } from 'node:crypto'
import type {
  ConexaoMcp, DecisaoAutorizacaoSaida, DestinoConexao, ErroOAuth, Id, ListarConexoesConsulta, ListarConexoesSaida,
  MetadadosRecursoProtegido, MetadadosServidorAutorizacao, MotivoRevogacaoConexao, PedidoAutorizacao,
  RegistroClienteSaida, TipoClienteOAuth,
} from '../../../shared/tipos/index.ts'
import {
  ESCOPOS_OAUTH, FAIXA_ANTHROPIC, LIMITES_MCP, PRAZOS_OAUTH, REDIRECTS_CLAUDE,
} from '../../../shared/tipos/index.ts'
import { umaLinha } from '../../../shared/logica/mcp-texto.ts'
import type { Ator } from '../auth.ts'
import { config, origemApp } from '../config.ts'
import { agora, marcadores, novoId, rodar, todos, tx, um, type Db } from '../db.ts'
import { ErroHttp, naoEncontrado } from '../erros.ts'
import { iguaisSeguro } from './cripto.ts'
import { emitirObjeto } from './eventos.ts'
import { ipNaFaixa, usar } from './mcp-limites.ts'
import { exigir } from './permissoes.ts'

type Linha = Record<string, unknown>

/** Códigos de erro do OAuth que o Pauta usa (os do contrato + os que só saem no redirecionamento da autorização). */
export type CodigoErroOAuth = ErroOAuth['error'] | 'access_denied' | 'unsupported_response_type'

/** Erro no formato das RFCs (`{ error, error_description }`), nunca ErroApi. */
export class ErroOAuthHttp extends Error {
  readonly status: number
  readonly erro: CodigoErroOAuth
  readonly esperaSeg: number | null

  constructor(status: number, erro: CodigoErroOAuth, descricao: string, esperaSeg: number | null = null) {
    super(descricao)
    this.name = 'ErroOAuthHttp'
    this.status = status
    this.erro = erro
    this.esperaSeg = esperaSeg
  }

  corpo(): { error: CodigoErroOAuth; error_description: string } {
    return { error: this.erro, error_description: this.message }
  }
}

/** Ator dos efeitos do sistema (revogação por reuso, pelo cliente, por desativação): `a` e `t` nulos no SSE. */
const SISTEMA: Ator = { tipo: 'sistema', usuario: null, papel: null, traceId: null, ip: '' }

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const somarMs = (ms: number) => new Date(Date.parse(agora()) + ms).toISOString()

// ─────────────────────────────── endereços e metadados ───────────────────────────────

/** Emissor = a origem do APP_URL, sem barra ("https://demandas.meltcomunicacao.com.br"). */
export function emissor(): string {
  return origemApp()
}

/** O endereço que se cola no Claude (a audiência dos tokens): emissor + '/mcp'. */
export function recursoMcp(): string {
  return `${emissor()}/mcp`
}

/**
 * Forma canônica de um `resource` (RFC 8707, como o Claude manda): esquema e host minúsculos, sem porta padrão, sem
 * fragmento e sem barra no fim. Inválido → null.
 */
export function normalizarResource(valor: string | null | undefined): string | null {
  if (!valor) return null
  let u: URL
  try {
    u = new URL(valor)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  const caminho = u.pathname.replace(/\/+$/, '')
  return `${u.protocol}//${u.host}${caminho}${u.search}`
}

/** O `resource` é o nosso (ausente também vale: é o nosso). */
export function resourceNosso(valor: string | null | undefined): boolean {
  if (valor === null || valor === undefined || valor === '') return true
  return normalizarResource(valor) === normalizarResource(recursoMcp())
}

export function metadadosRecurso(): MetadadosRecursoProtegido {
  return {
    resource: recursoMcp(), authorization_servers: [emissor()], scopes_supported: ['pauta'],
    bearer_methods_supported: ['header'], resource_name: config.appNome,
  }
}

export function metadadosServidor(): MetadadosServidorAutorizacao {
  const base = emissor()
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/autorizar`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/registrar`,
    revocation_endpoint: `${base}/oauth/revogar`,
    scopes_supported: ['pauta', 'offline_access'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
  }
}

/** O desafio do 401 do /mcp (sem token: sem `error`; token inválido: `error="invalid_token"`). */
export function desafioBearer(tokenInvalido: boolean): string {
  const base = `Bearer resource_metadata="${emissor()}/.well-known/oauth-protected-resource/mcp", scope="pauta"`
  return tokenInvalido ? `${base}, error="invalid_token"` : base
}

// ─────────────────────────────── redirect_uri ───────────────────────────────

const HOSTS_LOOPBACK = new Set(['localhost', '127.0.0.1'])

function url(valor: string): URL | null {
  try {
    return new URL(valor)
  } catch {
    return null
  }
}

/**
 * Loopback do Claude Code: `http://localhost[:porta]/callback` ou `http://127.0.0.1[:porta]/callback`, sem query, sem
 * fragmento, sem usuário e senha (conferido pelo `new URL` e, para `?`/`#` vazios, pelo texto).
 */
export function ehLoopback(valor: string): boolean {
  const u = url(valor)
  return !!u && u.protocol === 'http:' && HOSTS_LOOPBACK.has(u.hostname) && u.pathname === '/callback' && u.search === ''
    && u.hash === '' && u.username === '' && u.password === '' && !valor.includes('?') && !valor.includes('#')
}

/**
 * A lista fechada (API.md §F.3), com a lista ATUAL do ambiente: os do Claude e os de MCP_REDIRECTS_EXTRAS por igualdade
 * de texto, e o loopback pelo `new URL`. Roda no registro, no /oauth/autorizar, na troca do código, no refresh e no /mcp.
 */
export function redirectPermitido(valor: string): boolean {
  if (ehLoopback(valor)) return true
  return (REDIRECTS_CLAUDE as readonly string[]).includes(valor) || config.mcpRedirectsExtras.includes(valor)
}

export function destinoDe(redirect: string): DestinoConexao {
  if ((REDIRECTS_CLAUDE as readonly string[]).includes(redirect)) return 'claude_ai'
  if (ehLoopback(redirect)) return 'claude_code'
  return 'outro'
}

export function hostDe(redirect: string): string {
  return url(redirect)?.hostname ?? redirect
}

/** Um dos registrados pelo cliente: igual, ou loopback igual a menos da porta (RFC 8252 §7.3). */
export function redirectRegistrado(registrados: readonly string[], pedido: string): boolean {
  if (registrados.includes(pedido)) return true
  if (!ehLoopback(pedido)) return false
  const p = new URL(pedido)
  return registrados.some((r) => {
    if (!ehLoopback(r)) return false
    const u = new URL(r)
    return u.hostname === p.hostname && u.pathname === p.pathname
  })
}

// ─────────────────────────────── clientes (registro dinâmico) ───────────────────────────────

interface LinhaCliente {
  id: string
  nome: string
  redirect_uris: string
  tipo: TipoClienteOAuth
  criado_em: string
}

export function carregarClienteOAuth(db: Db, id: string): (LinhaCliente & { redirects: string[] }) | null {
  if (!id || id.length > 100) return null
  const l = um<LinhaCliente>(db, 'SELECT id, nome, redirect_uris, tipo, criado_em FROM oauth_cliente WHERE id = ?', id)
  return l ? { ...l, redirects: JSON.parse(l.redirect_uris) as string[] } : null
}

const GRANTS_ACEITOS = new Set(['authorization_code', 'refresh_token'])

function listaDeTextos(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v as string[] : null
}

/**
 * Teto de clientes sem concessão (o claude.ai registra um a cada conexão nova): ao chegar nele, apaga os que nunca
 * tiveram concessão e não têm pedido vivo, criados há mais de 15 min. Nunca recusa o registro por isso.
 */
function abrirEspaco(db: Db): void {
  const instante = agora()
  const semConcessao = `NOT EXISTS (SELECT 1 FROM oauth_concessao oc WHERE oc.cliente_id = c.id)`
  const n = um<{ n: number }>(db, `SELECT count(*) AS n FROM oauth_cliente c WHERE ${semConcessao}`)!.n
  if (n < LIMITES_MCP.clientesSemConcessaoMax) return
  const limite = new Date(Date.parse(instante) - 15 * 60_000).toISOString()
  rodar(db, `DELETE FROM oauth_cliente WHERE id IN (
      SELECT c.id FROM oauth_cliente c WHERE ${semConcessao} AND c.criado_em < ?
         AND NOT EXISTS (SELECT 1 FROM oauth_pedido p WHERE p.cliente_id = c.id
                          AND (p.expira_em > ? OR (p.codigo_expira_em > ? AND p.codigo_usado_em IS NULL)))
       ORDER BY c.criado_em)`, limite, instante, instante)
}

/** O corpo do registro pede só redirects de loopback (o Claude Code)? Corpo inválido: não (conta no limite de sempre). */
function soLoopback(corpo: unknown): boolean {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return false
  const redirects = listaDeTextos((corpo as Record<string, unknown>).redirect_uris)
  return !!redirects && redirects.length > 0 && redirects.length <= 10 && redirects.every((x) => x.length <= 500 && ehLoopback(x))
}

/**
 * POST /oauth/registrar (RFC 7591). `ip`: o IP real. O limite por hora é por IP: folgado na faixa da Anthropic (o
 * claude.ai) e, fora dela, um para o Claude Code (só loopback; 30, porque a equipe inteira divide o IP do escritório) e
 * outro para o resto (10). Corpo inválido conta no de 10.
 */
export function registrarCliente(db: Db, corpo: unknown, ip: string): RegistroClienteSaida {
  const daAnthropic = ipNaFaixa(ip, FAIXA_ANTHROPIC)
  const loopback = !daAnthropic && soLoopback(corpo)
  const max = daAnthropic ? LIMITES_MCP.registrosPorHoraIpAnthropic
    : loopback ? LIMITES_MCP.registrosPorHoraIpLoopback : LIMITES_MCP.registrosPorHoraIp
  const r = usar(`oauth-registro${loopback ? '-loopback' : ''}|${ip}`, max, 3600)
  if (!r.ok) throw new ErroOAuthHttp(429, 'temporarily_unavailable', 'Muitos registros deste endereço. Tente mais tarde.', r.esperaSeg)

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroOAuthHttp(400, 'invalid_client_metadata', 'O corpo precisa ser um objeto JSON.')
  }
  const e = corpo as Record<string, unknown>
  const redirects = listaDeTextos(e.redirect_uris)
  if (!redirects || redirects.length === 0 || redirects.length > 10 || redirects.some((x) => x.length > 500 || !redirectPermitido(x))) {
    throw new ErroOAuthHttp(400, 'invalid_redirect_uri', 'Endereço de retorno não permitido.')
  }
  if (e.grant_types !== undefined) {
    const g = listaDeTextos(e.grant_types)
    if (!g || g.some((x) => !GRANTS_ACEITOS.has(x))) {
      throw new ErroOAuthHttp(400, 'invalid_client_metadata', 'grant_types aceitos: authorization_code e refresh_token.')
    }
  }
  if (e.response_types !== undefined) {
    const rt = listaDeTextos(e.response_types)
    if (!rt || rt.some((x) => x !== 'code')) throw new ErroOAuthHttp(400, 'invalid_client_metadata', 'response_types aceito: code.')
  }
  const nome = umaLinha(typeof e.client_name === 'string' ? e.client_name : '', 120) || 'Cliente sem nome'
  const unicos = [...new Set(redirects)]
  const tipo: TipoClienteOAuth = unicos.some(ehLoopback) ? 'native' : 'web'

  return tx(db, () => {
    abrirEspaco(db)
    const id = randomBytes(18).toString('base64url')
    const instante = agora()
    rodar(db, 'INSERT INTO oauth_cliente (id, nome, redirect_uris, tipo, metodo_auth, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
      id, nome, JSON.stringify(unicos), tipo, 'none', instante)
    return {
      client_id: id, client_id_issued_at: Math.floor(Date.parse(instante) / 1000), client_name: nome, redirect_uris: unicos,
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
      application_type: tipo, scope: 'pauta',
    }
  })
}

// ─────────────────────────────── pedido de autorização ───────────────────────────────

/** O que GET /oauth/autorizar faz: página de erro sem redirecionar, redirecionar com erro, ou o pedido gravado. */
export type ResultadoAutorizar =
  | { tipo: 'pagina'; status: 400 | 429; texto: string; esperaSeg?: number }
  | { tipo: 'redirecionar'; url: string }
  | { tipo: 'pedido'; id: string; cookie: string }

/** O redirect com os parâmetros da resposta (sempre com `iss`, RFC 9207; `state` quando veio). */
export function urlDeRetorno(redirect: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(redirect)
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) u.searchParams.set(k, v)
  u.searchParams.set('iss', emissor())
  return u.toString()
}

const PAGINA_INVALIDA = 'Este pedido de conexão não é válido.'

/** GET /oauth/autorizar (API.md §F.3). `ip`: o do navegador da pessoa (60 por hora). */
export function iniciarAutorizacao(db: Db, q: Record<string, string | undefined>, ip: string): ResultadoAutorizar {
  const lim = usar(`oauth-autorizar|${ip}`, LIMITES_MCP.autorizacoesPorHoraIp, 3600)
  if (!lim.ok) return { tipo: 'pagina', status: 429, texto: 'Muitos pedidos de conexão. Espere um pouco e tente de novo.', esperaSeg: lim.esperaSeg }

  const cliente = carregarClienteOAuth(db, q.client_id ?? '')
  const redirect = q.redirect_uri ?? ''
  if (!cliente || !redirect || !redirectRegistrado(cliente.redirects, redirect) || !redirectPermitido(redirect)) {
    return { tipo: 'pagina', status: 400, texto: PAGINA_INVALIDA }
  }
  const state = q.state ?? null
  const erro = (error: CodigoErroOAuth, descricao: string): ResultadoAutorizar => ({
    tipo: 'redirecionar',
    url: urlDeRetorno(redirect, { error, error_description: descricao, state: state && state.length <= 1024 ? state : null }),
  })
  if (q.response_type !== 'code') return erro('unsupported_response_type', 'Só response_type=code.')
  const desafio = q.code_challenge ?? ''
  if (!desafio || q.code_challenge_method !== 'S256') return erro('invalid_request', 'PKCE com S256 é obrigatório.')
  if (!/^[A-Za-z0-9_-]{43}$/.test(desafio)) return erro('invalid_request', 'code_challenge inválido.')
  if (state !== null && state.length > 1024) return erro('invalid_request', 'state longo demais.')
  const escopos = (q.scope ?? '').split(' ').filter(Boolean)
  if (escopos.some((s) => !(ESCOPOS_OAUTH as readonly string[]).includes(s))) return erro('invalid_scope', 'Escopo desconhecido.')
  if (!resourceNosso(q.resource)) return erro('invalid_target', 'Este servidor não emite tokens para esse recurso.')

  return tx(db, () => {
    const instante = agora()
    // o 6º pedido pendente do mesmo cliente apaga o mais antigo
    const pendentes = todos<{ id: string }>(db, `SELECT id FROM oauth_pedido WHERE cliente_id = ? AND decisao IS NULL AND expira_em > ?
      ORDER BY criado_em, rowid`, cliente.id, instante)
    const sobra = pendentes.length - (LIMITES_MCP.pedidosPendentesPorCliente - 1)
    if (sobra > 0) {
      const velhos = pendentes.slice(0, sobra).map((p) => p.id)
      rodar(db, `DELETE FROM oauth_pedido WHERE id IN (${marcadores(velhos.length)})`, ...velhos)
    }
    const id = randomBytes(32).toString('base64url')
    const cookie = randomBytes(32).toString('base64url')
    rodar(db, `INSERT INTO oauth_pedido (id, cliente_id, redirect_uri, code_challenge, escopo, state, resource, navegador_hash,
                 criado_em, expira_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, cliente.id, redirect, desafio, escopos.join(' ') || 'pauta', state, normalizarResource(recursoMcp()), sha256(cookie),
      instante, somarMs(PRAZOS_OAUTH.pedidoMin * 60_000))
    rodar(db, 'UPDATE oauth_cliente SET ultimo_uso_em = ? WHERE id = ?', instante, cliente.id)
    return { tipo: 'pedido', id, cookie }
  })
}

interface LinhaPedido {
  id: string
  cliente_id: string
  redirect_uri: string
  code_challenge: string
  escopo: string
  state: string | null
  resource: string
  navegador_hash: string
  criado_em: string
  expira_em: string
  decisao: string | null
  usuario_id: string | null
  substituir: number | null
  codigo_hash: string | null
  codigo_expira_em: string | null
  codigo_usado_em: string | null
  concessao_id: string | null
}

const OUTRO_NAVEGADOR = 'Abra a conexão pelo Claude neste navegador.'

/**
 * O pedido para a tela e a decisão: 404 se não existe; 410 se o cookie do pedido não é deste navegador (comparação em
 * tempo constante), se venceu ou se já foi decidido. O cookie é conferido primeiro: um link encaminhado não diz nada.
 */
function pedidoDoNavegador(db: Db, id: string, cookie: string | undefined): LinhaPedido {
  const p = id && id.length <= 100 ? um<LinhaPedido>(db, 'SELECT * FROM oauth_pedido WHERE id = ?', id) : undefined
  if (!p) throw naoEncontrado('Pedido de conexão não encontrado.')
  if (!cookie || !iguaisSeguro(sha256(cookie), p.navegador_hash)) {
    throw new ErroHttp(410, 'token_invalido', OUTRO_NAVEGADOR, { motivo: 'outro_navegador' })
  }
  if (p.decisao !== null) {
    throw new ErroHttp(410, 'token_invalido', 'Este pedido já foi respondido. Volte ao Claude e conecte de novo.', { motivo: 'decidido' })
  }
  if (p.expira_em <= agora()) {
    throw new ErroHttp(410, 'token_invalido', 'Este pedido expirou. Volte ao Claude e conecte de novo.', { motivo: 'vencido' })
  }
  return p
}

/** Conexões ativas da pessoa para o mesmo destino (claude.ai, Claude Code, outro). */
function ativasDoDestino(db: Db, usuarioId: Id, destino: DestinoConexao): { id: string }[] {
  return todos<{ id: string; redirect_uri: string }>(db,
    'SELECT id, redirect_uri FROM oauth_concessao WHERE usuario_id = ? AND revogada_em IS NULL', usuarioId)
    .filter((c) => destinoDe(c.redirect_uri) === destino)
}

/** GET /api/oauth/pedidos/:id */
export function lerPedido(db: Db, id: string, cookie: string | undefined, ator: Ator): PedidoAutorizacao {
  const p = pedidoDoNavegador(db, id, cookie)
  const cliente = carregarClienteOAuth(db, p.cliente_id)!
  const destino = destinoDe(p.redirect_uri)
  return {
    id: p.id, nomeCliente: cliente.nome, destino, hostRedirect: hostDe(p.redirect_uri), criadoEm: p.criado_em,
    expiraEm: p.expira_em, anteriores: ativasDoDestino(db, ator.usuario!.id, destino).length,
  }
}

/**
 * POST /api/oauth/pedidos/:id/decisao: grava a decisão numa transação que exige o pedido ainda pendente
 * (`changes = 1`) e devolve para onde a tela vai (code, state e iss; ou error=access_denied).
 */
export function decidirPedido(db: Db, id: string, cookie: string | undefined, ator: Ator,
  e: { permitir: boolean; substituir?: boolean }): DecisaoAutorizacaoSaida {
  return tx(db, () => {
    const p = pedidoDoNavegador(db, id, cookie)
    const instante = agora()
    const usuarioId = ator.usuario!.id
    if (!e.permitir) {
      const r = rodar(db, `UPDATE oauth_pedido SET decisao = 'negado', decidido_em = ?, usuario_id = ?
        WHERE id = ? AND decisao IS NULL AND expira_em > ?`, instante, usuarioId, p.id, instante)
      if (r.changes !== 1) throw new ErroHttp(410, 'token_invalido', 'Este pedido já foi respondido.', { motivo: 'decidido' })
      return { redirecionar: urlDeRetorno(p.redirect_uri, {
        error: 'access_denied', error_description: 'A pessoa não autorizou.', state: p.state,
      }) }
    }
    const codigo = randomBytes(32).toString('base64url')
    const r = rodar(db, `UPDATE oauth_pedido SET decisao = 'permitido', decidido_em = ?, usuario_id = ?, substituir = ?,
        codigo_hash = ?, codigo_expira_em = ? WHERE id = ? AND decisao IS NULL AND expira_em > ?`,
      instante, usuarioId, e.substituir === false ? 0 : 1, sha256(codigo), somarMs(PRAZOS_OAUTH.codigoMin * 60_000), p.id, instante)
    if (r.changes !== 1) throw new ErroHttp(410, 'token_invalido', 'Este pedido já foi respondido.', { motivo: 'decidido' })
    return { redirecionar: urlDeRetorno(p.redirect_uri, { code: codigo, state: p.state }) }
  })
}

// ─────────────────────────────── concessões (conexões) ───────────────────────────────

interface LinhaConcessao {
  id: string
  usuario_id: string
  cliente_id: string
  redirect_uri: string
  resource: string
  criada_em: string
  ultimo_uso_em: string | null
  revogada_em: string | null
  motivo_revogacao: MotivoRevogacaoConexao | null
  nome_cliente: string
}

const SELECT_CONCESSAO = `SELECT oc.*, c.nome AS nome_cliente FROM oauth_concessao oc JOIN oauth_cliente c ON c.id = oc.cliente_id`

function mapearConexao(l: LinhaConcessao): ConexaoMcp {
  return {
    id: l.id, usuarioId: l.usuario_id, nomeCliente: l.nome_cliente, destino: destinoDe(l.redirect_uri),
    hostRedirect: hostDe(l.redirect_uri), criadaEm: l.criada_em, ultimoUsoEm: l.ultimo_uso_em, revogadaEm: l.revogada_em,
    motivoRevogacao: l.motivo_revogacao,
  }
}

export function carregarConexao(db: Db, id: Id): ConexaoMcp {
  const l = um<LinhaConcessao>(db, `${SELECT_CONCESSAO} WHERE oc.id = ?`, id)
  if (!l) throw naoEncontrado('Conexão não encontrada.')
  return mapearConexao(l)
}

/** SSE `conexao` (público usuario_admin: a dona e os admins), sempre o objeto inteiro. */
export function emitirConexao(db: Db, id: Id, ator: Ator): ConexaoMcp {
  const c = carregarConexao(db, id)
  emitirObjeto(db, 'conexao', c.id, c, ator, { publico: 'usuario_admin', usuarioId: c.usuarioId })
  return c
}

/**
 * Revoga uma concessão (uma vez: os tokens dela param no mesmo instante; nenhum nasce depois, gatilho da 100). Já
 * revogada: nada muda. `por`: quem revogou pela tela (nulo para o sistema). Devolve true se revogou agora.
 */
export function revogarConcessao(db: Db, id: Id, motivo: MotivoRevogacaoConexao, ator: Ator, por: Id | null = null): boolean {
  return tx(db, () => {
    const r = rodar(db, 'UPDATE oauth_concessao SET revogada_em = ?, revogada_por = ?, motivo_revogacao = ? WHERE id = ? AND revogada_em IS NULL',
      agora(), por, motivo, id)
    if (r.changes !== 1) return false
    rodar(db, 'UPDATE oauth_token SET filho_cifrado = NULL WHERE concessao_id = ? AND filho_cifrado IS NOT NULL', id)
    emitirConexao(db, id, ator)
    return true
  })
}

/**
 * As conexões seguem as sessões (API.md §F.4): trocar ou redefinir a senha ('credenciais'), mudar o papel ('papel') e
 * desativar ('desativacao') revogam todas as da pessoa, na mesma transação de `revogarSessoes`. Devolve quantas.
 */
export function revogarConexoesDe(db: Db, usuarioId: Id, motivo: MotivoRevogacaoConexao, ator: Ator = SISTEMA): number {
  const ativas = todos<{ id: string }>(db, 'SELECT id FROM oauth_concessao WHERE usuario_id = ? AND revogada_em IS NULL', usuarioId)
  let n = 0
  for (const c of ativas) if (revogarConcessao(db, c.id, motivo, ator)) n++
  return n
}

/**
 * Na troca do código: revoga a concessão ativa da pessoa com o mesmo cliente e, com `substituir`, as ativas com o mesmo
 * destino ('substituida'), depois cria a nova. Emite `conexao` de cada uma.
 */
export function criarConcessao(db: Db, p: { usuarioId: Id; clienteId: string; redirect: string; resource: string; substituir: boolean }): Id {
  const mesmas = todos<{ id: string }>(db, 'SELECT id FROM oauth_concessao WHERE usuario_id = ? AND cliente_id = ? AND revogada_em IS NULL',
    p.usuarioId, p.clienteId)
  for (const c of mesmas) revogarConcessao(db, c.id, 'substituida', SISTEMA)
  if (p.substituir) for (const c of ativasDoDestino(db, p.usuarioId, destinoDe(p.redirect))) revogarConcessao(db, c.id, 'substituida', SISTEMA)
  const id = novoId()
  rodar(db, `INSERT INTO oauth_concessao (id, usuario_id, cliente_id, escopo, redirect_uri, resource, criada_em)
             VALUES (?, ?, ?, 'pauta', ?, ?, ?)`, id, p.usuarioId, p.clienteId, p.redirect, p.resource, agora())
  emitirConexao(db, id, SISTEMA)
  return id
}

/** GET /api/conexoes (as próprias; `todas` só admin). Ativas primeiro, mais recentes primeiro. */
export function listarConexoes(db: Db, ator: Ator, c: ListarConexoesConsulta): ListarConexoesSaida {
  if (c.todas) exigir(ator, 'pessoas')
  const onde: string[] = []
  const params: unknown[] = []
  if (!c.todas) { onde.push('oc.usuario_id = ?'); params.push(ator.usuario!.id) }
  if (!c.incluirRevogadas) onde.push('oc.revogada_em IS NULL')
  const linhas = todos<LinhaConcessao>(db, `${SELECT_CONCESSAO} ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
    ORDER BY (oc.revogada_em IS NOT NULL), oc.criada_em DESC, oc.id LIMIT 500`, ...params)
  return { urlMcp: recursoMcp(), conexoes: linhas.map(mapearConexao) }
}

/** POST /api/conexoes/:id/revogar: a dona ('usuario') ou um admin ('admin'). De outra pessoa para quem não é admin: 404. */
export function revogarConexaoPelaTela(db: Db, id: Id, ator: Ator): ConexaoMcp {
  return tx(db, () => {
    const atual = carregarConexao(db, id)
    const eu = ator.usuario!.id
    const dona = atual.usuarioId === eu
    if (!dona && ator.papel !== 'admin') throw naoEncontrado('Conexão não encontrada.')
    if (atual.revogadaEm) return atual
    revogarConcessao(db, id, dona ? 'usuario' : 'admin', ator, eu)
    return carregarConexao(db, id)
  })
}

// ─────────────────────────────── poda ───────────────────────────────

/**
 * Tarefa oauth-poda (API.md §F.11): pedidos vencidos há mais de 1 dia, tokens vencidos há mais de 1 dia, clientes sem
 * nenhuma concessão criados há mais de 24 h (os pedidos vão junto) e o par guardado dos refresh trocados há mais de 60 s.
 */
export function podarOAuth(db: Db): { pedidos: number; tokens: number; clientes: number; filhos: number } {
  return tx(db, () => {
    const agoraMs = Date.parse(agora())
    const umDia = new Date(agoraMs - 86_400_000).toISOString()
    const tolerancia = new Date(agoraMs - PRAZOS_OAUTH.toleranciaRefreshSeg * 1000).toISOString()
    const pedidos = rodar(db, `DELETE FROM oauth_pedido WHERE expira_em < ? AND (codigo_expira_em IS NULL OR codigo_expira_em < ?)`,
      umDia, umDia).changes
    const tokens = rodar(db, 'DELETE FROM oauth_token WHERE expira_em < ?', umDia).changes
    const clientes = rodar(db, `DELETE FROM oauth_cliente WHERE criado_em < ?
      AND NOT EXISTS (SELECT 1 FROM oauth_concessao oc WHERE oc.cliente_id = oauth_cliente.id)`, umDia).changes
    const filhos = rodar(db, 'UPDATE oauth_token SET filho_cifrado = NULL WHERE filho_cifrado IS NOT NULL AND trocado_em < ?', tolerancia).changes
    return { pedidos, tokens, clientes, filhos }
  })
}

export { sha256 as hashOAuth, SISTEMA as atorSistemaOAuth }
export type { LinhaPedido, LinhaConcessao }
