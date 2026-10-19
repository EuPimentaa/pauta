/** Diálogo `resultados-ligar-conta` (F8, só ele abre: o tipo é acrescentado em funcionalidades/resultados/dialogos.ts). */
import type { ExtensaoDialogo } from '../tipos.ts'
import '../../funcionalidades/resultados/dialogos.ts'

export const dialogo: ExtensaoDialogo<'resultados-ligar-conta'> = {
  id: 'resultados-ligar-conta',
  carregar: () => import('../../funcionalidades/resultados/DialogoLigarConta.tsx'),
}
