/** /arquivo (F5): o que saiu do quadro, com busca e restaurar. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/arquivo',
  carregar: () => import('./TelaArquivo.tsx'),
  acesso: 'autenticada',
  layout: 'casca',
  titulo: 'Arquivo',
}
