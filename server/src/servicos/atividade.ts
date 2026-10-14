/** Histórico tipado (`atividade`): uma linha por fato, com o ator, o trace e os valores anteriores. */
import type { Id, MapaDadosAtividade, TipoAtividade } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, rodar, type Db } from '../db.ts'

export function registrarAtividade<T extends TipoAtividade>(db: Db, a: {
  tipo: T; ator: Ator; demandaId?: Id; clienteId?: Id; dados: MapaDadosAtividade[T]; antes?: Record<string, unknown>
}): number {
  const r = rodar(db, `
    INSERT INTO atividade (demanda_id, cliente_id, ator_id, ator_tipo, tipo, dados, antes, trace_id, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    a.demandaId ?? null, a.clienteId ?? null, a.ator.usuario?.id ?? null, a.ator.tipo, a.tipo,
    JSON.stringify(a.dados ?? {}), a.antes === undefined ? null : JSON.stringify(a.antes), a.ator.traceId, agora())
  return Number(r.lastInsertRowid)
}
