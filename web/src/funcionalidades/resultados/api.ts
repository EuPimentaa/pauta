/**
 * Dados dos resultados da Windsor (F8; API.md §F.8). Chaves (o tratador extensoes/eventos/resultados.ts invalida pelo
 * prefixo ['resultados', clienteId] e ['resultados', 'panorama'] quando chega `resultado_cliente`):
 *   ['resultados', clienteId, periodo]          GET /api/clientes/:id/resultados
 *   ['resultados', clienteId, 'contas']         GET /api/clientes/:id/resultados/contas
 *   ['resultados', 'panorama', periodo]         GET /api/resultados/panorama
 *   ['resultados', 'contas']                    GET /api/resultados/contas (admin e atendimento)
 * Com `atualizando: true`, a consulta pede de novo a cada 15 s (o SSE costuma chegar antes).
 * As mutações LANÇAM o ErroDaApi; quem chama decide o aviso.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type {
  ContaLigada, Id, LigarContaEntrada, ListarContasWindsorSaida, PanoramaResultados, PeriodoResultados, ResultadosCliente,
} from '@shared/tipos/index.ts'
import { api, comConsulta, type ErroDaApi } from '../../api/cliente.ts'

export const chavesResultados = {
  tudo: ['resultados'] as const,
  cliente: (clienteId: Id) => ['resultados', clienteId] as const,
  doCliente: (clienteId: Id, periodo: PeriodoResultados) => ['resultados', clienteId, periodo] as const,
  contasDoCliente: (clienteId: Id) => ['resultados', clienteId, 'contas'] as const,
  panorama: (periodo: PeriodoResultados) => ['resultados', 'panorama', periodo] as const,
  todasPanorama: ['resultados', 'panorama'] as const,
  contasWindsor: ['resultados', 'contas'] as const,
}

const REPETIR_MS = 15_000

export function useResultadosCliente(clienteId: Id, periodo: PeriodoResultados) {
  return useQuery<ResultadosCliente, ErroDaApi>({
    queryKey: chavesResultados.doCliente(clienteId, periodo),
    queryFn: ({ signal }) => api<ResultadosCliente>('GET', comConsulta(`/api/clientes/${clienteId}/resultados`, { periodo }), { sinal: signal }),
    staleTime: 60_000,
    placeholderData: (anterior, consulta) => (consulta?.queryKey[1] === clienteId ? anterior : undefined),
    refetchInterval: (q) => (q.state.data?.atualizando ? REPETIR_MS : false),
  })
}

export function usePanorama(periodo: PeriodoResultados) {
  return useQuery<PanoramaResultados, ErroDaApi>({
    queryKey: chavesResultados.panorama(periodo),
    queryFn: ({ signal }) => api<PanoramaResultados>('GET', comConsulta('/api/resultados/panorama', { periodo }), { sinal: signal }),
    staleTime: 60_000,
    placeholderData: (anterior) => anterior,
    refetchInterval: (q) => (q.state.data?.atualizando ? REPETIR_MS : false),
  })
}

export function useContasLigadas(clienteId: Id) {
  return useQuery<ContaLigada[], ErroDaApi>({
    queryKey: chavesResultados.contasDoCliente(clienteId),
    queryFn: ({ signal }) => api<ContaLigada[]>('GET', `/api/clientes/${clienteId}/resultados/contas`, { sinal: signal }),
    staleTime: 60_000,
  })
}

/** A lista de contas da Windsor (só admin e atendimento: `habilitado` falso para a equipe). */
export function useContasWindsor(habilitado = true) {
  return useQuery<ListarContasWindsorSaida, ErroDaApi>({
    queryKey: chavesResultados.contasWindsor,
    queryFn: ({ signal }) => api<ListarContasWindsorSaida>('GET', '/api/resultados/contas', { sinal: signal }),
    enabled: habilitado,
    staleTime: 5 * 60_000,
  })
}

/** "Recarregar lista" (só admin; 1 a cada 10 min). */
export async function recarregarContasWindsor(qc: QueryClient): Promise<ListarContasWindsorSaida> {
  const lista = await api<ListarContasWindsorSaida>('GET', '/api/resultados/contas?recarregar=1')
  qc.setQueryData(chavesResultados.contasWindsor, lista)
  return lista
}

/** Depois de ligar ou desligar: o eco do SSE é ignorado nesta janela, então ela mesma atualiza o que mudou. */
function contasMudaram(qc: QueryClient, clienteId: Id): void {
  void qc.invalidateQueries({ queryKey: chavesResultados.cliente(clienteId) })
  void qc.invalidateQueries({ queryKey: chavesResultados.todasPanorama })
  void qc.invalidateQueries({ queryKey: chavesResultados.contasWindsor })
}

export async function ligarConta(qc: QueryClient, clienteId: Id, e: LigarContaEntrada): Promise<ContaLigada> {
  const conta = await api<ContaLigada>('POST', `/api/clientes/${clienteId}/resultados/contas`, { corpo: e })
  qc.setQueryData<ContaLigada[]>(chavesResultados.contasDoCliente(clienteId), (l) => (l ? [...l.filter((x) => x.id !== conta.id), conta] : l))
  contasMudaram(qc, clienteId)
  return conta
}

export async function desligarConta(qc: QueryClient, clienteId: Id, ligacaoId: Id): Promise<void> {
  await api<void>('DELETE', `/api/clientes/${clienteId}/resultados/contas/${ligacaoId}`)
  qc.setQueryData<ContaLigada[]>(chavesResultados.contasDoCliente(clienteId), (l) => l?.filter((x) => x.id !== ligacaoId))
  contasMudaram(qc, clienteId)
}

/** "Atualizar agora": 202; o fim chega pelo SSE (e pela repetição de 15 s). */
export async function atualizarResultados(qc: QueryClient, clienteId: Id, periodo: PeriodoResultados): Promise<void> {
  await api<{ atualizando: boolean }>('POST', `/api/clientes/${clienteId}/resultados/atualizar`, { corpo: { periodo } })
  await qc.invalidateQueries({ queryKey: chavesResultados.cliente(clienteId) })
}
