/** Início · Menções recentes (F3, ordem 300). */
import type { ExtensaoSecaoInicio } from '../tipos.ts'

export const secao: ExtensaoSecaoInicio = {
  id: 'paineis-mencoes',
  ordem: 300,
  carregar: () => import('../../funcionalidades/paineis/SecaoMencoes.tsx'),
}
