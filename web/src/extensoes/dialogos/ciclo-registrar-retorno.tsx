/** Ciclo (F2): Registrar retorno (aprovado ou ajuste, com print). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'registrar-retorno'> = {
  id: 'registrar-retorno',
  carregar: () => import('../../funcionalidades/ciclo/dialogos/index.ts').then((m) => ({ default: m.RegistrarRetorno })),
}
