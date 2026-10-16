/** Só DEV (/dev/extensoes): selo no topo do card (só nos números múltiplos de 5, para não poluir). */
import type { Coluna, Demanda, Quadro } from '@shared/tipos/index.ts'
import type { ExtensaoSeloCard } from '../tipos.ts'
import { useExemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

function Selo({ demanda, coluna }: { demanda: Demanda; coluna: Coluna | null; quadro: Quadro | null }) {
  const ativos = useExemplosAtivos()
  if (!ativos || demanda.numero % 5 !== 0) return null
  return <span className="ui-sinal" data-tom="extra" data-exemplo="selo-topo">topo · {coluna ? coluna.nome : 'fora do quadro'}</span>
}

export const selo: ExtensaoSeloCard | undefined = import.meta.env.DEV
  ? { id: 'nucleo-exemplo-topo', ordem: 100, lugar: 'topo', Componente: Selo }
  : undefined
