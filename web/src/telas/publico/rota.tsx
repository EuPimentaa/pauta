/**
 * /a/:token (F2): página pública de aprovação. Sem sessão: nada de bootstrap, SSE, redirecionamento para /entrar nem
 * registro de extensões; tela cheia, celular primeiro. O servidor manda o HTML de /a/* com no-store, noindex e
 * no-referrer (app.ts).
 */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/a/:token', carregar: () => import('./TelaAprovacao.tsx'), acesso: 'publica', layout: 'vazio', titulo: 'Aprovação',
}
