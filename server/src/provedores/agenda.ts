/**
 * Provedor da agenda para o MCP (FASE2-PLANO §5; API.md §F.5.1): a ferramenta `agenda` do F7 lê as ocorrências das
 * agendas ativas no período (até 62 dias) sem importar este serviço. Do cache (nunca busca o iCal); privados já vêm
 * como "Ocupado", sem local, descrição nem link. Período inválido lança o mesmo ErroHttp 400 da rota (o F7 envolve toda
 * chamada de provedor num try/catch).
 */
import type { ProvedorAgendaMcp } from '../../../shared/tipos/index.ts'
import type { Db } from '../db.ts'
import { eventosAgenda } from '../servicos/agenda.ts'

export const provedor: ProvedorAgendaMcp<Db> = {
  tipo: 'agenda',
  eventos: (db, { de, ate }) => eventosAgenda(db, { de, ate }),
}
