/** Modal (F1): capa por cor ou imagem anexada. */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'capa'> = {
  id: 'capa', forma: 'popover',
  carregar: () => import('../../funcionalidades/modal/dialogos/index.ts').then((m) => ({ default: m.Capa })),
}
