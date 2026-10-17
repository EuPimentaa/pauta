/**
 * Sino (API.md §4.18, F3): listar as minhas notificações (mais novas primeiro, cursor pelo id) e marcar como lidas.
 * Cada uma marcada emite `notificacao` com o patch `lidaEm`, só para o dono (público usuario).
 * As notificações nascem em servicos/notificacoes.ts (núcleo), chamadas por quem faz o fato.
 */
import type { ListarNotificacoesConsulta, ListarNotificacoesSaida, MarcarLidasEntrada } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, leitura, marcadores, rodar, todos, um, type Db } from '../db.ts'
import { emitir } from './eventos.ts'
import { mapear } from './mapear.ts'

export const LIMITE_PADRAO_NOTIFICACOES = 30
export const LIMITE_MAX_NOTIFICACOES = 100

export function listarNotificacoes(db: Db, usuarioId: string, c: ListarNotificacoesConsulta): ListarNotificacoesSaida {
  const limite = Math.min(Math.max(c.limite ?? LIMITE_PADRAO_NOTIFICACOES, 1), LIMITE_MAX_NOTIFICACOES)
  return leitura(db, () => {
    const onde = ['n.usuario_id = ?']
    const params: unknown[] = [usuarioId]
    if (c.antesDe !== undefined) { onde.push('n.id < ?'); params.push(c.antesDe) }
    if (c.soNaoLidas) onde.push('n.lida_em IS NULL')
    const linhas = todos<Record<string, unknown>>(db, `
      SELECT n.*, d.numero AS demanda_numero FROM notificacao n LEFT JOIN demanda d ON d.id = n.demanda_id
       WHERE ${onde.join(' AND ')} ORDER BY n.id DESC LIMIT ?`, ...params, limite + 1)
    const itens = linhas.slice(0, limite).map(mapear.notificacao)
    return {
      itens,
      naoLidas: Number(um<{ n: number }>(db, 'SELECT count(*) AS n FROM notificacao WHERE usuario_id = ? AND lida_em IS NULL', usuarioId)!.n),
      proximo: linhas.length > limite ? itens.at(-1)!.id : null,
    }
  })
}

/**
 * Marca as minhas ainda não lidas: as de `ids`; sem `ids`, todas até `ate` (inclusive); sem nenhum, todas. Ids de
 * outra pessoa são ignorados (nunca viram 404, para não revelar o que existe). Devolve quantas mudaram.
 */
export function marcarLidas(db: Db, ator: Ator, e: MarcarLidasEntrada): number {
  const usuarioId = ator.usuario!.id
  const onde = ['usuario_id = ?', 'lida_em IS NULL']
  const params: unknown[] = [usuarioId]
  if (e.ids) {
    if (e.ids.length === 0) return 0
    onde.push(`id IN (${marcadores(e.ids.length)})`)
    params.push(...e.ids)
  } else if (e.ate !== undefined) {
    onde.push('id <= ?')
    params.push(e.ate)
  }
  const alvos = todos<{ id: number }>(db, `SELECT id FROM notificacao WHERE ${onde.join(' AND ')} ORDER BY id`, ...params).map((l) => Number(l.id))
  if (alvos.length === 0) return 0
  const lidaEm = agora()
  for (let i = 0; i < alvos.length; i += 500) {
    const lote = alvos.slice(i, i + 500)
    rodar(db, `UPDATE notificacao SET lida_em = ? WHERE id IN (${marcadores(lote.length)})`, lidaEm, ...lote)
  }
  for (const id of alvos) {
    emitir(db, { entidade: 'notificacao', id: String(id), op: 'upsert', patch: { lidaEm }, campos: ['lidaEm'],
      publico: 'usuario', usuarioId, ator })
  }
  return alvos.length
}
