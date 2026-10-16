/** Modal (F1): cronômetro (T), total e meu tempo, Lançar tempo. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-tempo', ordem: 500, coluna: 'lateral',
  carregar: () => import('../../funcionalidades/modal/lateral/index.ts').then((m) => ({ default: m.Tempo })),
}
