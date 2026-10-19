/** /resultados (F8): a carteira de resultados da Windsor, uma linha por cliente com conta ligada; todos os internos. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/resultados', carregar: () => import('./TelaResultados.tsx'), acesso: 'autenticada', layout: 'casca', titulo: 'Resultados',
}
