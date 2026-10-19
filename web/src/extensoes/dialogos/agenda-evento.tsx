/**
 * Diálogo `agenda-evento` (F9): os detalhes de um evento das agendas externas. Popover ancorado no item (desktop),
 * folha no celular. Só a fonte da Agenda e "Hoje na agenda" abrem; por isso o MapaDialogos é aumentado aqui
 * (FASE2-PLANO §4, "cada um aumenta MapaDialogos com declare module no próprio arquivo").
 */
import type { Cor, EventoAgendaExterna } from '@shared/tipos/index.ts'
import type { ExtensaoDialogo } from '../tipos.ts'

declare module '../tipos.ts' {
  interface MapaDialogos {
    /** F9. O evento como veio de GET /api/agendas-externas/eventos e a agenda dele (nome e cor). */
    'agenda-evento': { evento: EventoAgendaExterna; agenda: { nome: string; cor: Cor } }
  }
  interface MapaResultadosDialogos {
    'agenda-evento': { fechado: true }
  }
}

export const dialogo: ExtensaoDialogo<'agenda-evento'> = {
  id: 'agenda-evento',
  forma: 'popover',
  carregar: () => import('../../funcionalidades/agenda/DialogoEvento.tsx'),
}
