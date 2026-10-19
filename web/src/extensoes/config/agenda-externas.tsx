/** Configurações › Agendas externas (F9; FASE2-PLANO §4, ordem 570): só o admin (API.md §F.7, ação `config`). */
import { CalendarSync } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'agenda-externas', rotulo: 'Agendas externas', ordem: 570, caminho: 'agendas-externas', acesso: ['admin'], icone: CalendarSync,
  carregar: () => import('../../funcionalidades/agenda/ConfigAgendas.tsx'),
}
