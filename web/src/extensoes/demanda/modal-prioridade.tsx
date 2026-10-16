/** Modal (F1): prioridade. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-prioridade', ordem: 350, coluna: 'lateral',
  carregar: () => import('../../funcionalidades/modal/lateral/index.ts').then((m) => ({ default: m.Prioridade })),
}
