/** Layout "Quadro" do núcleo (quadro/LayoutQuadro.tsx): colunas tingidas e arrastar. */
import { Columns3 } from 'lucide-react'
import type { ExtensaoLayout } from '../tipos.ts'

export const layout: ExtensaoLayout = {
  id: 'quadro',
  rotulo: 'Quadro',
  icone: Columns3,
  ordem: 100,
  carregar: () => import('../../quadro/LayoutQuadro.tsx'),
}
