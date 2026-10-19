/**
 * Fonte "agenda" da tela Agenda (F9; FASE2-PLANO §4, ordem 100): os eventos das agendas externas do período visível,
 * só leitura, com o filtro de calendários (chips na cor de cada agenda, guardados neste aparelho).
 */
import type { FonteAgenda } from '../tipos.ts'
import { FiltroAgendas, usarItensAgenda } from '../../funcionalidades/agenda/fonte.tsx'

export const fonte: FonteAgenda = {
  id: 'agenda',
  ordem: 100,
  usarItens: usarItensAgenda,
  Filtro: FiltroAgendas,
}
