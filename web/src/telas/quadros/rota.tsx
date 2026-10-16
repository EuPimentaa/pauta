/** /quadros/novo (F5): Novo quadro e, com ?equipes=1, "Criar os quadros das equipes"; por cima da tela atual, só admin. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/quadros/novo',
  carregar: () => import('./TelaNovoQuadro.tsx'),
  acesso: 'admin',
  layout: 'sobreposta',
  titulo: 'Novo quadro',
}
