/**
 * O que os atalhos do núcleo (extensoes/atalhos/nucleo.ts) pedem à tela aberta: a página do quadro e o modal da
 * demanda registram aqui enquanto estão montados (só um de cada por vez).
 */
import type { Id } from '../../../shared/tipos/index.ts'

export type Direcao = 'cima' | 'baixo' | 'esquerda' | 'direita'

export interface ControleQuadro {
  quadroId: Id
  /** Q: "Só as minhas". */
  alternarSoMinhas(): void
  /** X: limpa os filtros. */
  limparFiltros(): void
  /** N: abre a criação rápida da coluna (a do card em foco; senão a primeira). false = nenhuma entrada registrada. */
  abrirEntrada(colunaId: Id | null): boolean
  /** \: recolhe ou abre a coluna (a do card em foco; senão a primeira). */
  recolher(colunaId: Id | null): void
  /** Shift+\: recolhe todas (ou abre todas, se já estão recolhidas). */
  recolherTodas(): void
  /** Setas e J/K: o foco anda entre os cards. */
  moverFoco(d: Direcao): void
}

export interface ControleModal {
  demandaId: Id
  /** ←/→ e J/K: a vizinha da mesma coluna. */
  vizinha(passo: -1 | 1): void
}

let quadro: ControleQuadro | null = null
let modal: ControleModal | null = null

export function definirControleQuadro(c: ControleQuadro | null): () => void {
  quadro = c
  return () => { if (quadro === c) quadro = null }
}

export function definirControleModal(c: ControleModal | null): () => void {
  modal = c
  return () => { if (modal === c) modal = null }
}

export const controleQuadro = (): ControleQuadro | null => quadro
export const controleModal = (): ControleModal | null => modal
