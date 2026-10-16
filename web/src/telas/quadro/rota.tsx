/** /q/:slug: a página do quadro (NÚCLEO-WEB). Título dinâmico (o nome do quadro) pelo useTituloAba. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/q/:slug',
  carregar: () => import('./TelaQuadro.tsx'),
  acesso: 'autenticada',
  layout: 'casca',
  titulo: 'Quadro',
}
