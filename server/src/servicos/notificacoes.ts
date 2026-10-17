/**
 * Notificações no app (API.md §5.9): nunca para o próprio ator, nunca repetindo a pessoa no mesmo fato (`exceto`),
 * só para pessoas ativas; cada uma emite o evento `notificacao` (público usuario).
 */
import type { Id, PapelColuna, TipoNotificacao, ViaMovimento } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, marcadores, rodar, todos, um, type Db } from '../db.ts'
import { emitirObjeto } from './eventos.ts'
import { mapear } from './mapear.ts'

export function notificar(db: Db, n: {
  para: Id | Id[]; tipo: TipoNotificacao; demandaId?: Id; atividadeId?: number; ator: Ator; resumo: string; exceto?: Id[]
}): Id[] {
  const proibidos = new Set([...(n.exceto ?? []), ...(n.ator.usuario ? [n.ator.usuario.id] : [])])
  const candidatos = [...new Set(Array.isArray(n.para) ? n.para : [n.para])].filter((id) => !proibidos.has(id))
  if (candidatos.length === 0) return []
  const ativos = new Set(todos<{ id: string }>(db,
    `SELECT id FROM usuario WHERE ativo = 1 AND id IN (${marcadores(candidatos.length)})`, ...candidatos).map((l) => l.id))
  const resumo = n.resumo.length > 300 ? `${n.resumo.slice(0, 299)}…` : n.resumo
  const enviados: Id[] = []
  for (const usuarioId of candidatos) {
    if (!ativos.has(usuarioId)) continue
    const r = rodar(db, `
      INSERT INTO notificacao (usuario_id, tipo, demanda_id, atividade_id, ator_id, resumo, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      usuarioId, n.tipo, n.demandaId ?? null, n.atividadeId ?? null, n.ator.usuario?.id ?? null, resumo, agora())
    const id = Number(r.lastInsertRowid)
    const linha = um<Record<string, unknown>>(db, `
      SELECT n.*, d.numero AS demanda_numero FROM notificacao n LEFT JOIN demanda d ON d.id = n.demanda_id WHERE n.id = ?`, id)!
    emitirObjeto(db, 'notificacao', String(id), mapear.notificacao(linha), n.ator,
      { publico: 'usuario', usuarioId, demandaId: n.demandaId ?? null })
    enviados.push(usuarioId)
  }
  return enviados
}

/**
 * Marca as notificações de um fato desfeito (ex.: a aprovação anulada): o resumo ganha o sufixo ("· anulada por Pri")
 * e cada uma sai de novo pelo evento `notificacao` (objeto inteiro: o sino troca a linha). Não muda o lido.
 */
export function marcarNotificacoesDoFato(db: Db, p: { atividadeId: number; tipo: TipoNotificacao; sufixo: string; ator: Ator }): number {
  const linhas = todos<{ id: number; usuario_id: string; resumo: string; demanda_id: string | null }>(db,
    'SELECT id, usuario_id, resumo, demanda_id FROM notificacao WHERE atividade_id = ? AND tipo = ?', p.atividadeId, p.tipo)
  for (const l of linhas) {
    if (l.resumo.endsWith(p.sufixo)) continue
    const resumo = `${l.resumo.slice(0, 300 - p.sufixo.length)}${p.sufixo}`
    rodar(db, 'UPDATE notificacao SET resumo = ? WHERE id = ?', resumo, l.id)
    const linha = um<Record<string, unknown>>(db, `
      SELECT n.*, d.numero AS demanda_numero FROM notificacao n LEFT JOIN demanda d ON d.id = n.demanda_id WHERE n.id = ?`, l.id)!
    emitirObjeto(db, 'notificacao', String(l.id), mapear.notificacao(linha), p.ator, { publico: 'usuario', usuarioId: l.usuario_id, demandaId: l.demanda_id })
  }
  return linhas.length
}

/** Pessoas ativas que seguem o quadro. */
export function seguidoresDoQuadro(db: Db, quadroId: Id): Id[] {
  return todos<{ usuario_id: string }>(db, `
    SELECT qu.usuario_id FROM quadro_usuario qu JOIN usuario u ON u.id = qu.usuario_id
     WHERE qu.quadro_id = ? AND qu.seguindo = 1 AND u.ativo = 1 ORDER BY qu.usuario_id`, quadroId).map((l) => l.usuario_id)
}

/** Nome curto de quem agiu ("Rafa"), ou null para cliente e sistema. */
export function nomeDoAtor(ator: Ator): string | null {
  return ator.usuario ? (ator.usuario.apelido ?? ator.usuario.nome.split(' ')[0]!) : null
}

/** "#12 Carrossel" para os resumos. */
export function rotuloDemanda(db: Db, demandaId: Id): string {
  const d = um<{ numero: number; titulo: string }>(db, 'SELECT numero, titulo FROM demanda WHERE id = ?', demandaId)
  return d ? `#${d.numero} ${d.titulo}` : 'uma demanda'
}

/**
 * `chegou` aos seguidores (API.md §5.9): só quando a demanda entra no quadro e, depois de aplicados os membros,
 * nenhum membro é da equipe do quadro (quadro sem equipe: nenhum membro). Nunca por automação numa coluna
 * aguardando_cliente. `exceto`: quem já recebeu `membro` neste fato.
 */
export function notificarChegou(db: Db, p: {
  demandaId: Id; quadroId: Id; ator: Ator; via: ViaMovimento | 'criacao'; colunaPapel: PapelColuna; exceto?: Id[]
}): Id[] {
  if (p.via === 'automacao' && p.colunaPapel === 'aguardando_cliente') return []
  const quadro = um<{ nome: string; equipe_id: string | null }>(db, 'SELECT nome, equipe_id FROM quadro WHERE id = ?', p.quadroId)
  if (!quadro) return []
  const membros = todos<{ usuario_id: string }>(db, 'SELECT usuario_id FROM demanda_membro WHERE demanda_id = ?', p.demandaId)
    .map((l) => l.usuario_id)
  if (membros.length > 0) {
    if (quadro.equipe_id === null) return []
    const daEquipe = um<{ n: number }>(db, `
      SELECT count(*) AS n FROM equipe_membro WHERE equipe_id = ? AND usuario_id IN (${marcadores(membros.length)})`,
      quadro.equipe_id, ...membros)!.n
    if (daEquipe > 0) return []
  }
  const seguidores = seguidoresDoQuadro(db, p.quadroId)
  if (seguidores.length === 0) return []
  return notificar(db, {
    para: seguidores, tipo: 'chegou', demandaId: p.demandaId, ator: p.ator, exceto: p.exceto,
    resumo: `${rotuloDemanda(db, p.demandaId)} chegou em ${quadro.nome}`,
  })
}
