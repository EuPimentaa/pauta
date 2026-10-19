/** /autorizar?pedido=<id> (F7): a tela de consentimento do Claude. Autenticada (sem sessão: /entrar e volta), sem casca. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/autorizar', carregar: () => import('./TelaAutorizar.tsx'), acesso: 'autenticada', layout: 'vazio', titulo: 'Conectar o Claude',
}
