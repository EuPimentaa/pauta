/** Ciclo (F2): Enviar ao cliente (link ou por fora, com teste de Drive). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'enviar-ao-cliente'> = {
  id: 'enviar-ao-cliente',
  carregar: () => import('../../funcionalidades/ciclo/dialogos/index.ts').then((m) => ({ default: m.EnviarAoCliente })),
}
