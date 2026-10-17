/**
 * Datas de calendário para os componentes de UI (SeletorData, GradeCalendario). DataLocal = "YYYY-MM-DD" de São Paulo;
 * as contas são de calendário puro (meio-dia local, sem fuso no meio). Semana começa na segunda (API §1).
 * Regras de negócio (dias úteis, prazo) ficam em shared/logica/datas.ts, do NÚCLEO-SERVIDOR.
 */
import { FUSO, type DataLocal, type HoraLocal } from '@shared/tipos/index.ts'

export const DIAS_CURTOS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'] as const
export const DIAS_LONGOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'] as const
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

const dois = (n: number) => String(n).padStart(2, '0')

export function deDataLocal(s: DataLocal): Date {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(a, m - 1, d, 12)
}

export function paraDataLocal(d: Date): DataLocal {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

const formatoSP = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Hoje em São Paulo. */
export function hojeLocal(agora: Date = new Date()): DataLocal {
  return formatoSP.format(agora)
}

export function ehDataLocal(s: unknown): s is DataLocal {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(deDataLocal(s).getTime())
}

export function somarDias(s: DataLocal, n: number): DataLocal {
  const d = deDataLocal(s)
  d.setDate(d.getDate() + n)
  return paraDataLocal(d)
}

/** 0 = segunda … 6 = domingo. */
export function diaDaSemana(s: DataLocal): number {
  return (deDataLocal(s).getDay() + 6) % 7
}

export function ehFimDeSemana(s: DataLocal): boolean {
  return diaDaSemana(s) >= 5
}

export function inicioDaSemana(s: DataLocal): DataLocal {
  return somarDias(s, -diaDaSemana(s))
}

export function inicioDoMes(s: DataLocal): DataLocal {
  return `${s.slice(0, 7)}-01`
}

export function somarMeses(s: DataLocal, n: number): DataLocal {
  const d = deDataLocal(inicioDoMes(s))
  d.setMonth(d.getMonth() + n)
  return paraDataLocal(d)
}

export function mesmoMes(a: DataLocal, b: DataLocal): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** Semanas inteiras (segunda a domingo) que cobrem o mês de `s`. */
export function gradeDoMes(s: DataLocal): DataLocal[] {
  const primeiro = inicioDoMes(s)
  const d = deDataLocal(primeiro)
  d.setMonth(d.getMonth() + 1, 0)
  const ultimo = paraDataLocal(d)
  const inicio = inicioDaSemana(primeiro)
  const fim = somarDias(inicioDaSemana(ultimo), 6)
  const dias: DataLocal[] = []
  for (let x = inicio; x <= fim; x = somarDias(x, 1)) dias.push(x)
  return dias
}

export function diasDaSemana(s: DataLocal): DataLocal[] {
  const inicio = inicioDaSemana(s)
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))
}

/** "outubro de 2026" */
export function formatarMesAno(s: DataLocal): string {
  return `${MESES[Number(s.slice(5, 7)) - 1]} de ${s.slice(0, 4)}`
}

/** "qui, 16/10" ou "qui, 16/10, 18h" / "18h30" (o formato do contrato). */
export function formatarData(s: DataLocal, hora?: HoraLocal | null): string {
  const base = `${DIAS_CURTOS[diaDaSemana(s)]}, ${s.slice(8, 10)}/${s.slice(5, 7)}`
  return hora ? `${base}, ${formatarHora(hora)}` : base
}

/** "16/10" (o dia e o mês do formato do contrato, sem o dia da semana: colunas estreitas, "Entregue em 16/10"). */
export function formatarDiaBarraMes(s: DataLocal): string {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`
}

/** "16 out" (títulos de período, como a semana do calendário). */
export function formatarDiaMes(s: DataLocal): string {
  return `${Number(s.slice(8, 10))} ${MESES_CURTOS[Number(s.slice(5, 7)) - 1]}`
}

/** "18h" ou "18h30". */
export function formatarHora(h: HoraLocal): string {
  const [hh, mm] = h.split(':')
  return mm === '00' ? `${Number(hh)}h` : `${Number(hh)}h${mm}`
}

/** Aceita "18", "18h", "18h30", "1830", "18:30", "9:5"; devolve "HH:MM" ou null. */
export function lerHora(texto: string): HoraLocal | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  let m = t.match(/^(\d{1,2})(?:[:h](\d{1,2})?)?$/)
  if (!m) m = t.match(/^(\d{1,2})(\d{2})$/)
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return null
  return `${dois(h)}:${dois(min)}`
}
