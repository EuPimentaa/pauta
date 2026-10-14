/**
 * Datas locais de São Paulo (DataLocal 'YYYY-MM-DD', HoraLocal 'HH:MM') e dias úteis.
 * Puro: roda no Node e no navegador (só Intl). Feriado = dia não útil (tabela `feriado`, Set de DataLocal).
 * A semana começa na segunda.
 */
import { FUSO, type DataLocal, type HoraLocal, type Instante } from '../tipos/nucleo.ts'

const DIA_MS = 86_400_000
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

const formatoSP = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

/** Relógio de parede de São Paulo de um instante, como números. */
function partesSP(instante: Date): { ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number } {
  const p: Record<string, number> = {}
  for (const parte of formatoSP.formatToParts(instante)) {
    if (parte.type !== 'literal') p[parte.type] = Number(parte.value)
  }
  return { ano: p.year!, mes: p.month!, dia: p.day!, hora: p.hour! % 24, minuto: p.minute!, segundo: p.second! }
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** Data de hoje em São Paulo. */
export function hojeSP(agora: Date = new Date()): DataLocal {
  const p = partesSP(agora)
  return `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`
}

/** Dia local (São Paulo) de um instante. */
export function dataLocalDe(i: Instante): DataLocal {
  return hojeSP(new Date(i))
}

/** Hora local (São Paulo) de um instante, "HH:MM". */
export function horaLocalDe(i: Instante): HoraLocal {
  const p = partesSP(new Date(i))
  return `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`
}

/** "YYYY-MM-DD" que existe no calendário. */
export function ehDataLocal(s: unknown): s is DataLocal {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [a, m, d] = s.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(a, m - 1, d))
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** "HH:MM" de 00:00 a 23:59. */
export function ehHoraLocal(s: unknown): s is HoraLocal {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

function paraMs(d: DataLocal): number {
  const [a, m, dia] = d.split('-').map(Number) as [number, number, number]
  return Date.UTC(a, m - 1, dia)
}

function deMs(ms: number): DataLocal {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Soma dias corridos (negativo volta). */
export function somarDias(d: DataLocal, n: number): DataLocal {
  return deMs(paraMs(d) + n * DIA_MS)
}

/** Dias corridos de `de` até `ate` (negativo se `ate` vem antes). */
export function diasEntre(de: DataLocal, ate: DataLocal): number {
  return Math.round((paraMs(ate) - paraMs(de)) / DIA_MS)
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(d: DataLocal): number {
  return new Date(paraMs(d)).getUTCDay()
}

/** Segunda a sexta e fora dos feriados. */
export function ehDiaUtil(d: DataLocal, feriados: ReadonlySet<string>): boolean {
  const dia = diaDaSemana(d)
  return dia !== 0 && dia !== 6 && !feriados.has(d)
}

/** O primeiro dia útil DEPOIS de `d` (nunca o próprio `d`). */
export function proximoDiaUtil(d: DataLocal, feriados: ReadonlySet<string>): DataLocal {
  let atual = somarDias(d, 1)
  while (!ehDiaUtil(atual, feriados)) atual = somarDias(atual, 1)
  return atual
}

/** `d` se for dia útil; senão o próximo dia útil. */
export function diaUtilOuProximo(d: DataLocal, feriados: ReadonlySet<string>): DataLocal {
  return ehDiaUtil(d, feriados) ? d : proximoDiaUtil(d, feriados)
}

/** O último dia útil ANTES de `d` (a "véspera útil"). */
export function diaUtilAnterior(d: DataLocal, feriados: ReadonlySet<string>): DataLocal {
  let atual = somarDias(d, -1)
  while (!ehDiaUtil(atual, feriados)) atual = somarDias(atual, -1)
  return atual
}

/**
 * `d` + `n` dias úteis: cada passo pula fim de semana e feriado. n = 0 devolve `d` como está (prazo "para hoje").
 * Ex.: qua 14/10 + 2 = sex 16/10; sex + 1 = seg.
 */
export function somarDiasUteis(d: DataLocal, n: number, feriados: ReadonlySet<string>): DataLocal {
  let atual = d
  for (let i = 0; i < n; i++) atual = proximoDiaUtil(atual, feriados)
  return atual
}

/**
 * Dias úteis contados DEPOIS de `de` até `ate` inclusive (o "parado há N dias úteis"): mesmo dia = 0, de sexta para
 * a segunda seguinte = 1. `ate` antes de `de` = 0.
 */
export function diasUteisEntre(de: DataLocal, ate: DataLocal, feriados: ReadonlySet<string>): number {
  if (ate <= de) return 0
  let n = 0
  for (let atual = somarDias(de, 1); atual <= ate; atual = somarDias(atual, 1)) {
    if (ehDiaUtil(atual, feriados)) n++
  }
  return n
}

/** Segunda-feira da semana de `d` (a semana começa na segunda). */
export function segundaDaSemana(d: DataLocal): DataLocal {
  const dia = diaDaSemana(d)
  return somarDias(d, dia === 0 ? -6 : 1 - dia)
}

/** Último dia do mês de `ano`/`mes` (1–12). */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/**
 * Instante em que o relógio de São Paulo marca `d` às `h`. Calcula o fuso pelo Intl (vale também para datas
 * antigas com horário de verão).
 */
export function instanteSP(d: DataLocal, h: HoraLocal): Date {
  const [a, m, dia] = d.split('-').map(Number) as [number, number, number]
  const [hh, mi] = h.split(':').map(Number) as [number, number]
  const alvo = Date.UTC(a, m - 1, dia, hh, mi)
  let t = alvo + 3 * 3_600_000
  for (let i = 0; i < 3; i++) {
    const p = partesSP(new Date(t))
    const parede = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
    if (parede === alvo) break
    t += alvo - parede
  }
  return new Date(t)
}

/** "qui, 16/10, 18h" ("18h30" com minutos); sem hora: "qui, 16/10". */
export function formatarPrazo(d: DataLocal, h: HoraLocal | null): string {
  const [, m, dia] = d.split('-') as [string, string, string]
  const base = `${DIAS_SEMANA[diaDaSemana(d)]}, ${dia}/${m}`
  if (!h) return base
  const [hh, mi] = h.split(':') as [string, string]
  return `${base}, ${Number(hh)}h${mi === '00' ? '' : mi}`
}
