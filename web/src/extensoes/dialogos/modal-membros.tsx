/** Modal (F1): popover de membros (busca, Entrar/Sair, responsável do cliente). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'membros'> = {
  id: 'membros', forma: 'popover',
  carregar: () => import('../../funcionalidades/modal/dialogos/index.ts').then((m) => ({ default: m.Membros })),
}
