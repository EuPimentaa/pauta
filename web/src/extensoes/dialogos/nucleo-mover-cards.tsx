/** Diálogo do menu da coluna: mover todos os cards (quadro/DialogoMoverCards.tsx). */
import '../../quadro/dialogos-coluna.ts'
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'nucleo-mover-cards'> = {
  id: 'nucleo-mover-cards',
  carregar: () => import('../../quadro/DialogoMoverCards.tsx'),
}
