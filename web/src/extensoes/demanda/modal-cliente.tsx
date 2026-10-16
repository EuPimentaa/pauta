/** Modal (F1): cliente, atendimento, links do cliente e a pasta de saída com Copiar. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-cliente', ordem: 200, coluna: 'lateral',
  carregar: () => import('../../funcionalidades/modal/lateral/index.ts').then((m) => ({ default: m.Cliente })),
}
