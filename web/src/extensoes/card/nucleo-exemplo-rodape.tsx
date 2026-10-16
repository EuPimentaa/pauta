/** Só DEV (/dev/extensoes): selo no rodapé do card; mostra quando o card está fora do bootstrap (coluna e quadro nulos). */
import type { Coluna, Demanda, Quadro } from '@shared/tipos/index.ts'
import type { ExtensaoSeloCard } from '../tipos.ts'

function Selo({ demanda, coluna, quadro }: { demanda: Demanda; coluna: Coluna | null; quadro: Quadro | null }) {
  if (demanda.numero % 5 !== 0 && coluna && quadro) return null
  return <span className="ui-sinal" data-exemplo="selo-rodape">rodapé · {quadro ? quadro.nome : 'sem quadro'}</span>
}

export const selo: ExtensaoSeloCard = { id: 'nucleo-exemplo-rodape', ordem: 300, lugar: 'rodape', Componente: Selo }
