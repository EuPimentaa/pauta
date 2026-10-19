/**
 * Dados da agenda externa (F9; API.md §F.9): a lista (sem o endereço), os eventos de um período (até 62 dias, a chave
 * ['agenda-externa', 'eventos', de, ate]) e as mutações do admin. O tempo real mantém tudo (eventos/agenda.ts); as
 * mutações aplicam a resposta na hora. O filtro de calendários fica neste aparelho (localStorage).
 */
import { useCallback, useMemo } from 'react'
import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import type {
  AgendaExterna, CriarAgendaExternaEntrada, DataLocal, EditarAgendaExternaEntrada, EventosAgendaSaida,
} from '@shared/tipos/index.ts'
import { api, comConsulta, type ErroDaApi } from '../../api/cliente.ts'
import { useLocal } from '../../lib/armazenamento.ts'
import { aplicarAgenda, tirarAgenda } from './cache.ts'
import { alternarDesligada, CHAVE_DESLIGADAS, chavesAgenda } from './logica.ts'

/** `acompanharMs`: relê a lista nesse intervalo (Configurações, enquanto espera o fim de uma busca pedida). */
export function useAgendasExternas(acompanharMs: number | false = false) {
  return useQuery<AgendaExterna[], ErroDaApi>({
    queryKey: chavesAgenda.lista,
    queryFn: ({ signal }) => api<AgendaExterna[]>('GET', '/api/agendas-externas', { sinal: signal }),
    staleTime: 60_000,
    refetchInterval: acompanharMs,
  })
}

export function useEventosAgenda(de: DataLocal, ate: DataLocal) {
  return useQuery<EventosAgendaSaida, ErroDaApi>({
    queryKey: chavesAgenda.eventos(de, ate),
    queryFn: ({ signal }) => api<EventosAgendaSaida>('GET', comConsulta('/api/agendas-externas/eventos', { de, ate }), { sinal: signal }),
    // o tempo real invalida quando as ocorrências mudam; o resto é a janela de 15 min da busca
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  })
}

const SEM_DESLIGADAS: string[] = []

/** As agendas escondidas no filtro deste aparelho (a mesma chave na Agenda e no Início). */
export function useDesligadas(): { desligadas: ReadonlySet<string>; alternar(id: string): void } {
  const [lista, definir] = useLocal<string[]>(CHAVE_DESLIGADAS, SEM_DESLIGADAS)
  const desligadas = useMemo(() => new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === 'string') : []), [lista])
  const alternar = useCallback((id: string) => definir((atual) => alternarDesligada(Array.isArray(atual) ? atual : [], id)), [definir])
  return { desligadas, alternar }
}

// ─────────────────────────────── mutações (admin) ───────────────────────────────

export async function criarAgendaExterna(qc: QueryClient, e: CriarAgendaExternaEntrada): Promise<AgendaExterna> {
  const a = await api<AgendaExterna>('POST', '/api/agendas-externas', { corpo: e })
  aplicarAgenda(qc, a)
  return a
}

export async function editarAgendaExterna(qc: QueryClient, id: string, e: EditarAgendaExternaEntrada): Promise<AgendaExterna> {
  const a = await api<AgendaExterna>('PATCH', `/api/agendas-externas/${encodeURIComponent(id)}`, { corpo: e })
  aplicarAgenda(qc, a)
  if (e.posicao) void qc.invalidateQueries({ queryKey: chavesAgenda.lista })
  return a
}

export async function excluirAgendaExterna(qc: QueryClient, id: string): Promise<void> {
  await api<void>('DELETE', `/api/agendas-externas/${encodeURIComponent(id)}`)
  tirarAgenda(qc, id)
}

/** "Atualizar agora": 202 com a agenda de antes da busca (o fim chega pelo tempo real ou pela próxima leitura). */
export async function atualizarAgendaExterna(qc: QueryClient, id: string): Promise<AgendaExterna> {
  const a = await api<AgendaExterna>('POST', `/api/agendas-externas/${encodeURIComponent(id)}/atualizar`)
  aplicarAgenda(qc, a)
  return a
}
