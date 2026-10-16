/** Só DEV (/dev/extensoes): layout "Calendário" de exemplo sobre o CalendarioDemandas do núcleo (o de verdade é do F6). */
import { CalendarDays } from 'lucide-react'
import type { ExtensaoLayout } from '../tipos.ts'

export const layout: ExtensaoLayout = {
  id: 'calendario', rotulo: 'Calendário', icone: CalendarDays, ordem: 300,
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.LayoutCalendario })),
}
