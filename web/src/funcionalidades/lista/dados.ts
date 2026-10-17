/**
 * Leituras do F6 sobre o cache do núcleo (seletores da PLANO §2.2): as demandas do quadro como o quadro mostra (sem as
 * concluídas antigas, que estão no Arquivo), com e sem filtros, e o contexto que a Lista usa para ordenar e agrupar.
 */
import { useMemo, useSyncExternalStore } from 'react'
import type { Coluna, Demanda, Etiqueta, FiltrosQuadro, Id } from '@shared/tipos/index.ts'
import { aplicarFiltros } from '@shared/logica/filtros.ts'
import { ehCardDaColuna } from '@shared/logica/quadro.ts'
import { useEu } from '../../api/auth.ts'
import { useClientes, useColunas, useConfig, useDemandasDoQuadro, useUsuarios } from '../../api/seletores.ts'
import type { ContextoLista } from './logica.ts'

// ─────────────────────────────── relógio de minuto ───────────────────────────────

let minuto = Math.floor(Date.now() / 60_000)
const ouvintes = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
const datas = new Map<number, Date>()

function assinar(f: () => void) {
  ouvintes.add(f)
  timer ??= setInterval(() => {
    const m = Math.floor(Date.now() / 60_000)
    if (m === minuto) return
    minuto = m
    ouvintes.forEach((g) => g())
  }, 5000)
  return () => {
    ouvintes.delete(f)
    if (ouvintes.size === 0 && timer) { clearInterval(timer); timer = null }
  }
}

/** "Agora", trocado a cada minuto (prazo de hoje vira atrasado sem recarregar). */
export function useMinuto(): Date {
  const m = useSyncExternalStore(assinar, () => minuto, () => minuto)
  let d = datas.get(m)
  if (!d) { datas.clear(); d = new Date(m * 60_000); datas.set(m, d) }
  return d
}

// ─────────────────────────────── demandas ───────────────────────────────

/** As do quadro que o quadro mostra (sem filtros): sem arquivadas e sem as concluídas que já saíram para o Arquivo. */
export function useDemandasNoQuadro(quadroId: Id): Demanda[] {
  const todas = useDemandasDoQuadro(quadroId)
  const config = useConfig()
  const agora = useMinuto()
  return useMemo(() => todas.filter((d) => ehCardDaColuna(d, agora, config.quadroConcluidasDias)), [todas, agora, config.quadroConcluidasDias])
}

/** As mesmas com os filtros da URL (a faixa de colunas do celular conta por coluna o que aparece). */
export function useDemandasFiltradas(quadroId: Id, filtros: FiltrosQuadro): Demanda[] {
  const doQuadro = useDemandasNoQuadro(quadroId)
  const eu = useEu()
  const colunas = useColunas(quadroId)
  const clientes = useClientes()
  const agora = useMinuto()
  return useMemo(() => aplicarFiltros(doQuadro, filtros, {
    euId: eu.usuario.id,
    agora,
    colunas: new Map(colunas.map((c) => [c.id, c])),
    clientes: new Map(clientes.map((c) => [c.id, c])),
  }), [doQuadro, filtros, eu.usuario.id, agora, colunas, clientes])
}

/** Contexto de ordenar e agrupar a Lista. */
export function useContextoLista(colunas: readonly Coluna[], etiquetas: readonly Etiqueta[]): ContextoLista {
  const clientes = useClientes()
  const usuarios = useUsuarios()
  const agora = useMinuto()
  return useMemo(() => ({
    colunas,
    etiquetas,
    clientes: new Map(clientes.map((c) => [c.id, c])),
    usuarios: new Map(usuarios.map((u) => [u.id, u])),
    agora,
  }), [colunas, etiquetas, clientes, usuarios, agora])
}
