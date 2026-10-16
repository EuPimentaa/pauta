/**
 * Teclado para as funcionalidades (PLANO §2.2):
 *   useEscopoAtalho('agenda')                 // liga o escopo enquanto a tela está montada
 *   const [foco, focar] = useFocoDemanda()     // quem desenha cards: focar(d) no foco, focar(null) ao sair
 * Os atalhos em si ficam em extensoes/atalhos (Atalho.escopo); o despachante é o global nucleo-teclado.
 */
import { useCallback } from 'react'
import type { Demanda } from '@shared/tipos/index.ts'
import { useDemanda } from '../api/seletores.ts'
import { definirCardFocado, useDemandaEmFocoId } from './foco.ts'

export { useEscopoAtalho } from './escopos.ts'

/** A demanda em foco (a do modal; senão o card focado; senão o card sob o mouse) e quem marca o card focado. */
export function useFocoDemanda(): [Demanda | null, (d: Demanda | null) => void] {
  const d = useDemanda(useDemandaEmFocoId())
  const focar = useCallback((x: Demanda | null) => definirCardFocado(x?.id ?? null), [])
  return [d ?? null, focar]
}
