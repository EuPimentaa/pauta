/** Modal (F1): marcar etiquetas no card; sem demanda, gerenciar as do quadro. */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'etiquetas'> = {
  id: 'etiquetas', forma: 'popover',
  carregar: () => import('../../funcionalidades/modal/dialogos/index.ts').then((m) => ({ default: m.Etiquetas })),
}
