/** Diálogo do menu da coluna: limite WIP (quadro/DialogoLimiteWip.tsx). */
import '../../quadro/dialogos-coluna.ts'
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'nucleo-limite-wip'> = {
  id: 'nucleo-limite-wip',
  carregar: () => import('../../quadro/DialogoLimiteWip.tsx'),
}
