/**
 * Concluir e repetir (API.md §5.3). Marcar grava concluida_em/por, para os cronômetros e cria a repetição (menos
 * quando a coluna virou `concluida`); a automação `concluida` roda só pelo checkbox/ação. Desmarcar numa coluna
 * `concluida` volta para a coluna de antes (ou a de entrada) pelo `mover()`.
 */
import type { ConcluirSaida, Demanda, Id } from '../../../shared/tipos/index.ts'
import { diasEntre, somarDias } from '../../../shared/logica/datas.ts'
import { proximoPrazo } from '../../../shared/logica/prazo.ts'
import { colunaDeEntrada as entradaPura } from '../../../shared/logica/quadro.ts'
import type { Ator } from '../auth.ts'
import { agora, todos, um, type Db } from '../db.ts'
import { estadoInvalido } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { executarAutomacao } from './automacoes.ts'
import { feriados } from './config-app.ts'
import {
  atualizarLinhaDemanda, carregarDemanda, criarDemanda, demandaViva, emitirChecklist, estaNoBootstrap, inserirChecklist,
  restaurarDemanda,
} from './demandas.ts'
import { emitirMudancasDemanda } from './eventos.ts'
import { pararCronometros } from './horas.ts'
import { mover, responsavelDoCliente } from './mover.ts'
import { carregarColuna, colunasDoQuadro } from './quadros.ts'

/** Quadro de nascimento: o da primeira passagem em demanda_movimento. */
function quadroDeNascimento(db: Db, demandaId: Id): Id {
  return um<{ quadro_id: string }>(db, 'SELECT quadro_id FROM demanda_movimento WHERE demanda_id = ? ORDER BY id LIMIT 1', demandaId)!.quadro_id
}

function quadroAtivo(db: Db, id: Id): boolean {
  return !!um(db, 'SELECT 1 FROM quadro WHERE id = ? AND arquivado_em IS NULL', id)
}

/**
 * A próxima da série (§5.3): já existe ativa (ou excluída) → nada; existe arquivada (Desfazer do concluir) →
 * restaura no topo da coluna de entrada do quadro de nascimento; não existe → cria lá (ou no quadro atual, se o de
 * nascimento estiver arquivado) com o prazo seguinte, título, descrição, cliente, AM, prioridade, estimativa,
 * modelo, repetir, capa de cor, checklists (desmarcados, sem o de rodada), membros e etiquetas.
 */
export function criarRepeticao(db: Db, original: Demanda, ator: Ator): Demanda | null {
  if (original.repetir === 'nenhuma' || !original.prazo) return null
  const nascimento = quadroDeNascimento(db, original.id)
  const quadroId = quadroAtivo(db, nascimento) ? nascimento : original.quadroId
  if (!quadroAtivo(db, quadroId)) return null
  const entrada = entradaPura(colunasDoQuadro(db, quadroId), quadroId)
  if (!entrada) return null

  const existente = um<{ id: string; arquivado_em: string | null; excluido_em: string | null }>(db,
    "SELECT id, arquivado_em, excluido_em FROM demanda WHERE origem = 'repeticao' AND origem_demanda_id = ?", original.id)
  if (existente) {
    if (!existente.arquivado_em || existente.excluido_em) return null
    const daSerie = carregarDemanda(db, existente.id)
    if (!quadroAtivo(db, daSerie.quadroId)) return null
    return restaurarDemanda(db, existente.id,
      { colunaId: daSerie.quadroId === quadroId ? entrada.id : undefined, posicao: { depoisDeId: null } }, ator)
  }

  const fer = feriados(db)
  const prazo = proximoPrazo(original.prazo, original.repetir, fer)
  const passo = diasEntre(original.prazo, prazo)
  const mudaDeQuadro = quadroId !== original.quadroId
  let membroIds = original.membroIds
  if (mudaDeQuadro) {
    const responsavel = responsavelDoCliente(db, original.clienteId, quadroId)
    if (responsavel) membroIds = [responsavel]
  }
  const ativos = new Set(todos<{ id: string }>(db, 'SELECT id FROM usuario WHERE ativo = 1').map((l) => l.id))
  const etiquetaIds = todos<{ etiqueta_id: string }>(db,
    'SELECT etiqueta_id FROM demanda_etiqueta WHERE demanda_id = ? AND quadro_id = ?', original.id, quadroId).map((l) => l.etiqueta_id)
  const descricaoMd = um<{ descricao_md: string }>(db, 'SELECT descricao_md FROM demanda WHERE id = ?', original.id)!.descricao_md
  const { demanda } = criarDemanda(db, {
    quadroId, colunaId: entrada.id, posicao: { depoisDeId: null }, titulo: original.titulo, descricaoMd,
    clienteId: original.clienteId, atendimentoId: original.atendimentoId, modeloId: null,
    membroIds: membroIds.filter((id) => ativos.has(id)), etiquetaIds, prioridade: original.prioridade,
    inicio: original.inicio ? somarDias(original.inicio, passo) : null, inicioHora: original.inicioHora,
    prazo, prazoHora: original.prazoHora,
    publicacaoData: original.publicacaoData ? somarDias(original.publicacaoData, passo) : null, publicacaoHora: original.publicacaoHora,
    estimativaMin: original.estimativaMin, repetir: original.repetir, capaCor: original.capaCor,
    rodadasInclusas: original.rodadasInclusas, origem: 'repeticao', origemDemandaId: original.id,
  }, ator, { notificar: false, criadoPor: original.criadoPor })
  // o modelo vai junto só como referência (os padrões dele já vieram da original)
  if (original.modeloId) atualizarLinhaDemanda(db, demanda.id, { modelo_id: original.modeloId }, ator)

  const checklists = todos<{ id: string; titulo: string; pos: number }>(db,
    'SELECT id, titulo, pos FROM checklist WHERE demanda_id = ? AND rodada_id IS NULL ORDER BY pos', original.id)
  for (const c of checklists) {
    const textos = todos<{ texto: string }>(db, 'SELECT texto FROM checklist_item WHERE checklist_id = ? ORDER BY pos', c.id).map((l) => l.texto)
    emitirChecklist(db, inserirChecklist(db, demanda.id, c.titulo, textos, null, c.pos, ator), ator)
  }
  registrarAtividade(db, { tipo: 'demanda.repetida', ator, demandaId: original.id, dados: { novaId: demanda.id, novaNumero: demanda.numero } })
  registrarAtividade(db, { tipo: 'demanda.repetida', ator, demandaId: demanda.id, dados: { origemId: original.id, origemNumero: original.numero } })
  const final = carregarDemanda(db, demanda.id)
  if (checklists.length > 0 || original.modeloId) emitirMudancasDemanda(db, demanda, ator)
  return final
}

/**
 * Marcar ou desmarcar concluída (API.md §5.3). `via`: checkbox (POST /concluir), coluna (soltar numa `concluida`,
 * feito pelo mover) ou papel (a coluna virou `concluida`: sem repetição). `repetir` e `automacao` sobrescrevem os
 * padrões (repetir: via ≠ papel; automação: só checkbox).
 */
export function concluir(db: Db, p: { demandaId: Id; ator: Ator; concluida: boolean; via: 'checkbox' | 'coluna' | 'papel';
  repetir?: boolean; automacao?: boolean }): ConcluirSaida {
  const antes = demandaViva(db, p.demandaId)
  if (antes.arquivadoEm) throw estadoInvalido('Demanda arquivada. Restaure antes.')
  const estavaNoBootstrap = estaNoBootstrap(db, antes)

  if (p.concluida) {
    if (antes.concluidaEm) return { demanda: antes, proxima: null, automacao: false }
    atualizarLinhaDemanda(db, antes.id, { concluida_em: agora(), concluida_por: p.ator.usuario?.id ?? null }, p.ator)
    pararCronometros(db, { demandaId: antes.id }, p.ator)
    const proxima = (p.repetir ?? p.via !== 'papel') ? criarRepeticao(db, carregarDemanda(db, antes.id), p.ator) : null
    registrarAtividade(db, { tipo: 'demanda.concluida', ator: p.ator, demandaId: antes.id,
      dados: { via: p.via, ...(proxima ? { proximaId: proxima.id, proximaNumero: proxima.numero } : {}) } })
    emitirMudancasDemanda(db, antes, p.ator)
    const automacao = (p.automacao ?? p.via === 'checkbox') ? executarAutomacao(db, antes.id, 'concluida', p.ator) : false
    return { demanda: carregarDemanda(db, antes.id), proxima, automacao }
  }

  if (!antes.concluidaEm) return { demanda: antes, proxima: null, automacao: false }
  const coluna = carregarColuna(db, antes.colunaId)
  if (coluna.papel === 'concluida') {
    const anterior = um<{ coluna_id: string }>(db, `
      SELECT m.coluna_id FROM demanda_movimento m
        JOIN coluna c ON c.id = m.coluna_id JOIN quadro q ON q.id = c.quadro_id
       WHERE m.demanda_id = ? AND m.saiu_em IS NOT NULL ORDER BY m.id DESC LIMIT 1`, antes.id)
    const candidata = anterior ? carregarColuna(db, anterior.coluna_id) : null
    const valida = candidata && !candidata.arquivadaEm && candidata.papel !== 'concluida' && quadroAtivo(db, candidata.quadroId)
    const destino = valida ? candidata : entradaPura(colunasDoQuadro(db, antes.quadroId), antes.quadroId)
    if (!destino || destino.papel === 'concluida') throw estadoInvalido('Não há outra coluna para onde a demanda possa voltar.')
    const r = mover(db, { demandaId: antes.id, ator: p.ator, colunaId: destino.id, via: 'reabrir' })
    return { demanda: r.demanda, proxima: null, automacao: false }
  }
  atualizarLinhaDemanda(db, antes.id, { concluida_em: null, concluida_por: null }, p.ator)
  registrarAtividade(db, { tipo: 'demanda.reaberta', ator: p.ator, demandaId: antes.id, dados: { colunaId: antes.colunaId } })
  const depois = carregarDemanda(db, antes.id)
  emitirMudancasDemanda(db, antes, p.ator, { inteira: !estavaNoBootstrap && estaNoBootstrap(db, depois) })
  return { demanda: depois, proxima: null, automacao: false }
}
