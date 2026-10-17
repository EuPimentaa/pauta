/** Layout "Lista" do quadro (F6): tabela ordenável e agrupável; no celular, cards agrupados. funcionalidades/lista/. */
import { List } from 'lucide-react'
import type { ExtensaoLayout } from '../tipos.ts'

export const layout: ExtensaoLayout = {
  id: 'lista',
  rotulo: 'Lista',
  icone: List,
  ordem: 200,
  carregar: () => import('../../funcionalidades/lista/LayoutLista.tsx'),
}
