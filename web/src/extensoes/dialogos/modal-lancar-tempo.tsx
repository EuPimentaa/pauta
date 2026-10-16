/** Modal (F1): Lançar tempo (também aberto pela tela /horas do F3). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'lancar-tempo'> = {
  id: 'lancar-tempo',
  carregar: () => import('../../funcionalidades/modal/dialogos/index.ts').then((m) => ({ default: m.LancarTempo })),
}
