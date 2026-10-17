/**
 * Teclado para as funcionalidades (PLANO §2.2):
 *   useEscopoAtalho('agenda')                 // liga o escopo enquanto a tela está montada
 *   const [foco, focar] = useFocoDemanda()     // quem desenha cards: focar(d) no foco, focar(null) ao sair
 *   definirCardSobMouse(d.id) / sairDoCard(d.id)  // linha que vale como card sob o mouse (Espaço, vírgula, ponto, Enter)
 * Os atalhos em si ficam em extensoes/atalhos (Atalho.escopo); o despachante é o global nucleo-teclado.
 */
import { useCallback } from 'react'
import type { Demanda } from '@shared/tipos/index.ts'
import { useDemanda } from '../api/seletores.ts'
import { definirCardFocado, useDemandaEmFocoId } from './foco.ts'

export { useEscopoAtalho } from './escopos.ts'
/** Card sob o mouse (Lista do F6; pedido 5 do F6): no mouseenter e no mouseleave da linha. */
export { definirCardSobMouse, sairDoCard } from './foco.ts'

/** A demanda em foco (a do modal; senão o card focado; senão o card sob o mouse) e quem marca o card focado. */
export function useFocoDemanda(): [Demanda | null, (d: Demanda | null) => void] {
  const d = useDemanda(useDemandaEmFocoId())
  const focar = useCallback((x: Demanda | null) => definirCardFocado(x?.id ?? null), [])
  return [d ?? null, focar]
}
