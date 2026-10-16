/**
 * Só DEV (/dev/extensoes): layout "Calendário" de exemplo sobre o CalendarioDemandas do núcleo (o de verdade é do F6;
 * apague este quando o F6 entrar). `exemplo: true` deixa a página do quadro escondê-lo fora da tela de exemplos.
 */
import { CalendarDays } from 'lucide-react'
import type { ExtensaoLayout } from '../tipos.ts'

export const layout: (ExtensaoLayout & { exemplo: true }) | undefined = import.meta.env.DEV ? {
  id: 'calendario', rotulo: 'Calendário', icone: CalendarDays, ordem: 300, exemplo: true,
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.LayoutCalendario })),
} : undefined
