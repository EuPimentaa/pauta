/**
 * Anexos de referência (API.md §4.15): link https (provedor pelo host), caminho de rede (M:\…, nunca vira href) ou
 * arquivo já enviado (POST /api/arquivos). Excluir: quem enviou, atendimento, admin (pode('anexo.excluir')); o anexo
 * da capa limpa a capa na mesma transação; o print de evidência de uma decisão nunca sai (409).
 */
import type { Anexo, CriarAnexoEntrada, EditarAnexoEntrada, Id } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, rodar, um, type Db } from '../db.ts'
import { conflito, naoEncontrado, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { atualizarLinhaDemanda, carregarAnexo, emitirContadores, inserirAnexo, mandarParaLixoSeSemUso } from './demandas.ts'
import { emitirDelete, emitirMudancasDemanda, emitirObjeto } from './eventos.ts'
import { demandaEditavel } from './modal-comum.ts'
import { posicaoEntre } from './posicao.ts'
import { exigir } from './permissoes.ts'

/** Anexo ativo (404 se não existe ou já saiu). */
function anexoVivo(db: Db, id: Id): Anexo {
  if (!um(db, 'SELECT 1 FROM anexo WHERE id = ? AND excluido_em IS NULL', id)) throw naoEncontrado('Anexo não encontrado.')
  return carregarAnexo(db, id)
}

export function criarAnexo(db: Db, demandaId: Id, e: CriarAnexoEntrada, ator: Ator): Anexo {
  const antes = demandaEditavel(db, demandaId)
  if (e.tipo === 'arquivo' && !um(db, 'SELECT 1 FROM arquivo WHERE id = ?', e.arquivoId)) {
    throw validacao('Arquivo inexistente. Envie de novo.', { arquivoId: 'arquivo inexistente' })
  }
  const anexo = inserirAnexo(db, demandaId, e, ator)
  registrarAtividade(db, { tipo: 'anexo.adicionado', ator, demandaId, dados: { anexoId: anexo.id, nome: anexo.nome, tipo: anexo.tipo } })
  emitirContadores(db, demandaId, ator, antes)
  return anexo
}

/** PATCH /api/anexos/:id: renomear e reordenar (qualquer pessoa interna). */
export function editarAnexo(db: Db, id: Id, e: EditarAnexoEntrada, ator: Ator): Anexo {
  const atual = anexoVivo(db, id)
  demandaEditavel(db, atual.demandaId)
  const sets: string[] = []
  const params: unknown[] = []
  if (e.nome !== undefined) {
    const nome = e.nome.replace(/\s+/g, ' ').trim()
    if (!nome) throw validacao('Dê um nome ao anexo.', { nome: 'vazio' })
    if (nome !== atual.nome) { sets.push('nome = ?'); params.push(nome.slice(0, 200)) }
  }
  if (e.posicao) {
    sets.push('pos = ?')
    params.push(posicaoEntre(db, { tabela: 'anexo', coluna: 'pos', escopo: { coluna: 'demanda_id', valor: atual.demandaId } }, e.posicao, id))
  }
  if (sets.length === 0) return atual
  rodar(db, `UPDATE anexo SET ${sets.join(', ')} WHERE id = ?`, ...params, id)
  const anexo = carregarAnexo(db, id)
  emitirObjeto(db, 'anexo', id, anexo, ator, { demandaId: anexo.demandaId })
  return anexo
}

export function excluirAnexo(db: Db, id: Id, ator: Ator): void {
  const atual = anexoVivo(db, id)
  exigir(ator, 'anexo.excluir', { anexo: atual })
  const antes = demandaEditavel(db, atual.demandaId)
  if (um(db, 'SELECT 1 FROM aprovacao WHERE evidencia_anexo_id = ?', id)) throw conflito('Este print é a prova de uma aprovação.')
  if (antes.capaAnexoId === id) atualizarLinhaDemanda(db, atual.demandaId, { capa_anexo_id: null }, ator)
  rodar(db, 'UPDATE anexo SET excluido_em = ? WHERE id = ?', agora(), id)
  if (atual.arquivo) mandarParaLixoSeSemUso(db, atual.arquivo.id)
  registrarAtividade(db, { tipo: 'anexo.removido', ator, demandaId: atual.demandaId, dados: { anexoId: id, nome: atual.nome } })
  emitirDelete(db, 'anexo', id, ator, { demandaId: atual.demandaId })
  if (antes.capaAnexoId === id) emitirMudancasDemanda(db, antes, ator)
  else emitirContadores(db, atual.demandaId, ator, antes)
}
