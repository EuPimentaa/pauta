/**
 * `mover()`: o único caminho de troca de coluna ou de quadro (API.md §5.1, §5.3 e §5.6). Arrastar, "Mover para…",
 * "Enviar para", teclas , e ., "Mover todos os cards", automações, reabrir e restaurar a repetição passam aqui.
 */
import type {
  Etiqueta, EtiquetasSemPar, GatilhoAutomacao, Id, MembrosAoMover, MoverSaida, PosicaoRelativa, ViaMovimento,
} from '../../../shared/tipos/index.ts'
import { mapearEtiquetas, membrosAoMover, passouWip } from '../../../shared/logica/quadro.ts'
import type { Ator } from '../auth.ts'
import { agora, depoisDe, marcadores, novoId, rodar, todos, um, type Db } from '../db.ts'
import { estadoInvalido, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { criarRepeticao } from './concluir.ts'
import {
  atualizarLinhaDemanda, cardsDaColuna, conflitoRev, demandaViva, estaNoBootstrap, carregarDemanda,
} from './demandas.ts'
import { emitirMudancasDemanda, emitirObjeto } from './eventos.ts'
import { pararCronometros } from './horas.ts'
import { mapear } from './mapear.ts'
import { nomeDoAtor, notificar, notificarChegou, rotuloDemanda } from './notificacoes.ts'
import { exigirAtivos, idsAtivos } from './pessoas.ts'
import { posicaoEntre } from './posicao.ts'
import { carregarColuna, carregarEtiqueta, etiquetasDoQuadro } from './quadros.ts'

type Linha = Record<string, unknown>

export interface MoverParametros {
  demandaId: Id
  ator: Ator
  colunaId: Id
  posicao?: PosicaoRelativa
  via?: ViaMovimento
  gatilho?: GatilhoAutomacao
  etiquetasSemPar?: EtiquetasSemPar
  etiquetaIds?: Id[]
  membros?: MembrosAoMover
  membroIds?: Id[]
  rev?: number
  /**
   * Mudando de quadro, as etiquetas guardadas neste quadro também casam por nome com o destino, além das atuais (as
   * sem par continuam guardadas nele, sem aviso). A automação do quadro do envio (§5.5) passa o quadro do envio.
   */
  etiquetasTambemDe?: Id
}

/** Responsável ativo do cliente na equipe do quadro (cliente_responsavel), ou null. */
export function responsavelDoCliente(db: Db, clienteId: Id | null, quadroId: Id): Id | null {
  if (!clienteId) return null
  const l = um<{ usuario_id: string }>(db, `
    SELECT cr.usuario_id FROM cliente_responsavel cr JOIN quadro q ON q.equipe_id = cr.equipe_id
      JOIN usuario u ON u.id = cr.usuario_id
     WHERE cr.cliente_id = ? AND q.id = ? AND u.ativo = 1`, clienteId, quadroId)
  return l?.usuario_id ?? null
}

function etiquetasGuardadas(db: Db, demandaId: Id, quadroId: Id): Etiqueta[] {
  return todos<Linha>(db, `
    SELECT e.* FROM demanda_etiqueta de JOIN etiqueta e ON e.id = de.etiqueta_id
     WHERE de.demanda_id = ? AND de.quadro_id = ? ORDER BY e.pos`, demandaId, quadroId).map(mapear.etiqueta)
}

/**
 * Move a demanda (API.md §5.1). Mesma coluna: só reordena. Outra coluna: status_desde cresce, a coluna de pessoa
 * reatribui, entrar numa `concluida` conclui (com repetição, sem a automação) e sair dela reabre. Outro quadro:
 * etiquetas por nome (as sem par ficam guardadas ou são criadas) e membros (manter, responsável do destino ou
 * `membroIds`). Avisa `limite_wip`; notifica `membro` e `chegou`.
 */
export function mover(db: Db, p: MoverParametros): MoverSaida {
  const antes = demandaViva(db, p.demandaId)
  if (p.rev !== undefined && p.rev !== antes.rev) throw conflitoRev(db, antes)
  if (antes.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de mover.')
  const destinoLinha = um<Linha>(db, `SELECT c.*, q.arquivado_em AS quadro_arquivado FROM coluna c JOIN quadro q ON q.id = c.quadro_id
    WHERE c.id = ?`, p.colunaId)
  if (!destinoLinha) throw validacao('Coluna de destino inexistente.', { colunaId: 'coluna inexistente' })
  if (destinoLinha.arquivada_em || destinoLinha.quadro_arquivado) throw estadoInvalido('A coluna ou o quadro de destino está arquivado.')
  const destino = mapear.coluna(destinoLinha)
  const origem = carregarColuna(db, antes.colunaId)
  const escopo = { tabela: 'demanda', coluna: 'posicao' as const, escopo: { coluna: 'coluna_id', valor: destino.id } }
  const vazio: MoverSaida = { demanda: antes, etiquetasDeixadas: [], etiquetasCriadas: [], proxima: null, avisos: [] }

  // 3. mesma coluna: só reordena
  if (destino.id === antes.colunaId) {
    if (!p.posicao) return vazio
    atualizarLinhaDemanda(db, antes.id, { posicao: posicaoEntre(db, escopo, p.posicao, antes.id) }, p.ator)
    emitirMudancasDemanda(db, antes, p.ator)
    return { ...vazio, demanda: carregarDemanda(db, antes.id) }
  }

  const estavaNoBootstrap = estaNoBootstrap(db, antes)
  const mudaDeQuadro = destino.quadroId !== antes.quadroId
  const via = p.via ?? 'manual'
  const eu = p.ator.usuario?.id ?? null
  const entraConcluida = destino.papel === 'concluida' && !antes.concluidaEm
  const saiConcluida = origem.papel === 'concluida' && destino.papel !== 'concluida' && !!antes.concluidaEm

  // 4. lugar, status_desde e (des)conclusão na mesma UPDATE (os gatilhos exigem)
  const campos: Record<string, unknown> = {
    coluna_id: destino.id, quadro_id: destino.quadroId, posicao: posicaoEntre(db, escopo, p.posicao, antes.id),
    status_desde: depoisDe(antes.statusDesde),
  }
  if (entraConcluida) Object.assign(campos, { concluida_em: agora(), concluida_por: eu })
  if (saiConcluida) Object.assign(campos, { concluida_em: null, concluida_por: null })
  atualizarLinhaDemanda(db, antes.id, campos, p.ator)

  // 5. etiquetas (§5.6): as guardadas no destino + as atuais que casam por nome; as sem par ficam ou são criadas
  let etiquetasDeixadas: string[] = []
  const etiquetasCriadas: Id[] = []
  if (p.etiquetaIds) {
    const doDestino = new Set(etiquetasDoQuadro(db, destino.quadroId).map((e) => e.id))
    if (p.etiquetaIds.some((id) => !doDestino.has(id))) throw validacao('Etiqueta de outro quadro.', { etiquetaIds: 'etiqueta de outro quadro' })
    const lista = [...new Set(p.etiquetaIds)]
    rodar(db, `DELETE FROM demanda_etiqueta WHERE demanda_id = ? AND quadro_id = ?
                ${lista.length ? `AND etiqueta_id NOT IN (${marcadores(lista.length)})` : ''}`, antes.id, destino.quadroId, ...lista)
    for (const id of lista) {
      rodar(db, 'INSERT OR IGNORE INTO demanda_etiqueta (demanda_id, etiqueta_id, quadro_id) VALUES (?, ?, ?)', antes.id, id, destino.quadroId)
    }
  } else if (mudaDeQuadro) {
    const atuais = etiquetasGuardadas(db, antes.id, antes.quadroId)
    const doDestino = etiquetasDoQuadro(db, destino.quadroId)
    const guardadas = etiquetasGuardadas(db, antes.id, destino.quadroId).map((e) => e.id)
    const { ids, semPar } = mapearEtiquetas(atuais, doDestino, guardadas)
    const finais = [...ids]
    const tambemDe = p.etiquetasTambemDe
    if (tambemDe && tambemDe !== antes.quadroId && tambemDe !== destino.quadroId) {
      for (const id of mapearEtiquetas(etiquetasGuardadas(db, antes.id, tambemDe), doDestino, []).ids) {
        if (!finais.includes(id)) finais.push(id)
      }
    }
    if ((p.etiquetasSemPar ?? 'deixar') === 'criar') {
      for (const et of semPar) {
        const id = novoId()
        const pos = posicaoEntre(db, { tabela: 'etiqueta', coluna: 'pos', escopo: { coluna: 'quadro_id', valor: destino.quadroId } }, undefined)
        rodar(db, 'INSERT INTO etiqueta (id, quadro_id, nome, cor, pos, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
          id, destino.quadroId, et.nome, et.cor, pos, agora())
        etiquetasCriadas.push(id)
        finais.push(id)
      }
    } else {
      etiquetasDeixadas = semPar.map((e) => e.nome || e.cor)
    }
    for (const id of finais) {
      rodar(db, 'INSERT OR IGNORE INTO demanda_etiqueta (demanda_id, etiqueta_id, quadro_id) VALUES (?, ?, ?)', antes.id, id, destino.quadroId)
    }
  }

  // 5 e 6. membros: `membroIds` (Desfazer) substitui; senão responsável do destino e coluna de pessoa
  let entraram: Id[]
  let sairam: Id[]
  if (p.membroIds) {
    const lista = [...new Set(p.membroIds)]
    exigirAtivos(db, lista, 'membroIds')
    entraram = lista.filter((id) => !antes.membroIds.includes(id))
    sairam = antes.membroIds.filter((id) => !lista.includes(id))
  } else {
    const membros = p.membros ?? 'manter'
    const r = membrosAoMover(antes.membroIds, {
      de: origem, para: destino, mudaDeQuadro, membros,
      responsavelDestino: mudaDeQuadro && membros === 'responsavel_destino' ? responsavelDoCliente(db, antes.clienteId, destino.quadroId) : null,
      ativos: idsAtivos(db),
    })
    entraram = r.entraram
    sairam = r.sairam
  }
  for (const id of sairam) rodar(db, 'DELETE FROM demanda_membro WHERE demanda_id = ? AND usuario_id = ?', antes.id, id)
  for (const id of entraram) {
    rodar(db, 'INSERT OR IGNORE INTO demanda_membro (demanda_id, usuario_id, adicionado_por, adicionado_em) VALUES (?, ?, ?, ?)',
      antes.id, id, eu, agora())
  }

  // 7. concluir ao entrar numa `concluida` (com repetição; sem a automação) e reabrir ao sair
  let proxima = null
  if (entraConcluida) {
    pararCronometros(db, { demandaId: antes.id }, p.ator)
    proxima = antes.repetir !== 'nenhuma' ? criarRepeticao(db, carregarDemanda(db, antes.id), p.ator) : null
  }

  const de = { quadroId: antes.quadroId, colunaId: antes.colunaId }
  const para = { quadroId: destino.quadroId, colunaId: destino.id }
  const atividadeId = registrarAtividade(db, { tipo: 'demanda.movida', ator: p.ator, demandaId: antes.id, dados: {
    de, para, via, ...(p.gatilho ? { gatilho: p.gatilho } : {}),
    ...(etiquetasDeixadas.length ? { etiquetasDeixadas } : {}),
    ...(entraram.length ? { membrosEntraram: entraram } : {}), ...(sairam.length ? { membrosSairam: sairam } : {}),
  } })
  if (entraConcluida) {
    registrarAtividade(db, { tipo: 'demanda.concluida', ator: p.ator, demandaId: antes.id,
      dados: { via: 'coluna', ...(proxima ? { proximaId: proxima.id, proximaNumero: proxima.numero } : {}) } })
  }
  if (saiConcluida) registrarAtividade(db, { tipo: 'demanda.reaberta', ator: p.ator, demandaId: antes.id, dados: { colunaId: destino.id } })

  // eventos: etiquetas criadas antes da demanda que as usa; a demanda inteira se entrou no conjunto do bootstrap
  for (const id of etiquetasCriadas) emitirObjeto(db, 'etiqueta', id, carregarEtiqueta(db, id), p.ator)
  const depois = carregarDemanda(db, antes.id)
  emitirMudancasDemanda(db, antes, p.ator, { inteira: !estavaNoBootstrap && estaNoBootstrap(db, depois) })

  // 10. notificações: `membro` a quem entrou; `chegou` ao mudar de quadro
  const quem = nomeDoAtor(p.ator)
  const notificados = notificar(db, { para: entraram, tipo: 'membro', demandaId: antes.id, atividadeId, ator: p.ator,
    resumo: `${quem ?? 'Uma automação'} pôs você em ${rotuloDemanda(db, antes.id)}` })
  if (mudaDeQuadro) {
    notificarChegou(db, { demandaId: antes.id, quadroId: destino.quadroId, ator: p.ator, via, colunaPapel: destino.papel, exceto: notificados })
  }

  // 8. limite WIP (só aviso)
  const avisos: MoverSaida['avisos'] = passouWip(destino, cardsDaColuna(db, destino.id).length) ? ['limite_wip'] : []
  return { demanda: depois, etiquetasDeixadas, etiquetasCriadas, proxima, avisos }
}
