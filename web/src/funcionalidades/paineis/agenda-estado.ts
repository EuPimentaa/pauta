/**
 * A Agenda aberta registra como andar de período, para os atalhos do escopo `agenda` (Shift+← e Shift+→ mudam o
 * período, Shift+T volta para hoje), que rodam fora do render.
 */
export interface ControleAgenda {
  andar(passo: -1 | 1): void
  hoje(): void
}

let controle: ControleAgenda | null = null

export function registrarControleAgenda(c: ControleAgenda): () => void {
  controle = c
  return () => { if (controle === c) controle = null }
}

export function controleAgenda(): ControleAgenda | null {
  return controle
}
