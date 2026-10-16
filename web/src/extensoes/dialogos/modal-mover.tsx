/** Modal (F1): Mover para… (quadro, coluna, posição, etiquetas sem par e responsável no destino). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'mover-demanda'> = {
  id: 'mover-demanda',
  carregar: () => import('../../funcionalidades/modal/dialogos/index.ts').then((m) => ({ default: m.MoverDemanda })),
}
