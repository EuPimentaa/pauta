/**
 * GET /api/bootstrap (API §3): tudo o que a interface precisa para abrir. Chave ['bootstrap'], staleTime Infinity:
 * o NÚCLEO-WEB mantém o cache vivo pelo SSE (tratadores) e recarrega com recarregarBootstrap() no `resync`.
 * Só a área autenticada chama; rota pública nunca.
 */
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Bootstrap } from '@shared/tipos/index.ts'
import { definirNomeApp } from '../lib/app.ts'
import { marcarPessoaLocal } from '../lib/armazenamento.ts'
import { DICA_SESSAO, temDicaSessao } from '../lib/dica-sessao.ts'
import { ErroDaApi, api } from './cliente.ts'

export const CHAVE_BOOTSTRAP = ['bootstrap'] as const

export async function buscarBootstrap(sinal?: AbortSignal): Promise<Bootstrap> {
  // em produção o index.html acerta a dica com a sessão: sem ela, nem pede (o 401 esperado sujava o console). No
  // desenvolvimento o Vite serve o index.html e a dica pode faltar: pede sempre.
  if (import.meta.env.PROD && !temDicaSessao()) throw new ErroDaApi(401, 'nao_autenticado', 'Entre para continuar.')
  let b: Bootstrap
  try {
    b = await api<Bootstrap>('GET', '/api/bootstrap', { sinal, redirecionar401: false })
  } catch (e) {
    if (e instanceof ErroDaApi && e.status === 401) document.cookie = `${DICA_SESSAO}=; Max-Age=0; Path=/`
    throw e
  }
  definirNomeApp(b.app?.nome)
  // outra pessoa neste navegador: os rascunhos da anterior saem antes de qualquer tela os ler
  marcarPessoaLocal(b.eu.usuario.id)
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
