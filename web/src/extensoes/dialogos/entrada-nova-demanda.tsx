/** Diálogo `nova-demanda` (F4): Shift+N, o botão laranja da barra, o "+" do celular e a paleta. */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'nova-demanda'> = {
  id: 'nova-demanda',
  carregar: () => import('../../funcionalidades/entrada/NovaDemanda.tsx'),
}
