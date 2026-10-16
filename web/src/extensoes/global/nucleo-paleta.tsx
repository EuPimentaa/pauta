/** Paleta Cmd+K (NÚCLEO-WEB): o cmdk só baixa com ela (fora do chunk inicial). */
import type { ExtensaoGlobal } from '../tipos.ts'

export const global: ExtensaoGlobal = {
  id: 'nucleo-paleta',
  ordem: 400,
  escopo: 'autenticada',
  carregar: () => import('../../paleta/Paleta.tsx'),
}
