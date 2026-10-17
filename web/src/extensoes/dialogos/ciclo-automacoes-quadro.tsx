/** Ciclo (F2): As 4 automações do quadro. */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'automacoes-quadro'> = {
  id: 'automacoes-quadro',
  carregar: () => import('../../funcionalidades/ciclo/dialogos/index.ts').then((m) => ({ default: m.AutomacoesQuadro })),
}
