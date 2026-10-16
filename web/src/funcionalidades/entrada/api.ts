/**
 * Dados da Entrada (F4): criação rápida, Colar do WhatsApp, busca e modelos de demanda. As rotas são desta
 * funcionalidade (API.md §4.9 e §4.13); o cache é atualizado pela resposta (o tempo real ignora o próprio eco) e,
 * para os outros, pelo tratador de extensoes/eventos/entrada.ts.
 *
 *   const contexto = useContextoRapida()                       // mapas de clientes e pessoas para a prévia ao vivo
 *   const saida = await criarRapida(qc, { texto, colunaId })   // a demanda já entra no quadro
 *   const { data: modelos } = useModelosTodos()                // com os desativados (tela de modelos)
 */
import { useMemo } from 'react'
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  AnaliseTexto, BuscaSaida, CriarModeloDemandaEntrada, CriarRapidaEntrada, CriarRapidaSaida, EditarModeloDemandaEntrada, Id,
  ModeloDemanda, ModelosRevisadosSaida,
} from '@shared/tipos/index.ts'
import { montarContextoRapida, type ContextoRapida } from '@shared/logica/rapida.ts'
import { aplicarNoBootstrap, inserirDemanda, inserirOuAtualizar, mudarBootstrap } from '../../api/cache.ts'
import { chaves } from '../../api/chaves.ts'
import { api, type ErroDaApi } from '../../api/cliente.ts'
import { useClientes, useUsuarios } from '../../api/seletores.ts'

// ─────────────────────────────── criação rápida ───────────────────────────────

/** Mapas da análise (clientes pelos apelidos, pessoas ativas pelo apelido ou primeiro nome), do bootstrap. */
export function useContextoRapida(): ContextoRapida {
  const clientes = useClientes()
  const usuarios = useUsuarios()
  return useMemo(() => montarContextoRapida(clientes, usuarios), [clientes, usuarios])
}

/** POST /api/demandas/rapida: a demanda entra no cache pela resposta. Rejeita com ErroDaApi. */
export async function criarRapida(qc: QueryClient, e: CriarRapidaEntrada): Promise<CriarRapidaSaida> {
  const saida = await api<CriarRapidaSaida>('POST', '/api/demandas/rapida', { corpo: e })
  inserirDemanda(qc, saida.demanda)
  return saida
}

// ─────────────────────────────── Colar do WhatsApp ───────────────────────────────

/** POST /api/entrada/analisar (sem efeito). */
export function analisarTexto(texto: string, sinal?: AbortSignal): Promise<AnaliseTexto> {
  return api<AnaliseTexto>('POST', '/api/entrada/analisar', { corpo: { texto }, sinal })
}

// ─────────────────────────────── busca ───────────────────────────────

/**
 * GET /api/busca, guardado por 10 s em ['busca', q] (a paleta pergunta a cada tecla; voltar a um termo é instantâneo).
 * `sinal` só solta quem esperava: a resposta ainda entra no cache.
 */
export async function buscarDemandas(qc: QueryClient, q: string, sinal?: AbortSignal): Promise<BuscaSaida> {
  const pedido = qc.fetchQuery({
    queryKey: chaves.busca(q),
    queryFn: ({ signal }) => api<BuscaSaida>('GET', `/api/busca?q=${encodeURIComponent(q)}`, { sinal: signal }),
    staleTime: 10_000,
    gcTime: 60_000,
  })
  if (!sinal) return pedido
  return new Promise<BuscaSaida>((ok, falha) => {
    const abortar = () => falha(new DOMException('Busca trocada', 'AbortError'))
    if (sinal.aborted) return abortar()
    sinal.addEventListener('abort', abortar, { once: true })
    pedido.then(ok, falha).finally(() => sinal.removeEventListener('abort', abortar))
  })
}

// ─────────────────────────────── modelos ───────────────────────────────

/** ['modelos-demanda']: todos, com os desativados (GET /api/modelos-demanda?inativos=1). */
export function useModelosTodos(): UseQueryResult<ModeloDemanda[], ErroDaApi> {
  return useQuery<ModeloDemanda[], ErroDaApi>({
    queryKey: chaves.modelosDemanda,
    queryFn: ({ signal }) => api<ModeloDemanda[]>('GET', '/api/modelos-demanda?inativos=1', { sinal: signal }),
    staleTime: 60_000,
  })
}

/** O modelo mudou (resposta nossa ou evento de outra pessoa): a lista completa e o bootstrap (só os ativos). */
export function aplicarModelo(qc: QueryClient, m: ModeloDemanda): void {
  qc.setQueryData<ModeloDemanda[]>(chaves.modelosDemanda, (lista) => (lista ? inserirOuAtualizar(lista, m) : lista))
  aplicarNoBootstrap(qc, 'modelosDemanda', m.ativo ? 'upsert' : 'delete', m.ativo ? m : { id: m.id })
}

export function tirarModelo(qc: QueryClient, id: Id): void {
  qc.setQueryData<ModeloDemanda[]>(chaves.modelosDemanda, (lista) => (lista ? lista.filter((m) => m.id !== id) : lista))
  aplicarNoBootstrap(qc, 'modelosDemanda', 'delete', { id })
}

export async function criarModelo(qc: QueryClient, e: CriarModeloDemandaEntrada): Promise<ModeloDemanda> {
  const m = await api<ModeloDemanda>('POST', '/api/modelos-demanda', { corpo: e })
  aplicarModelo(qc, m)
  return m
}

export async function editarModelo(qc: QueryClient, id: Id, e: EditarModeloDemandaEntrada): Promise<ModeloDemanda> {
  const m = await api<ModeloDemanda>('PATCH', `/api/modelos-demanda/${encodeURIComponent(id)}`, { corpo: e })
  aplicarModelo(qc, m)
  return m
}

/** "Revisei os modelos" (admin): grava no bootstrap e o Início relê os Primeiros passos. */
export async function marcarRevisados(qc: QueryClient): Promise<ModelosRevisadosSaida> {
  const r = await api<ModelosRevisadosSaida>('POST', '/api/modelos-demanda/revisados')
  mudarBootstrap(qc, (b) => ({ ...b, config: { ...b.config, modelosRevisadosEm: r.modelosRevisadosEm } }))
  void qc.invalidateQueries({ queryKey: chaves.inicio })
  return r
}
