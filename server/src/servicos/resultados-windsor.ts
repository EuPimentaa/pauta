/**
 * Fase 2 (F8): o cliente HTTP da Windsor.ai (API.md §F.8; pesquisa-windsor §3–§9). O ÚNICO arquivo que vê a resposta da
 * Windsor: a chave vai na URL (a Windsor só aceita na query) e o erro de chave inválida devolve a chave no texto
 * (medido), então:
 * - a URL é montada com URLSearchParams na hora da chamada e nunca vai a log, exceção nem resposta;
 * - de uma resposta de erro lê no máximo 4 KB, só para classificar, e devolve uma FalhaWindsor com o erro do Pauta
 *   (ERROS_WINDSOR), o status HTTP e o `code` (um dos conhecidos ou "outro"); nenhum texto da Windsor sai daqui;
 * - o log é fixo: `windsor <conector> http=<status> code=<code>`;
 * - `fetch` com `redirect: 'error'` (um 302 vira fora_do_ar sem seguir), `credentials: 'omit'` e 60 s de limite.
 *
 * A cota: cada chamada soma em `windsor_uso` (dia de São Paulo) antes de sair; passou de TETO_DIA no dia, `limite` sem
 * chamar. A busca é trocável (`definirBuscaWindsor`, como `definirBuscaDrive`); `definirEnderecosWindsor` aponta a busca
 * HTTP de verdade para um servidor falso nos testes. Em desenvolvimento, `WINDSOR_API_KEY=fixtures` lê as fixtures
 * (resultados-fixtures.ts).
 */
import { z } from 'zod'
import type { ConectorWindsor, DataLocal, ErroWindsor } from '../../../shared/tipos/index.ts'
import type { LinhaWindsor } from '../../../shared/tipos/ext/resultados.ts'
import { hojeSP } from '../../../shared/logica/datas.ts'
import { idConta } from '../../../shared/logica/resultados-calculo.ts'
import { config } from '../config.ts'
import { agora, agoraData, rodar, um, type Db } from '../db.ts'
import { buscaFixtures } from './resultados-fixtures.ts'

/** O Pauta para aqui (a Windsor aceita 10.000 por dia). */
export const TETO_DIA = 8000
/** Limite de cada chamada. */
export const LIMITE_MS = 60_000
/** Quanto de uma resposta de erro é lido (só para classificar). */
const ERRO_MAX_BYTES = 4096
/** Teto de uma resposta boa (90 dias com comparação passam pouco de 1 MB). */
const RESPOSTA_MAX_BYTES = 32 * 1024 * 1024

/** `code` da Windsor que o Pauta conhece (o resto vira "outro"); os do Pauta dizem o que aconteceu do nosso lado. */
const CODES_WINDSOR = ['user_error', 'unauthorized', 'invalid_request', 'authentication_error', 'permission_denied',
  'not_found', 'rate_limit_exceeded', 'server_error'] as const
export type CodeWindsor = (typeof CODES_WINDSOR)[number] | 'rede' | 'tempo' | 'redirecionamento' | 'corpo' | 'teto' | 'excecao' | 'outro'

/** Falha de uma chamada à Windsor, já sem nada do que ela respondeu. */
export class FalhaWindsor extends Error {
  readonly erro: ErroWindsor
  readonly http: number | null
  readonly code: CodeWindsor
  constructor(erro: ErroWindsor, http: number | null, code: CodeWindsor) {
    super(`Windsor: ${erro}`)
    this.name = 'FalhaWindsor'
    this.erro = erro
    this.http = http
    this.code = code
  }
}

export interface PedidoDados {
  conector: ConectorWindsor
  campos: readonly string[]
  de: DataLocal
  ate: DataLocal
  /** As contas em `select_accounts`. Vazio = todas as da chave (só a lista de contas usa). */
  contas: readonly string[]
  /** JSON do parâmetro `filter` (ex.: [["conversions","gt",0]]). */
  filtro?: unknown
}

/** Uma conta da lista da Windsor. */
export interface ContaDaLista {
  contaId: string
  nome: string
  status: string | null
}

export interface BuscaWindsor {
  /** As linhas de `{"data":[...]}` só com os campos pedidos (números ou null; textos como texto). */
  dados(p: PedidoDados): Promise<LinhaWindsor[]>
  /** A lista de contas do conector (ds-accounts). */
  contas(conector: ConectorWindsor): Promise<ContaDaLista[]>
}

// ─────────────────────────────── texto de fora ───────────────────────────────

/** Nome de conta ou campanha como texto puro de uma linha: sem controles nem marcas de direção, até `max`. */
export function limparNome(s: unknown, max = 200): string {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩﻿]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

// ─────────────────────────────── validação ───────────────────────────────

/** Campos de texto (dimensões); os outros são números. */
const TEXTOS = new Set(['date', 'account_id', 'account_name', 'account_currency', 'currency', 'campaign_id', 'campaign',
  'objective', 'advertising_channel_type', 'campaign_status', 'event_name', 'datasource'])

const numero = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]).nullish()
  .transform((v) => (v === undefined || v === null || !Number.isFinite(v) ? null : v))
const textoOuNumero = z.union([z.string(), z.number()]).nullish().transform((v) => (v === undefined || v === null ? null : String(v)))

const corpoDados = z.object({ data: z.array(z.record(z.string(), z.unknown())) })
const corpoContas = z.array(z.looseObject({
  datasource: z.string().nullish(), account_id: z.union([z.string(), z.number()]), account_name: z.string().nullish(),
  status: z.string().nullish(),
}))

function normalizarData(v: string | null): string | null {
  if (v && /^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
  return v
}

/** Valida o corpo e devolve as linhas só com os campos pedidos. Fora do formato → resposta_invalida. */
export function lerLinhas(corpo: unknown, campos: readonly string[], http: number | null = 200): LinhaWindsor[] {
  const r = corpoDados.safeParse(corpo)
  if (!r.success) throw new FalhaWindsor('resposta_invalida', http, 'corpo')
  return r.data.data.map((bruta) => {
    const linha: LinhaWindsor = {}
    for (const c of campos) {
      const v = (TEXTOS.has(c) ? textoOuNumero : numero).safeParse(bruta[c])
      if (!v.success) throw new FalhaWindsor('resposta_invalida', http, 'corpo')
      let valor = v.data as string | number | null
      if (c === 'date') valor = normalizarData(valor as string | null)
      if (c === 'account_id' && valor !== null) valor = idConta(valor)
      if ((c === 'campaign' || c === 'account_name' || c === 'event_name') && typeof valor === 'string') valor = limparNome(valor) || null
      linha[c] = valor
    }
    return linha
  })
}

/** A lista do ds-accounts validada: ids normalizados (Meta sem act_), só dígitos e hífen; nomes limpos. */
export function lerContas(corpo: unknown, conector: ConectorWindsor): ContaDaLista[] {
  const r = corpoContas.safeParse(corpo)
  if (!r.success) throw new FalhaWindsor('resposta_invalida', 200, 'corpo')
  const vistas = new Map<string, ContaDaLista>()
  for (const c of r.data) {
    if (c.datasource && c.datasource !== conector) continue
    const contaId = idConta(c.account_id)
    if (!/^[0-9-]{1,40}$/.test(contaId)) continue
    vistas.set(contaId, { contaId, nome: limparNome(c.account_name) || contaId, status: c.status ? limparNome(c.status, 40) || null : null })
  }
  return [...vistas.values()]
}

// ─────────────────────────────── HTTP ───────────────────────────────

const ENDERECOS_PADRAO = {
  dados: 'https://connectors.windsor.ai',
  contas: 'https://onboard.windsor.ai/api/common/ds-accounts',
  limiteMs: LIMITE_MS,
}
let enderecos = { ...ENDERECOS_PADRAO }

/** Testes: aponta a busca HTTP para um servidor falso (e encurta o limite). Sem argumento, volta ao padrão. */
export function definirEnderecosWindsor(e?: Partial<typeof ENDERECOS_PADRAO>): void {
  enderecos = { ...ENDERECOS_PADRAO, ...(e ?? {}) }
}

async function lerAte(r: Response, max: number): Promise<{ bytes: Buffer; cortado: boolean }> {
  if (!r.body) return { bytes: Buffer.alloc(0), cortado: false }
  const leitor = r.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  let cortado = false
  try {
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      if (total + value.byteLength > max) {
        partes.push(value.subarray(0, max - total))
        total = max
        cortado = true
        break
      }
      partes.push(value)
      total += value.byteLength
    }
  } finally {
    void leitor.cancel().catch(() => {})
  }
  return { bytes: Buffer.concat(partes), cortado }
}

/** Status + o código do corpo de erro → o erro do Pauta. O texto lido morre aqui. */
function classificar(status: number, bruto: string): FalhaWindsor {
  let code: CodeWindsor = 'outro'
  try {
    const j = JSON.parse(bruto) as { code?: unknown; error?: unknown }
    const c = typeof j?.code === 'string' ? j.code
      : (j?.error && typeof j.error === 'object' && typeof (j.error as { code?: unknown }).code === 'string') ? (j.error as { code: string }).code : null
    if (c && (CODES_WINDSOR as readonly string[]).includes(c)) code = c as CodeWindsor
  } catch {
    // corpo que não é JSON: fica "outro"
  }
  const texto = bruto.toLowerCase()
  if (status === 429 || code === 'rate_limit_exceeded') return new FalhaWindsor('limite', status, code)
  if (status >= 500 || code === 'server_error') return new FalhaWindsor('fora_do_ar', status, code)
  if (status === 401 || status === 403 || code === 'unauthorized' || code === 'authentication_error' || code === 'permission_denied'
    || /api[\s_-]?key|not authorized/.test(texto)) {
    return new FalhaWindsor('chave_invalida', status, code)
  }
  if (/account/.test(texto)) return new FalhaWindsor('conta_nao_conectada', status, code)
  return new FalhaWindsor('resposta_invalida', status, code)
}

async function pedirJson(url: URL): Promise<unknown> {
  let r: Response
  try {
    r = await fetch(url, {
      redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(enderecos.limiteMs), headers: { Accept: 'application/json' },
    })
  } catch (e) {
    const nome = e instanceof Error ? e.name : ''
    if (nome === 'TimeoutError' || nome === 'AbortError') throw new FalhaWindsor('fora_do_ar', null, 'tempo')
    const causa = e instanceof Error && e.cause instanceof Error ? e.cause.message : ''
    throw new FalhaWindsor('fora_do_ar', null, /redirect/i.test(causa) ? 'redirecionamento' : 'rede')
  }
  try {
    if (!r.ok) {
      const { bytes } = await lerAte(r, ERRO_MAX_BYTES)
      throw classificar(r.status, bytes.toString('utf8'))
    }
    const { bytes, cortado } = await lerAte(r, RESPOSTA_MAX_BYTES)
    if (cortado) throw new FalhaWindsor('resposta_invalida', r.status, 'corpo')
    try {
      return JSON.parse(bytes.toString('utf8')) as unknown
    } catch {
      throw new FalhaWindsor('resposta_invalida', r.status, 'corpo')
    }
  } catch (e) {
    if (e instanceof FalhaWindsor) throw e
    const nome = e instanceof Error ? e.name : ''
    throw new FalhaWindsor('fora_do_ar', r.status, nome === 'TimeoutError' || nome === 'AbortError' ? 'tempo' : 'rede')
  }
}

function chave(): string {
  const k = config.windsorApiKey
  if (!k) throw new FalhaWindsor('chave_invalida', null, 'outro')
  return k
}

const buscaHttp: BuscaWindsor = {
  async dados(p) {
    const url = new URL(`${enderecos.dados.replace(/\/+$/, '')}/${p.conector}`)
    const q = new URLSearchParams({ api_key: chave(), fields: p.campos.join(','), date_from: p.de, date_to: p.ate })
    if (p.contas.length > 0) q.set('select_accounts', p.contas.join(','))
    if (p.filtro !== undefined) q.set('filter', JSON.stringify(p.filtro))
    url.search = q.toString()
    return lerLinhas(await pedirJson(url), p.campos)
  },
  async contas(conector) {
    const url = new URL(enderecos.contas)
    url.search = new URLSearchParams({ datasource: conector, api_key: chave() }).toString()
    return lerContas(await pedirJson(url), conector)
  },
}

let buscaTrocada: BuscaWindsor | null = null

/** Troca a busca da Windsor (testes); sem argumento, volta à de verdade. */
export function definirBuscaWindsor(fn?: BuscaWindsor): void {
  buscaTrocada = fn ?? null
}

/** `WINDSOR_API_KEY=fixtures` fora de produção: as fixtures, sem rede. */
export function modoFixtures(): boolean {
  return !config.producao && config.windsorApiKey === 'fixtures'
}

function busca(): BuscaWindsor {
  if (buscaTrocada) return buscaTrocada
  return modoFixtures() ? buscaFixtures : buscaHttp
}

/** A chave está configurada (sem ela: estado `sem_chave`, sem chamar nada). */
export function temChave(): boolean {
  return !!config.windsorApiKey
}

// ─────────────────────────────── cota e chamadas ───────────────────────────────

/** Chamadas à Windsor hoje (dia de São Paulo). */
export function usoHoje(db: Db): number {
  return Number(um<{ n: number }>(db, 'SELECT chamadas n FROM windsor_uso WHERE dia = ?', hojeSP(agoraData()))?.n ?? 0)
}

/** Reserva uma chamada na cota do dia; passou do teto → limite, sem contar. */
function reservar(db: Db): void {
  const dia = hojeSP(agoraData())
  const n = Number(um<{ n: number }>(db, 'SELECT chamadas n FROM windsor_uso WHERE dia = ?', dia)?.n ?? 0)
  if (n >= TETO_DIA) throw new FalhaWindsor('limite', null, 'teto')
  rodar(db, `INSERT INTO windsor_uso (dia, chamadas) VALUES (?, 1)
             ON CONFLICT (dia) DO UPDATE SET chamadas = chamadas + 1`, dia)
}

function registrarErro(db: Db, conector: ConectorWindsor, f: FalhaWindsor): void {
  console.error(`windsor ${conector} http=${f.http ?? '-'} code=${f.code}`)
  if (f.code === 'teto') return
  rodar(db, `INSERT INTO windsor_uso (dia, chamadas, erros, ultimo_erro, ultimo_erro_em) VALUES (?, 0, 1, ?, ?)
             ON CONFLICT (dia) DO UPDATE SET erros = erros + 1, ultimo_erro = excluded.ultimo_erro, ultimo_erro_em = excluded.ultimo_erro_em`,
  hojeSP(agoraData()), f.erro, agora())
}

/** Qualquer exceção da busca vira FalhaWindsor (uma exceção que não é dela nunca sai como veio). */
function comoFalha(e: unknown): FalhaWindsor {
  return e instanceof FalhaWindsor ? e : new FalhaWindsor('fora_do_ar', null, 'excecao')
}

/** Uma chamada de dados, com a cota e o log fixo. Falha sempre como FalhaWindsor. */
export async function chamarDados(db: Db, p: PedidoDados): Promise<LinhaWindsor[]> {
  try {
    reservar(db)
    return await busca().dados(p)
  } catch (e) {
    const f = comoFalha(e)
    registrarErro(db, p.conector, f)
    throw f
  }
}

/** A lista de contas do conector (ds-accounts), com a cota e o log fixo. */
export async function chamarContas(db: Db, conector: ConectorWindsor): Promise<ContaDaLista[]> {
  try {
    reservar(db)
    return await busca().contas(conector)
  } catch (e) {
    const f = comoFalha(e)
    registrarErro(db, conector, f)
    throw f
  }
}
