/** Diálogo `confirmar` do núcleo (dialogos/Confirmar.tsx). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'confirmar'> = {
  id: 'confirmar',
  carregar: () => import('../../dialogos/Confirmar.tsx'),
}
