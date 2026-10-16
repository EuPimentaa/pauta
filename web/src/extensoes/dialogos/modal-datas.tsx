/** Modal (F1): início, prazo com hora, publicação e repetir. */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'datas'> = {
  id: 'datas', forma: 'popover',
  carregar: () => import('../../funcionalidades/modal/dialogos/index.ts').then((m) => ({ default: m.Datas })),
}
