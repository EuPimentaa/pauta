/** Só DEV (/dev/extensoes): seção principal de ordem 200 que demora 1,5 s para carregar (o host mostra o esqueleto). */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'nucleo-exemplo-principal-b', ordem: 200, coluna: 'principal',
  carregar: () => new Promise((r) => setTimeout(r, 1500))
    .then(() => import('../../telas/dev-extensoes/componentes-exemplo.tsx'))
    .then((m) => ({ default: m.SecaoPrincipalB })),
}
