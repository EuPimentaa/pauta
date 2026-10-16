/**
 * Comentários (API.md §4.15): listar, criar, editar e excluir, com @menção e "Visível ao cliente" (só atendimento e
 * admin, por pode()). Notificações (§5.9): `mencao` aos mencionados; `comentario` aos membros e ao AM que não foram
 * mencionados; nunca ao autor; editar só avisa as menções novas.
 */
import type { Anexo, Comentario, ComentarioSaida, CriarComentarioEntrada, EditarComentarioEntrada, Id } from '../../../shared/tipos/index.ts'
import { motivoNegado } from '../../../shared/logica/permissoes.ts'
import { detectarSenha } from '../../../shared/logica/senha.ts'
import { limparMencoes } from '../../../shared/logica/modal-texto.ts'
import type { Ator } from '../auth.ts'
import { agora, marcadores, novoId, rodar, todos, um, type Db } from '../db.ts'
import { ErroHttp, naoEncontrado, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { carregarAnexo, carregarDemanda, demandaViva, emitirContadores, mencoesValidas } from './demandas.ts'
import { emitirObjeto } from './eventos.ts'
import { COLUNAS_ARQUIVO, mapear } from './mapear.ts'
import { demandaEditavel } from './modal-comum.ts'
import { nomeDoAtor, notificar, rotuloDemanda } from './notificacoes.ts'
import { exigir, podeAtor } from './permissoes.ts'

type Linha = Record<string, unknown>

/** Comentários pelo WHERE (sobre `c`), com menções e anexos (os do comentário excluído não vêm). */
function carregarComentarios(db: Db, onde: string, params: unknown[]): Comentario[] {
  const linhas = todos<Linha>(db, `SELECT c.* FROM comentario c WHERE ${onde} ORDER BY c.criado_em, c.rowid`, ...params)
  if (linhas.length === 0) return []
  const ids = linhas.map((l) => String(l.id))
  const mencoes = new Map<string, string[]>()
  for (const l of todos<{ comentario_id: string; usuario_id: string }>(db,
    `SELECT comentario_id, usuario_id FROM comentario_mencao WHERE comentario_id IN (${marcadores(ids.length)}) ORDER BY rowid`, ...ids)) {
    mencoes.set(l.comentario_id, [...(mencoes.get(l.comentario_id) ?? []), l.usuario_id])
  }
  const anexos = new Map<string, Anexo[]>()
  for (const l of todos<Linha>(db, `SELECT a.*, ${COLUNAS_ARQUIVO} FROM anexo a LEFT JOIN arquivo ar ON ar.id = a.arquivo_id
      WHERE a.comentario_id IN (${marcadores(ids.length)}) AND a.excluido_em IS NULL ORDER BY a.pos, a.id`, ...ids)) {
    const a = mapear.anexo(l)
    anexos.set(a.comentarioId!, [...(anexos.get(a.comentarioId!) ?? []), a])
  }
  return linhas.map((l) => {
    const id = String(l.id)
    return mapear.comentario(l, mencoes.get(id) ?? [], l.excluido_em ? [] : (anexos.get(id) ?? []))
  })
}

export function carregarComentario(db: Db, id: Id): Comentario {
  const [c] = carregarComentarios(db, 'c.id = ?', [id])
  if (!c) throw naoEncontrado('Comentário não encontrado.')
  return c
}

/** GET /api/demandas/:id/comentarios: em ordem de criação, os excluídos com corpo vazio. Demanda excluída → 404. */
export function listarComentarios(db: Db, demandaId: Id): Comentario[] {
  demandaViva(db, demandaId)
  return carregarComentarios(db, 'c.demanda_id = ?', [demandaId])
}

/** "Visível ao cliente" só para atendimento e admin (API.md §4.15): os outros, 403 campo_nao_permitido. */
function exigirVisivelCliente(ator: Ator, visivel: boolean | undefined): void {
  if (visivel === true && !podeAtor(ator, 'comentario.visivel_cliente')) {
    throw new ErroHttp(403, 'campo_nao_permitido', motivoNegado('comentario.visivel_cliente'),
      { campo: 'visivelCliente', campos: ['visivelCliente'] })
  }
}

/** O corpo com as menções inválidas em texto, e as válidas (pessoas ativas), na ordem. */
function prepararCorpo(db: Db, md: string): { corpo: string; mencoes: Id[] } {
  const corpo = md.trim()
  if (!corpo) throw validacao('Escreva o comentário.', { corpoMd: 'vazio' })
  const mencoes = mencoesValidas(db, corpo)
  return { corpo: limparMencoes(corpo, new Set(mencoes)), mencoes }
}

/** Primeiras palavras do comentário para o resumo da notificação (sem a marcação das menções). */
function trecho(md: string): string {
  const texto = md.replace(/@\[([^\]\n]{1,120})\]\(mencao:[A-Za-z0-9-]{1,64}\)/g, '@$1').replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ').trim()
  return texto.length > 90 ? `${texto.slice(0, 89)}…` : texto
}

export function criarComentario(db: Db, demandaId: Id, e: CriarComentarioEntrada, ator: Ator): ComentarioSaida {
  exigirVisivelCliente(ator, e.visivelCliente)
  const antes = demandaEditavel(db, demandaId)
  const { corpo, mencoes } = prepararCorpo(db, e.corpoMd)
  if (e.versaoId && !um(db, 'SELECT 1 FROM versao WHERE id = ? AND demanda_id = ?', e.versaoId, demandaId)) {
    throw validacao('A versão não é desta demanda.', { versaoId: 'versão de outra demanda' })
  }
  const anexoIds = [...new Set(e.anexoIds ?? [])]
  for (const a of anexoIds) {
    if (!um(db, 'SELECT 1 FROM anexo WHERE id = ? AND demanda_id = ? AND excluido_em IS NULL AND comentario_id IS NULL', a, demandaId)) {
      throw validacao('Um dos anexos não é desta demanda.', { anexoIds: 'anexo de outra demanda ou já usado' })
    }
  }
  const eu = ator.usuario
  if (!eu) throw new Error('criarComentario precisa de um usuário')
  const id = novoId()
  rodar(db, `INSERT INTO comentario (id, demanda_id, autor_id, versao_id, corpo_md, visivel_cliente, criado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, id, demandaId, eu.id, e.versaoId ?? null, corpo, e.visivelCliente ? 1 : 0, agora())
  for (const u of mencoes) rodar(db, 'INSERT INTO comentario_mencao (comentario_id, usuario_id) VALUES (?, ?)', id, u)
  for (const a of anexoIds) rodar(db, 'UPDATE anexo SET comentario_id = ? WHERE id = ?', id, a)
  const atividadeId = registrarAtividade(db, { tipo: 'comentario.criado', ator, demandaId,
    dados: { comentarioId: id, visivelCliente: !!e.visivelCliente } })
  const comentario = carregarComentario(db, id)
  emitirObjeto(db, 'comentario', id, comentario, ator, { demandaId })
  for (const a of anexoIds) emitirObjeto(db, 'anexo', a, carregarAnexo(db, a), ator, { demandaId })
  emitirContadores(db, demandaId, ator, antes)

  const quem = nomeDoAtor(ator) ?? 'Alguém'
  const rotulo = rotuloDemanda(db, demandaId)
  const resumo = trecho(corpo)
  notificar(db, { para: mencoes, tipo: 'mencao', demandaId, atividadeId, ator,
    resumo: `${quem} mencionou você em ${rotulo}: “${resumo}”` })
  const d = carregarDemanda(db, demandaId)
  notificar(db, { para: [...d.membroIds, ...(d.atendimentoId ? [d.atendimentoId] : [])], tipo: 'comentario', demandaId, atividadeId,
    ator, exceto: mencoes, resumo: `${quem} comentou em ${rotulo}: “${resumo}”` })
  return { comentario, avisos: detectarSenha(corpo) ? ['senha_detectada'] : [] }
}

function comentarioVivo(db: Db, id: Id): Comentario {
  const c = carregarComentario(db, id)
  if (c.excluidoEm) throw naoEncontrado('Comentário não encontrado.')
  return c
}

export function editarComentario(db: Db, id: Id, e: EditarComentarioEntrada, ator: Ator): ComentarioSaida {
  const atual = comentarioVivo(db, id)
  exigir(ator, 'comentario.editar', { comentario: atual })
  exigirVisivelCliente(ator, e.visivelCliente)
  demandaEditavel(db, atual.demandaId)
  const campos: string[] = []
  const params: unknown[] = []
  let novas: Id[] = []
  let corpo = atual.corpoMd
  if (e.corpoMd !== undefined) {
    const p = prepararCorpo(db, e.corpoMd)
    if (p.corpo !== atual.corpoMd) {
      corpo = p.corpo
      campos.push('corpo_md = ?')
      params.push(p.corpo)
      novas = p.mencoes.filter((u) => !atual.mencoes.includes(u))
      rodar(db, 'DELETE FROM comentario_mencao WHERE comentario_id = ?', id)
      for (const u of p.mencoes) rodar(db, 'INSERT INTO comentario_mencao (comentario_id, usuario_id) VALUES (?, ?)', id, u)
    }
  }
  if (e.visivelCliente !== undefined && e.visivelCliente !== atual.visivelCliente) {
    campos.push('visivel_cliente = ?')
    params.push(e.visivelCliente ? 1 : 0)
  }
  if (campos.length === 0) return { comentario: atual, avisos: [] }
  rodar(db, `UPDATE comentario SET ${campos.join(', ')}, editado_em = ? WHERE id = ?`, ...params, agora(), id)
  const atividadeId = registrarAtividade(db, { tipo: 'comentario.editado', ator, demandaId: atual.demandaId, dados: { comentarioId: id } })
  const comentario = carregarComentario(db, id)
  emitirObjeto(db, 'comentario', id, comentario, ator, { demandaId: atual.demandaId })
  if (novas.length > 0) {
    notificar(db, { para: novas, tipo: 'mencao', demandaId: atual.demandaId, atividadeId, ator,
      resumo: `${nomeDoAtor(ator) ?? 'Alguém'} mencionou você em ${rotuloDemanda(db, atual.demandaId)}: “${trecho(corpo)}”` })
  }
  return { comentario, avisos: e.corpoMd !== undefined && detectarSenha(corpo) ? ['senha_detectada'] : [] }
}

/** DELETE: o autor ou o admin. Marca excluido_em e esvazia o corpo (as menções saem junto). */
export function excluirComentario(db: Db, id: Id, ator: Ator): void {
  const atual = comentarioVivo(db, id)
  exigir(ator, 'comentario.excluir', { comentario: atual })
  const antes = demandaEditavel(db, atual.demandaId)
  rodar(db, 'DELETE FROM comentario_mencao WHERE comentario_id = ?', id)
  rodar(db, `UPDATE comentario SET corpo_md = '', excluido_em = ? WHERE id = ?`, agora(), id)
  registrarAtividade(db, { tipo: 'comentario.excluido', ator, demandaId: atual.demandaId, dados: { comentarioId: id } })
  emitirObjeto(db, 'comentario', id, carregarComentario(db, id), ator, { demandaId: atual.demandaId })
  emitirContadores(db, atual.demandaId, ator, antes)
}
