/**
 * Tokens do OAuth do MCP (F7, API.md §F.3 e §F.5): troca do código (PKCE S256), refresh com rotação (o mesmo par na
 * tolerância de 60 s, pelo `filho_cifrado`), revogação (RFC 7009) e a conferência do bearer do /mcp. Tokens opacos
 * `pauta_at_…`/`pauta_rt_…` + randomBytes(32); o banco guarda só o sha256. Nada de scrypt aqui (o Claude espera no
 * máximo 10 s pelo token).
 */
import { createHash, randomBytes } from 'node:crypto'
import type { TokenSaida, Usuario } from '../../../shared/tipos/index.ts'
import { LIMITES_MCP, PRAZOS_OAUTH } from '../../../shared/tipos/index.ts'
import { agora, rodar, tx, um, type Db } from '../db.ts'
import { lerConfig } from './config-app.ts'
import { cifrar, decifrar, iguaisSeguro } from './cripto.ts'
import { usar } from './mcp-limites.ts'
import {
  atorSistemaOAuth, carregarClienteOAuth, criarConcessao, ErroOAuthHttp, hashOAuth, normalizarResource, redirectPermitido,
  recursoMcp, revogarConcessao, type LinhaPedido,
} from './oauth.ts'
import { carregarUsuario } from './pessoas.ts'

const VERIFICADOR = /^[A-Za-z0-9\-._~]{43,128}$/

interface Par {
  at: string
  rt: string
}

const novoToken = (prefixo: 'pauta_at_' | 'pauta_rt_') => `${prefixo}${randomBytes(32).toString('base64url')}`
const somarMs = (ms: number) => new Date(Date.parse(agora()) + ms).toISOString()

function saida(par: Par, expiraEmSeg: number): TokenSaida {
  return { access_token: par.at, token_type: 'Bearer', expires_in: expiraEmSeg, refresh_token: par.rt, scope: 'pauta' }
}

/** Grava um par novo na concessão (acesso 1 h; refresh sessaoValidadeDias, deslizante a cada troca). */
function emitirPar(db: Db, concessaoId: string): Par {
  const par = { at: novoToken('pauta_at_'), rt: novoToken('pauta_rt_') }
  const instante = agora()
  const dias = lerConfig(db).sessaoValidadeDias
  rodar(db, `INSERT INTO oauth_token (hash, concessao_id, tipo, criado_em, expira_em) VALUES (?, ?, 'acesso', ?, ?)`,
    hashOAuth(par.at), concessaoId, instante, somarMs(PRAZOS_OAUTH.acessoSeg * 1000))
  rodar(db, `INSERT INTO oauth_token (hash, concessao_id, tipo, criado_em, expira_em) VALUES (?, ?, 'atualizacao', ?, ?)`,
    hashOAuth(par.rt), concessaoId, instante, somarMs(dias * 86_400_000))
  return par
}

function usuarioAtivo(db: Db, id: string | null): boolean {
  return !!id && um<{ ativo: number }>(db, 'SELECT ativo FROM usuario WHERE id = ?', id)?.ativo === 1
}

const grantInvalido = () => new ErroOAuthHttp(400, 'invalid_grant', 'Autorização inválida, vencida ou já usada. Conecte de novo.')

/** POST /oauth/token (form-urlencoded já lido em `f`). */
export function trocarToken(db: Db, f: URLSearchParams): TokenSaida {
  const clientId = f.get('client_id') ?? ''
  const grant = f.get('grant_type') ?? ''
  if (!clientId) throw new ErroOAuthHttp(400, 'invalid_request', 'Falta client_id.')
  const lim = usar(`oauth-token|${clientId}`, LIMITES_MCP.tokensPorMinutoCliente, 60)
  if (!lim.ok) throw new ErroOAuthHttp(429, 'temporarily_unavailable', 'Muitas trocas de token seguidas. Espere um minuto.', lim.esperaSeg)
  if (!carregarClienteOAuth(db, clientId)) throw new ErroOAuthHttp(401, 'invalid_client', 'Cliente desconhecido.')
  if (grant === 'authorization_code') return trocarCodigo(db, f, clientId)
  if (grant === 'refresh_token') return renovar(db, f, clientId)
  throw new ErroOAuthHttp(400, 'unsupported_grant_type', 'grant_type aceitos: authorization_code e refresh_token.')
}

function trocarCodigo(db: Db, f: URLSearchParams, clientId: string): TokenSaida {
  const codigo = f.get('code') ?? ''
  const redirect = f.get('redirect_uri') ?? ''
  const verificador = f.get('code_verifier') ?? ''
  if (!codigo || !redirect || !verificador) throw new ErroOAuthHttp(400, 'invalid_request', 'Faltam code, redirect_uri ou code_verifier.')
  const p = um<LinhaPedido>(db, 'SELECT * FROM oauth_pedido WHERE codigo_hash = ?', hashOAuth(codigo))
  if (!p) throw grantInvalido()
  if (p.codigo_usado_em !== null) {
    // código usado de novo: a concessão que ele emitiu cai (alguém copiou o código)
    if (p.concessao_id) revogarConcessao(db, p.concessao_id, 'codigo_reusado', atorSistemaOAuth)
    throw grantInvalido()
  }
  const instante = agora()
  if (p.cliente_id !== clientId || !p.codigo_expira_em || p.codigo_expira_em <= instante || p.redirect_uri !== redirect) throw grantInvalido()
  if (!VERIFICADOR.test(verificador)) throw grantInvalido()
  const calculado = createHash('sha256').update(verificador, 'ascii').digest('base64url')
  if (!iguaisSeguro(calculado, p.code_challenge)) throw grantInvalido()
  const resource = f.get('resource')
  if (resource && normalizarResource(resource) !== p.resource) {
    throw new ErroOAuthHttp(400, 'invalid_target', 'Este servidor não emite tokens para esse recurso.')
  }
  if (!redirectPermitido(p.redirect_uri) || !usuarioAtivo(db, p.usuario_id)) throw grantInvalido()

  return tx(db, () => {
    const r = rodar(db, 'UPDATE oauth_pedido SET codigo_usado_em = ? WHERE id = ? AND codigo_usado_em IS NULL', instante, p.id)
    if (r.changes !== 1) throw grantInvalido()
    const concessaoId = criarConcessao(db, {
      usuarioId: p.usuario_id!, clienteId: clientId, redirect: p.redirect_uri, resource: p.resource, substituir: p.substituir === 1,
    })
    rodar(db, 'UPDATE oauth_pedido SET concessao_id = ? WHERE id = ?', concessaoId, p.id)
    rodar(db, 'UPDATE oauth_cliente SET ultimo_uso_em = ? WHERE id = ?', instante, clientId)
    return saida(emitirPar(db, concessaoId), PRAZOS_OAUTH.acessoSeg)
  })
}

interface LinhaToken {
  hash: string
  concessao_id: string
  tipo: 'acesso' | 'atualizacao'
  criado_em: string
  expira_em: string
  trocado_em: string | null
  filho_cifrado: string | null
}

interface LinhaConcessaoToken {
  id: string
  usuario_id: string
  cliente_id: string
  redirect_uri: string
  resource: string
  revogada_em: string | null
  ultimo_uso_em: string | null
}

function renovar(db: Db, f: URLSearchParams, clientId: string): TokenSaida {
  const rt = f.get('refresh_token') ?? ''
  if (!rt) throw new ErroOAuthHttp(400, 'invalid_request', 'Falta refresh_token.')
  // a revogação por reuso precisa ficar gravada: a transação devolve `null` e o erro sai depois do commit
  const resposta = tx(db, (): TokenSaida | null => {
    const t = um<LinhaToken>(db, "SELECT * FROM oauth_token WHERE hash = ? AND tipo = 'atualizacao'", hashOAuth(rt))
    if (!t) throw grantInvalido()
    const c = um<LinhaConcessaoToken>(db, 'SELECT * FROM oauth_concessao WHERE id = ?', t.concessao_id)!
    if (c.cliente_id !== clientId) throw grantInvalido()
    const instante = agora()
    if (t.trocado_em !== null) {
      const dentro = Date.parse(instante) - Date.parse(t.trocado_em) <= PRAZOS_OAUTH.toleranciaRefreshSeg * 1000
      if (dentro && t.filho_cifrado && c.revogada_em === null) {
        // duas conversas renovando juntas: o MESMO par da troca, sem emitir outro
        const par = JSON.parse(decifrar(t.filho_cifrado, 'oauth_refresh')) as Par
        const at = um<{ expira_em: string }>(db, "SELECT expira_em FROM oauth_token WHERE hash = ? AND tipo = 'acesso'", hashOAuth(par.at))
        if (at) return saida(par, Math.max(1, Math.round((Date.parse(at.expira_em) - Date.parse(instante)) / 1000)))
      }
      // reuso depois da folga: roubo provável; a concessão inteira cai
      rodar(db, 'UPDATE oauth_token SET filho_cifrado = NULL WHERE hash = ?', t.hash)
      revogarConcessao(db, c.id, 'reuso_refresh', atorSistemaOAuth)
      return null
    }
    if (t.expira_em <= instante || c.revogada_em !== null) throw grantInvalido()
    if (!usuarioAtivo(db, c.usuario_id) || !redirectPermitido(c.redirect_uri)) throw grantInvalido()
    const resource = f.get('resource')
    if (resource && normalizarResource(resource) !== c.resource) {
      throw new ErroOAuthHttp(400, 'invalid_target', 'Este servidor não emite tokens para esse recurso.')
    }
    const par = emitirPar(db, c.id)
    const r = rodar(db, 'UPDATE oauth_token SET trocado_em = ?, filho_cifrado = ? WHERE hash = ? AND trocado_em IS NULL',
      instante, cifrar(JSON.stringify(par), 'oauth_refresh'), t.hash)
    if (r.changes !== 1) throw grantInvalido()
    rodar(db, 'UPDATE oauth_cliente SET ultimo_uso_em = ? WHERE id = ?', instante, clientId)
    return saida(par, PRAZOS_OAUTH.acessoSeg)
  })
  if (!resposta) throw grantInvalido()
  return resposta
}

/** POST /oauth/revogar (RFC 7009): revoga a concessão do token (acesso ou refresh). Desconhecido: nada (200 sempre). */
export function revogarPorToken(db: Db, token: string): void {
  if (!token || token.length > 300) return
  const t = um<{ concessao_id: string }>(db, 'SELECT concessao_id FROM oauth_token WHERE hash = ?', hashOAuth(token))
  if (t) revogarConcessao(db, t.concessao_id, 'pedido_cliente', atorSistemaOAuth)
}

/** Quem chama o /mcp: a pessoa (ativa) e a concessão do token. */
export interface ConexaoAtiva {
  usuario: Usuario
  concessaoId: string
}

/**
 * O bearer do /mcp (API.md §F.5): sha256 → token de acesso não vencido → concessão não revogada → pessoa ativa →
 * `resource` = o nosso → `redirectPermitido(concessão.redirect_uri)`. `ausente`: sem `Authorization: Bearer`.
 * Grava o último uso da concessão no máximo a cada 10 min (sem evento).
 */
export function conferirBearer(db: Db, autorizacao: string | undefined): { tipo: 'ausente' } | { tipo: 'invalido' } | ({ tipo: 'ok' } & ConexaoAtiva) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(autorizacao ?? '')
  if (!m) return { tipo: 'ausente' }
  const token = m[1]!
  if (token.length > 300) return { tipo: 'invalido' }
  const instante = agora()
  const l = um<LinhaConcessaoToken & { expira_em: string }>(db, `
    SELECT oc.*, t.expira_em FROM oauth_token t JOIN oauth_concessao oc ON oc.id = t.concessao_id
     WHERE t.hash = ? AND t.tipo = 'acesso'`, hashOAuth(token))
  if (!l || l.expira_em <= instante || l.revogada_em !== null) return { tipo: 'invalido' }
  if (!usuarioAtivo(db, l.usuario_id) || l.resource !== normalizarResource(recursoMcp()) || !redirectPermitido(l.redirect_uri)) {
    return { tipo: 'invalido' }
  }
  if (!l.ultimo_uso_em || Date.parse(instante) - Date.parse(l.ultimo_uso_em) >= PRAZOS_OAUTH.ultimoUsoMin * 60_000) {
    rodar(db, 'UPDATE oauth_concessao SET ultimo_uso_em = ? WHERE id = ? AND revogada_em IS NULL', instante, l.id)
  }
  return { tipo: 'ok', usuario: carregarUsuario(db, l.usuario_id), concessaoId: l.id }
}
