/** Diálogo `notificacoes` (F3): popover ancorado no sino (desktop), folha no celular (aba Sino). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'notificacoes'> = {
  id: 'notificacoes',
  forma: 'popover',
  carregar: () => import('../../funcionalidades/paineis/DialogoNotificacoes.tsx'),
}
