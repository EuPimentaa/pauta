/**
 * Dados do F7 no navegador: a tela de consentimento (/autorizar) e as Conexões (API.md §F.3 e §F.4). As consultas de
 * Conexões ficam em ['conexoes', { todas, revogadas }]; o evento `conexao` (extensoes/eventos/mcp.ts) troca a linha.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type {
  ConexaoMcp, DecisaoAutorizacaoEntrada, DecisaoAutorizacaoSaida, Id, ListarConexoesSaida, PedidoAutorizacao,
} from '@shared/tipos/index.ts'
import { api, comConsulta, type ErroDaApi } from '../../api/cliente.ts'

export const RAIZ_CONEXOES = ['conexoes'] as const
export const chaveConexoes = (todas: boolean, revogadas: boolean) => ['conexoes', { todas, revogadas }] as const

/** GET /api/conexoes (as minhas; `todas` só admin). */
export function useConexoes(todas: boolean, revogadas: boolean) {
  return useQuery<ListarConexoesSaida, ErroDaApi>({
    queryKey: chaveConexoes(todas, revogadas),
    queryFn: ({ signal }) => api<ListarConexoesSaida>('GET', comConsulta('/api/conexoes', { todas: todas || undefined,
      incluirRevogadas: revogadas || undefined }), { sinal: signal }),
    staleTime: 30_000,
  })
}

/**
 * Uma conexão nova ou mudada em todas as listas em cache: entra (criada), troca (mudou) ou sai das listas só de
 * ativas (revogada). As listas "só as minhas" de outra pessoa não existem no cache (a chave é por navegador).
 */
export function aplicarConexao(qc: QueryClient, c: ConexaoMcp, euId: Id | null): void {
  for (const [chave, dados] of qc.getQueriesData<ListarConexoesSaida>({ queryKey: RAIZ_CONEXOES })) {
    if (!dados) continue
    const filtro = chave[1] as { todas?: boolean; revogadas?: boolean } | undefined
    if (!filtro?.todas && c.usuarioId !== euId) continue
    const sem = dados.conexoes.filter((x) => x.id !== c.id)
    const entra = !c.revogadaEm || filtro?.revogadas
    const conexoes = entra ? [c, ...sem] : sem
    conexoes.sort((a, b) => Number(!!a.revogadaEm) - Number(!!b.revogadaEm) || b.criadaEm.localeCompare(a.criadaEm))
    qc.setQueryData<ListarConexoesSaida>(chave, { ...dados, conexoes })
  }
}

/** POST /api/conexoes/:id/revogar: atualiza as listas pela resposta. Lança o ErroDaApi. */
export async function revogarConexao(qc: QueryClient, id: Id, euId: Id | null): Promise<ConexaoMcp> {
  const c = await api<ConexaoMcp>('POST', `/api/conexoes/${id}/revogar`, { corpo: {} })
  aplicarConexao(qc, c, euId)
  return c
}

/** GET /api/oauth/pedidos/:id (só no navegador que abriu o pedido). Sem repetir: 410 e 404 são respostas finais. */
export function usePedido(id: string | null) {
  return useQuery<PedidoAutorizacao, ErroDaApi>({
    queryKey: ['oauth', 'pedido', id],
    queryFn: ({ signal }) => api<PedidoAutorizacao>('GET', `/api/oauth/pedidos/${encodeURIComponent(id!)}`, { sinal: signal }),
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
}

/** POST /api/oauth/pedidos/:id/decisao → para onde a tela vai (location.assign). Lança o ErroDaApi. */
export function decidir(id: string, e: DecisaoAutorizacaoEntrada): Promise<DecisaoAutorizacaoSaida> {
  return api<DecisaoAutorizacaoSaida>('POST', `/api/oauth/pedidos/${encodeURIComponent(id)}/decisao`, { corpo: e })
}

const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const DIA_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit' })

/** "14:05" (São Paulo). */
export function horaDe(i: string): string {
  return HORA.format(new Date(i))
}

/** "14/10/2026, 10:00". */
export function diaHoraDe(i: string): string {
  return DIA_HORA.format(new Date(i))
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(i: string, agora = Date.now()): string {
  const min = Math.max(0, Math.round((agora - Date.parse(i)) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}
