/**
 * Datas e fuso do iCal (RFC 5545 §3.3.4, §3.3.5, §3.3.6; pesquisa-ical §4).
 * - Hora local + TZID → instante pelo `Intl` (tzdata do Node), NUNCA pelo VTIMEZONE do arquivo: o Google projeta só a
 *   regra atual desde 1970 e erraria 1 h todo horário de verão antigo de São Paulo (caso F1).
 * - O VTIMEZONE só serve de reserva para TZID que o `Intl` não conhece (ex.: "E. South America Standard Time" do Outlook):
 *   desvio fixo do STANDARD. Sem ele: São Paulo, e a contagem `fusosDesconhecidos` sobe.
 * - Hora que não existiu (início do horário de verão) desloca com o desvio de antes da lacuna; hora que aconteceu duas
 *   vezes vale a primeira (RFC §3.3.5). Uma ocorrência de série numa hora inexistente também desloca em vez de sumir
 *   (a RFC §3.3.10 manda ignorar; preferimos não perder um compromisso: só afeta 00:00–00:59 de domingos de início de
 *   horário de verão até 2018).
 * "Local" aqui é o relógio de parede guardado como se fosse UTC (ms): `Date.UTC(ano, mes - 1, dia, h, m, s)`. Nada usa
 * os métodos locais de `Date`, então o resultado não depende do TZ do servidor (caso B6).
 */
import { FUSO } from '../../../shared/tipos/index.ts'
import type { Componente } from './agenda-ical-leitura.ts'
import { prop } from './agenda-ical-leitura.ts'

const HORA = 3_600_000
export const DIA_MS = 86_400_000

const formatos = new Map<string, Intl.DateTimeFormat | null>()

function formato(fuso: string): Intl.DateTimeFormat | null {
  let f = formatos.get(fuso)
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: fuso, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
      })
    } catch {
      f = null
    }
    formatos.set(fuso, f)
  }
  return f
}

/** O `Intl` conhece o fuso (IANA)? */
export function fusoConhecido(fuso: string): boolean {
  return formato(fuso) !== null
}

/** Relógio de parede do fuso num instante, como ms "local" (whole seconds). */
export function paredeMs(fuso: string, instanteMs: number): number {
  const f = formato(fuso) ?? formato(FUSO)!
  const p: Record<string, string> = {}
  for (const parte of f.formatToParts(new Date(instanteMs))) if (parte.type !== 'literal') p[parte.type] = parte.value
  return utc(Number(p.year), Number(p.month), Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second))
}

function desvio(fuso: string, instanteMs: number): number {
  const inteiro = Math.floor(instanteMs / 1000) * 1000
  return paredeMs(fuso, inteiro) - inteiro
}

/**
 * Desvio do fuso que vale em todo um bloco de 6 h (com 15 h de folga dos dois lados), ou null se ele muda ali dentro.
 * Os desvios ficam entre −12 h e +14 h, então toda hora local do bloco (e todo instante dele) cai na faixa conferida:
 * com o desvio estável, a conversão é uma subtração. As mudanças de horário de verão ficam meses afastadas, então
 * conferir as duas pontas basta. Corta as chamadas ao Intl de ~4 por ocorrência para ~2 por bloco.
 */
const BLOCO = 6 * HORA
const estaveis = new Map<string, Map<number, number | null>>()

function desvioDoBloco(fuso: string, bloco: number): number | null {
  let m = estaveis.get(fuso)
  if (!m) { m = new Map(); estaveis.set(fuso, m) }
  let v = m.get(bloco)
  if (v === undefined) {
    if (m.size > 200_000) m.clear()
    const a = desvio(fuso, bloco * BLOCO - 15 * HORA)
    const b = desvio(fuso, (bloco + 1) * BLOCO + 15 * HORA)
    v = a === b ? a : null
    m.set(bloco, v)
  }
  return v
}

/** Como `paredeMs`, mas pelo desvio do bloco quando ele é estável (o caminho exato só perto de uma mudança). */
export function paredeRapida(fuso: string, instanteMs: number): number {
  const o = formato(fuso) ? desvioDoBloco(fuso, Math.floor(instanteMs / BLOCO)) : null
  return o === null ? paredeMs(fuso, Math.floor(instanteMs / 1000) * 1000) + (instanteMs % 1000) : instanteMs + o
}

/** Hora local de um fuso IANA → instante (ms). Dois candidatos: o mais cedo; nenhum: o desvio de antes da lacuna. */
export function localParaInstante(localMs: number, fuso: string): number {
  const estavel = formato(fuso) ? desvioDoBloco(fuso, Math.floor(localMs / BLOCO)) : null
  if (estavel !== null) return localMs - estavel
  const o1 = desvio(fuso, localMs - 12 * HORA)
  const o2 = desvio(fuso, localMs + 12 * HORA)
  let melhor: number | null = null
  for (const candidato of o1 === o2 ? [localMs - o1] : [localMs - o1, localMs - o2]) {
    if (paredeMs(fuso, candidato) === localMs && (melhor === null || candidato < melhor)) melhor = candidato
  }
  return melhor ?? localMs - o1
}

// ─────────────────────────────── valores de data e hora ───────────────────────────────

/** Um DTSTART/DTEND/EXDATE/RECURRENCE-ID lido: data (dia inteiro), UTC ou hora local (com TZID ou flutuante). */
export type ValorData =
  | { tipo: 'data'; localMs: number }
  | { tipo: 'utc'; ms: number }
  | { tipo: 'local'; localMs: number; tzid: string | null }

const RE_DATA = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/

/** "20261020", "20261020T130000Z", "20261020T130000" → valor (null: fora do formato ou data que não existe). */
export function lerValorData(texto: string, tzid: string | null, soData = false): ValorData | null {
  const m = RE_DATA.exec(texto.trim())
  if (!m) return null
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const temHora = m[4] !== undefined
  const [h, mi, s] = temHora ? [Number(m[4]), Number(m[5]), Number(m[6])] : [0, 0, 0]
  if (mes < 1 || mes > 12 || dia < 1 || h > 23 || mi > 59 || s > 60) return null
  const local = utc(ano, mes, dia, h, mi, Math.min(s, 59))
  const d = new Date(local)
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  if (!temHora || soData) return { tipo: 'data', localMs: utc(ano, mes, dia) }
  if (m[7]) return { tipo: 'utc', ms: local }
  return { tipo: 'local', localMs: local, tzid }
}

/** Date.UTC sem a armadilha dos anos 0–99 (que ele trata como 1900+). */
export function utc(ano: number, mes: number, dia: number, h = 0, mi = 0, s = 0): number {
  if (ano < 0 || ano > 99) return Date.UTC(ano, mes - 1, dia, h, mi, s)
  const d = new Date(Date.UTC(2000, mes - 1, dia, h, mi, s))
  d.setUTCFullYear(ano)
  return d.getTime()
}

/** "YYYY-MM-DD" de um ms local (ou de um instante em UTC). */
export function dataDoLocal(localMs: number): string {
  return new Date(localMs).toISOString().slice(0, 10)
}

/** DURATION simples (P#W, P#D, PT#H#M#S, com sinal): ms e, para o dia inteiro, os dias nominais. */
export function lerDuracao(texto: string): { ms: number; dias: number } | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(texto.trim())
  if (!m || texto.trim() === 'P' || /T$/.test(texto.trim())) return null
  const sinal = m[1] === '-' ? -1 : 1
  const dias = Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)
  const ms = dias * DIA_MS + Number(m[4] ?? 0) * HORA + Number(m[5] ?? 0) * 60_000 + Number(m[6] ?? 0) * 1000
  return { ms: sinal * ms, dias: sinal * dias }
}

// ─────────────────────────────── resolução de TZID ───────────────────────────────

/** Converte hora local em instante (ms) num fuso já resolvido. */
export type ParaInstante = (localMs: number) => number

/**
 * Resolve TZID → conversor, uma vez por fuso no arquivo. IANA pelo `Intl`; senão o STANDARD do VTIMEZONE (desvio fixo);
 * senão São Paulo. Os dois últimos casos contam em `desconhecidos` (um por TZID).
 */
export class Fusos {
  readonly desconhecidos = new Set<string>()
  private readonly cache = new Map<string, ParaInstante>()
  private readonly vtimezones: Map<string, Componente>
  /** Fuso da hora flutuante: X-WR-TIMEZONE (se o Intl conhecer), senão São Paulo. */
  readonly flutuante: string

  constructor(vtimezones: Componente[], xWrTimezone: string | null) {
    this.vtimezones = new Map()
    for (const v of vtimezones) {
      const id = prop(v, 'TZID')?.valor.trim()
      if (id) this.vtimezones.set(id, v)
    }
    this.flutuante = xWrTimezone && fusoConhecido(xWrTimezone) ? xWrTimezone : FUSO
  }

  /** Conversor do TZID (null = hora flutuante). */
  conversor(tzid: string | null): ParaInstante {
    const chave = tzid ?? '\u0000flutuante'
    let c = this.cache.get(chave)
    if (c) return c
    if (tzid === null) {
      const f = this.flutuante
      c = (l) => localParaInstante(l, f)
    } else {
      const limpo = tzid.replace(/^\/+/, '')
      if (fusoConhecido(limpo)) {
        c = (l) => localParaInstante(l, limpo)
      } else {
        this.desconhecidos.add(tzid)
        const fixo = desvioFixo(this.vtimezones.get(tzid))
        c = fixo === null ? (l) => localParaInstante(l, FUSO) : (l) => l - fixo
      }
    }
    this.cache.set(chave, c)
    return c
  }

  /** Instante (ms) de um valor de data-hora (data = meia-noite local no fuso da hora flutuante). */
  instante(v: ValorData): number {
    if (v.tipo === 'utc') return v.ms
    if (v.tipo === 'data') return this.conversor(null)(v.localMs)
    return this.conversor(v.tzid)(v.localMs)
  }
}

/** TZOFFSETTO do STANDARD mais recente do VTIMEZONE (ms), ou null. */
function desvioFixo(v: Componente | undefined): number | null {
  if (!v) return null
  const partes = v.filhos.filter((f) => f.nome === 'STANDARD')
  const escolhido = partes.length > 0 ? partes : v.filhos.filter((f) => f.nome === 'DAYLIGHT')
  let melhor: { inicio: string; desvio: number } | null = null
  for (const p of escolhido) {
    const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(prop(p, 'TZOFFSETTO')?.valor.trim() ?? '')
    if (!m) continue
    const desvio = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * HORA + Number(m[3]) * 60_000 + Number(m[4] ?? 0) * 1000)
    const inicio = prop(p, 'DTSTART')?.valor ?? ''
    if (!melhor || inicio > melhor.inicio) melhor = { inicio, desvio }
  }
  return melhor?.desvio ?? null
}
