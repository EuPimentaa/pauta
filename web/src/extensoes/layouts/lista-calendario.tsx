/** Layout "Calendário" do quadro (F6): o CalendarioDemandas do núcleo com as demandas filtradas; arrastar muda o prazo. */
import { CalendarDays } from 'lucide-react'
import type { ExtensaoLayout } from '../tipos.ts'

export const layout: ExtensaoLayout = {
  id: 'calendario',
  rotulo: 'Calendário',
  icone: CalendarDays,
  ordem: 300,
  carregar: () => import('../../funcionalidades/lista/LayoutCalendario.tsx'),
}
