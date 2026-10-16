/**
 * O que os atalhos do núcleo (extensoes/atalhos/nucleo.ts) pedem à tela aberta. A página do quadro registra a parte
 * dela (filtros); o layout "Quadro" registra a dele (colunas, foco, criação rápida); o modal da demanda, a vizinha.
 * Só um de cada por vez; sem o layout do quadro (Lista, Calendário), as teclas dele não fazem nada.
 */
import type { Id } from '../../../shared/tipos/index.ts'

export type Direcao = 'cima' | 'baixo' | 'esquerda' | 'direita'

export interface ControlePagina {
  quadroId: Id
  /** Q: "Só as minhas". */
  alternarSoMinhas(): void
  /** X: limpa os filtros. */
  limparFiltros(): void
}

export interface ControleLayout {
  /** N: abre a criação rápida da coluna (a do card em foco; senão a primeira). false = nenhuma entrada registrada. */
  abrirEntrada(colunaId: Id | null): boolean
  /** \: recolhe ou abre a coluna (a do card em foco; senão a primeira aberta). */
  recolher(colunaId: Id | null): void
  /** Shift+\: recolhe todas (ou abre todas, se já estão recolhidas). */
  recolherTodas(): void
  /** Setas e J/K: o foco anda entre os cards. */
  moverFoco(d: Direcao): void
}

export type ControleQuadro = ControlePagina & ControleLayout

export interface ControleModal {
  demandaId: Id
  /** ←/→ e J/K: a vizinha da mesma coluna. */
  vizinha(passo: -1 | 1): void
}

let pagina: ControlePagina | null = null
let layout: ControleLayout | null = null
let modal: ControleModal | null = null

const SEM_LAYOUT: ControleLayout = { abrirEntrada: () => false, recolher: () => {}, recolherTodas: () => {}, moverFoco: () => {} }

export function definirControlePagina(c: ControlePagina | null): () => void {
  pagina = c
  return () => { if (pagina === c) pagina = null }
}

export function definirControleLayout(c: ControleLayout | null): () => void {
  layout = c
  return () => { if (layout === c) layout = null }
}

export function definirControleModal(c: ControleModal | null): () => void {
  modal = c
  return () => { if (modal === c) modal = null }
}

/** A página do quadro aberta, com as ações do layout dela (ou nenhuma). */
export const controleQuadro = (): ControleQuadro | null => (pagina ? { ...pagina, ...(layout ?? SEM_LAYOUT) } : null)
export const controleModal = (): ControleModal | null => modal
