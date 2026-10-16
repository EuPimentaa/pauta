/**
 * Texto do modal (F1), puro: menções inválidas viram texto, duração digitada ("1h30", "45", "1:15") em minutos e
 * minutos por extenso curto ("1h30", "45 min"). Servidor e front usam o mesmo código.
 */
import type { Id } from '../tipos/nucleo.ts'

const MENCAO = /@\[([^\]\n]{1,120})\]\(mencao:([A-Za-z0-9-]{1,64})\)/g

/**
 * Troca as menções `@[Nome](mencao:<id>)` cujo id não está em `validas` (pessoa inexistente ou desativada) por
 * `@Nome` em texto (API.md §4.15: "as inválidas viram texto"). As válidas ficam como vieram.
 */
export function limparMencoes(md: string, validas: ReadonlySet<Id>): string {
  return md.replace(MENCAO, (todo, nome: string, id: string) => (validas.has(id) ? todo : `@${nome}`))
}

/**
 * Duração digitada → minutos (1 a 1440), ou null. Aceita "90", "90m", "90 min", "1h", "1h30", "1h 30min", "1:30",
 * "1,5h", "1.5 h", "2 horas".
 */
export function lerDuracao(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null
  let min: number | null = null
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d{1,2}):(\d{1,2})$/))) {
    if (Number(m[2]) < 60) min = Number(m[1]) * 60 + Number(m[2])
  } else if ((m = t.match(/^(\d{1,2}(?:[.,]\d{1,2})?) ?(?:h|hr|hrs|hora|horas)$/))) {
    min = Math.round(Number(m[1]!.replace(',', '.')) * 60)
  } else if ((m = t.match(/^(\d{1,2}) ?(?:h|hr|hora|horas) ?(\d{1,2}) ?(?:m|min|mins|minuto|minutos)?$/))) {
    if (Number(m[2]) < 60) min = Number(m[1]) * 60 + Number(m[2])
  } else if ((m = t.match(/^(\d{1,4}) ?(?:m|min|mins|minuto|minutos)?$/))) {
    min = Number(m[1])
  }
  if (min === null || !Number.isFinite(min) || min < 1 || min > 1440) return null
  return min
}

/** 45 → "45 min"; 60 → "1h"; 90 → "1h30"; 0 → "0 min". */
export function formatarDuracao(minutos: number): string {
  const total = Math.max(0, Math.round(minutos))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** Tempo correndo do cronômetro em "h:mm" (0:07, 1:42, 12:05). */
export function formatarCorrendo(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}
