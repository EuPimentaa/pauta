/** Só DEV (/dev/extensoes): seção lateral do modal. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'
import { exemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

export const secao: ExtensaoSecaoDemanda | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-lateral', ordem: 100, coluna: 'lateral', visivel: exemplosAtivos,
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.SecaoLateral })),
} : undefined
