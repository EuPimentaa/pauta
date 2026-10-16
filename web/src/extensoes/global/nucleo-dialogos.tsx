/** Host de diálogos (NÚCLEO-WEB): a pilha de abrirDialogo, a navegação fora do render e a ponte da casca. */
import type { ExtensaoGlobal } from '../tipos.ts'

export const global: ExtensaoGlobal = {
  id: 'nucleo-dialogos',
  ordem: 200,
  escopo: 'autenticada',
  carregar: () => import('../../dialogos/Host.tsx'),
}
