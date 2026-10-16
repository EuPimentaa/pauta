/** Modal (F1): estimativa e quanto já foi lançado. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-estimativa', ordem: 400, coluna: 'lateral',
  carregar: () => import('../../funcionalidades/modal/lateral/index.ts').then((m) => ({ default: m.Estimativa })),
}
