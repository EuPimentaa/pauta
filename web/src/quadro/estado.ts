/**
 * Estado local do quadro (preferências do aparelho, como no Trello) e pontes entre partes da tela:
 * - colunas recolhidas e etiquetas recolhidas em barras finas (localStorage);
 * - a visão escolhida em cada quadro (Quadro | Lista | Calendário);
 * - qual coluna está com o nome em edição (o "Renomear" do menu da coluna);
 * - rolar até uma coluna (barra de chips do celular, F6: useRolarParaColuna);
 * - o relógio de minuto em minuto (estado do prazo e "parado há" sem recarregar a tela).
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { Id, VisaoQuadro } from '../../../shared/tipos/index.ts'
import { lerLocal, useLocal } from '../lib/armazenamento.ts'

// ─────────────────────────────── preferências do aparelho ───────────────────────────────

const SEM_IDS: Id[] = []

export function useColunasRecolhidas(): [ReadonlySet<Id>, (id: Id, recolhida?: boolean) => void, (ids: Id[], recolhidas: boolean) => void] {
  const [lista, definir] = useLocal<Id[]>('colunas-recolhidas', SEM_IDS)
  const conjunto = useConjunto(lista)
  const alternar = useCallback((id: Id, recolhida?: boolean) => {
    definir((atual) => {
      const tem = atual.includes(id)
      const quer = recolhida ?? !tem
      if (quer === tem) return atual
      return quer ? [...atual, id] : atual.filter((x) => x !== id)
    })
  }, [definir])
  const todas = useCallback((ids: Id[], recolhidas: boolean) => {
    definir((atual) => (recolhidas ? [...new Set([...atual, ...ids])] : atual.filter((x) => !ids.includes(x))))
  }, [definir])
  return [conjunto, alternar, todas]
}

const conjuntos = new WeakMap<Id[], ReadonlySet<Id>>()
function useConjunto(lista: Id[]): ReadonlySet<Id> {
  let s = conjuntos.get(lista)
  if (!s) { s = new Set(lista); conjuntos.set(lista, s) }
  return s
}

/** Etiquetas recolhidas em barras finas (clicar numa recolhe todas, como no Trello). */
export function useEtiquetasRecolhidas(): [boolean, () => void] {
  const [recolhidas, definir] = useLocal<boolean>('etiquetas-recolhidas', false)
  return [recolhidas, useCallback(() => definir((v) => !v), [definir])]
}

const chaveVisao = (quadroId: Id) => `visao:${quadroId}`
export function visaoGuardada(quadroId: Id): VisaoQuadro | null {
  return lerLocal<VisaoQuadro | null>(chaveVisao(quadroId), null)
}
export function useVisaoGuardada(quadroId: Id): [VisaoQuadro | null, (v: VisaoQuadro) => void] {
  const [v, definir] = useLocal<VisaoQuadro | null>(chaveVisao(quadroId), null)
  return [v, definir as (v: VisaoQuadro) => void]
}

// ─────────────────────────────── coluna em edição ───────────────────────────────

let editando: Id | null = null
const ouvintesEdicao = new Set<() => void>()

export function editarNomeDaColuna(id: Id | null): void {
  editando = id
  ouvintesEdicao.forEach((f) => f())
}

export function useColunaEmEdicao(): Id | null {
  return useSyncExternalStore((f) => { ouvintesEdicao.add(f); return () => { ouvintesEdicao.delete(f) } }, () => editando, () => null)
}

// ─────────────────────────────── rolar até a coluna ───────────────────────────────

const elementos = new Map<Id, HTMLElement>()

/** A coluna se registra ao montar (o layout do quadro chama). */
export function registrarElementoColuna(id: Id, el: HTMLElement | null): void {
  if (el) elementos.set(id, el)
  else elementos.delete(id)
}

export function rolarParaColuna(id: Id): void {
  const el = elementos.get(id)
  if (!el) return
  const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth', inline: 'start', block: 'nearest' })
}

// ─────────────────────────────── relógio ───────────────────────────────

let minuto = Math.floor(Date.now() / 60_000)
const ouvintesRelogio = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function assinarRelogio(f: () => void) {
  ouvintesRelogio.add(f)
  if (!timer) {
    timer = setInterval(() => {
      const agora = Math.floor(Date.now() / 60_000)
      if (agora === minuto) return
      minuto = agora
      ouvintesRelogio.forEach((g) => g())
    }, 5000)
  }
  return () => {
    ouvintesRelogio.delete(f)
    if (ouvintesRelogio.size === 0 && timer) { clearInterval(timer); timer = null }
  }
}

/** "Agora", trocado a cada minuto (o card recalcula prazo e sinal sem relógio por card). */
export function useAgora(): Date {
  const m = useSyncExternalStore(assinarRelogio, () => minuto, () => minuto)
  return datas(m)
}

const cacheDatas = new Map<number, Date>()
function datas(m: number): Date {
  let d = cacheDatas.get(m)
  if (!d) {
    cacheDatas.clear()
    d = new Date(m * 60_000)
    cacheDatas.set(m, d)
  }
  return d
}
