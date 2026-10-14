/**
 * Colunas (API.md §4.6): qualquer interno cria, edita (nome, cor, papel, pessoa, WIP, arrastar), arquiva (só sem
 * cards), restaura, move ou arquiva todos os cards e ordena. "Cards da coluna" = cardsDaColuna() (não arquivados,
 * abertos ou concluídos há pouco).
 */
import type {
  ArquivarCardsSaida, ArquivarColunaSaida, Coluna, CriarColunaEntrada, Demanda, EditarColunaEntrada, EditarColunaSaida,
  Id, MoverCardsEntrada, MoverCardsSaida, OrdemColuna, OrdenarColunaSaida,
} from '../../../shared/tipos/index.ts'
import { PRIORIDADES } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, marcadores, novoId, rodar, todos, um, type Db } from '../db.ts'
import { conflito, estadoInvalido, validacao } from '../erros.ts'
import { desligarAutomacoesPara } from './automacoes.ts'
import { concluir } from './concluir.ts'
import { arquivarDemanda, atualizarLinhaDemanda, carregarDemandas, cardsDaColuna } from './demandas.ts'
import { emitir, emitirObjeto } from './eventos.ts'
import { mover } from './mover.ts'
import { exigirAtivos } from './pessoas.ts'
import { posicaoEntre } from './posicao.ts'
import { carregarColuna, carregarQuadro } from './quadros.ts'

function exigirPessoaLivre(db: Db, quadroId: Id, responsavelId: Id, exceto: Id | null): void {
  exigirAtivos(db, [responsavelId], 'responsavelId')
  if (um(db, 'SELECT 1 FROM coluna WHERE quadro_id = ? AND responsavel_id = ? AND arquivada_em IS NULL AND id IS NOT ?',
    quadroId, responsavelId, exceto)) {
    throw conflito('Esta pessoa já tem uma coluna neste quadro.', { campo: 'responsavelId' })
  }
}

const escopoColunas = (quadroId: Id) => ({ tabela: 'coluna', coluna: 'pos' as const, escopo: { coluna: 'quadro_id', valor: quadroId } })

export function criarColuna(db: Db, quadroId: Id, e: CriarColunaEntrada, ator: Ator): Coluna {
  const quadro = carregarQuadro(db, quadroId)
  if (quadro.arquivadoEm) throw estadoInvalido('Este quadro está arquivado.')
  const papel = e.papel ?? 'normal'
  if (e.responsavelId) {
    if (papel !== 'normal') throw validacao('Coluna de pessoa é sempre de papel normal.', { papel: 'só normal com pessoa' })
    exigirPessoaLivre(db, quadro.id, e.responsavelId, null)
  }
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO coluna (id, quadro_id, nome, cor, papel, responsavel_id, limite_wip, pos, criado_em, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, quadro.id, e.nome.trim(), e.cor ?? null, papel, e.responsavelId ?? null, e.limiteWip ?? null,
    posicaoEntre(db, escopoColunas(quadro.id), e.posicao), instante, instante)
  const coluna = carregarColuna(db, id)
  emitirObjeto(db, 'coluna', id, coluna, ator)
  return coluna
}

/**
 * Virar `concluida` conclui as abertas da coluna sem repetição (via 'papel'); deixar de ser não desmarca ninguém.
 * Papel ≠ normal com pessoa → 400. Pôr ou trocar a pessoa não mexe nos membros dos cards que já estão nela.
 */
export function editarColuna(db: Db, id: Id, e: EditarColunaEntrada, ator: Ator): EditarColunaSaida {
  const atual = carregarColuna(db, id)
  if (atual.arquivadaEm) throw estadoInvalido('Restaure a coluna antes.')
  const papel = e.papel ?? atual.papel
  const responsavelId = e.responsavelId !== undefined ? e.responsavelId : atual.responsavelId
  if (responsavelId && papel !== 'normal') throw validacao('Tire a pessoa da coluna antes.', { papel: 'coluna de pessoa é normal' })
  if (responsavelId && responsavelId !== atual.responsavelId) exigirPessoaLivre(db, atual.quadroId, responsavelId, atual.id)

  const concluidas: Id[] = []
  if (papel === 'concluida' && atual.papel !== 'concluida') {
    const abertas = todos<{ id: string }>(db, `SELECT id FROM demanda WHERE coluna_id = ? AND arquivado_em IS NULL
      AND excluido_em IS NULL AND concluida_em IS NULL ORDER BY posicao`, atual.id)
    for (const d of abertas) {
      concluir(db, { demandaId: d.id, ator, concluida: true, via: 'papel', repetir: false, automacao: false })
      concluidas.push(d.id)
    }
  }
  const pos = e.posicao ? posicaoEntre(db, escopoColunas(atual.quadroId), e.posicao, atual.id) : atual.pos
  rodar(db, 'UPDATE coluna SET nome = ?, cor = ?, papel = ?, responsavel_id = ?, limite_wip = ?, pos = ?, atualizado_em = ? WHERE id = ?',
    e.nome?.trim() ?? atual.nome, e.cor !== undefined ? e.cor : atual.cor, papel, responsavelId,
    e.limiteWip !== undefined ? e.limiteWip : atual.limiteWip, pos, agora(), atual.id)
  const coluna = carregarColuna(db, atual.id)
  emitirObjeto(db, 'coluna', coluna.id, coluna, ator)
  return { coluna, concluidas }
}

/**
 * Arquivar só sem cards (409). Antes, arquiva as concluídas antigas que ainda apontam para ela e desliga as
 * automações que apontam para ela.
 */
export function arquivarColuna(db: Db, id: Id, ator: Ator): ArquivarColunaSaida {
  const atual = carregarColuna(db, id)
  if (atual.arquivadaEm) throw conflito('Esta coluna já está arquivada.')
  if (cardsDaColuna(db, atual.id).length > 0) throw conflito('Mova ou arquive os cards antes.')
  const antigas = todos<{ id: string }>(db, `SELECT id FROM demanda WHERE coluna_id = ? AND arquivado_em IS NULL ORDER BY posicao`, atual.id)
  const concluidasArquivadas: Id[] = []
  for (const d of antigas) {
    arquivarDemanda(db, d.id, ator)
    concluidasArquivadas.push(d.id)
  }
  const automacoesDesligadas = desligarAutomacoesPara(db, { colunaId: atual.id }, ator)
  rodar(db, 'UPDATE coluna SET arquivada_em = ?, arquivada_por = ?, atualizado_em = ? WHERE id = ?',
    agora(), ator.usuario?.id ?? null, agora(), atual.id)
  const coluna = carregarColuna(db, atual.id)
  emitirObjeto(db, 'coluna', coluna.id, coluna, ator)
  return { coluna, automacoesDesligadas, concluidasArquivadas }
}

/** Restaura no fim do quadro; quadro arquivado → 422; a pessoa que já tem outra coluna ativa sai desta. */
export function restaurarColuna(db: Db, id: Id, ator: Ator): Coluna {
  const atual = carregarColuna(db, id)
  if (!atual.arquivadaEm) throw conflito('Esta coluna não está arquivada.')
  if (carregarQuadro(db, atual.quadroId).arquivadoEm) throw estadoInvalido('Restaure o quadro antes.')
  let responsavelId = atual.responsavelId
  if (responsavelId && (um(db, `SELECT 1 FROM coluna WHERE quadro_id = ? AND responsavel_id = ? AND arquivada_em IS NULL`,
    atual.quadroId, responsavelId) || !um(db, 'SELECT 1 FROM usuario WHERE id = ? AND ativo = 1', responsavelId))) responsavelId = null
  rodar(db, 'UPDATE coluna SET arquivada_em = NULL, arquivada_por = NULL, responsavel_id = ?, pos = ?, atualizado_em = ? WHERE id = ?',
    responsavelId, posicaoEntre(db, escopoColunas(atual.quadroId), undefined, atual.id), agora(), atual.id)
  const coluna = carregarColuna(db, atual.id)
  emitirObjeto(db, 'coluna', coluna.id, coluna, ator)
  return coluna
}

/** "Mover todos os cards": cada card da coluna, na ordem, pelo mover() para o fim do destino (via 'coluna'). */
export function moverCards(db: Db, id: Id, e: MoverCardsEntrada, ator: Ator): MoverCardsSaida {
  const origem = carregarColuna(db, id)
  if (e.destinoColunaId === origem.id) throw validacao('Escolha outra coluna.', { destinoColunaId: 'a mesma coluna' })
  const movidas: Id[] = []
  const proximas: Demanda[] = []
  for (const demandaId of cardsDaColuna(db, origem.id)) {
    const r = mover(db, { demandaId, ator, colunaId: e.destinoColunaId, via: 'coluna', etiquetasSemPar: e.etiquetasSemPar,
      membros: e.membros })
    movidas.push(demandaId)
    if (r.proxima) proximas.push(r.proxima)
  }
  return { movidas, proximas }
}

/** "Arquivar todos os cards desta coluna". */
export function arquivarCards(db: Db, id: Id, ator: Ator): ArquivarCardsSaida {
  const coluna = carregarColuna(db, id)
  const arquivadas: Id[] = []
  for (const demandaId of cardsDaColuna(db, coluna.id)) {
    arquivarDemanda(db, demandaId, ator)
    arquivadas.push(demandaId)
  }
  return { arquivadas }
}

const PESO_PRIORIDADE = Object.fromEntries([...PRIORIDADES].reverse().map((p, i) => [p, i])) as Record<string, number>
const colador = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

/**
 * "Ordenar por…" (como no Trello): grava as posições dos cards da coluna de uma vez (passo 1024). prazo: sem prazo
 * por último (e a hora, 18:00 sem hora); prioridade: urgente primeiro; criacao: a mais antiga primeiro; titulo; cliente
 * (sigla; sem cliente por último). Empate: a ordem atual.
 */
export function ordenarColuna(db: Db, id: Id, por: OrdemColuna, ator: Ator): OrdenarColunaSaida {
  const coluna = carregarColuna(db, id)
  const ids = cardsDaColuna(db, coluna.id)
  if (ids.length === 0) return { ordem: [] }
  const demandas = carregarDemandas(db, `d.id IN (${marcadores(ids.length)})`, ids, 'd.posicao, d.numero')
  const siglas = new Map(todos<{ id: string; sigla: string }>(db, 'SELECT id, sigla FROM cliente').map((c) => [c.id, c.sigla]))
  const chave = (d: Demanda): (string | number)[] => {
    switch (por) {
      case 'prazo': return [d.prazo ? 0 : 1, d.prazo ?? '', d.prazoHora ?? '18:00']
      case 'prioridade': return [PESO_PRIORIDADE[d.prioridade]!]
      case 'criacao': return [d.numero]
      case 'titulo': return [d.titulo]
      case 'cliente': return [d.clienteId ? 0 : 1, d.clienteId ? siglas.get(d.clienteId) ?? '' : '']
    }
  }
  const ordenadas = [...demandas].map((d, i) => ({ d, i })).sort((a, b) => {
    const ka = chave(a.d)
    const kb = chave(b.d)
    for (let j = 0; j < ka.length; j++) {
      const x = ka[j]!
      const y = kb[j]!
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : colador.compare(String(x), String(y))
      if (c !== 0) return c
    }
    return a.i - b.i
  })
  ordenadas.forEach(({ d }, i) => {
    const posicao = (i + 1) * 1024
    if (d.posicao === posicao) return
    atualizarLinhaDemanda(db, d.id, { posicao }, ator)
    emitir(db, { entidade: 'demanda', id: d.id, demandaId: d.id, op: 'upsert', patch: { posicao }, campos: ['posicao'], ator })
  })
  return { ordem: ordenadas.map(({ d }) => d.id) }
}
