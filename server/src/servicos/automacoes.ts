/**
 * Automações do quadro (API.md §5.5): 4 gatilhos, cada um opcional, com destino numa coluna ativa de qualquer quadro
 * ativo. `executarAutomacao` move para o TOPO do destino por `mover()` (via 'automacao'); destino arquivado ou a
 * demanda já lá: nada, sem erro. Automações não disparam umas às outras (mover nunca é gatilho).
 */
import type { AutomacaoQuadro, GatilhoAutomacao, Id, MembrosAoMover } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, rodar, todos, um, type Db } from '../db.ts'
import { estadoInvalido, validacao } from '../erros.ts'
import { emitirObjeto } from './eventos.ts'
import { mapear } from './mapear.ts'
import { mover } from './mover.ts'

type Linha = Record<string, unknown>

export function carregarAutomacao(db: Db, quadroId: Id, gatilho: GatilhoAutomacao): AutomacaoQuadro | null {
  const l = um<Linha>(db, 'SELECT * FROM automacao_quadro WHERE quadro_id = ? AND gatilho = ?', quadroId, gatilho)
  return l ? mapear.automacao(l) : null
}

/**
 * Cria ou substitui a automação do gatilho no quadro (o quadro de destino é o da coluna). Destino precisa ser
 * coluna ativa de quadro ativo (400). Usada na criação e na cópia de quadros e pelo PUT do F2. Emite `automacao`.
 */
export function gravarAutomacao(db: Db, p: {
  quadroId: Id; gatilho: GatilhoAutomacao; destinoColunaId: Id; membros?: MembrosAoMover; ativa?: boolean; ator: Ator
}): AutomacaoQuadro {
  const destino = um<{ quadro_id: string; arquivada_em: string | null; quadro_arquivado: string | null }>(db, `
    SELECT c.quadro_id, c.arquivada_em, q.arquivado_em AS quadro_arquivado FROM coluna c JOIN quadro q ON q.id = c.quadro_id
     WHERE c.id = ?`, p.destinoColunaId)
  if (!destino || destino.arquivada_em || destino.quadro_arquivado) {
    throw validacao('Escolha uma coluna ativa de um quadro ativo.', { destinoColunaId: 'coluna inexistente ou arquivada' })
  }
  rodar(db, `
    INSERT INTO automacao_quadro (quadro_id, gatilho, destino_quadro_id, destino_coluna_id, membros, ativa, atualizado_por, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (quadro_id, gatilho) DO UPDATE SET destino_quadro_id = excluded.destino_quadro_id,
      destino_coluna_id = excluded.destino_coluna_id, membros = excluded.membros, ativa = excluded.ativa,
      atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em`,
    p.quadroId, p.gatilho, destino.quadro_id, p.destinoColunaId, p.membros ?? 'manter', p.ativa ?? true,
    p.ator.usuario?.id ?? null, agora())
  const a = carregarAutomacao(db, p.quadroId, p.gatilho)!
  emitirObjeto(db, 'automacao', a.id, a, p.ator)
  return a
}

/** Desliga (ativa = 0) as automações que apontam para a coluna ou para o quadro. Emite `automacao` de cada uma. */
export function desligarAutomacoesPara(db: Db, alvo: { colunaId?: Id; quadroId?: Id; excetoQuadroId?: Id }, ator: Ator):
  { quadroId: Id; gatilho: GatilhoAutomacao }[] {
  const linhas = alvo.colunaId
    ? todos<Linha>(db, 'SELECT * FROM automacao_quadro WHERE destino_coluna_id = ? AND ativa = 1', alvo.colunaId)
    : todos<Linha>(db, 'SELECT * FROM automacao_quadro WHERE destino_quadro_id = ? AND quadro_id IS NOT ? AND ativa = 1',
      alvo.quadroId ?? null, alvo.excetoQuadroId ?? null)
  const desligadas: { quadroId: Id; gatilho: GatilhoAutomacao }[] = []
  for (const l of linhas) {
    rodar(db, 'UPDATE automacao_quadro SET ativa = 0, atualizado_por = ?, atualizado_em = ? WHERE quadro_id = ? AND gatilho = ?',
      ator.usuario?.id ?? null, agora(), l.quadro_id, l.gatilho)
    const a = carregarAutomacao(db, String(l.quadro_id), l.gatilho as GatilhoAutomacao)!
    emitirObjeto(db, 'automacao', a.id, a, ator)
    desligadas.push({ quadroId: a.quadroId, gatilho: a.gatilho })
  }
  return desligadas
}

/**
 * Roda a automação do gatilho no quadro de referência (padrão: o atual da demanda; ajuste_pedido e aprovado passam
 * o quadro do envio decidido, `quadroDoEnvio`). true = moveu.
 */
export function executarAutomacao(db: Db, demandaId: Id, gatilho: GatilhoAutomacao, ator: Ator, quadroId?: Id): boolean {
  const d = um<{ quadro_id: string; coluna_id: string; arquivado_em: string | null }>(db,
    'SELECT quadro_id, coluna_id, arquivado_em FROM demanda WHERE id = ?', demandaId)
  if (!d || d.arquivado_em) return false
  const a = um<Linha>(db, `
    SELECT a.*, c.arquivada_em, q.arquivado_em AS quadro_arquivado FROM automacao_quadro a
      JOIN coluna c ON c.id = a.destino_coluna_id JOIN quadro q ON q.id = a.destino_quadro_id
     WHERE a.quadro_id = ? AND a.gatilho = ? AND a.ativa = 1`, quadroId ?? d.quadro_id, gatilho)
  if (!a || a.arquivada_em || a.quadro_arquivado || a.destino_coluna_id === d.coluna_id) return false
  // a demanda espera o cliente em outro quadro (ex.: Atendimento › Com o cliente): as etiquetas que ficaram guardadas
  // no quadro do envio (as da Criação) também casam por nome com o destino (pedido 1 do F2, integração 3B)
  mover(db, {
    demandaId, ator, colunaId: String(a.destino_coluna_id), posicao: { depoisDeId: null }, via: 'automacao', gatilho,
    etiquetasSemPar: 'deixar', membros: a.membros as MembrosAoMover,
    ...(quadroId && quadroId !== d.quadro_id ? { etiquetasTambemDe: quadroId } : {}),
  })
  return true
}

/** Quadro do último envio da versão (envio.quadro_id): referência das automações de ajuste e aprovação. */
export function quadroDoEnvio(db: Db, versaoId: Id): Id {
  const l = um<{ quadro_id: string }>(db,
    'SELECT quadro_id FROM envio WHERE versao_id = ? ORDER BY enviado_em DESC, rowid DESC LIMIT 1', versaoId)
  if (!l) throw estadoInvalido('Esta versão ainda não foi enviada ao cliente.')
  return l.quadro_id
}
