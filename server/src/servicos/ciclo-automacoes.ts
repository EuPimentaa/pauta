/**
 * Automações do quadro (API.md §4.8): PUT e DELETE de cada um dos 4 gatilhos (admin e atendimento). O destino é uma
 * coluna ativa de qualquer quadro ativo (`gravarAutomacao` do núcleo confere e emite); a execução é do núcleo
 * (`executarAutomacao`, §5.5), chamada pelo ciclo no envio e no retorno e pelo núcleo no "Concluída".
 */
import { GATILHOS_AUTOMACAO, type AutomacaoQuadro, type DefinirAutomacaoEntrada, type GatilhoAutomacao, type Id } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { rodar, um, type Db } from '../db.ts'
import { estadoInvalido, naoEncontrado, validacao } from '../erros.ts'
import { carregarAutomacao, gravarAutomacao } from './automacoes.ts'
import { emitirDelete } from './eventos.ts'
import { exigir } from './permissoes.ts'

function gatilhoValido(g: string): GatilhoAutomacao {
  if (!(GATILHOS_AUTOMACAO as readonly string[]).includes(g)) {
    throw validacao('Gatilho desconhecido.', { gatilho: `use ${GATILHOS_AUTOMACAO.join(', ')}` })
  }
  return g as GatilhoAutomacao
}

function quadroAtivo(db: Db, quadroId: Id): void {
  const q = um<{ arquivado_em: string | null }>(db, 'SELECT arquivado_em FROM quadro WHERE id = ?', quadroId)
  if (!q) throw naoEncontrado('Quadro não encontrado.')
  if (q.arquivado_em) throw estadoInvalido('Este quadro está arquivado. Restaure antes de mudar as automações.')
}

/** PUT /api/quadros/:id/automacoes/:gatilho: cria ou substitui (o quadro de destino é o da coluna). */
export function definirAutomacao(db: Db, quadroId: Id, gatilho: string, e: DefinirAutomacaoEntrada, ator: Ator): AutomacaoQuadro {
  exigir(ator, 'automacao.editar')
  const g = gatilhoValido(gatilho)
  quadroAtivo(db, quadroId)
  return gravarAutomacao(db, { quadroId, gatilho: g, destinoColunaId: e.destinoColunaId, membros: e.membros, ativa: e.ativa ?? true, ator })
}

/** DELETE /api/quadros/:id/automacoes/:gatilho: some a automação (sem ela, o gatilho não move). Idempotente. */
export function excluirAutomacao(db: Db, quadroId: Id, gatilho: string, ator: Ator): void {
  exigir(ator, 'automacao.editar')
  const g = gatilhoValido(gatilho)
  quadroAtivo(db, quadroId)
  const a = carregarAutomacao(db, quadroId, g)
  if (!a) return
  rodar(db, 'DELETE FROM automacao_quadro WHERE quadro_id = ? AND gatilho = ?', quadroId, g)
  emitirDelete(db, 'automacao', a.id, ator)
}
