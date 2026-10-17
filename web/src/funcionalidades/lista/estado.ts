/**
 * Pontes do F6 entre partes da página do quadro que não se veem:
 * - o atalho F (extensoes/atalhos/lista.ts) pede ao botão "Filtros" do cabeçalho que abra o painel;
 * - a Lista no celular publica os grupos dela, e a faixa de chips do cabeçalho (lista-colunas-celular) pula para eles
 *   como pula para as colunas do Quadro (useRolarParaColuna).
 * E as preferências do aparelho: agrupamento e ordem da Lista por quadro, grupos recolhidos, campos e modo do
 * Calendário (localStorage, como a visão escolhida e as colunas recolhidas).
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { CampoAgenda, Id } from '@shared/tipos/index.ts'
import { useLocal } from '../../lib/armazenamento.ts'
import type { Agrupamento, OrdemLista } from './logica.ts'

// ─────────────────────────────── atalho F → painel de filtros ───────────────────────────────

const pedidosFiltros = new Set<() => void>()

/** O atalho F chama; o botão "Filtros" montado abre o painel. false = nenhum botão na tela. */
export function abrirPainelFiltros(): boolean {
  pedidosFiltros.forEach((f) => f())
  return pedidosFiltros.size > 0
}

export function usePedidoDeFiltros(abrir: () => void): void {
  useEffect(() => {
    pedidosFiltros.add(abrir)
    return () => { pedidosFiltros.delete(abrir) }
  }, [abrir])
}

// ─────────────────────────────── grupos da Lista (faixa do celular) ───────────────────────────────

export interface GrupoNaFaixa { id: string; rotulo: string; cor: string | null; quantidade: number }

interface GruposPublicados {
  quadroId: Id
  grupos: readonly GrupoNaFaixa[]
  rolar(grupoId: string): void
  /** O grupo que está no topo da lista agora. */
  ativo: string | null
}

let publicados: GruposPublicados | null = null
const ouvintesGrupos = new Set<() => void>()
const avisarGrupos = () => ouvintesGrupos.forEach((f) => f())

export function publicarGrupos(g: GruposPublicados | null): void {
  publicados = g
  avisarGrupos()
}

/** Só troca o ativo (a rolagem chama muito; sem recriar a lista). */
export function marcarGrupoAtivo(id: string | null): void {
  if (!publicados || publicados.ativo === id) return
  publicados = { ...publicados, ativo: id }
  avisarGrupos()
}

export function useGruposPublicados(quadroId: Id): GruposPublicados | null {
  const g = useSyncExternalStore(
    (f) => { ouvintesGrupos.add(f); return () => { ouvintesGrupos.delete(f) } },
    () => publicados,
    () => null,
  )
  return g && g.quadroId === quadroId ? g : null
}

// ─────────────────────────────── preferências ───────────────────────────────

/** Agrupamento da Lista deste quadro (o da URL vence; este é o lembrado). */
export function useAgrupamentoGuardado(quadroId: Id): [Agrupamento | null, (a: Agrupamento) => void] {
  const [v, definir] = useLocal<Agrupamento | null>(`lista-agrupar:${quadroId}`, null)
  return [v, definir as (a: Agrupamento) => void]
}

export function useOrdemGuardada(quadroId: Id): [OrdemLista | null, (o: OrdemLista) => void] {
  const [v, definir] = useLocal<OrdemLista | null>(`lista-ordem:${quadroId}`, null)
  return [v, definir as (o: OrdemLista) => void]
}

const SEM_GRUPOS: string[] = []

/** Grupos recolhidos da Lista (por quadro e por agrupamento). */
export function useGruposRecolhidos(quadroId: Id, agrupar: Agrupamento): [ReadonlySet<string>, (id: string) => void, (ids: string[], recolher: boolean) => void] {
  const [lista, definir] = useLocal<string[]>(`lista-recolhidos:${quadroId}:${agrupar}`, SEM_GRUPOS)
  const conjunto = useConjunto(lista)
  const alternar = useCallback((id: string) => {
    definir((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]))
  }, [definir])
  const todos = useCallback((ids: string[], recolher: boolean) => {
    definir((atual) => (recolher ? [...new Set([...atual, ...ids])] : atual.filter((x) => !ids.includes(x))))
  }, [definir])
  return [conjunto, alternar, todos]
}

const conjuntos = new WeakMap<string[], ReadonlySet<string>>()
function useConjunto(lista: string[]): ReadonlySet<string> {
  let s = conjuntos.get(lista)
  if (!s) { s = new Set(lista); conjuntos.set(lista, s) }
  return s
}

const CAMPOS_PADRAO: CampoAgenda[] = ['prazo']

/** Campos do Calendário do quadro (o prazo sempre; início e publicação são opcionais). */
export function useCamposCalendario(): [readonly CampoAgenda[], (c: CampoAgenda) => void] {
  const [campos, definir] = useLocal<CampoAgenda[]>('calendario-campos', CAMPOS_PADRAO)
  const alternar = useCallback((c: CampoAgenda) => {
    if (c === 'prazo') return
    definir((atual) => (atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]))
  }, [definir])
  return [campos.includes('prazo') ? campos : ['prazo', ...campos], alternar]
}

export function useModoCalendario(): [ 'mes' | 'semana', (m: 'mes' | 'semana') => void] {
  const [m, definir] = useLocal<'mes' | 'semana'>('calendario-modo', 'mes')
  return [m === 'semana' ? 'semana' : 'mes', definir]
}

