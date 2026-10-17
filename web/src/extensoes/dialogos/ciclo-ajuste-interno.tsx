/** Ciclo (F2): Pedir ajuste interno (rodada N+1 de origem interna). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'ajuste-interno'> = {
  id: 'ajuste-interno',
  carregar: () => import('../../funcionalidades/ciclo/dialogos/index.ts').then((m) => ({ default: m.AjusteInterno })),
}
