/** Só DEV (/dev/extensoes): selo no topo do card (só nos números múltiplos de 5, para não poluir). */
import type { Coluna, Demanda, Quadro } from '@shared/tipos/index.ts'
import type { ExtensaoSeloCard } from '../tipos.ts'

function Selo({ demanda, coluna }: { demanda: Demanda; coluna: Coluna | null; quadro: Quadro | null }) {
  if (demanda.numero % 5 !== 0) return null
  return <span className="ui-sinal" data-tom="extra" data-exemplo="selo-topo">topo · {coluna ? coluna.nome : 'fora do quadro'}</span>
}

export const selo: ExtensaoSeloCard = { id: 'nucleo-exemplo-topo', ordem: 100, lugar: 'topo', Componente: Selo }
