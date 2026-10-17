/** Ciclo (F2): Copiar para WhatsApp (envio, lembrete, aprovado, ajuste). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'copiar-whatsapp'> = {
  id: 'copiar-whatsapp',
  carregar: () => import('../../funcionalidades/ciclo/dialogos/index.ts').then((m) => ({ default: m.CopiarWhatsapp })),
}
