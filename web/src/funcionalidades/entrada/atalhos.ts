/**
 * A lista do "?" (puro, os testes do servidor importam): agrupa os atalhos registrados por grupo e junta as teclas
 * que fazem a mesma coisa no mesmo lugar ("Próximo card": J ou ↓). Filtro sem acento e sem caixa pela descrição,
 * pelo lugar e pela tecla.
 */
import { normalizarAlias } from '../../../../shared/logica/texto.ts'

type Grupo = 'navegacao' | 'quadro' | 'demanda' | 'geral'

export const GRUPOS_ATALHO: Record<Grupo, string> = {
  geral: 'Geral', navegacao: 'Ir para', quadro: 'No quadro', demanda: 'Na demanda',
}
const ORDEM: Grupo[] = ['geral', 'navegacao', 'quadro', 'demanda']

export interface AtalhoListavel {
  id: string
  teclas: string
  descricao: string
  escopo: string
  grupo: Grupo
}

export interface ItemListaAtalhos<E extends string = string> {
  chave: string
  descricao: string
  escopo: E
  teclas: string[]
}

export function agruparAtalhos<A extends AtalhoListavel>(atalhos: readonly A[], filtro = ''): { grupo: Grupo; itens: ItemListaAtalhos<A['escopo']>[] }[] {
  const termo = normalizarAlias(filtro)
  const porGrupo = new Map<Grupo, Map<string, ItemListaAtalhos<A['escopo']>>>()
  for (const a of atalhos) {
    if (termo && !normalizarAlias(`${a.descricao} ${a.teclas} ${a.escopo}`).includes(termo)) continue
    const grupo = porGrupo.get(a.grupo) ?? new Map<string, ItemListaAtalhos<A['escopo']>>()
    porGrupo.set(a.grupo, grupo)
    const chave = `${a.escopo}|${normalizarAlias(a.descricao)}`
    const item: ItemListaAtalhos<A['escopo']> = grupo.get(chave) ?? { chave, descricao: a.descricao, escopo: a.escopo, teclas: [] }
    if (!item.teclas.includes(a.teclas)) item.teclas.push(a.teclas)
    grupo.set(chave, item)
  }
  return ORDEM.filter((g) => porGrupo.has(g)).map((g) => ({ grupo: g, itens: [...porGrupo.get(g)!.values()] }))
}
