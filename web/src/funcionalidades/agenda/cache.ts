/**
 * Cache da agenda externa (F9; API.md §F.10): o que o tempo real e as respostas das mutações fazem nas chaves
 * ['agendas-externas'] e ['agenda-externa', 'eventos', de, ate]. Puro sobre o QueryClient (os testes do servidor
 * importam; só caminhos relativos).
 * - upsert: troca a agenda na lista (ou acrescenta) e em cada período em cache; pausada sai dos períodos com os eventos
 *   dela; nova ativa ou `ocorrenciasEm` diferente → os períodos são invalidados (buscam de novo); a lista também é
 *   invalidada (a ordem não vem no objeto).
 * - delete: some da lista e dos períodos, com os eventos.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { AgendaExterna, EventoTempoReal, EventosAgendaSaida } from '../../../../shared/tipos/index.ts'
import { chavesAgenda } from './logica.ts'

/** A agenda nova (ou alterada) na lista em cache, na mesma posição. */
export function comAgenda(lista: AgendaExterna[] | undefined, a: AgendaExterna): AgendaExterna[] | undefined {
  if (!lista) return lista
  return lista.some((x) => x.id === a.id) ? lista.map((x) => (x.id === a.id ? a : x)) : [...lista, a]
}

export function aplicarAgenda(qc: QueryClient, a: AgendaExterna): void {
  qc.setQueryData<AgendaExterna[]>(chavesAgenda.lista, (l) => comAgenda(l, a))
  let buscarDeNovo = false
  for (const [chave, s] of qc.getQueriesData<EventosAgendaSaida>({ queryKey: chavesAgenda.todosEventos })) {
    if (!s) continue
    const antes = s.agendas.find((x) => x.id === a.id)
    if (!a.ativa) {
      if (antes) qc.setQueryData<EventosAgendaSaida>(chave, { ...s, agendas: s.agendas.filter((x) => x.id !== a.id), eventos: s.eventos.filter((e) => e.agendaId !== a.id) })
      continue
    }
    if (!antes || antes.ocorrenciasEm !== a.ocorrenciasEm) buscarDeNovo = true
    if (antes) qc.setQueryData<EventosAgendaSaida>(chave, { ...s, agendas: s.agendas.map((x) => (x.id === a.id ? a : x)) })
  }
  if (buscarDeNovo) void qc.invalidateQueries({ queryKey: chavesAgenda.todosEventos })
}

export function tirarAgenda(qc: QueryClient, id: string): void {
  qc.setQueryData<AgendaExterna[]>(chavesAgenda.lista, (l) => l?.filter((x) => x.id !== id))
  for (const [chave, s] of qc.getQueriesData<EventosAgendaSaida>({ queryKey: chavesAgenda.todosEventos })) {
    if (s && s.agendas.some((x) => x.id === id)) {
      qc.setQueryData<EventosAgendaSaida>(chave, { ...s, agendas: s.agendas.filter((x) => x.id !== id), eventos: s.eventos.filter((e) => e.agendaId !== id) })
    }
  }
}

/** O tratador do SSE (`agenda_externa`, sempre o objeto inteiro). Idempotente. */
export function tratarAgendaExterna(ev: EventoTempoReal, qc: QueryClient): void {
  if (ev.e !== 'agenda_externa') return
  if (ev.op === 'delete') { tirarAgenda(qc, ev.id); return }
  aplicarAgenda(qc, ev.p as AgendaExterna)
  void qc.invalidateQueries({ queryKey: chavesAgenda.lista })
}
