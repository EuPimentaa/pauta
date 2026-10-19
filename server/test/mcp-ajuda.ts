/**
 * Ajuda dos testes do MCP e do OAuth (F7): o fluxo inteiro como o Claude faz (registro → PKCE → autorizar com o cookie do
 * pedido → decisão na tela → token) e as chamadas ao /mcp. Nenhum token vai para o log.
 */
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { Usuario } from '../../shared/tipos/index.ts'
import { nomeCookie } from '../src/auth.ts'
import { configurar } from '../src/config.ts'
import { zerarLimitesMcp } from '../src/servicos/mcp-limites.ts'
import { ambiente, ORIGEM, sessaoPara, type Ambiente } from './ajuda.ts'

/** O ambiente de sempre com os limites do MCP zerados (ficam em memória entre os testes do arquivo). */
export async function ambienteMcp(): Promise<Ambiente> {
  const amb = await ambiente()
  zerarLimitesMcp()
  // o IP real vem do X-Forwarded-For (cada requisição de teste tem o seu, salvo quando o teste escolhe)
  configurar({ trustProxyHops: 1 })
  return amb
}

const ipAleatorio = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`

export const REDIRECT_CLAUDE = 'https://claude.ai/api/mcp/auth_callback'
export const REDIRECT_LOOPBACK = 'http://127.0.0.1:43123/callback'
export const RECURSO = `${ORIGEM}/mcp`
export const COOKIE_PEDIDO = 'pauta_oauth'

export { zerarLimitesMcp }

export function pkce(): { verificador: string; desafio: string } {
  const verificador = randomBytes(32).toString('base64url')
  return { verificador, desafio: createHash('sha256').update(verificador).digest('base64url') }
}

export interface Resp {
  status: number
  headers: Headers
  texto: string
  corpo: any
}

export async function req(amb: Ambiente, caminho: string, init: RequestInit = {}): Promise<Resp> {
  const headers = new Headers(init.headers)
  if (!headers.has('x-forwarded-for')) headers.set('X-Forwarded-For', ipAleatorio())
  const r = await amb.app.request(caminho, { ...init, headers })
  const texto = await r.text()
  let corpo: unknown = texto
  if ((r.headers.get('content-type') ?? '').includes('json') && texto) corpo = JSON.parse(texto)
  return { status: r.status, headers: r.headers, texto, corpo }
}

export async function registrarCliente(amb: Ambiente, redirect = REDIRECT_CLAUDE, extra: Record<string, unknown> = {}, ip?: string): Promise<Resp> {
  return req(amb, '/oauth/registrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}) },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect], ...extra }),
  })
}

export function urlAutorizar(p: Record<string, string | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v !== undefined) u.set(k, v)
  return `/oauth/autorizar?${u.toString()}`
}

/** O valor do cookie do pedido no Set-Cookie (ou null). */
export function cookieDoPedido(r: Resp): string | null {
  const m = new RegExp(`${COOKIE_PEDIDO}=([^;]+)`).exec(r.headers.get('set-cookie') ?? '')
  return m ? m[1]! : null
}

export function cabecalhosTela(sessao: string, cookiePedido: string | null, mutacao = false): Record<string, string> {
  return {
    Cookie: [`${nomeCookie()}=${sessao}`, ...(cookiePedido ? [`${COOKIE_PEDIDO}=${cookiePedido}`] : [])].join('; '),
    ...(mutacao ? { 'X-Trace-Id': randomUUID(), Origin: ORIGEM, 'Content-Type': 'application/json' } : {}),
  }
}

export interface Pedido {
  clientId: string
  redirect: string
  verificador: string
  state: string
  pedidoId: string
  cookie: string
}

/** Registro + autorizar (sem seguir o 302): o pedido e o cookie do navegador. */
export async function abrirPedido(amb: Ambiente, o: { redirect?: string; clientId?: string } = {}): Promise<Pedido> {
  const redirect = o.redirect ?? REDIRECT_CLAUDE
  const clientId = o.clientId ?? (await registrarCliente(amb, redirect)).corpo.client_id
  const { verificador, desafio } = pkce()
  const state = randomBytes(8).toString('hex')
  const r = await req(amb, urlAutorizar({
    response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: desafio, code_challenge_method: 'S256',
    scope: 'pauta offline_access', state, resource: RECURSO,
  }))
  if (r.status !== 302) throw new Error(`autorizar: ${r.status} ${r.texto}`)
  const pedidoId = new URL(r.headers.get('location')!, ORIGEM).searchParams.get('pedido')!
  return { clientId, redirect, verificador, state, pedidoId, cookie: cookieDoPedido(r)! }
}

/** Decide pela tela (com a sessão da pessoa e o cookie do pedido) e devolve o `redirecionar`. */
export async function decidir(amb: Ambiente, p: Pedido, pessoa: Usuario, permitir = true, substituir?: boolean): Promise<Resp> {
  const sessao = sessaoPara(amb.db, pessoa.id)
  return req(amb, `/api/oauth/pedidos/${p.pedidoId}/decisao`, {
    method: 'POST', headers: cabecalhosTela(sessao, p.cookie, true),
    body: JSON.stringify({ permitir, ...(substituir !== undefined ? { substituir } : {}) }),
  })
}

export function form(campos: Record<string, string>): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(campos).toString() }
}

export interface Conexao {
  clientId: string
  redirect: string
  at: string
  rt: string
  codigo: string
  verificador: string
}

/** O fluxo inteiro: devolve os tokens (para os testes; nunca para o log). */
export async function conectar(amb: Ambiente, pessoa: Usuario, o: { redirect?: string; clientId?: string; substituir?: boolean } = {}): Promise<Conexao> {
  const p = await abrirPedido(amb, o)
  const d = await decidir(amb, p, pessoa, true, o.substituir)
  if (d.status !== 200) throw new Error(`decisão: ${d.status} ${d.texto}`)
  const codigo = new URL(d.corpo.redirecionar).searchParams.get('code')!
  const t = await req(amb, '/oauth/token', form({
    grant_type: 'authorization_code', code: codigo, client_id: p.clientId, redirect_uri: p.redirect, code_verifier: p.verificador,
    resource: RECURSO,
  }))
  if (t.status !== 200) throw new Error(`token: ${t.status} ${t.texto}`)
  return { clientId: p.clientId, redirect: p.redirect, at: t.corpo.access_token, rt: t.corpo.refresh_token, codigo, verificador: p.verificador }
}

let proximoId = 1

/** Um POST /mcp com JSON-RPC. */
export async function rpc(amb: Ambiente, token: string | null, method: string, params?: unknown, headers: Record<string, string> = {}): Promise<Resp> {
  return req(amb, '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: proximoId++, method, ...(params !== undefined ? { params } : {}) }),
  })
}

/** tools/call: o texto e se veio como erro. */
export async function chamar(amb: Ambiente, token: string, nome: string, args: Record<string, unknown> = {}): Promise<{ texto: string; erro: boolean }> {
  const r = await rpc(amb, token, 'tools/call', { name: nome, arguments: args })
  if (r.status !== 200 || !r.corpo.result) throw new Error(`tools/call ${nome}: ${r.status} ${r.texto}`)
  return { texto: r.corpo.result.content[0].text as string, erro: r.corpo.result.isError === true }
}

/** Captura console.log/warn/error durante `fn` (para conferir que nenhum segredo vai ao log). */
export async function capturarLog<T>(fn: () => Promise<T>): Promise<{ valor: T; log: string }> {
  const linhas: string[] = []
  const orig = { log: console.log, warn: console.warn, error: console.error }
  const guardar = (...a: unknown[]) => { linhas.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}\n${x.stack}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) }
  console.log = guardar
  console.warn = guardar
  console.error = guardar
  try {
    const valor = await fn()
    return { valor, log: linhas.join('\n') }
  } finally {
    Object.assign(console, orig)
  }
}
