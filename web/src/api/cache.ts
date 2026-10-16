/**
 * Utilitários do cache (PLANO §2.2): toda mudança no ['bootstrap'] e no detalhe da demanda passa por aqui.
 * Regras:
 * - os objetos que não mudam mantêm a identidade (os cards são memo e os selects comparam por referência);
 * - o bootstrap só tem demandas não arquivadas de quadros ativos (API §3): um patch que arquiva ou leva para fora
 *   tira a demanda da lista; `inserirDemanda` não põe de volta o que não pertence;
 * - o detalhe aberto (['demanda', numero]) acompanha a demanda, mesmo fora do bootstrap (modal de arquivada).
 *
 *   aplicarPatchDemanda(qc, d.id, { colunaId, posicao })   // false = id desconhecido no bootstrap
 *   aplicarNoBootstrap(qc, 'colunas', 'upsert', coluna)
 */
import type { QueryClient } from '@tanstack/react-query'
import type { Bootstrap, Demanda, DemandaDetalhe, Id } from '../../../shared/tipos/index.ts'
import { chaves } from './chaves.ts'

export type ListaBootstrap = 'quadros' | 'colunas' | 'etiquetas' | 'automacoes' | 'modelosDemanda'

// ─────────────────────────────── puro (sobre o Bootstrap) ───────────────────────────────

/** Substitui o item de mesmo id (mesma posição) ou acrescenta no fim. Mesmo objeto: devolve a lista igual. */
export function inserirOuAtualizar<T extends { id: unknown }>(lista: readonly T[], item: T): T[] {
  const i = lista.findIndex((x) => x.id === item.id)
  if (i < 0) return [...lista, item]
  if (lista[i] === item) return lista as T[]
  const nova = lista.slice()
  nova[i] = item
  return nova
}

/** A demanda cabe no bootstrap: não arquivada e de um quadro ativo (as concluídas antigas o quadro esconde ao desenhar). */
export function pertenceAoBootstrap(b: Pick<Bootstrap, 'quadros'>, d: Pick<Demanda, 'arquivadoEm' | 'quadroId'>): boolean {
  return d.arquivadoEm === null && b.quadros.some((q) => q.id === d.quadroId && q.arquivadoEm === null)
}

/** Só os campos que mudaram de fato (patch repetido pelo tempo real não troca o objeto). */
function mudou<T extends object>(atual: T, patch: Partial<T>): boolean {
  for (const k of Object.keys(patch) as (keyof T)[]) {
    const a = atual[k], p = patch[k]
    if (a === p) continue
    if (Array.isArray(a) && Array.isArray(p) && a.length === p.length && a.every((x, i) => x === p[i])) continue
    return true
  }
  return false
}

export function comPatchDemanda(b: Bootstrap, id: Id, patch: Partial<Demanda>): Bootstrap {
  const i = b.demandas.findIndex((d) => d.id === id)
  if (i < 0) return b
  const atual = b.demandas[i]
  if (!mudou(atual, patch)) return b
  const nova = { ...atual, ...patch, id }
  const demandas = b.demandas.slice()
  if (pertenceAoBootstrap(b, nova)) demandas[i] = nova
  else demandas.splice(i, 1)
  return { ...b, demandas }
}

export function comDemanda(b: Bootstrap, d: Demanda): Bootstrap {
  if (!pertenceAoBootstrap(b, d)) return semDemanda(b, d.id)
  const demandas = inserirOuAtualizar(b.demandas, d)
  return demandas === b.demandas ? b : { ...b, demandas }
}

export function semDemanda(b: Bootstrap, id: Id): Bootstrap {
  return b.demandas.some((d) => d.id === id) ? { ...b, demandas: b.demandas.filter((d) => d.id !== id) } : b
}

export function comItem<K extends ListaBootstrap>(b: Bootstrap, lista: K, op: 'upsert' | 'delete', item: Bootstrap[K][number] | { id: string }): Bootstrap {
  const atual = b[lista] as readonly { id: string }[]
  if (op === 'delete') {
    return atual.some((x) => x.id === item.id) ? { ...b, [lista]: atual.filter((x) => x.id !== item.id) } : b
  }
  const nova = inserirOuAtualizar(atual, item as { id: string })
  return nova === atual ? b : { ...b, [lista]: nova }
}

/**
 * Tira um quadro e tudo o que é dele (colunas, etiquetas, automações dele, demandas): quadro arquivado ou excluído
 * (API §3). As automações de outros quadros que apontavam para ele chegam desligadas por evento próprio.
 */
export function semQuadro(b: Bootstrap, quadroId: Id): Bootstrap {
  if (!b.quadros.some((q) => q.id === quadroId)) return b
  return {
    ...b,
    quadros: b.quadros.filter((q) => q.id !== quadroId),
    colunas: b.colunas.filter((c) => c.quadroId !== quadroId),
    etiquetas: b.etiquetas.filter((e) => e.quadroId !== quadroId),
    automacoes: b.automacoes.filter((a) => a.quadroId !== quadroId),
    modelosDemanda: b.modelosDemanda.filter((m) => m.quadroId !== quadroId),
    demandas: b.demandas.filter((d) => d.quadroId !== quadroId),
  }
}

// ─────────────────────────────── sobre o QueryClient ───────────────────────────────

/** Muda o bootstrap em cache (nada antes de carregar). */
export function mudarBootstrap(qc: QueryClient, fn: (b: Bootstrap) => Bootstrap): void {
  qc.setQueryData<Bootstrap>(chaves.bootstrap, (b) => (b ? fn(b) : b))
}

/** O QueryClient do app, para quem só recebe texto (fontes da paleta): os globais do núcleo registram ao montar. */
let padrao: QueryClient | null = null
export function definirClientePadrao(qc: QueryClient | null): void {
  padrao = qc
}
export function clientePadrao(): QueryClient | null {
  return padrao
}
/** O bootstrap em cache do cliente padrão (undefined antes de carregar ou fora da área autenticada). */
export function bootstrapAtual(): Bootstrap | undefined {
  return padrao ? bootstrapDe(padrao) : undefined
}

export function bootstrapDe(qc: QueryClient): Bootstrap | undefined {
  return qc.getQueryData<Bootstrap>(chaves.bootstrap)
}

export function demandaEmCache(qc: QueryClient, id: Id): Demanda | undefined {
  return bootstrapDe(qc)?.demandas.find((d) => d.id === id)
}

/** O detalhe aberto da demanda (chave ['demanda', numero], achada pelo id). */
function chaveDoDetalhe(qc: QueryClient, demandaId: Id): readonly unknown[] | null {
  for (const [chave, dado] of qc.getQueriesData<DemandaDetalhe>({ queryKey: ['demanda'] })) {
    if (chave.length === 2 && typeof chave[1] === 'number' && dado?.demanda.id === demandaId) return chave
  }
  return null
}

export function atualizarDetalhe(qc: QueryClient, demandaId: Id, fn: (d: DemandaDetalhe) => DemandaDetalhe): void {
  const chave = chaveDoDetalhe(qc, demandaId)
  if (chave) qc.setQueryData<DemandaDetalhe>(chave, (d) => (d ? fn(d) : d))
}

/** A descrição mudou (o texto não viaja no evento, API §3): o detalhe aberto busca de novo. */
export function invalidarDetalhe(qc: QueryClient, demandaId: Id): void {
  const chave = chaveDoDetalhe(qc, demandaId)
  if (chave) void qc.invalidateQueries({ queryKey: chave, exact: true })
}

function patchNoDetalhe(qc: QueryClient, id: Id, patch: Partial<Demanda>): void {
  atualizarDetalhe(qc, id, (det) => (mudou(det.demanda, patch) ? { ...det, demanda: { ...det.demanda, ...patch, id } } : det))
}

/** Aplica campos de uma demanda. false = o id não está no bootstrap (o detalhe aberto, se houver, muda mesmo assim). */
export function aplicarPatchDemanda(qc: QueryClient, id: Id, patch: Partial<Demanda>): boolean {
  const conhecida = !!demandaEmCache(qc, id)
  if (conhecida) mudarBootstrap(qc, (b) => comPatchDemanda(b, id, patch))
  patchNoDetalhe(qc, id, patch)
  return conhecida
}

/** Objeto inteiro (criação, restaurar, voltar ao conjunto do bootstrap): entra ou é substituído. */
export function inserirDemanda(qc: QueryClient, d: Demanda): void {
  mudarBootstrap(qc, (b) => comDemanda(b, d))
  atualizarDetalhe(qc, d.id, (det) => (det.demanda === d ? det : { ...det, demanda: d }))
}

export function removerDemanda(qc: QueryClient, id: Id): void {
  mudarBootstrap(qc, (b) => semDemanda(b, id))
}

export function aplicarNoBootstrap<K extends ListaBootstrap>(
  qc: QueryClient, lista: K, op: 'upsert' | 'delete', item: Bootstrap[K][number] | { id: string },
): void {
  mudarBootstrap(qc, (b) => comItem(b, lista, op, item))
}

/**
 * A resposta do servidor para uma demanda que acabamos de mudar. Não volta no tempo: se o cache já tem uma versão mais
 * nova (atualizadoEm maior: outra pessoa mudou enquanto a resposta viajava, e o evento dela já chegou), só os
 * `campos` desta mutação vêm da resposta (o eco dela é ignorado; os outros campos já estão certos no cache).
 */
export function aplicarDemandaDoServidor(qc: QueryClient, d: Demanda, campos?: readonly (keyof Demanda)[]): void {
  const atual = demandaEmCache(qc, d.id)
  if (atual && atual.atualizadoEm > d.atualizadoEm) {
    if (!campos?.length) return
    const patch: Partial<Demanda> = {}
    for (const k of campos) (patch as Record<string, unknown>)[k] = d[k]
    aplicarPatchDemanda(qc, d.id, patch)
    return
  }
  inserirDemanda(qc, d)
}
