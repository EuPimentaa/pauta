/** Diálogo `copiar-quadro` (F5, só ele abre: o tipo é acrescentado em funcionalidades/cadastros/dialogos.ts). */
import type { ExtensaoDialogo } from '../tipos.ts'
import '../../funcionalidades/cadastros/dialogos.ts'

export const dialogo: ExtensaoDialogo<'copiar-quadro'> = {
  id: 'copiar-quadro',
  carregar: () => import('../../funcionalidades/cadastros/DialogoCopiarQuadro.tsx'),
}
