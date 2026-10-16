/** Despachante de atalhos (NÚCLEO-WEB): extensoes/atalhos por escopo, acorde G e o indicador "G…". */
import type { ExtensaoGlobal } from '../tipos.ts'

export const global: ExtensaoGlobal = {
  id: 'nucleo-teclado',
  ordem: 300,
  escopo: 'autenticada',
  carregar: () => import('../../teclado/Despachante.tsx'),
}
