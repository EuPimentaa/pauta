/**
 * Tratador `agenda` (F9; API.md §F.10): `agenda_externa` (sempre o objeto inteiro; excluída = delete) troca a agenda em
 * ['agendas-externas'] e nos períodos em cache; ocorrências novas (`ocorrenciasEm` mudou), agenda nova ou retomada →
 * os períodos ['agenda-externa', 'eventos', …] buscam de novo; pausada ou excluída some na hora com os eventos.
 */
import type { TratadorEventos } from '../tipos.ts'
import { tratarAgendaExterna } from '../../funcionalidades/agenda/cache.ts'

export const tratador: TratadorEventos = {
  id: 'agenda',
  entidades: ['agenda_externa'],
  tratar: tratarAgendaExterna,
}
