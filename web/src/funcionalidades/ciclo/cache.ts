/**
 * Cache do ciclo (F2): versões, envios, decisões, rodadas e links no detalhe aberto (['demanda', numero]) e a lista de
 * links (['demanda', id, 'links']). Puro sobre o DemandaDetalhe (o tratador do tempo real e as respostas das mutações
 * usam os mesmos): o objeto inteiro substitui pelo id, o parcial mescla, nada muda se já é igual.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { Aprovacao, DemandaDetalhe, Envio, Id, LinkPublicoComUrl, LinkPublicoResumo, Rodada, VersaoComItens } from '@shared/tipos/index.ts'
import { atualizarDetalhe } from '../../api/cache.ts'
import { chaves } from '../../api/chaves.ts'

function trocar<T extends { id: Id }>(lista: readonly T[], item: T, ordem: (a: T, b: T) => number): T[] {
  const i = lista.findIndex((x) => x.id === item.id)
  if (i >= 0 && lista[i] === item) return lista as T[]
  const nova = i >= 0 ? lista.map((x, j) => (j === i ? item : x)) : [...lista, item]
  return nova.sort(ordem)
}

export const comVersao = (det: DemandaDetalhe, v: VersaoComItens): DemandaDetalhe =>
  ({ ...det, versoes: trocar(det.versoes, v, (a, b) => a.numero - b.numero) })
export const comEnvio = (det: DemandaDetalhe, e: Envio): DemandaDetalhe =>
  ({ ...det, envios: trocar(det.envios, e, (a, b) => a.enviadoEm.localeCompare(b.enviadoEm)) })
export const comAprovacao = (det: DemandaDetalhe, a: Aprovacao): DemandaDetalhe =>
  ({ ...det, aprovacoes: trocar(det.aprovacoes, a, (x, y) => x.criadoEm.localeCompare(y.criadoEm)) })
export const comRodada = (det: DemandaDetalhe, r: Rodada): DemandaDetalhe =>
  ({ ...det, rodadas: trocar(det.rodadas, r, (a, b) => a.numero - b.numero) })
export const comLink = (det: DemandaDetalhe, l: LinkPublicoResumo): DemandaDetalhe =>
  ({ ...det, linksPublicos: trocar(det.linksPublicos, l, (a, b) => a.criadoEm.localeCompare(b.criadoEm)) })

/** Parcial de um item conhecido do detalhe (o tempo real manda só os campos de `c`); desconhecido: nada. */
export function mesclarNoDetalhe<K extends 'versoes' | 'envios' | 'aprovacoes' | 'rodadas' | 'linksPublicos'>(
  det: DemandaDetalhe, lista: K, id: Id, patch: Partial<DemandaDetalhe[K][number]>,
): DemandaDetalhe {
  const atual = (det[lista] as readonly { id: Id }[]).find((x) => x.id === id)
  if (!atual) return det
  const novo = { ...atual, ...patch, id }
  return { ...det, [lista]: (det[lista] as readonly { id: Id }[]).map((x) => (x.id === id ? novo : x)) }
}

/** A lista de links da demanda (só atendimento e admin a têm em cache). */
export function mudarLinks(qc: QueryClient, demandaId: Id, fn: (l: LinkPublicoComUrl[]) => LinkPublicoComUrl[]): void {
  qc.setQueryData<LinkPublicoComUrl[]>(chaves.links(demandaId), (l) => (l ? fn(l) : l))
}

export function aplicarNoDetalhe(qc: QueryClient, demandaId: Id, fn: (det: DemandaDetalhe) => DemandaDetalhe): void {
  atualizarDetalhe(qc, demandaId, fn)
}
