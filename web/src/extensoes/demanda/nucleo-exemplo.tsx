/** Só DEV (/dev/extensoes): seção principal de ordem 100 do modal. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'nucleo-exemplo-principal-a', ordem: 100, coluna: 'principal',
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.SecaoPrincipalA })),
}
