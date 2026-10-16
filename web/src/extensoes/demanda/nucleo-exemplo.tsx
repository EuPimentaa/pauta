/** Só DEV (/dev/extensoes): seção principal de ordem 100 do modal. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'
import { exemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

export const secao: ExtensaoSecaoDemanda | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-principal-a', ordem: 100, coluna: 'principal', visivel: exemplosAtivos,
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.SecaoPrincipalA })),
} : undefined
