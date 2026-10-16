/** "Copiar…" (F1, API.md §4.15): o que vai junto, etiquetas por nome, checklists desmarcados sem o de rodada. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChecklistComItens, Demanda } from '../../shared/tipos/index.ts'
import { um } from '../src/db.ts'
import { ambiente, eventos, notificacoesDe, ultimoSeq } from './ajuda.ts'
import { abrirAjustes, enviar } from './modal-ajuda.ts'

const etiqueta = (a: Awaited<ReturnType<typeof ambiente>>, quadro: 'criacao' | 'social', nome: string) =>
  a.quadros[quadro].etiquetas.find((e) => e.nome === nome)!.id

describe('POST /api/demandas/:id/copiar', () => {
  test('para outro quadro: etiquetas por nome, checklists desmarcados sem o de rodada, anexos e datas', async () => {
    const a = await ambiente()
    const { design, design2 } = a.pessoas
    const original = await a.criarDemanda({
      titulo: 'Carrossel do mês', descricaoMd: 'Briefing **completo**', prioridade: 'alta', estimativaMin: 120,
      etiquetaIds: [etiqueta(a, 'criacao', 'Urgente'), etiqueta(a, 'criacao', 'Alteração')], membroIds: [design2.id],
      prazo: '2026-10-20', prazoHora: '15:00', inicio: '2026-10-15', repetir: 'semanal', rodadasInclusas: 3, como: a.pessoas.am,
    })
    const c: ChecklistComItens = (await a.como(design).post(`/api/demandas/${original.id}/checklists`, { titulo: 'Entrega', itens: ['Arte', 'Legenda'] })).corpo
    await a.como(design).patch(`/api/checklist-itens/${c.itens[0]!.id}`, { feito: true })
    abrirAjustes(a, original.id)
    await a.como(design).post(`/api/demandas/${original.id}/anexos`, { tipo: 'caminho', caminho: 'M:\\HE\\Carrossel' })
    const arquivoId = enviar(a, a.ator(design))
    await a.como(design).post(`/api/demandas/${original.id}/anexos`, { tipo: 'arquivo', arquivoId })
    await a.como(design).post(`/api/demandas/${original.id}/comentarios`, { corpoMd: 'Não vai junto' })

    const fila = a.coluna('social', 'Fila')
    const seq = ultimoSeq(a.db)
    // a equipe copia: os campos do atendimento vão com os valores da original, sem 403
    const r = await a.como(design).post(`/api/demandas/${original.id}/copiar`, {
      colunaId: fila.id, titulo: 'Carrossel do mês (cópia)',
      manter: { etiquetas: true, checklists: true, membros: true, anexos: true, datas: true },
    })
    assert.equal(r.status, 201)
    const copia: Demanda = r.corpo.demanda
    assert.notEqual(copia.numero, original.numero)
    assert.equal(copia.quadroId, a.quadros.social.quadro.id)
    assert.equal(copia.colunaId, fila.id)
    assert.equal(copia.titulo, 'Carrossel do mês (cópia)')
    assert.equal(copia.origem, 'copia')
    assert.equal(copia.origemDemandaId, original.id)
    assert.equal(copia.prioridade, 'alta')
    assert.equal(copia.estimativaMin, 120)
    assert.equal(copia.rodadasInclusas, 3)
    assert.equal(copia.atendimentoId, a.pessoas.am.id)
    assert.equal(copia.clienteId, a.clientes.he.id)
    assert.equal(copia.rodadaAtual, 1)
    assert.equal(copia.nVersoes, 0)
    assert.equal(copia.nComentarios, 0)
    // "Alteração" casa por nome no Social; "Urgente" não existe lá e fica de fora
    assert.deepEqual(copia.etiquetaIds, [etiqueta(a, 'social', 'Alteração')])
    assert.deepEqual(copia.membroIds, [design2.id])
    // a rodada 2 trouxe um prazo novo (hoje + 1 dia útil, sem hora): a cópia leva as datas como estão agora
    const agora = um<{ prazo: string; prazo_hora: string | null; inicio: string }>(a.db, 'SELECT prazo, prazo_hora, inicio FROM demanda WHERE id = ?', original.id)!
    assert.equal(copia.prazo, agora.prazo)
    assert.equal(copia.prazoHora, agora.prazo_hora)
    assert.equal(copia.inicio, agora.inicio)
    assert.equal(copia.repetir, 'semanal')
    assert.equal(copia.nCheckTotal, 2)
    assert.equal(copia.nCheckFeitos, 0)
    assert.equal(copia.nAnexos, 2)

    const det = (await a.como(design).get(`/api/demandas/${copia.numero}`)).corpo
    assert.equal(det.descricaoMd, 'Briefing **completo**')
    assert.deepEqual(det.checklists.map((x: ChecklistComItens) => x.titulo), ['Entrega'])
    assert.ok(det.checklists[0].itens.every((i: { feitoEm: string | null }) => i.feitoEm === null))
    assert.equal(det.rodadas.length, 1)
    assert.equal(det.anexos.find((x: { tipo: string }) => x.tipo === 'arquivo').arquivo.id, arquivoId)
    assert.equal((await a.como(design).get(`/api/demandas/${copia.id}/comentarios`)).corpo.length, 0)

    // atividade nas duas e o evento da cópia inteira
    const atividades = (id: string) => um<{ n: number }>(a.db, `SELECT count(*) AS n FROM atividade WHERE tipo = 'demanda.copiada' AND demanda_id = ?`, id)!.n
    assert.equal(atividades(original.id), 1)
    assert.equal(atividades(copia.id), 1)
    assert.ok(eventos(a.db, seq).some((e) => e.entidade === 'demanda' && e.entidade_id === copia.id && e.campos === null))
    // quem entrou como membro é avisado
    assert.ok(notificacoesDe(a.db, design2.id).some((n) => n.tipo === 'membro' && n.demanda_id === copia.id))
  })

  test('sem `manter`: sem datas (e sem repetir), etiquetas, membros, checklists nem anexos; mesmo quadro', async () => {
    const a = await ambiente()
    const original = await a.criarDemanda({ prazo: '2026-10-20', repetir: 'mensal', etiquetaIds: [etiqueta(a, 'criacao', 'Urgente')],
      membroIds: [a.pessoas.design.id] })
    await a.como(a.pessoas.am).post(`/api/demandas/${original.id}/checklists`, { titulo: 'A', itens: ['1'] })
    const pronto = a.coluna('criacao', 'Pronto')
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${original.id}/copiar`, { colunaId: pronto.id, posicao: { depoisDeId: null } })
    assert.equal(r.status, 201)
    const copia: Demanda = r.corpo.demanda
    assert.equal(copia.titulo, original.titulo)
    assert.equal(copia.prazo, null)
    assert.equal(copia.repetir, 'nenhuma')
    assert.deepEqual(copia.etiquetaIds, [])
    assert.deepEqual(copia.membroIds, [])
    assert.equal(copia.nCheckTotal, 0)
    // com as etiquetas, no mesmo quadro vão as mesmas
    const r2 = await a.como(a.pessoas.am).post(`/api/demandas/${original.id}/copiar`, { colunaId: pronto.id, manter: { etiquetas: true } })
    assert.deepEqual(r2.corpo.demanda.etiquetaIds, [etiqueta(a, 'criacao', 'Urgente')])
  })

  test('coluna inexistente → 400; quadro arquivado → 422', async () => {
    const a = await ambiente()
    const original = await a.criarDemanda()
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${original.id}/copiar`, { colunaId: 'nao-existe' })).status, 400)
    const fila = a.coluna('social', 'Fila')
    await a.como(a.pessoas.admin).post(`/api/quadros/${a.quadros.social.quadro.id}/arquivar`)
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${original.id}/copiar`, { colunaId: fila.id })).status, 422)
  })
})
