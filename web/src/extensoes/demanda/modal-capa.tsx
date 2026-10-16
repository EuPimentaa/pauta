/** Modal (F1): capa (cor ou imagem anexada). */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-capa', ordem: 600, coluna: 'lateral',
  carregar: () => import('../../funcionalidades/modal/lateral/index.ts').then((m) => ({ default: m.Capa })),
}
