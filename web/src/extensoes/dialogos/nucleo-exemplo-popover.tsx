/** Só DEV (/dev/extensoes): diálogo de exemplo em forma de popover (ancorado no desktop, folha no celular). */
import '../../telas/dev-extensoes/exemplos.ts'
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'nucleo-exemplo-popover'> | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-popover',
  forma: 'popover',
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.DialogoPopover })),
} : undefined
