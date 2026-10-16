/** Só DEV (/dev/extensoes): diálogo de exemplo em forma de modal (abre outro por cima). */
import '../../telas/dev-extensoes/exemplos.ts'
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'nucleo-exemplo-modal'> = {
  id: 'nucleo-exemplo-modal',
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.DialogoModal })),
}
