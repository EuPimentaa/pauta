/**
 * Etiquetas do quadro (API.md §4.7): nome opcional (só cor), sem repetir nome no quadro (sem caixa e sem acento).
 * Excluir tira de todas as demandas, inclusive das que a guardam estando em outro quadro (§5.6).
 */
import type { CriarEtiquetaEntrada, EditarEtiquetaEntrada, Etiqueta, Id } from '../../../shared/tipos/index.ts'
import { normalizarAlias } from '../../../shared/logica/texto.ts'
import type { Ator } from '../auth.ts'
import { agora, novoId, rodar, todos, type Db } from '../db.ts'
import { conflito, estadoInvalido, validacao } from '../erros.ts'
import { carregarDemanda } from './demandas.ts'
import { emitirDelete, emitirMudancasDemanda, emitirObjeto } from './eventos.ts'
import { posicaoEntre } from './posicao.ts'
import { carregarEtiqueta, carregarQuadro } from './quadros.ts'

function nomeLimpo(nome: string | undefined): string {
  const n = (nome ?? '').trim().replace(/\s+/g, ' ')
  if (n.length > 40) throw validacao('Nome de etiqueta com até 40 caracteres.', { nome: 'longo demais' })
  return n
}

function exigirNomeLivre(db: Db, quadroId: Id, nome: string, exceto: Id | null): void {
  if (!nome) return
  const alvo = normalizarAlias(nome)
  const outras = todos<{ id: string; nome: string }>(db, "SELECT id, nome FROM etiqueta WHERE quadro_id = ? AND nome <> '' AND id IS NOT ?", quadroId, exceto)
  if (outras.some((e) => normalizarAlias(e.nome) === alvo)) throw conflito(`Já existe a etiqueta "${nome}" neste quadro.`, { campo: 'nome' })
}

const escopo = (quadroId: Id) => ({ tabela: 'etiqueta', coluna: 'pos' as const, escopo: { coluna: 'quadro_id', valor: quadroId } })

export function criarEtiqueta(db: Db, quadroId: Id, e: CriarEtiquetaEntrada, ator: Ator): Etiqueta {
  const quadro = carregarQuadro(db, quadroId)
  if (quadro.arquivadoEm) throw estadoInvalido('Este quadro está arquivado.')
  const nome = nomeLimpo(e.nome)
  exigirNomeLivre(db, quadro.id, nome, null)
  const id = novoId()
  rodar(db, 'INSERT INTO etiqueta (id, quadro_id, nome, cor, pos, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
    id, quadro.id, nome, e.cor, posicaoEntre(db, escopo(quadro.id), e.posicao), agora())
  const etiqueta = carregarEtiqueta(db, id)
  emitirObjeto(db, 'etiqueta', id, etiqueta, ator)
  return etiqueta
}

export function editarEtiqueta(db: Db, id: Id, e: EditarEtiquetaEntrada, ator: Ator): Etiqueta {
  const atual = carregarEtiqueta(db, id)
  const nome = e.nome !== undefined ? nomeLimpo(e.nome) : atual.nome
  if (nome !== atual.nome) exigirNomeLivre(db, atual.quadroId, nome, atual.id)
  const pos = e.posicao ? posicaoEntre(db, escopo(atual.quadroId), e.posicao, atual.id) : atual.pos
  rodar(db, 'UPDATE etiqueta SET nome = ?, cor = ?, pos = ? WHERE id = ?', nome, e.cor ?? atual.cor, pos, atual.id)
  const etiqueta = carregarEtiqueta(db, atual.id)
  emitirObjeto(db, 'etiqueta', etiqueta.id, etiqueta, ator)
  return etiqueta
}

/** Sai de todas as demandas (cascade). Emite `etiqueta` (delete) e `demanda` (etiquetaIds) das que estão no quadro. */
export function excluirEtiqueta(db: Db, id: Id, ator: Ator): void {
  const atual = carregarEtiqueta(db, id)
  const afetadas = todos<{ id: string }>(db, `
    SELECT d.id FROM demanda_etiqueta de JOIN demanda d ON d.id = de.demanda_id
     WHERE de.etiqueta_id = ? AND d.quadro_id = de.quadro_id`, atual.id).map((l) => carregarDemanda(db, l.id))
  rodar(db, 'DELETE FROM etiqueta WHERE id = ?', atual.id)
  emitirDelete(db, 'etiqueta', atual.id, ator)
  for (const antes of afetadas) emitirMudancasDemanda(db, antes, ator)
}
