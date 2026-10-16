/** Casamento de texto da paleta (leve: as fontes do núcleo usam sem baixar o cmdk). */
import { normalizarAlias } from '@shared/logica/texto.ts'

/** Todas as palavras do termo aparecem no texto (sem acento, sem caixa). Termo vazio casa tudo. */
export function casaTermo(termo: string, ...textos: (string | null | undefined)[]): boolean {
  const palavras = normalizarAlias(termo).split(' ').filter(Boolean)
  if (!palavras.length) return true
  const alvo = normalizarAlias(textos.filter(Boolean).join(' '))
  return palavras.every((p) => alvo.includes(p))
}
