/** Diálogo `atalhos` (F4): a lista do "?", gerada de atalhos() de todas as funcionalidades. */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'atalhos'> = {
  id: 'atalhos',
  carregar: () => import('../../funcionalidades/entrada/ListaAtalhos.tsx'),
}
