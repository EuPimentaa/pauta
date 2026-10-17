/** Início · Minhas demandas por prazo (F3, ordem 100). */
import type { ExtensaoSecaoInicio } from '../tipos.ts'

export const secao: ExtensaoSecaoInicio = {
  id: 'paineis-minhas',
  ordem: 100,
  carregar: () => import('../../funcionalidades/paineis/SecaoMinhas.tsx'),
}
