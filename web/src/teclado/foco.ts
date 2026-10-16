/**
 * "Onde a pessoa está" para atalhos, comandos e itens de menu (ContextoAcao.demandaEmFoco e quadroAtual):
 * - card em foco: o card com o foco do teclado; sem foco, o card sob o mouse (como o Trello: passar o mouse e
 *   apertar Espaço entra na demanda);
 * - a demanda do modal aberto vale mais que o card de baixo;
 * - o quadro aberto em /q/:slug (ou o da demanda do modal).
 * Guarda ids; quem lê pega o objeto atual do cache.
 */
import { useSyncExternalStore } from 'react'
import type { Id } from '../../../shared/tipos/index.ts'

interface Lugar {
  focado: Id | null
  sobMouse: Id | null
  modal: Id | null
  quadro: Id | null
  quadroDoModal: Id | null
}

let lugar: Lugar = { focado: null, sobMouse: null, modal: null, quadro: null, quadroDoModal: null }
const ouvintes = new Set<() => void>()

function mudar(parcial: Partial<Lugar>) {
  const novo = { ...lugar, ...parcial }
  if ((Object.keys(parcial) as (keyof Lugar)[]).every((k) => novo[k] === lugar[k])) return
  lugar = novo
  ouvintes.forEach((f) => f())
}

export function assinarLugar(f: () => void): () => void {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

export const lugarAtual = (): Readonly<Lugar> => lugar

/** Id da demanda em foco agora: a do modal; senão o card focado; senão o card sob o mouse. */
export function demandaEmFocoId(): Id | null {
  return lugar.modal ?? lugar.focado ?? lugar.sobMouse
}

export function quadroAtualId(): Id | null {
  return lugar.modal ? lugar.quadroDoModal ?? lugar.quadro : lugar.quadro
}

export function useDemandaEmFocoId(): Id | null {
  return useSyncExternalStore(assinarLugar, demandaEmFocoId, () => null)
}

export function useQuadroAtualId(): Id | null {
  return useSyncExternalStore(assinarLugar, quadroAtualId, () => null)
}

/** O card focado com o teclado (só ele: o "sob o mouse" não conta). */
export function useCardFocadoId(): Id | null {
  return useSyncExternalStore(assinarLugar, () => lugar.focado, () => null)
}

export const definirCardFocado = (id: Id | null) => mudar({ focado: id })
export const definirCardSobMouse = (id: Id | null) => mudar({ sobMouse: id })
/** O card saiu de baixo do mouse: só limpa se ainda era ele. */
export const sairDoCard = (id: Id) => { if (lugar.sobMouse === id) mudar({ sobMouse: null }) }
export const desfocarCard = (id: Id) => { if (lugar.focado === id) mudar({ focado: null }) }
export const definirModal = (demandaId: Id | null, quadroId: Id | null = null) => mudar({ modal: demandaId, quadroDoModal: quadroId })
export const definirQuadroAtual = (id: Id | null) => mudar({ quadro: id })
