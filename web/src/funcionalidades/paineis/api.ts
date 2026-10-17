/**
 * Dados dos painéis (F3; chaves ['inicio'], ['agenda', consulta] e ['notificacoes'], PLANO §2.1).
 * - Início: as listas saem do bootstrap (shared/logica/paineis.ts, as mesmas do servidor), então o card entra e sai
 *   na hora; GET /api/inicio traz as menções e o resto.
 * - Agenda: idem, com os extras (concluídas antigas) de GET /api/agenda.
 * - Sino: a primeira página de GET /api/notificacoes fica em ['notificacoes'] e o tempo real a mantém
 *   (extensoes/eventos/paineis-notificacoes.ts); antes de ela chegar, a contagem é a do bootstrap.
 */
import { useCallback, useMemo } from 'react'
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  AgendaConsulta, AgendaSaida, Bootstrap, InicioSaida, ListarNotificacoesSaida, MarcarLidasEntrada, Notificacao,
} from '@shared/tipos/index.ts'
import { avisarErro } from '../../api/acoes.ts'
import { chaves } from '../../api/chaves.ts'
import { api, comConsulta, type ErroDaApi } from '../../api/cliente.ts'
import { useDoBootstrap } from '../../api/seletores.ts'
import { marcarMencoes } from './cache.ts'
import { comMaisAntigas, LISTA_VAZIA, marcarNaLista } from './logica.ts'

export const PAGINA_NOTIFICACOES = 30

export function useInicioApi() {
  return useQuery<InicioSaida, ErroDaApi>({
    queryKey: chaves.inicio,
    queryFn: ({ signal }) => api<InicioSaida>('GET', '/api/inicio', { sinal: signal }),
    staleTime: 30_000,
  })
}

export function useAgendaApi(c: AgendaConsulta) {
  return useQuery<AgendaSaida, ErroDaApi>({
    queryKey: chaves.agenda(c),
    queryFn: ({ signal }) => api<AgendaSaida>('GET', comConsulta('/api/agenda', { ...c }), { sinal: signal }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}

// ─────────────────────────────── sino ───────────────────────────────

const buscarPrimeira = (sinal?: AbortSignal) =>
  api<ListarNotificacoesSaida>('GET', comConsulta('/api/notificacoes', { limite: PAGINA_NOTIFICACOES }), { sinal })

export function useNotificacoes() {
  return useQuery<ListarNotificacoesSaida, ErroDaApi>({
    queryKey: chaves.notificacoes,
    queryFn: ({ signal }) => buscarPrimeira(signal),
    // o tempo real mantém a lista; o bootstrap recarregado (resync) também a recarrega (useNaoLidas)
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

const selNaoLidas = (b: Bootstrap) => b.naoLidas
const selSeq = (b: Bootstrap) => b.seq

/** Não lidas do sino: da lista, ou do bootstrap enquanto ela não chega. */
export function useNaoLidas(): number {
  const { data } = useNotificacoes()
  const doBootstrap = useDoBootstrap(selNaoLidas) ?? 0
  return data ? data.naoLidas : doBootstrap
}

/** O seq do bootstrap muda quando ele é recarregado (resync): a lista do sino também precisa ser relida. */
export function useSeqDoBootstrap(): number {
  return useDoBootstrap(selSeq) ?? 0
}

/** Marca como lidas (otimista; no erro a lista volta como estava e avisa). */
export async function marcarLidas(qc: QueryClient, quais: MarcarLidasEntrada): Promise<boolean> {
  const antes = qc.getQueryData<ListarNotificacoesSaida>(chaves.notificacoes)
  const inicioAntes = qc.getQueryData<InicioSaida>(chaves.inicio)
  const instante = new Date().toISOString()
  qc.setQueryData<ListarNotificacoesSaida>(chaves.notificacoes, (l) => marcarNaLista(l ?? LISTA_VAZIA, quais, instante))
  marcarMencoes(qc, (m) => (m.lidaEm === null && (quais.ids ? quais.ids.includes(m.id) : quais.ate === undefined || m.id <= quais.ate)
    ? instante : m.lidaEm))
  try {
    await api<void>('POST', '/api/notificacoes/lidas', { corpo: quais })
    return true
  } catch (e) {
    if (antes) qc.setQueryData(chaves.notificacoes, antes)
    if (inicioAntes) qc.setQueryData(chaves.inicio, inicioAntes)
    avisarErro(e, { titulo: 'Não foi possível marcar como lida.' })
    return false
  }
}

/** Busca a página seguinte (mais antigas) e junta no fim da lista. */
export async function carregarMaisAntigas(qc: QueryClient): Promise<void> {
  const l = qc.getQueryData<ListarNotificacoesSaida>(chaves.notificacoes)
  if (!l?.proximo) return
  try {
    const pagina = await api<ListarNotificacoesSaida>('GET', comConsulta('/api/notificacoes', { limite: PAGINA_NOTIFICACOES, antesDe: l.proximo }))
    qc.setQueryData<ListarNotificacoesSaida>(chaves.notificacoes, (atual) => comMaisAntigas(atual ?? l, pagina))
  } catch (e) {
    avisarErro(e, { titulo: 'Não foi possível carregar as notificações antigas.' })
  }
}

/** As ações do sino para os componentes. */
export function useAcoesSino(): { marcar(quais: MarcarLidasEntrada): Promise<boolean>; maisAntigas(): Promise<void>; abrir(n: Notificacao): void } {
  const qc = useQueryClient()
  const marcar = useCallback((quais: MarcarLidasEntrada) => marcarLidas(qc, quais), [qc])
  const maisAntigas = useCallback(() => carregarMaisAntigas(qc), [qc])
  const abrir = useCallback((n: Notificacao) => { if (n.lidaEm === null) void marcarLidas(qc, { ids: [n.id] }) }, [qc])
  return useMemo(() => ({ marcar, maisAntigas, abrir }), [marcar, maisAntigas, abrir])
}
