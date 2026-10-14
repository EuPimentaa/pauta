/**
 * Cliente HTTP do app (docs/API.md §1).
 * - Mesma origem, `credentials: 'same-origin'` (cookie de sessão httpOnly).
 * - Toda mutação leva `X-Trace-Id` novo (anti-CSRF e eco do tempo real: o cliente SSE ignora os eventos cujo `t` está
 *   em ultimosTraces()).
 * - Erro sempre como ErroDaApi { status, codigo, mensagem, detalhes } (falha de rede: status 0, codigo 'rede').
 * - 401 nao_autenticado fora de rota pública leva a /entrar?volta=<onde estava>.
 *
 *   const d = await api<Demanda>('PATCH', `/api/demandas/${id}`, { corpo: { titulo }, ifMatch: d.rev })
 *   const pagina = await api<Pagina<Atividade>>('GET', comConsulta(`/api/demandas/${id}/historico`, { cursor }))
 */
import { HEADER_IDEMPOTENCIA, HEADER_IF_MATCH, HEADER_TRACE, type CodigoErro, type ErroApi } from '@shared/tipos/index.ts'

export type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface OpcoesApi {
  /** Objeto (vira JSON) ou FormData (upload; o navegador põe o Content-Type com o boundary). */
  corpo?: unknown
  /** `rev` atual (PATCH de demanda). */
  ifMatch?: number | string
  /** Idempotency-Key (decisão pública). */
  idempotencia?: string
  sinal?: AbortSignal
  /** false: um 401 só rejeita (a área autenticada decide para onde ir). Padrão true. */
  redirecionar401?: boolean
}

export class ErroDaApi extends Error {
  readonly status: number
  readonly codigo: CodigoErro | 'rede'
  readonly mensagem: string
  readonly detalhes: Record<string, unknown> | undefined
  constructor(status: number, codigo: CodigoErro | 'rede', mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem)
    this.name = 'ErroDaApi'
    this.status = status
    this.codigo = codigo
    this.mensagem = mensagem
    this.detalhes = detalhes
  }
}

export function ehErroDaApi(e: unknown): e is ErroDaApi {
  return e instanceof ErroDaApi
}

/** Mensagem pronta para o aviso, de qualquer erro. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroDaApi) return e.mensagem
  return 'Não foi possível concluir. Tente de novo.'
}

// ─────────────── traces (eco do tempo real) ───────────────

const MAX_TRACES = 200
const traces: string[] = []
const conjunto = new Set<string>()

function novoTrace(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // fora de contexto seguro (http em IP da rede) não há randomUUID; v4 a partir de getRandomValues
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function guardarTrace(t: string) {
  traces.push(t)
  conjunto.add(t)
  if (traces.length > MAX_TRACES) conjunto.delete(traces.shift()!)
}

/** Traces das últimas mutações deste navegador (o tempo real ignora o próprio eco). */
export function ultimosTraces(): ReadonlySet<string> {
  return conjunto
}

export function ehMeuTrace(t: string | null | undefined): boolean {
  return !!t && conjunto.has(t)
}

// ─────────────── rota pública ───────────────

let rotaPublica = false

/** O roteador marca quando a tela atual é pública (/a/:token, /convite...): aí um 401 nunca redireciona. */
export function definirRotaPublica(publica: boolean): void {
  rotaPublica = publica
}

function irParaEntrar() {
  const { pathname, search, hash } = window.location
  if (pathname === '/entrar') return
  const volta = encodeURIComponent(pathname + search + hash)
  window.location.assign(`/entrar?volta=${volta}`)
}

// ─────────────── chamada ───────────────

/** Monta "?a=1&b=x" ignorando undefined/null; arrays repetem a chave. */
export function comConsulta(caminho: string, params: Record<string, unknown>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)))
    else q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
  }
  const s = q.toString()
  return s ? `${caminho}${caminho.includes('?') ? '&' : '?'}${s}` : caminho
}

export async function api<T>(metodo: Metodo, caminho: string, opcoes: OpcoesApi = {}): Promise<T> {
  const url = caminho.startsWith('/api/') || caminho === '/api' ? caminho : `/api${caminho.startsWith('/') ? '' : '/'}${caminho}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (opcoes.corpo !== undefined) {
    if (opcoes.corpo instanceof FormData) body = opcoes.corpo
    else { body = JSON.stringify(opcoes.corpo); headers['Content-Type'] = 'application/json' }
  }
  if (metodo !== 'GET') {
    const t = novoTrace()
    guardarTrace(t)
    headers[HEADER_TRACE] = t
  }
  if (opcoes.ifMatch !== undefined) headers[HEADER_IF_MATCH] = String(opcoes.ifMatch)
  if (opcoes.idempotencia) headers[HEADER_IDEMPOTENCIA] = opcoes.idempotencia

  let resp: Response
  try {
    resp = await fetch(url, { method: metodo, headers, body, credentials: 'same-origin', signal: opcoes.sinal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ErroDaApi(0, 'rede', 'Sem conexão com o servidor. Tente de novo em instantes.')
  }

  if (resp.status === 204 || resp.status === 205) return undefined as T
  const tipo = resp.headers.get('Content-Type') ?? ''
  const dados: unknown = tipo.includes('application/json') ? await resp.json().catch(() => null) : await resp.text().catch(() => '')

  if (resp.ok) return dados as T

  const erro = (dados as Partial<ErroApi> | null)?.erro
  const codigo: CodigoErro = erro?.codigo ?? (resp.status === 401 ? 'nao_autenticado' : 'interno')
  const mensagem = erro?.mensagem ?? (resp.status >= 500 ? 'O servidor não respondeu como deveria. Tente de novo.' : 'Não foi possível concluir.')
  const falha = new ErroDaApi(resp.status, codigo, mensagem, erro?.detalhes)
  if (resp.status === 401 && codigo === 'nao_autenticado' && !rotaPublica && opcoes.redirecionar401 !== false) irParaEntrar()
  throw falha
}
