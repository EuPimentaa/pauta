/**
 * Ambiente de teste de todos (PLANO §1.1.1): app + banco :memory: migrado + a fixture (pessoas, quadros, clientes),
 * `como(pessoa)` com cookie, X-Trace-Id e Origin, `criarDemanda({ ate })` por SQL e `relogio()`.
 * As funcionalidades podem criar test/<prefixo>-ajuda.ts com o que for só delas.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  Cliente, Coluna, CriarDemandaEntrada, Demanda, Instante, QuadroCompleto, Usuario,
} from '../../shared/tipos/index.ts'
import { completarAte } from '../scripts/ciclo-sql.ts'
import { criarApp } from '../src/app.ts'
import { atorDe, hashSenha, nomeCookie, type App, type Ator } from '../src/auth.ts'
import { configurar } from '../src/config.ts'
import { abrir, agora, fixarRelogio, migrar, novoId, rodar, todos, tx, um, type Db } from '../src/db.ts'
import { gravarAutomacao } from '../src/servicos/automacoes.ts'
import { carregarCliente, criarCliente, criarContato, definirResponsaveis } from '../src/servicos/clientes.ts'
import { criarColuna } from '../src/servicos/colunas.ts'
import { gerarToken } from '../src/servicos/cripto.ts'
import { carregarDemanda, criarDemanda as criarDemandaServico } from '../src/servicos/demandas.ts'
import { criarEtiqueta } from '../src/servicos/etiquetas.ts'
import { carregarUsuario } from '../src/servicos/pessoas.ts'
import { criarQuadro, quadroCompleto } from '../src/servicos/quadros.ts'
import { zerarLimites } from '../src/auth.ts'

/** Origem do app nos testes (o anti-CSRF compara com ela). */
export const ORIGEM = 'http://localhost:5173'
/** Senha de todas as pessoas da fixture: gerada a cada execução (nunca fica no código). */
export const SENHA_TESTE = `${randomBytes(12).toString('base64url')}-Pauta9`
/** Relógio inicial: quarta, 14/10/2026, 10h em São Paulo. */
export const INICIO: Instante = '2026-10-14T13:00:00.000Z'

const pastaDados = mkdtempSync(join(tmpdir(), 'pauta-teste-'))
process.on('exit', () => rmSync(pastaDados, { recursive: true, force: true }))
configurar({
  appUrl: ORIGEM, segredo: randomBytes(32).toString('base64url'), producao: false, trustProxyHops: 0, log: false,
  dataDir: pastaDados,
})

let hashDaSenha: Promise<string> | null = null

export interface Resposta<T = any> {
  status: number
  corpo: T
  texto: string
  headers: Headers
}

export interface OpcoesReq {
  headers?: Record<string, string>
  /** If-Match (rev) do PATCH de demanda. */
  ifMatch?: number
  /** Sem X-Trace-Id e Origin (para testar o anti-CSRF). */
  semCsrf?: boolean
}

export interface Cliente_ {
  get<T = any>(caminho: string, o?: OpcoesReq): Promise<Resposta<T>>
  post<T = any>(caminho: string, corpo?: unknown, o?: OpcoesReq): Promise<Resposta<T>>
  patch<T = any>(caminho: string, corpo?: unknown, o?: OpcoesReq): Promise<Resposta<T>>
  put<T = any>(caminho: string, corpo?: unknown, o?: OpcoesReq): Promise<Resposta<T>>
  del<T = any>(caminho: string, o?: OpcoesReq): Promise<Resposta<T>>
  /** Requisição crua (SSE, upload multipart): já com cookie, X-Trace-Id e Origin. */
  bruto(caminho: string, init?: RequestInit): Promise<Response>
  /** O valor do cookie de sessão. */
  cookie: string
}

export type NomePessoa = 'admin' | 'am' | 'am2' | 'design' | 'design2' | 'social' | 'web'
export type NomeQuadro = 'atendimento' | 'criacao' | 'social'

export interface Ambiente {
  app: App
  db: Db
  pessoas: Record<NomePessoa, Usuario>
  clientes: Record<'he' | 'icc', Cliente>
  quadros: Record<NomeQuadro, QuadroCompleto>
  como(p: Usuario): Cliente_
  /** Ator de serviço (chamar serviços direto). */
  ator(p: Usuario): Ator
  /**
   * Demanda pela criarDemanda() do núcleo (padrão: quadro criacao, coluna Fila, cliente HE, como am) e, com `ate`,
   * completada por SQL até entregue/enviada/aprovada/anulada (sem rota nem serviço do F2; nenhuma automação roda).
   */
  criarDemanda(p?: Partial<CriarDemandaEntrada> & { como?: Usuario; ate?: 'entregue' | 'enviada' | 'aprovada' | 'anulada' }): Promise<Demanda>
  coluna(quadro: NomeQuadro, nome: string): Coluna
  relogio(instante: Instante | null): void
}

async function lerResposta(r: Response): Promise<Resposta> {
  const texto = await r.text()
  let corpo: unknown = texto
  if ((r.headers.get('content-type') ?? '').includes('application/json') && texto) corpo = JSON.parse(texto)
  return { status: r.status, corpo, texto, headers: r.headers }
}

/** Cliente HTTP de teste com a sessão da pessoa (ou sem sessão, com `cookie` vazio). */
export function clienteHttp(app: App, cookie: string): Cliente_ {
  const cabecalhos = (metodo: string, o: OpcoesReq = {}, json = true): Record<string, string> => ({
    ...(cookie ? { Cookie: `${nomeCookie()}=${cookie}` } : {}),
    ...(metodo !== 'GET' && !o.semCsrf ? { 'X-Trace-Id': randomUUID(), Origin: ORIGEM } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(o.ifMatch !== undefined ? { 'If-Match': String(o.ifMatch) } : {}),
    ...(o.headers ?? {}),
  })
  const enviar = async (metodo: string, caminho: string, corpo: unknown, o?: OpcoesReq) => lerResposta(await app.request(caminho, {
    method: metodo, headers: cabecalhos(metodo, o, corpo !== undefined),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }))
  return {
    cookie,
    get: (caminho, o) => enviar('GET', caminho, undefined, o),
    post: (caminho, corpo, o) => enviar('POST', caminho, corpo ?? {}, o),
    patch: (caminho, corpo, o) => enviar('PATCH', caminho, corpo ?? {}, o),
    put: (caminho, corpo, o) => enviar('PUT', caminho, corpo ?? {}, o),
    del: (caminho, o) => enviar('DELETE', caminho, undefined, o),
    bruto: async (caminho, init = {}) => {
      const metodo = init.method ?? 'GET'
      const headers = new Headers(init.headers)
      for (const [k, v] of Object.entries(cabecalhos(metodo, {}, false))) if (!headers.has(k)) headers.set(k, v)
      return app.request(caminho, { ...init, headers })
    },
  }
}

/** Sessão nova para a pessoa direto no banco (o cookie que o login daria). */
export function sessaoPara(db: Db, usuarioId: string): string {
  const { token, hash } = gerarToken()
  rodar(db, 'INSERT INTO sessao (id, usuario_id, token_hash, criada_em, expira_em, ultimo_uso_em) VALUES (?, ?, ?, ?, ?, ?)',
    novoId(), usuarioId, hash, agora(), new Date(Date.parse(agora()) + 30 * 86_400_000).toISOString(), agora())
  return token
}

const PESSOAS: Record<NomePessoa, { nome: string; apelido: string; papel: Usuario['papel']; cor: Usuario['cor']; equipe: string | null }> = {
  admin: { nome: 'Alice Admin', apelido: 'Alice', papel: 'admin', cor: 'grafite', equipe: null },
  am: { nome: 'Pri Souza', apelido: 'Pri', papel: 'atendimento', cor: 'ambar', equipe: 'eq-atendimento' },
  am2: { nome: 'Gabi Rocha', apelido: 'Gabi', papel: 'atendimento', cor: 'amarelo', equipe: 'eq-atendimento' },
  design: { nome: 'Rafa Lima', apelido: 'Design', papel: 'equipe', cor: 'rosa', equipe: 'eq-criacao' },
  design2: { nome: 'Rosa Melo', apelido: 'Design2', papel: 'equipe', cor: 'magenta', equipe: 'eq-criacao' },
  social: { nome: 'Caio Dias', apelido: 'Social', papel: 'equipe', cor: 'roxo', equipe: 'eq-social' },
  web: { nome: 'Duda Reis', apelido: 'Web', papel: 'equipe', cor: 'azul', equipe: 'eq-web' },
}

/** Monta o ambiente com a fixture do PLANO §1.1.1 (relógio em 2026-10-14T13:00:00.000Z). */
export async function ambiente(): Promise<Ambiente> {
  fixarRelogio(INICIO)
  zerarLimites()
  const db = abrir(':memory:')
  migrar(db)
  const app = criarApp(db)
  const hash = await (hashDaSenha ??= hashSenha(SENHA_TESTE))

  const ids = {} as Record<NomePessoa, string>
  tx(db, () => {
    for (const [chave, p] of Object.entries(PESSOAS) as [NomePessoa, (typeof PESSOAS)[NomePessoa]][]) {
      const id = novoId()
      ids[chave] = id
      rodar(db, `INSERT INTO usuario (id, nome, apelido, email, senha_hash, senha_definida_em, papel, cor, criado_em, atualizado_em)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, p.nome, p.apelido, `${chave}@melt.test`, hash, agora(), p.papel, p.cor, agora(), agora())
      if (p.equipe) rodar(db, 'INSERT INTO equipe_membro (equipe_id, usuario_id, principal) VALUES (?, ?, 0)', p.equipe, id)
    }
  })
  const pessoas = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, carregarUsuario(db, id)])) as Record<NomePessoa, Usuario>
  const comoAdmin = atorDe(pessoas.admin)

  const coluna = (quadroId: string, nome: string): Coluna => {
    const l = um<Record<string, unknown>>(db, 'SELECT id FROM coluna WHERE quadro_id = ? AND nome = ? AND arquivada_em IS NULL', quadroId, nome)
    if (!l) throw new Error(`coluna ${nome} não existe no quadro ${quadroId}`)
    return quadroCompleto(db, quadroId).colunas.find((c) => c.id === l.id)!
  }

  const quadroIds = tx(db, () => {
    const social = criarQuadro(db, {
      nome: 'Social', equipeId: 'eq-social', cor: 'roxo',
      colunas: [{ nome: 'Fila' }, { nome: 'Agendar', cor: 'azul' }, { nome: 'Publicado', cor: 'verde', papel: 'concluida' }],
    }, comoAdmin).quadro.id
    criarEtiqueta(db, social, { nome: 'Alteração', cor: 'ambar' }, comoAdmin)
    const atendimento = criarQuadro(db, { nome: 'Atendimento', equipeId: 'eq-atendimento', cor: 'ambar', modeloQuadroId: 'mq-kanban' },
      comoAdmin).quadro.id
    const criacao = criarQuadro(db, { nome: 'Criação', equipeId: 'eq-criacao', cor: 'rosa', modeloQuadroId: 'mq-por-pessoa' },
      comoAdmin).quadro.id
    criarColuna(db, criacao, { nome: 'Pronto', cor: 'verde' }, comoAdmin)
    criarColuna(db, criacao, { nome: 'Concluído', cor: 'verde', papel: 'concluida' }, comoAdmin)
    criarEtiqueta(db, criacao, { nome: 'Urgente', cor: 'rosa' }, comoAdmin)
    criarEtiqueta(db, criacao, { nome: 'Alteração', cor: 'ambar' }, comoAdmin)
    gravarAutomacao(db, { quadroId: criacao, gatilho: 'enviado_ao_cliente', destinoColunaId: coluna(atendimento, 'Com o cliente').id, ator: comoAdmin })
    gravarAutomacao(db, { quadroId: criacao, gatilho: 'ajuste_pedido', destinoColunaId: coluna(criacao, 'Fila').id, ator: comoAdmin })
    gravarAutomacao(db, { quadroId: criacao, gatilho: 'aprovado', destinoColunaId: coluna(social, 'Agendar').id,
      membros: 'responsavel_destino', ator: comoAdmin })
    return { atendimento, criacao, social }
  })

  const clienteIds = tx(db, () => {
    const am = atorDe(pessoas.am)
    const he = criarCliente(db, { sigla: 'HE', nome: 'Hospital Evangélico', apelidos: ['hospital evangelico'],
      atendimentoId: pessoas.am.id, cor: 'verde' }, am).id
    definirResponsaveis(db, he, [{ equipeId: 'eq-criacao', usuarioId: pessoas.design.id }, { equipeId: 'eq-social', usuarioId: pessoas.social.id }], am)
    criarContato(db, he, { nome: 'Fulana', aprova: true, padrao: true, whatsapp: '+55 41 99999-0000' }, am)
    const icc = criarCliente(db, { sigla: 'ICC', nome: 'Instituto de Cardiologia', atendimentoId: pessoas.am2.id, cor: 'azul' },
      atorDe(pessoas.am2)).id
    criarContato(db, icc, { nome: 'Beltrana', aprova: true, padrao: true }, atorDe(pessoas.am2))
    return { he, icc }
  })
  const clientes = { he: carregarCliente(db, clienteIds.he), icc: carregarCliente(db, clienteIds.icc) }
  const quadros = {
    atendimento: quadroCompleto(db, quadroIds.atendimento), criacao: quadroCompleto(db, quadroIds.criacao),
    social: quadroCompleto(db, quadroIds.social),
  }

  const sessoes = new Map<string, string>()
  const como = (p: Usuario): Cliente_ => {
    let cookie = sessoes.get(p.id)
    if (!cookie) {
      cookie = sessaoPara(db, p.id)
      sessoes.set(p.id, cookie)
    }
    return clienteHttp(app, cookie)
  }

  const criarDemanda: Ambiente['criarDemanda'] = async (p = {}) => {
    const { como: quem = pessoas.am, ate, ...resto } = p
    const quadroId = resto.quadroId ?? quadroIds.criacao
    const entrada: CriarDemandaEntrada = {
      titulo: 'Post de outubro', clienteId: clienteIds.he, ...resto, quadroId,
      colunaId: resto.colunaId ?? (resto.quadroId ? undefined : coluna(quadroIds.criacao, 'Fila').id),
    }
    const { demanda } = tx(db, () => criarDemandaServico(db, entrada, atorDe(quem)))
    if (ate) tx(db, () => completarAte(db, demanda.id, ate, { autorId: pessoas.design.id, atendimentoId: pessoas.am.id }))
    return carregarDemanda(db, demanda.id)
  }

  return {
    app, db, pessoas, clientes, quadros, como, criarDemanda,
    ator: (p) => atorDe(p),
    coluna: (quadro, nome) => coluna(quadroIds[quadro], nome),
    relogio: (instante) => fixarRelogio(instante),
  }
}

// ─────────────────────────────── utilidades dos testes ───────────────────────────────

/** Linhas da tabela `evento` (patch já em objeto), opcionalmente depois de um seq. */
export function eventos(db: Db, desde = 0): { seq: number; entidade: string; entidade_id: string; op: string;
  patch: Record<string, unknown> | null; campos: string[] | null; publico: string; usuario_id: string | null;
  trace_id: string | null; ator_id: string | null }[] {
  return todos<Record<string, unknown>>(db, 'SELECT * FROM evento WHERE seq > ? ORDER BY seq', desde).map((l) => ({
    seq: Number(l.seq), entidade: String(l.entidade), entidade_id: String(l.entidade_id), op: String(l.op),
    patch: l.patch ? JSON.parse(String(l.patch)) : null, campos: l.campos ? JSON.parse(String(l.campos)) : null,
    publico: String(l.publico), usuario_id: l.usuario_id as string | null, trace_id: l.trace_id as string | null,
    ator_id: l.ator_id as string | null,
  }))
}

/** Último seq gravado. */
export function ultimoSeq(db: Db): number {
  return Number(um<{ s: number | null }>(db, 'SELECT max(seq) AS s FROM evento')!.s ?? 0)
}

/** Notificações da pessoa (mais novas por último). */
export function notificacoesDe(db: Db, usuarioId: string): { tipo: string; demanda_id: string | null; resumo: string }[] {
  return todos(db, 'SELECT tipo, demanda_id, resumo FROM notificacao WHERE usuario_id = ? ORDER BY id', usuarioId)
}

/** Lê blocos do SSE até `quantos` blocos `event: d|resync` ou o tempo esgotar. */
export async function lerSse(r: Response, quantos: number, tempoMs = 2000): Promise<{ evento: string; id: string | null; dados: any }[]> {
  const leitor = r.body!.getReader()
  const decodificador = new TextDecoder()
  const blocos: { evento: string; id: string | null; dados: any }[] = []
  let resto = ''
  const limite = Date.now() + tempoMs
  while (blocos.length < quantos && Date.now() < limite) {
    const parte = await Promise.race([
      leitor.read(),
      new Promise<{ done: true; value: undefined }>((ok) => setTimeout(() => ok({ done: true, value: undefined }), Math.max(1, limite - Date.now()))),
    ])
    if (parte.done) break
    resto += decodificador.decode(parte.value, { stream: true })
    let i: number
    while ((i = resto.indexOf('\n\n')) >= 0) {
      const bloco = resto.slice(0, i)
      resto = resto.slice(i + 2)
      const linhas = Object.fromEntries(bloco.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]))
      if (!linhas.event) continue
      blocos.push({ evento: linhas.event, id: linhas.id ?? null, dados: linhas.data ? JSON.parse(linhas.data) : null })
    }
  }
  await leitor.cancel()
  return blocos
}
