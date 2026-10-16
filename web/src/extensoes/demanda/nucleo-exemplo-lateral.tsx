/** Só DEV (/dev/extensoes): seção lateral do modal. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'nucleo-exemplo-lateral', ordem: 100, coluna: 'lateral',
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.SecaoLateral })),
}
