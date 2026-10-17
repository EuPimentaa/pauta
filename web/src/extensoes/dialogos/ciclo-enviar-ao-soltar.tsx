/** Ciclo (F2): Enviar ao cliente agora? (soltar numa coluna que aguarda o cliente). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'enviar-ao-soltar'> = {
  id: 'enviar-ao-soltar',
  carregar: () => import('../../funcionalidades/ciclo/dialogos/index.ts').then((m) => ({ default: m.EnviarAoSoltar })),
}
