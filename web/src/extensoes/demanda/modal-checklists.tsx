/** Modal (F1): checklists com barra e porcentagem, esconder marcados, arrastar itens e o selo da rodada. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-checklists', ordem: 200, coluna: 'principal',
  carregar: () => import('../../funcionalidades/modal/secoes/index.ts').then((m) => ({ default: m.Checklists })),
}
