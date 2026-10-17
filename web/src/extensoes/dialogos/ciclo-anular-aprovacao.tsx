/** Ciclo (F2): Anular a aprovação (o Desfazer do Aprovado pelo WhatsApp). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'anular-aprovacao'> = {
  id: 'anular-aprovacao',
  carregar: () => import('../../funcionalidades/ciclo/dialogos/index.ts').then((m) => ({ default: m.AnularAprovacao })),
}
