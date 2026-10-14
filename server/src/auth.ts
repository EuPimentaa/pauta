/**
 * Autenticação: senhas (scrypt), sessões por cookie, o `Ator` de cada requisição, os middlewares exigirUsuario /
 * exigirPapel, a validação zod e o limite em memória (API.md §1 e §4.2).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import type { Context, Hono, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { ZodType } from 'zod'
import type { Papel, Usuario } from '../../shared/tipos/index.ts'
import { config } from './config.ts'
import { agora, novoId, rodar, um, type Db } from './db.ts'
import { ErroHttp } from './erros.ts'
import { gerarToken, hashToken } from './servicos/cripto.ts'
import { lerConfig } from './servicos/config-app.ts'
import { carregarUsuario } from './servicos/pessoas.ts'

/**
 * Quem faz a ação. `usuario` nas rotas autenticadas; `cliente` na página pública (e antes do login); `sistema` nos
 * jobs. `ip`: o N-ésimo item do FIM do X-Forwarded-For (TRUST_PROXY_HOPS), senão o socket.
 */
export interface Ator {
  tipo: 'usuario' | 'cliente' | 'sistema'
  usuario: Usuario | null
  papel: Papel | null
  traceId: string | null
  ip: string
}

export type Ambiente = { Variables: { ator: Ator; db: Db } }
export type App = Hono<Ambiente>

/** Ator dos jobs e scripts. */
export function atorSistema(): Ator {
  return { tipo: 'sistema', usuario: null, papel: null, traceId: null, ip: '' }
}

/** Ator de um usuário fora de uma requisição (seed, testes, tarefas que agem em nome de alguém). */
export function atorDe(usuario: Usuario, traceId: string | null = null): Ator {
  return { tipo: 'usuario', usuario, papel: usuario.papel, traceId, ip: '' }
}

/** Id do usuário do ator (nulo para cliente e sistema). */
export function idDoAtor(ator: Ator): string | null {
  return ator.usuario?.id ?? null
}

// ─────────────────────────────── IP real ───────────────────────────────

/** API.md §1: com TRUST_PROXY_HOPS = N > 0, o N-ésimo do fim do X-Forwarded-For; senão o endereço do socket. */
export function ipReal(c: Context): string {
  const n = config.trustProxyHops
  if (n > 0) {
    const lista = (c.req.header('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    if (lista.length > 0) return lista[Math.max(0, lista.length - n)]!
  }
  try {
    return getConnInfo(c).remote.address ?? 'desconhecido'
  } catch {
    return 'desconhecido'
  }
}

// ─────────────────────────────── senhas ───────────────────────────────

const N = 2 ** 15
const R = 8
const P = 1
const TAMANHO = 64

function scrypt(senha: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opcoes: ScryptOptions = { N: n, r, p, maxmem: 256 * n * r }
  return new Promise((ok, falha) => scryptCb(senha, sal, TAMANHO, opcoes, (e, chave) => (e ? falha(e) : ok(chave))))
}

/** 'scrypt$N$r$p$sal_b64$hash_b64' (N=2^15, r=8, p=1, sal de 16 bytes). */
export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16)
  const chave = await scrypt(senha, sal, N, R, P)
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${chave.toString('base64')}`
}

let hashFicticio: Promise<string> | null = null

/**
 * Confere a senha em tempo parecido com ou sem usuário: sem hash (e-mail inexistente, pessoa sem senha), roda o
 * scrypt contra um hash fictício e devolve false.
 */
export async function conferirSenha(senha: string, hash: string | null): Promise<boolean> {
  const alvo = hash ?? (await (hashFicticio ??= hashSenha(randomBytes(18).toString('base64'))))
  const partes = alvo.split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false
  const [, n, r, p, sal, esperado] = partes as [string, string, string, string, string, string]
  const chave = await scrypt(senha, Buffer.from(sal, 'base64'), Number(n), Number(r), Number(p))
  const alvoBuf = Buffer.from(esperado, 'base64')
  return hash !== null && alvoBuf.length === chave.length && timingSafeEqual(alvoBuf, chave)
}

// ─────────────────────────────── sessões ───────────────────────────────

export function nomeCookie(): string {
  return config.producao ? '__Host-sid' : 'sid'
}

function gravarCookie(c: Context, token: string, dias: number): void {
  setCookie(c, nomeCookie(), token, {
    httpOnly: true, sameSite: 'Lax', path: '/', secure: config.producao, maxAge: dias * 86_400,
  })
}

/** Cria a sessão (30 dias deslizantes), grava o cookie e o último acesso. Devolve o id da sessão. */
export function criarSessao(db: Db, c: Context, usuarioId: string, ip: string): string {
  const dias = lerConfig(db).sessaoValidadeDias
  const { token, hash } = gerarToken()
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO sessao (id, usuario_id, token_hash, criada_em, expira_em, ultimo_uso_em, user_agent, ip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, usuarioId, hash, instante, new Date(Date.parse(instante) + dias * 86_400_000).toISOString(), instante,
    (c.req.header('user-agent') ?? '').slice(0, 300) || null, ip)
  rodar(db, 'UPDATE usuario SET ultimo_acesso_em = ? WHERE id = ?', instante, usuarioId)
  gravarCookie(c, token, dias)
  return id
}

export function apagarCookie(c: Context): void {
  deleteCookie(c, nomeCookie(), { path: '/', secure: config.producao })
}

/** Revoga as sessões da pessoa (menos `exceto`). Devolve quantas. */
export function revogarSessoes(db: Db, usuarioId: string, exceto?: string): number {
  return rodar(db, 'UPDATE sessao SET revogada_em = ? WHERE usuario_id = ? AND revogada_em IS NULL AND id IS NOT ?',
    agora(), usuarioId, exceto ?? null).changes
}

interface LinhaSessao {
  id: string
  usuario_id: string
  expira_em: string
  ultimo_uso_em: string | null
}

/** Sessão válida pelo token do cookie: não revogada, não vencida e de pessoa ativa (API.md §1). */
export function sessaoValida(db: Db, token: string | undefined): LinhaSessao | null {
  if (!token) return null
  const l = um<LinhaSessao>(db, `
    SELECT s.id, s.usuario_id, s.expira_em, s.ultimo_uso_em FROM sessao s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.token_hash = ? AND s.revogada_em IS NULL AND s.expira_em > ? AND u.ativo = 1`, hashToken(token), agora())
  return l ?? null
}

/** Sessão (id) da requisição, se houver cookie válido. */
export function sessaoDaRequisicao(c: Context<Ambiente>): LinhaSessao | null {
  return sessaoValida(c.get('db'), getCookie(c, nomeCookie()))
}

/** Renova a validade (deslizante) e o cookie. `forcar` renova mesmo se o último uso foi há pouco. */
function renovar(db: Db, c: Context, s: LinhaSessao, forcar: boolean): void {
  const instante = agora()
  if (!forcar && s.ultimo_uso_em && Date.parse(instante) - Date.parse(s.ultimo_uso_em) < 10 * 60_000) return
  const dias = lerConfig(db).sessaoValidadeDias
  rodar(db, 'UPDATE sessao SET expira_em = ?, ultimo_uso_em = ? WHERE id = ?',
    new Date(Date.parse(instante) + dias * 86_400_000).toISOString(), instante, s.id)
  const token = getCookie(c, nomeCookie())
  if (token) gravarCookie(c, token, dias)
}

/**
 * 401 sem sessão válida. Confere em TODA requisição: sessão não revogada e não vencida, pessoa ativa. Põe o ator
 * `usuario` no contexto e renova a validade (no máximo a cada 10 min; GET /api/auth/eu sempre).
 */
export const exigirUsuario: MiddlewareHandler<Ambiente> = async (c, next) => {
  const db = c.get('db')
  const s = sessaoDaRequisicao(c)
  if (!s) throw new ErroHttp(401, 'nao_autenticado', 'Entre de novo para continuar.')
  const usuario = carregarUsuario(db, s.usuario_id)
  const base = c.get('ator')
  c.set('ator', { tipo: 'usuario', usuario, papel: usuario.papel, traceId: base.traceId, ip: base.ip })
  renovar(db, c, s, c.req.method === 'GET' && c.req.path === '/api/auth/eu')
  await next()
}

/** 403 sem_permissao se o papel do usuário não estiver na lista (use depois de exigirUsuario). */
export function exigirPapel(...papeis: Papel[]): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const papel = c.get('ator').papel
    if (!papel || !papeis.includes(papel)) {
      throw new ErroHttp(403, 'sem_permissao', papeis.length === 1 && papeis[0] === 'admin'
        ? 'Só o admin pode fazer isto.' : 'Seu papel não permite esta ação.')
    }
    await next()
  }
}

// ─────────────────────────────── validação ───────────────────────────────

/** zod → valor tipado, ou 400 validacao com `detalhes.campos` ({ "colunas.0.nome": "mensagem" }). */
export function validar<T>(esquema: ZodType<T>, valor: unknown): T {
  const r = esquema.safeParse(valor)
  if (r.success) return r.data
  const campos: Record<string, string> = {}
  for (const issue of r.error.issues) {
    const caminho = issue.path.map(String).join('.') || '(corpo)'
    campos[caminho] ??= issue.message
  }
  const [primeiro] = Object.entries(campos)
  throw new ErroHttp(400, 'validacao', primeiro ? `Confira ${primeiro[0] === '(corpo)' ? 'os dados' : `"${primeiro[0]}"`}: ${primeiro[1]}` : 'Dados inválidos.', { campos })
}

/** Corpo JSON da requisição (400 se não for JSON). Sem corpo = {}. */
export async function corpoJson(c: Context): Promise<unknown> {
  const texto = await c.req.text()
  if (texto.trim() === '') return {}
  try {
    return JSON.parse(texto)
  } catch {
    throw new ErroHttp(400, 'validacao', 'O corpo não é um JSON válido.')
  }
}

// ─────────────────────────────── limite em memória ───────────────────────────────

const janelas = new Map<string, number[]>()

/** Zera os limites em memória (testes). */
export function zerarLimites(): void {
  janelas.clear()
}

/**
 * 429 muitas_tentativas com `detalhes.tenteEmSegundos` quando passa de `max` requisições em `janelaSeg` (janela
 * deslizante, em memória: um processo só). A chave é `chave` + IP real + os parâmetros da rota (ex.: o token do
 * link público em `/api/publico/a/:token`).
 */
export function limite(chave: string, max: number, janelaSeg: number): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const agoraMs = Date.parse(agora())
    const id = [chave, c.get('ator').ip, ...Object.values(c.req.param() as Record<string, string>)].join('|')
    const inicio = agoraMs - janelaSeg * 1000
    const lista = (janelas.get(id) ?? []).filter((t) => t > inicio)
    if (lista.length >= max) {
      const espera = Math.max(1, Math.ceil((lista[0]! + janelaSeg * 1000 - agoraMs) / 1000))
      janelas.set(id, lista)
      throw new ErroHttp(429, 'muitas_tentativas', 'Muitas tentativas. Espere um pouco e tente de novo.',
        { tenteEmSegundos: espera })
    }
    lista.push(agoraMs)
    janelas.set(id, lista)
    if (janelas.size > 20_000) {
      for (const [k, v] of janelas) if (v.every((t) => t <= inicio)) janelas.delete(k)
    }
    await next()
  }
}
