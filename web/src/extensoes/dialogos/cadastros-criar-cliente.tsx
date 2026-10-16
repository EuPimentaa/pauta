/** Diálogo `criar-cliente` (F5): sigla e nome, para todos os papéis (F1, F4 e a lista de Clientes abrem). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'criar-cliente'> = {
  id: 'criar-cliente',
  carregar: () => import('../../funcionalidades/cadastros/DialogoCriarCliente.tsx'),
}
