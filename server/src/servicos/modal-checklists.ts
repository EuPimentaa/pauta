/**
 * Checklists e itens (API.md §4.15): vários por demanda, ordem por `pos`, marcar com quem e quando. O checklist de
 * rodada ("Ajustes R2") só sai por atendimento e admin (pode('checklist_rodada.excluir')). Contadores n_check_* por
 * gatilho; o patch da demanda sai por emitirContadores().
 */
import type {
  Checklist, ChecklistComItens, ChecklistItem, CriarChecklistEntrada, CriarItensEntrada, EditarChecklistEntrada,
  EditarItemEntrada, Id,
} from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, novoId, rodar, todos, um, type Db } from '../db.ts'
import { naoEncontrado, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { carregarChecklistComItens, emitirChecklist, emitirContadores, inserirChecklist } from './demandas.ts'
import { emitirDelete, emitirObjeto } from './eventos.ts'
import { mapear } from './mapear.ts'
import { demandaEditavel } from './modal-comum.ts'
import { posicaoEntre } from './posicao.ts'
import { exigir } from './permissoes.ts'

type Linha = Record<string, unknown>

function tituloValido(t: string): string {
  const titulo = t.replace(/\s+/g, ' ').trim()
  if (!titulo) throw validacao('Dê um nome ao checklist.', { titulo: 'vazio' })
  return titulo.slice(0, 200)
}

/** Textos dos itens: sem os vazios e sem espaço nas pontas. */
function textosValidos(textos: readonly string[]): string[] {
  return textos.map((t) => t.trim()).filter((t) => t.length > 0).map((t) => t.slice(0, 2000))
}

function carregarItem(db: Db, id: Id): ChecklistItem {
  const l = um<Linha>(db, 'SELECT * FROM checklist_item WHERE id = ?', id)
  if (!l) throw naoEncontrado('Item não encontrado.')
  return mapear.checklistItem(l)
}

function semItens(c: ChecklistComItens): Checklist {
  const { itens: _, ...checklist } = c
  return checklist
}

/** POST /api/demandas/:id/checklists: no fim da lista, com os itens (uma linha = um item). */
export function criarChecklist(db: Db, demandaId: Id, e: CriarChecklistEntrada, ator: Ator): ChecklistComItens {
  const antes = demandaEditavel(db, demandaId)
  const titulo = tituloValido(e.titulo)
  const pos = posicaoEntre(db, { tabela: 'checklist', coluna: 'pos', escopo: { coluna: 'demanda_id', valor: demandaId } }, undefined)
  const id = inserirChecklist(db, demandaId, titulo, textosValidos(e.itens ?? []), null, pos, ator)
  registrarAtividade(db, { tipo: 'checklist.criado', ator, demandaId, dados: { checklistId: id, titulo } })
  const c = emitirChecklist(db, id, ator)
  emitirContadores(db, demandaId, ator, antes)
  return c
}

/** PATCH /api/checklists/:id: renomear e reordenar entre os checklists da demanda. */
export function editarChecklist(db: Db, id: Id, e: EditarChecklistEntrada, ator: Ator): ChecklistComItens {
  const atual = carregarChecklistComItens(db, id)
  demandaEditavel(db, atual.demandaId)
  const sets: string[] = []
  const params: unknown[] = []
  if (e.titulo !== undefined) {
    const titulo = tituloValido(e.titulo)
    if (titulo !== atual.titulo) { sets.push('titulo = ?'); params.push(titulo) }
  }
  if (e.posicao) {
    sets.push('pos = ?')
    params.push(posicaoEntre(db, { tabela: 'checklist', coluna: 'pos', escopo: { coluna: 'demanda_id', valor: atual.demandaId } }, e.posicao, id))
  }
  if (sets.length === 0) return atual
  rodar(db, `UPDATE checklist SET ${sets.join(', ')} WHERE id = ?`, ...params, id)
  const c = carregarChecklistComItens(db, id)
  emitirObjeto(db, 'checklist', id, semItens(c), ator, { demandaId: c.demandaId })
  return c
}

/** DELETE /api/checklists/:id: com os itens. O de rodada só atendimento e admin. */
export function excluirChecklist(db: Db, id: Id, ator: Ator): void {
  const atual = carregarChecklistComItens(db, id)
  exigir(ator, 'checklist_rodada.excluir', { checklist: atual })
  const antes = demandaEditavel(db, atual.demandaId)
  // os itens saem antes (os gatilhos de contagem rodam por item) e depois o checklist
  rodar(db, 'DELETE FROM checklist_item WHERE checklist_id = ?', id)
  rodar(db, 'DELETE FROM checklist WHERE id = ?', id)
  registrarAtividade(db, { tipo: 'checklist.removido', ator, demandaId: atual.demandaId, dados: { checklistId: id, titulo: atual.titulo } })
  for (const item of atual.itens) emitirDelete(db, 'checklist_item', item.id, ator, { demandaId: atual.demandaId })
  emitirDelete(db, 'checklist', id, ator, { demandaId: atual.demandaId })
  emitirContadores(db, atual.demandaId, ator, antes)
}

/** POST /api/checklists/:id/itens: cada texto vira um item, na posição pedida (padrão: no fim), na ordem dada. */
export function criarItens(db: Db, checklistId: Id, e: CriarItensEntrada, ator: Ator): ChecklistItem[] {
  const checklist = carregarChecklistComItens(db, checklistId)
  const antes = demandaEditavel(db, checklist.demandaId)
  const textos = textosValidos(e.textos)
  if (textos.length === 0) throw validacao('Escreva o item.', { textos: 'vazio' })
  const alvo = { tabela: 'checklist_item', coluna: 'pos' as const, escopo: { coluna: 'checklist_id', valor: checklistId } }
  const criados: ChecklistItem[] = []
  let rel = e.posicao
  for (const texto of textos) {
    const id = novoId()
    const pos = posicaoEntre(db, alvo, rel)
    rodar(db, 'INSERT INTO checklist_item (id, checklist_id, demanda_id, texto, pos, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
      id, checklistId, checklist.demandaId, texto, pos, agora())
    rel = { depoisDeId: id }
    criados.push(carregarItem(db, id))
  }
  // a renormalização pode ter mexido nas chaves dos já criados: devolve e emite como ficaram
  const finais = criados.map((i) => carregarItem(db, i.id))
  for (const item of finais) emitirObjeto(db, 'checklist_item', item.id, item, ator, { demandaId: checklist.demandaId })
  emitirContadores(db, checklist.demandaId, ator, antes)
  return finais
}

/** PATCH /api/checklist-itens/:id: texto, feito (com quem e quando) e posição dentro do checklist. */
export function editarItem(db: Db, id: Id, e: EditarItemEntrada, ator: Ator): ChecklistItem {
  const atual = carregarItem(db, id)
  const antes = demandaEditavel(db, atual.demandaId)
  const sets: string[] = []
  const params: unknown[] = []
  if (e.texto !== undefined) {
    const texto = e.texto.trim().slice(0, 2000)
    if (!texto) throw validacao('Escreva o item.', { texto: 'vazio' })
    if (texto !== atual.texto) { sets.push('texto = ?'); params.push(texto) }
  }
  const mudouFeito = e.feito !== undefined && e.feito !== (atual.feitoEm !== null)
  if (mudouFeito) {
    sets.push('feito_em = ?', 'feito_por = ?')
    params.push(e.feito ? agora() : null, e.feito ? (ator.usuario?.id ?? null) : null)
  }
  if (e.posicao) {
    sets.push('pos = ?')
    params.push(posicaoEntre(db, { tabela: 'checklist_item', coluna: 'pos', escopo: { coluna: 'checklist_id', valor: atual.checklistId } },
      e.posicao, id))
  }
  if (sets.length === 0) return atual
  // marcar sem usuário (cliente, sistema) não acontece: a rota exige sessão
  if (mudouFeito && e.feito && !ator.usuario) throw new Error('editarItem: marcar precisa de um usuário')
  rodar(db, `UPDATE checklist_item SET ${sets.join(', ')} WHERE id = ?`, ...params, id)
  const item = carregarItem(db, id)
  if (mudouFeito) {
    registrarAtividade(db, { tipo: e.feito ? 'checklist.item_feito' : 'checklist.item_desfeito', ator, demandaId: item.demandaId,
      dados: { itemId: id, texto: item.texto } })
  }
  emitirObjeto(db, 'checklist_item', id, item, ator, { demandaId: item.demandaId })
  if (mudouFeito) emitirContadores(db, item.demandaId, ator, antes)
  return item
}

/** DELETE /api/checklist-itens/:id. */
export function excluirItem(db: Db, id: Id, ator: Ator): void {
  const atual = carregarItem(db, id)
  const antes = demandaEditavel(db, atual.demandaId)
  rodar(db, 'DELETE FROM checklist_item WHERE id = ?', id)
  emitirDelete(db, 'checklist_item', id, ator, { demandaId: atual.demandaId })
  emitirContadores(db, atual.demandaId, ator, antes)
}

/** Checklists da demanda com itens (copiar). */
export function checklistsDe(db: Db, demandaId: Id): ChecklistComItens[] {
  return todos<{ id: string }>(db, 'SELECT id FROM checklist WHERE demanda_id = ? ORDER BY pos, id', demandaId)
    .map((l) => carregarChecklistComItens(db, l.id))
}
