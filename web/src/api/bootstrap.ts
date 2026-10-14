/**
 * GET /api/bootstrap (API §3): tudo o que a interface precisa para abrir. Chave ['bootstrap'], staleTime Infinity:
 * o NÚCLEO-WEB mantém o cache vivo pelo SSE (tratadores) e recarrega com recarregarBootstrap() no `resync`.
 * Só a área autenticada chama; rota pública nunca.
 */
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Bootstrap } from '@shared/tipos/index.ts'
import { definirNomeApp } from '../lib/app.ts'
import { api, type ErroDaApi } from './cliente.ts'

export const CHAVE_BOOTSTRAP = ['bootstrap'] as const

export async function buscarBootstrap(sinal?: AbortSignal): Promise<Bootstrap> {
  const b = await api<Bootstrap>('GET', '/api/bootstrap', { sinal, redirecionar401: false })
  definirNomeApp(b.app?.nome)
  return b
}

export const opcoesBootstrap = {
  queryKey: CHAVE_BOOTSTRAP,
  queryFn: ({ signal }: { signal: AbortSignal }) => buscarBootstrap(signal),
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: (falhas: number, e: ErroDaApi) => e.status !== 401 && e.status !== 403 && falhas < 2,
} as const

export function useBootstrap(): UseQueryResult<Bootstrap, ErroDaApi> {
  return useQuery<Bootstrap, ErroDaApi>(opcoesBootstrap)
}

/** Recarrega o bootstrap (resync do SSE, quadro restaurado). */
export function recarregarBootstrap(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: CHAVE_BOOTSTRAP, refetchType: 'all' })
}

/** Lê o bootstrap do cache fora do render (undefined antes de carregar). */
export function bootstrapEmCache(qc: QueryClient): Bootstrap | undefined {
  return qc.getQueryData<Bootstrap>(CHAVE_BOOTSTRAP)
}
