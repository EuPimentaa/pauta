/** Cliente SSE (NÚCLEO-WEB): eventos de /api/eventos no cache, para todas as telas da área autenticada. */
import type { ExtensaoGlobal } from '../tipos.ts'

export const global: ExtensaoGlobal = {
  id: 'nucleo-tempo-real',
  ordem: 100,
  escopo: 'autenticada',
  carregar: () => import('../../tempo-real/TempoReal.tsx'),
}
