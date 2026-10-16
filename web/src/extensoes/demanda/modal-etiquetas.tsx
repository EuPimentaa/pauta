/** Modal (F1): etiquetas do card (L). */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-etiquetas', ordem: 150, coluna: 'lateral',
  carregar: () => import('../../funcionalidades/modal/lateral/index.ts').then((m) => ({ default: m.Etiquetas })),
}
