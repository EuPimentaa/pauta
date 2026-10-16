/**
 * Escopos dos atalhos (EscopoAtalho em extensoes/tipos.ts): 'global' vale sempre; os outros enquanto a tela que os usa
 * chama useEscopoAtalho. Prioridade quando a mesma tecla existe em mais de um: modal > card > quadro e agenda > global.
 * Com o modal da demanda aberto, o quadro e o card de baixo ficam quietos. 'card' vale quando há um card com foco (ou
 * sob o mouse) fora do modal.
 */
import { useEffect } from 'react'
import type { EscopoAtalho } from '../extensoes/tipos.ts'
import { lugarAtual } from './foco.ts'

const ativos = new Map<EscopoAtalho, number>()

/** Liga o escopo enquanto o componente está montado (e `ativo`). */
export function useEscopoAtalho(escopo: EscopoAtalho, ativo = true): void {
  useEffect(() => {
    if (!ativo || escopo === 'global') return
    ativos.set(escopo, (ativos.get(escopo) ?? 0) + 1)
    return () => { ativos.set(escopo, Math.max(0, (ativos.get(escopo) ?? 1) - 1)) }
  }, [escopo, ativo])
}

/** Os escopos que valem agora, do mais específico para o geral. */
export function escoposAtivos(): EscopoAtalho[] {
  const ligado = (e: EscopoAtalho) => (ativos.get(e) ?? 0) > 0
  if (ligado('modal')) return ['modal', 'global']
  const lista: EscopoAtalho[] = []
  const l = lugarAtual()
  if (l.focado || l.sobMouse) lista.push('card')
  if (ligado('quadro')) lista.push('quadro')
  if (ligado('agenda')) lista.push('agenda')
  lista.push('global')
  return lista
}

export function escopoLigado(e: EscopoAtalho): boolean {
  return e === 'global' || (ativos.get(e) ?? 0) > 0
}
