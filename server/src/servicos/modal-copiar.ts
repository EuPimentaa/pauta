/**
 * "Copiar…" (API.md §4.15), como no Trello: a cópia nasce na coluna escolhida (qualquer quadro ativo) pela
 * criarDemanda() do núcleo, com título, descrição, cliente, AM, prioridade, estimativa, modelo, repetir e rodadas
 * inclusas da original (os CAMPOS_SO_ATENDIMENTO vão com os valores dela, quem copia não escolhe). Com `manter`:
 * checklists (itens desmarcados; o de rodada fica), etiquetas (mapeadas por nome no destino, §5.6), membros ativos,
 * anexos de referência (o arquivo é o mesmo) e datas. Nasce com a rodada 1, sem versões, comentários nem histórico.
 */
import type { CopiarDemandaEntrada, CriarDemandaSaida, Etiqueta, Id } from '../../../shared/tipos/index.ts'
import { mapearEtiquetas } from '../../../shared/logica/quadro.ts'
import type { Ator } from '../auth.ts'
import { todos, um, type Db } from '../db.ts'
import { estadoInvalido, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { atualizarLinhaDemanda, carregarDemanda, criarDemanda, demandaViva, emitirChecklist, inserirAnexo, inserirChecklist } from './demandas.ts'
import { emitirMudancasDemanda } from './eventos.ts'
import { COLUNAS_ARQUIVO, mapear } from './mapear.ts'
import { checklistsDe } from './modal-checklists.ts'
import { idsAtivos } from './pessoas.ts'
import { etiquetasDoQuadro } from './quadros.ts'

export function copiarDemanda(db: Db, origemId: Id, e: CopiarDemandaEntrada, ator: Ator): CriarDemandaSaida {
  const origem = demandaViva(db, origemId)
  const coluna = um<{ quadro_id: string; arquivada_em: string | null }>(db, 'SELECT quadro_id, arquivada_em FROM coluna WHERE id = ?', e.colunaId)
  if (!coluna) throw validacao('Coluna inexistente.', { colunaId: 'coluna inexistente' })
  if (coluna.arquivada_em) throw estadoInvalido('Esta coluna está arquivada.')
  const destino = coluna.quadro_id
  const manter = e.manter ?? {}
  const linha = um<{ descricao_md: string }>(db, 'SELECT descricao_md FROM demanda WHERE id = ?', origemId)!
  const titulo = (e.titulo ?? origem.titulo).replace(/\s+/g, ' ').trim()
  if (!titulo) throw validacao('Escreva um título.', { titulo: 'vazio' })

  // etiquetas atuais da original, no quadro dela; no destino, as de mesmo nome (as sem par ficam de fora)
  let etiquetaIds: Id[] = []
  if (manter.etiquetas && origem.etiquetaIds.length > 0) {
    if (destino === origem.quadroId) {
      etiquetaIds = [...origem.etiquetaIds]
    } else {
      const atuais = etiquetasDoQuadro(db, origem.quadroId).filter((et: Etiqueta) => origem.etiquetaIds.includes(et.id))
      etiquetaIds = mapearEtiquetas(atuais, etiquetasDoQuadro(db, destino), []).ids
    }
  }
  const ativos = idsAtivos(db)
  const datas = manter.datas
  const { demanda: criada, avisos } = criarDemanda(db, {
    quadroId: destino, colunaId: e.colunaId, posicao: e.posicao, titulo,
    // o modelo entra depois: pela criarDemanda ele traria de novo o checklist e as etiquetas padrão
    modeloId: null,
    // AM desativado: a cópia fica com o padrão (o AM do cliente)
    clienteId: origem.clienteId, atendimentoId: origem.atendimentoId && !ativos.has(origem.atendimentoId) ? undefined : origem.atendimentoId,
    rodadasInclusas: origem.rodadasInclusas,
    membroIds: manter.membros ? origem.membroIds.filter((u) => ativos.has(u)) : [],
    etiquetaIds, descricaoMd: linha.descricao_md, prioridade: origem.prioridade, estimativaMin: origem.estimativaMin,
    inicio: datas ? origem.inicio : null, inicioHora: datas ? origem.inicioHora : null,
    prazo: datas ? origem.prazo : null, prazoHora: datas ? origem.prazoHora : null,
    publicacaoData: datas ? origem.publicacaoData : null, publicacaoHora: datas ? origem.publicacaoHora : null,
    // repetir precisa de prazo: sem as datas, a cópia não repete
    repetir: datas && origem.prazo ? origem.repetir : 'nenhuma',
    origem: 'copia', origemDemandaId: origem.id,
  }, ator)

  // modelo: o da original, se ainda vale no destino (global ou do mesmo quadro, ativo)
  if (origem.modeloId && um(db, 'SELECT 1 FROM modelo_demanda WHERE id = ? AND ativo = 1 AND (quadro_id IS NULL OR quadro_id = ?)',
    origem.modeloId, destino)) {
    atualizarLinhaDemanda(db, criada.id, { modelo_id: origem.modeloId }, ator)
  }
  if (manter.checklists) {
    let pos = 0
    for (const c of checklistsDe(db, origem.id)) {
      if (c.rodadaId !== null) continue
      const id = inserirChecklist(db, criada.id, c.titulo, c.itens.map((i) => i.texto), null, (pos += 1024), ator)
      emitirChecklist(db, id, ator)
    }
  }
  if (manter.anexos) {
    const anexos = todos<Record<string, unknown>>(db, `SELECT a.*, ${COLUNAS_ARQUIVO} FROM anexo a LEFT JOIN arquivo ar ON ar.id = a.arquivo_id
      WHERE a.demanda_id = ? AND a.excluido_em IS NULL AND a.finalidade = 'referencia' AND a.comentario_id IS NULL ORDER BY a.pos, a.id`,
    origem.id).map(mapear.anexo)
    for (const a of anexos) {
      if (a.tipo === 'link' && a.url) inserirAnexo(db, criada.id, { tipo: 'link', url: a.url, nome: a.nome }, ator)
      else if (a.tipo === 'caminho' && a.caminho) inserirAnexo(db, criada.id, { tipo: 'caminho', caminho: a.caminho, nome: a.nome }, ator)
      else if (a.tipo === 'arquivo' && a.arquivo) inserirAnexo(db, criada.id, { tipo: 'arquivo', arquivoId: a.arquivo.id, nome: a.nome }, ator)
    }
  }
  registrarAtividade(db, { tipo: 'demanda.copiada', ator, demandaId: origem.id, dados: { novaId: criada.id, novaNumero: criada.numero } })
  registrarAtividade(db, { tipo: 'demanda.copiada', ator, demandaId: criada.id, dados: { origemId: origem.id, origemNumero: origem.numero } })
  emitirMudancasDemanda(db, criada, ator)
  return { demanda: carregarDemanda(db, criada.id), avisos }
}
