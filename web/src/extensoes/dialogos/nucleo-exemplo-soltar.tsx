/** Só DEV (/dev/extensoes): o diálogo que o interceptador de exemplo abre (Seguir, Feito ou Cancelar). */
import '../../telas/dev-extensoes/exemplos.ts'
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'nucleo-exemplo-soltar'> | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-soltar',
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.DialogoSoltar })),
} : undefined
