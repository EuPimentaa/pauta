/** Texto: apelidos e etiquetas normalizados, menções no Markdown e linhas de ajuste. Puro. */
import type { Id } from '../tipos/nucleo.ts'

/** Minúsculo, sem acento, espaços simples e sem espaço nas pontas (apelidos de cliente e nomes de etiqueta). */
export function normalizarAlias(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Caracteres que não se veem na tela e o modelo lê: controles (Cc, menos \t \n \r, que cada uso trata), formatação
 * (Cf: largura zero, direção, tags U+E0000–E007F, hífen suave, U+2060…) e os ignoráveis do Unicode (seletores de
 * variação, preenchedores Hangul). Ficam só as "colas" de emoji: U+200D entre dois emojis e um U+FE0E/U+FE0F
 * sozinho (o do ✔ como emoji); uma fila de seletores (dados escondidos) sai.
 */
const COLA_DE_EMOJI = /(?<=[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F])\u200D(?=\p{Extended_Pictographic})|(?<![\uFE00-\uFE0F\u200D])[\uFE0E\uFE0F](?![\uFE00-\uFE0F])/u
const INVISIVEL = /(?![\t\n\r])[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u
const INVISIVEIS = new RegExp(`(${COLA_DE_EMOJI.source})|${INVISIVEL.source}`, 'gu')

/** O texto sem os caracteres invisíveis (acima); \t \n \r ficam. */
export function semInvisiveis(s: string): string {
  return s.replace(INVISIVEIS, (m, cola: string | undefined) => (cola === undefined ? '' : m))
}

/** Tem algum caractere invisível (acima)? Os nomes de uma linha (coluna, etiqueta, cliente, apelido) os recusam. */
export function temInvisivel(s: string): boolean {
  return semInvisiveis(s) !== s
}

const MENCAO =/@\[([^\]\n]{1,120})\]\(mencao:([A-Za-z0-9-]{1,64})\)/g

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

/**
 * Nome provisório tirado do e-mail (o admin do primeiro boot): "admin.revfun@x" → "Admin Revfun", "pedro@x" → "Pedro".
 * Os Primeiros passos pedem para o admin conferir enquanto o nome for este e não houver apelido.
 */
export function nomeDoEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const nome = local.split(/[._+-]+/).filter(Boolean)
    .map((p) => p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)).join(' ')
  return (nome || local).slice(0, 120)
}
