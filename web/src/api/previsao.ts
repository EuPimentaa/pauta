/**
 * Previsão local do mover (PLANO §2, "aplica na hora"): o card vai para o lugar novo antes da resposta, com as mesmas
 * regras puras do servidor (shared/logica): posição entre os vizinhos, membros pela coluna de pessoa e pelo
 * "responsável do cliente no destino", etiquetas por nome entre quadros, concluir ao entrar numa coluna `concluida`.
 * A resposta do POST /mover corrige o que a previsão não sabe (etiquetas guardadas no destino, renormalização).
 */
import type {
  Bootstrap, Coluna, Demanda, Id, Instante, MoverEntrada, PosicaoRelativa,
} from '../../../shared/tipos/index.ts'
import { entre, PASSO_POSICAO } from '../../../shared/logica/posicao.ts'
import { mapearEtiquetas, membrosAoMover } from '../../../shared/logica/quadro.ts'

const porPosicao = (a: Demanda, b: Demanda) => a.posicao - b.posicao || a.numero - b.numero

/** Cards da coluna em ordem, sem `excluir` (o próprio card que se move). */
export function cardsDaColuna(demandas: readonly Demanda[], colunaId: Id, excluir?: Id): Demanda[] {
  return demandas.filter((d) => d.colunaId === colunaId && d.id !== excluir).sort(porPosicao)
}

/**
 * A chave de posição que o servidor vai calcular (API §5.10), sobre a lista inteira da coluna (os escondidos por
 * filtro mantêm o lugar). `depoisDeId` vence `antesDeId`; `depoisDeId: null` = topo; nada = fim.
 */
export function posicaoPrevista(lista: readonly Demanda[], rel: PosicaoRelativa | undefined): number {
  const primeiro = lista[0]?.posicao ?? null
  const ultimo = lista.at(-1)?.posicao ?? null
  if (rel?.depoisDeId !== undefined) {
    if (rel.depoisDeId === null) return primeiro === null ? PASSO_POSICAO : primeiro - PASSO_POSICAO
    const i = lista.findIndex((d) => d.id === rel.depoisDeId)
    if (i < 0) return ultimo === null ? PASSO_POSICAO : ultimo + PASSO_POSICAO
    return entre(lista[i].posicao, lista[i + 1]?.posicao ?? null)
  }
  if (rel?.antesDeId) {
    const i = lista.findIndex((d) => d.id === rel.antesDeId)
    if (i >= 0) return entre(lista[i - 1]?.posicao ?? null, lista[i].posicao)
  }
  return ultimo === null ? PASSO_POSICAO : ultimo + PASSO_POSICAO
}

/**
 * A posição relativa de quem solta no índice `indice` de uma lista visível (sem o card arrastado): logo depois do
 * vizinho de cima; no topo, antes do primeiro; lista vazia: no fim.
 */
export function posicaoNoIndice(visiveis: readonly Pick<Demanda, 'id'>[], indice: number): PosicaoRelativa {
  if (indice > 0 && visiveis[indice - 1]) return { depoisDeId: visiveis[indice - 1].id }
  if (visiveis[indice]) return { antesDeId: visiveis[indice].id }
  return {}
}

/** A posição relativa da chave `alvo` na lista em ordem: logo depois do último card antes dela; nenhum antes = topo. */
export function posicaoPorChave(lista: readonly Pick<Demanda, 'id' | 'posicao'>[], alvo: number): PosicaoRelativa {
  const antes = lista.filter((d) => d.posicao < alvo)
  return antes.length ? { depoisDeId: antes.at(-1)!.id } : { depoisDeId: null }
}

/**
 * A posição relativa ainda vale na coluna? `lista` = os cards da coluna agora, em ordem e sem o que se move. Se o
 * vizinho de referência saiu dela (outra pessoa o moveu durante o arraste, ou depois do movimento que o Desfazer
 * desfaz), o servidor recusaria com 400: refaz pela chave `alvo` (onde o card ficaria); sem `alvo`, no fim.
 */
export function posicaoValida(lista: readonly Pick<Demanda, 'id' | 'posicao'>[], rel: PosicaoRelativa | undefined,
  alvo: number | null): PosicaoRelativa | undefined {
  const ref = typeof rel?.depoisDeId === 'string' ? rel.depoisDeId : rel?.depoisDeId === null ? null : rel?.antesDeId
  if (ref === undefined || ref === null || lista.some((d) => d.id === ref)) return rel
  return alvo === null ? {} : posicaoPorChave(lista, alvo)
}

/** Onde a demanda está agora, como posição relativa (o Desfazer volta para cá). */
export function lugarAtual(demandas: readonly Demanda[], d: Demanda): { colunaId: Id; posicao: PosicaoRelativa } {
  const lista = cardsDaColuna(demandas, d.colunaId, d.id)
  const antes = lista.filter((x) => porPosicao(x, d) < 0)
  return { colunaId: d.colunaId, posicao: antes.length ? { depoisDeId: antes.at(-1)!.id } : { depoisDeId: null } }
}

/** max(agora, anterior + 1 ms): status_desde sempre cresce ao trocar de coluna (PLANO §0, regra 11). */
export function depoisDe(anterior: Instante, agora: Date): Instante {
  const ms = Math.max(agora.getTime(), new Date(anterior).getTime() + 1)
  return new Date(ms).toISOString()
}

export interface Previsao {
  demanda: Demanda
  de: Coluna
  para: Coluna
  mudaColuna: boolean
  mudaQuadro: boolean
  /** Nomes das etiquetas sem par no destino (o aviso "2 etiquetas ficaram no quadro Criação"). */
  semPar: string[]
}

/** A demanda depois do mover, como o servidor deve devolver. null: coluna desconhecida no cache. */
export function preverMovimento(b: Bootstrap, d: Demanda, entrada: MoverEntrada, agora: Date): Previsao | null {
  const de = b.colunas.find((c) => c.id === d.colunaId)
  const para = b.colunas.find((c) => c.id === entrada.colunaId)
  if (!de || !para) return null
  const mudaColuna = para.id !== d.colunaId
  const mudaQuadro = para.quadroId !== d.quadroId

  const posicao = posicaoPrevista(cardsDaColuna(b.demandas, para.id, d.id), entrada.posicao)

  const quadroDestino = b.quadros.find((q) => q.id === para.quadroId)
  const cliente = d.clienteId ? b.clientes.find((c) => c.id === d.clienteId) : undefined
  const responsavelDestino = (quadroDestino?.equipeId && cliente?.responsaveis.find((r) => r.equipeId === quadroDestino.equipeId)?.usuarioId) || null
  const ativos = new Set(b.usuarios.filter((u) => u.ativo).map((u) => u.id))
  const membroIds = entrada.membroIds ?? (mudaColuna
    ? membrosAoMover(d.membroIds, { de, para, mudaDeQuadro: mudaQuadro, membros: entrada.membros ?? 'manter', responsavelDestino, ativos }).membroIds
    : d.membroIds)

  let etiquetaIds = d.etiquetaIds
  let semPar: string[] = []
  if (mudaQuadro) {
    const atuais = b.etiquetas.filter((e) => d.etiquetaIds.includes(e.id))
    const doDestino = b.etiquetas.filter((e) => e.quadroId === para.quadroId)
    const mapa = mapearEtiquetas(atuais, doDestino, [])
    etiquetaIds = entrada.etiquetaIds ?? mapa.ids
    semPar = entrada.etiquetasSemPar === 'criar' ? [] : mapa.semPar.map((e) => e.nome || 'sem nome')
  }

  const entrandoConcluida = mudaColuna && para.papel === 'concluida' && de.papel !== 'concluida' && !d.concluidaEm
  const saindoConcluida = mudaColuna && de.papel === 'concluida' && para.papel !== 'concluida'
  const demanda: Demanda = {
    ...d,
    colunaId: para.id,
    quadroId: para.quadroId,
    posicao,
    statusDesde: mudaColuna ? depoisDe(d.statusDesde, agora) : d.statusDesde,
    membroIds,
    etiquetaIds,
    ...(entrandoConcluida ? { concluidaEm: agora.toISOString(), concluidaPor: b.eu.usuario.id } : {}),
    ...(saindoConcluida ? { concluidaEm: null, concluidaPor: null } : {}),
  }
  return { demanda, de, para, mudaColuna, mudaQuadro, semPar }
}

/** Campos que o mover muda (a resposta traz estes mesmo quando o cache já tem uma versão mais nova). */
export const CAMPOS_DO_MOVER = [
  'colunaId', 'quadroId', 'posicao', 'statusDesde', 'membroIds', 'etiquetaIds', 'concluidaEm', 'concluidaPor',
] as const satisfies readonly (keyof Demanda)[]
