/** Início · Hoje na agenda (F9; FASE2-PLANO §4, ordem 150): some quando não há agenda externa ativa. */
import type { ExtensaoSecaoInicio } from '../tipos.ts'

export const secao: ExtensaoSecaoInicio = {
  id: 'agenda-hoje',
  ordem: 150,
  carregar: () => import('../../funcionalidades/agenda/SecaoHojeNaAgenda.tsx'),
}
