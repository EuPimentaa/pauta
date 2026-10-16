/** Só DEV (/dev/extensoes): seção com `visivel` falso (o host não a desenha nem a carrega). */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-oculta', ordem: 150, coluna: 'principal', visivel: () => false,
  carregar: () => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.SecaoOculta })),
} : undefined
