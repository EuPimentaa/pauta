/**
 * Chaves de ordenação REAL (API.md §5.10): entre vizinhos = média; topo = primeiro − 1024; fim = último + 1024.
 * Quando a folga fica abaixo de 1e-6, o servidor renormaliza o escopo com passo 1024.
 */

export const PASSO_POSICAO = 1024
export const FOLGA_MINIMA = 1e-6

/** Chave entre `antes` e `depois` (null = sem vizinho daquele lado). */
export function entre(antes: number | null, depois: number | null): number {
  if (antes === null && depois === null) return PASSO_POSICAO
  if (antes === null) return depois! - PASSO_POSICAO
  if (depois === null) return antes + PASSO_POSICAO
  return (antes + depois) / 2
}

/** true se não cabe mais uma chave com folga entre `a` e `b`. */
export function precisaRenormalizar(a: number, b: number): boolean {
  return Math.abs(b - a) < FOLGA_MINIMA * 2
}
