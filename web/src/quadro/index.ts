/**
 * O quadro para as funcionalidades (PLANO §2.2):
 *   <CardDemanda demanda={d} />            card sem arrastar (Início, Agenda, cliente, Lista), com clique, menu e foco
 *   const rolar = useRolarParaColuna(); rolar(coluna.id)   celular: a barra de chips das colunas (F6)
 *   <MenuDoCard d={d} ancora={a} fechar={...} />            o menu do card (botão direito na linha da Lista)
 */
import { rolarParaColuna } from './estado.ts'

export { CardDemanda, MenuDoCard } from './CardDemanda.tsx'

export function useRolarParaColuna(): (colunaId: string) => void {
  return rolarParaColuna
}
