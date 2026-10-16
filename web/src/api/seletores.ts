/**
 * Seletores do bootstrap (PLANO §2.2). Todos leem ['bootstrap'] (useBootstrap do DS) com `select` do TanStack: o
 * componente só redesenha quando o pedaço que ele lê muda (o compartilhamento estrutural guarda a identidade).
 * Dentro da área autenticada o bootstrap já chegou; antes disso as listas vêm vazias.
 *
 *   const colunas = useColunas(quadro.id)              // ativas, em ordem
 *   const d = useDemandaPorNumero(12)                  // undefined fora do bootstrap (arquivada, quadro arquivado)
 */
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  AutomacaoQuadro, Bootstrap, ClienteResumo, Coluna, ConfigApp, Demanda, Equipe, Etiqueta, Feriado, Id, ModeloDemanda, Quadro,
  UsuarioResumo,
} from '../../../shared/tipos/index.ts'
import { opcoesBootstrap } from './bootstrap.ts'
import type { ErroDaApi } from './cliente.ts'

const VAZIO: never[] = []

/** Lê um pedaço do bootstrap. `select` deve ser estável (useCallback) para não recalcular a cada render. */
export function useDoBootstrap<T>(select: (b: Bootstrap) => T): T | undefined {
  return useQuery<Bootstrap, ErroDaApi, T>({ ...opcoesBootstrap, select }).data
}

const porPos = <T extends { pos: number }>(a: T, b: T) => a.pos - b.pos
const porPosicao = (a: Demanda, b: Demanda) => a.posicao - b.posicao || a.numero - b.numero

// ─────────────────────────────── demandas ───────────────────────────────

const selDemandas = (b: Bootstrap) => b.demandas
export function useDemandas(): Demanda[] {
  return useDoBootstrap(selDemandas) ?? VAZIO
}

/** Do quadro, não arquivadas, em ordem de posição (cada coluna filtra a sua). */
export function useDemandasDoQuadro(quadroId: Id): Demanda[] {
  const sel = useCallback((b: Bootstrap) => b.demandas.filter((d) => d.quadroId === quadroId).sort(porPosicao), [quadroId])
  return useDoBootstrap(sel) ?? VAZIO
}

export function useDemanda(id: Id | null): Demanda | undefined {
  const sel = useCallback((b: Bootstrap) => (id ? b.demandas.find((d) => d.id === id) : undefined), [id])
  return useDoBootstrap(sel)
}

export function useDemandaPorNumero(numero: number): Demanda | undefined {
  const sel = useCallback((b: Bootstrap) => b.demandas.find((d) => d.numero === numero), [numero])
  return useDoBootstrap(sel)
}

// ─────────────────────────────── quadros, colunas, etiquetas ───────────────────────────────

const selQuadros = (b: Bootstrap) => [...b.quadros].sort(porPos)
export function useQuadros(): Quadro[] {
  return useDoBootstrap(selQuadros) ?? VAZIO
}

export function useQuadro(id: Id | null): Quadro | undefined {
  const sel = useCallback((b: Bootstrap) => (id ? b.quadros.find((q) => q.id === id) : undefined), [id])
  return useDoBootstrap(sel)
}

export function useQuadroPorSlug(slug: string): Quadro | undefined {
  const sel = useCallback((b: Bootstrap) => b.quadros.find((q) => q.slug === slug), [slug])
  return useDoBootstrap(sel)
}

/** Ativas, em ordem. */
export function useColunas(quadroId: Id): Coluna[] {
  const sel = useCallback((b: Bootstrap) => b.colunas.filter((c) => c.quadroId === quadroId && c.arquivadaEm === null).sort(porPos), [quadroId])
  return useDoBootstrap(sel) ?? VAZIO
}

export function useColuna(id: Id | null): Coluna | undefined {
  const sel = useCallback((b: Bootstrap) => (id ? b.colunas.find((c) => c.id === id) : undefined), [id])
  return useDoBootstrap(sel)
}

export function useEtiquetas(quadroId: Id): Etiqueta[] {
  const sel = useCallback((b: Bootstrap) => b.etiquetas.filter((e) => e.quadroId === quadroId).sort(porPos), [quadroId])
  return useDoBootstrap(sel) ?? VAZIO
}

export function useAutomacoes(quadroId: Id): AutomacaoQuadro[] {
  const sel = useCallback((b: Bootstrap) => b.automacoes.filter((a) => a.quadroId === quadroId), [quadroId])
  return useDoBootstrap(sel) ?? VAZIO
}

/** Globais + do quadro, ativos, em ordem. */
export function useModelosDemanda(quadroId: Id | null): ModeloDemanda[] {
  const sel = useCallback((b: Bootstrap) => b.modelosDemanda
    .filter((m) => m.ativo && (m.quadroId === null || m.quadroId === quadroId))
    .sort((a, c) => (a.quadroId === null ? 0 : 1) - (c.quadroId === null ? 0 : 1) || a.pos - c.pos), [quadroId])
  return useDoBootstrap(sel) ?? VAZIO
}

// ─────────────────────────────── pessoas, clientes, equipes, configuração ───────────────────────────────

const selUsuarios = (b: Bootstrap) => b.usuarios
export function useUsuarios(): UsuarioResumo[] {
  return useDoBootstrap(selUsuarios) ?? VAZIO
}

export function useUsuario(id: Id | null): UsuarioResumo | undefined {
  const sel = useCallback((b: Bootstrap) => (id ? b.usuarios.find((u) => u.id === id) : undefined), [id])
  return useDoBootstrap(sel)
}

const selClientes = (b: Bootstrap) => b.clientes
export function useClientes(): ClienteResumo[] {
  return useDoBootstrap(selClientes) ?? VAZIO
}

export function useCliente(id: Id | null): ClienteResumo | undefined {
  const sel = useCallback((b: Bootstrap) => (id ? b.clientes.find((c) => c.id === id) : undefined), [id])
  return useDoBootstrap(sel)
}

const selEquipes = (b: Bootstrap) => b.equipes
export function useEquipes(): Equipe[] {
  return useDoBootstrap(selEquipes) ?? VAZIO
}

const conjuntos = new WeakMap<readonly Feriado[], ReadonlySet<string>>()
/** Datas de feriado (ano corrente e o próximo) para dias úteis. */
export function conjuntoFeriados(lista: readonly Feriado[]): ReadonlySet<string> {
  let s = conjuntos.get(lista)
  if (!s) { s = new Set(lista.map((f) => f.data)); conjuntos.set(lista, s) }
  return s
}
const selFeriados = (b: Bootstrap) => conjuntoFeriados(b.feriados)
const SEM_FERIADOS: ReadonlySet<string> = new Set()
export function useFeriados(): ReadonlySet<string> {
  return useQuery<Bootstrap, ErroDaApi, ReadonlySet<string>>({ ...opcoesBootstrap, select: selFeriados, structuralSharing: false }).data ?? SEM_FERIADOS
}

const selListaFeriados = (b: Bootstrap) => b.feriados
/** Os feriados como vieram (nome e tipo: o calendário mostra). */
export function useListaFeriados(): Feriado[] {
  return useDoBootstrap(selListaFeriados) ?? VAZIO
}

const selConfig = (b: Bootstrap) => b.config
export function useConfig(): ConfigApp {
  const c = useDoBootstrap(selConfig)
  if (!c) throw new Error('useConfig() antes do bootstrap: use dentro da área autenticada.')
  return c
}
