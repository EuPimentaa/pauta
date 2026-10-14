/** Texto: apelidos e etiquetas normalizados, menções no Markdown e linhas de ajuste. Puro. */
import type { Id } from '../tipos/nucleo.ts'

/** Minúsculo, sem acento, espaços simples e sem espaço nas pontas (apelidos de cliente e nomes de etiqueta). */
export function normalizarAlias(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const MENCAO = /@\[([^\]\n]{1,120})\]\(mencao:([A-Za-z0-9-]{1,64})\)/g

/** Ids das menções `@[Nome](mencao:<id>)`, sem repetir, na ordem em que aparecem. */
export function extrairMencoes(md: string): Id[] {
  const ids: Id[] = []
  for (const m of md.matchAll(MENCAO)) {
    if (!ids.includes(m[2]!)) ids.push(m[2]!)
  }
  return ids
}

/**
 * Uma linha = um item: tira linhas vazias e os marcadores do começo ("-", "*", "•", "1.", "1)", "[ ]", "[x]").
 * Usado nas rodadas de ajuste ("Ajustes R2") e no colar de itens de checklist.
 */
export function linhasParaItens(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha
      .replace(/^\s*(?:[-*•–]|\d{1,3}[.)])\s*/u, '')
      .replace(/^\[[ xX]?\]\s*/, '')
      .trim())
    .filter((linha) => linha.length > 0)
}
