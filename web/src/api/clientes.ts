/**
 * Cliente completo (contatos, links, contadores) em ['cliente', sigla] (PLANO §2.1). A sigla sai do bootstrap; o
 * tratador do tempo real (cliente, contato, link) mantém o cache. O F1 (links no modal), o F2 (contatos do envio)
 * e o F5 (página do cliente) usam.
 *
 *   const { data: cliente } = useClienteDetalhe(demanda.clienteId)
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Cliente, Id } from '@shared/tipos/index.ts'
import { chaves } from './chaves.ts'
import { api, type ErroDaApi } from './cliente.ts'
import { useCliente } from './seletores.ts'

export function useClienteDetalhe(id: Id | null): UseQueryResult<Cliente, ErroDaApi> {
  const resumo = useCliente(id)
  const sigla = resumo?.sigla ?? ''
  return useQuery<Cliente, ErroDaApi>({
    queryKey: chaves.cliente(sigla),
    queryFn: ({ signal }) => api<Cliente>('GET', `/api/clientes/${encodeURIComponent(sigla)}`, { sinal: signal }),
    enabled: !!sigla,
    staleTime: 60_000,
  })
}
