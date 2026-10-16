/**
 * Só DEV (/dev/extensoes): layout "Lista" de exemplo (o de verdade é do F6; apague este quando o F6 entrar, os ids se
 * repetiriam). `exemplo: true` deixa a página do quadro escondê-lo fora da tela de exemplos.
 */
import { List } from 'lucide-react'
import type { ExtensaoLayout } from '../tipos.ts'

export const layout: (ExtensaoLayout & { exemplo: true }) | undefined = import.meta.env.DEV ? {
  id: 'lista', rotulo: 'Lista', icone: List, ordem: 200, exemplo: true,
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.LayoutLista })),
} : undefined
