/**
 * Histórico da demanda (API.md §4.15): `atividade` paginada, mais novas primeiro. O `tempo.lancado` é horas
 * individuais: só a dona das horas e o admin veem (a dona é a do apontamento, mesmo quando quem parou o cronômetro
 * foi outra pessoa, ao arquivar a demanda). O `link.exibido` (quem recebeu o endereço do link de aprovação) só o admin vê.
 */
import type { Atividade, Id, ListarHistoricoConsulta, Pagina } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { todos, type Db } from '../db.ts'
import { validacao } from '../erros.ts'
import { demandaViva } from './demandas.ts'
import { mapearAtividade } from './modal-comum.ts'

const LIMITE_PADRAO = 50

/** Cursor opaco: o id da última linha da página, em base64url. */
function lerCursor(cursor: string | undefined): number | null {
  if (!cursor) return null
  const n = Number(Buffer.from(cursor, 'base64url').toString('utf8'))
  if (!Number.isInteger(n) || n < 1) throw validacao('Cursor inválido.', { cursor: 'inválido' })
  return n
}

export function listarHistorico(db: Db, demandaId: Id, c: ListarHistoricoConsulta, ator: Ator): Pagina<Atividade> {
  demandaViva(db, demandaId)
  const limite = Math.min(200, Math.max(1, c.limite ?? LIMITE_PADRAO))
  const depoisDe = lerCursor(c.cursor)
  const condicoes = ['a.demanda_id = ?']
  const params: unknown[] = [demandaId]
  if (depoisDe !== null) { condicoes.push('a.id < ?'); params.push(depoisDe) }
  if (ator.papel !== 'admin') {
    // quem recebeu o endereço do link (link.exibido) é trilha para o admin: aos outros seria só ruído
    condicoes.push(`a.tipo <> 'link.exibido'`)
    condicoes.push(`NOT (a.tipo = 'tempo.lancado' AND coalesce(
      (SELECT ap.usuario_id FROM apontamento ap WHERE ap.id = json_extract(a.dados, '$.apontamentoId')), a.ator_id) IS NOT ?)`)
    params.push(ator.usuario?.id ?? null)
  }
  const linhas = todos<Record<string, unknown>>(db,
    `SELECT a.* FROM atividade a WHERE ${condicoes.join(' AND ')} ORDER BY a.id DESC LIMIT ?`, ...params, limite + 1)
  const itens = linhas.slice(0, limite).map(mapearAtividade)
  const proximo = linhas.length > limite ? Buffer.from(String(itens.at(-1)!.id), 'utf8').toString('base64url') : null
  return { itens, proximo }
}
