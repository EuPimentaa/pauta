/**
 * O quadro para as funcionalidades (PLANO §2.2):
 *   <CardDemanda demanda={d} />            card sem arrastar (Início, Agenda, cliente, Lista), com clique, menu e foco
 *   const rolar = useRolarParaColuna(); rolar(coluna.id)   celular: a barra de chips das colunas (F6)
 */
import { rolarParaColuna } from './estado.ts'

export { CardDemanda } from './CardDemanda.tsx'

export function useRolarParaColuna(): (colunaId: string) => void {
  return rolarParaColuna
}
