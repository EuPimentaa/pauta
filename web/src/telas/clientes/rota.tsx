/** /clientes e /clientes/:sigla (F5): a lista e a página do cliente, na casca. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rotas: ExtensaoRota[] = [
  { caminho: '/clientes', carregar: () => import('./TelaClientes.tsx'), acesso: 'autenticada', layout: 'casca', titulo: 'Clientes' },
  { caminho: '/clientes/:sigla', carregar: () => import('./TelaCliente.tsx'), acesso: 'autenticada', layout: 'casca', titulo: 'Cliente' },
]
