/** Modal (F1): Copiar… (o que manter e onde). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'copiar-demanda'> = {
  id: 'copiar-demanda',
  carregar: () => import('../../funcionalidades/modal/dialogos/index.ts').then((m) => ({ default: m.CopiarDemanda })),
}
