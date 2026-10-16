/** Só DEV (/dev/extensoes): layout "Lista" de exemplo (o de verdade é do F6). */
import { List } from 'lucide-react'
import type { ExtensaoLayout } from '../tipos.ts'

export const layout: ExtensaoLayout = {
  id: 'lista', rotulo: 'Lista', icone: List, ordem: 200,
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.LayoutLista })),
}
