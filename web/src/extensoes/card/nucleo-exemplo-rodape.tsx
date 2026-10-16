/** Só DEV (/dev/extensoes): selo no rodapé do card; mostra quando o card está fora do bootstrap (coluna e quadro nulos). */
import type { Coluna, Demanda, Quadro } from '@shared/tipos/index.ts'
import type { ExtensaoSeloCard } from '../tipos.ts'
import { useExemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

function Selo({ demanda, coluna, quadro }: { demanda: Demanda; coluna: Coluna | null; quadro: Quadro | null }) {
  const ativos = useExemplosAtivos()
  if (!ativos || (demanda.numero % 5 !== 0 && coluna && quadro)) return null
  return <span className="ui-sinal" data-exemplo="selo-rodape">rodapé · {quadro ? quadro.nome : 'sem quadro'}</span>
}

export const selo: ExtensaoSeloCard | undefined = import.meta.env.DEV
  ? { id: 'nucleo-exemplo-rodape', ordem: 300, lugar: 'rodape', Componente: Selo }
  : undefined
