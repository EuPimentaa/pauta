/**
 * A lista do "?" (puro, os testes do servidor importam): agrupa os atalhos registrados por grupo, junta as teclas
 * que fazem a mesma coisa no mesmo lugar ("Próximo card": J ou ↓) e junta numa linha só o mesmo atalho em lugares
 * diferentes ("Ligar ou parar o cronômetro · T · num card em foco ou na demanda aberta"). Filtro sem acento e sem
 * caixa pela descrição, pelo lugar e pela tecla.
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
  /** O primeiro lugar (o mesmo de escopos[0]). */
  escopo: E
  /** Os lugares onde vale, quando a mesma tecla faz o mesmo em mais de um. */
  escopos: E[]
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
    const item: ItemListaAtalhos<A['escopo']> = grupo.get(chave) ?? { chave, descricao: a.descricao, escopo: a.escopo, escopos: [a.escopo], teclas: [] }
    if (!item.teclas.includes(a.teclas)) item.teclas.push(a.teclas)
    grupo.set(chave, item)
  }
  return ORDEM.filter((g) => porGrupo.has(g)).map((g) => ({ grupo: g, itens: juntarLugares([...porGrupo.get(g)!.values()]) }))
}

/** A mesma descrição com as mesmas teclas em lugares diferentes vira uma linha (os lugares na ordem em que vieram). */
function juntarLugares<E extends string>(itens: ItemListaAtalhos<E>[]): ItemListaAtalhos<E>[] {
  const saida: ItemListaAtalhos<E>[] = []
  const porAssinatura = new Map<string, ItemListaAtalhos<E>>()
  for (const i of itens) {
    const assinatura = `${normalizarAlias(i.descricao)}|${[...i.teclas].sort().join(',')}`
    const ja = porAssinatura.get(assinatura)
    if (ja) { ja.escopos.push(...i.escopos.filter((e) => !ja.escopos.includes(e))); continue }
    const copia = { ...i, escopos: [...i.escopos] }
    porAssinatura.set(assinatura, copia)
    saida.push(copia)
  }
  return saida
}
