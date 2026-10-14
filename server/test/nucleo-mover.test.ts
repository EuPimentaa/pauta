/** mover() (API.md §5.1, §5.3 e §5.6). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tx, todos, um } from '../src/db.ts'
import { mover } from '../src/servicos/mover.ts'
import { executarAutomacao } from '../src/servicos/automacoes.ts'
import { ambiente, eventos, notificacoesDe, ultimoSeq } from './ajuda.ts'

const etiquetasDe = (db: Parameters<typeof um>[0], demandaId: string) =>
  todos<{ nome: string; quadro_id: string }>(db, `SELECT e.nome, de.quadro_id FROM demanda_etiqueta de JOIN etiqueta e ON e.id = de.etiqueta_id
    WHERE de.demanda_id = ? ORDER BY e.nome`, demandaId).map((l) => ({ ...l }))

describe('mover', () => {
  test('mesma coluna só reordena (sem demanda.movida); posição relativa', async () => {
    const a = await ambiente()
    const d1 = await a.criarDemanda()
    const d2 = await a.criarDemanda()
    const d3 = await a.criarDemanda()
    const seq = ultimoSeq(a.db)
    const fila = a.coluna('criacao', 'Fila').id
    const r = await a.como(a.pessoas.design).post(`/api/demandas/${d3.id}/mover`, { colunaId: fila, posicao: { depoisDeId: d1.id } })
    assert.equal(r.status, 200)
    assert.ok(r.corpo.demanda.posicao > d1.posicao && r.corpo.demanda.posicao < d2.posicao)
    assert.equal(r.corpo.demanda.statusDesde, d3.statusDesde)
    assert.equal(um(a.db, "SELECT 1 FROM atividade WHERE tipo = 'demanda.movida' AND demanda_id = ?", d3.id), undefined)
    const ev = eventos(a.db, seq)
    assert.equal(ev.length, 1)
    assert.ok(ev[0]!.campos!.includes('posicao'))
    assert.ok(!ev[0]!.campos!.includes('colunaId'))
    const topo = await a.como(a.pessoas.design).post(`/api/demandas/${d2.id}/mover`, { colunaId: fila, posicao: { depoisDeId: null } })
    assert.ok(topo.corpo.demanda.posicao < d1.posicao)
    const antes = await a.como(a.pessoas.design).post(`/api/demandas/${d1.id}/mover`, { colunaId: fila, posicao: { antesDeId: d2.id } })
    assert.ok(antes.corpo.demanda.posicao < topo.corpo.demanda.posicao)
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${d1.id}/mover`, { colunaId: fila, posicao: { depoisDeId: 'nada' } })).status, 400)
  })

  test('criar e mover no mesmo instante: statusDesde cresce 1 ms e o histórico registra', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const r = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Pronto').id })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.demanda.statusDesde, '2026-10-14T13:00:00.001Z')
    const r2 = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Fila').id })
    assert.equal(r2.corpo.demanda.statusDesde, '2026-10-14T13:00:00.002Z')
    const movs = todos<{ saiu_em: string | null; por: string }>(a.db, 'SELECT saiu_em, por FROM demanda_movimento WHERE demanda_id = ? ORDER BY id', d.id)
    assert.equal(movs.length, 3)
    assert.equal(movs[0]!.saiu_em, '2026-10-14T13:00:00.001Z')
    assert.equal(movs[2]!.por, a.pessoas.design.id)
    const atv = JSON.parse(um<{ dados: string }>(a.db, "SELECT dados FROM atividade WHERE tipo = 'demanda.movida' AND demanda_id = ? ORDER BY id LIMIT 1", d.id)!.dados)
    assert.deepEqual(atv, { de: { quadroId: d.quadroId, colunaId: d.colunaId }, para: { quadroId: d.quadroId, colunaId: a.coluna('criacao', 'Pronto').id }, via: 'manual' })
  })

  test('outro quadro: "Alteração" casa por nome, "Urgente" fica guardada e volta com a demanda', async () => {
    const a = await ambiente()
    const [urgente, alteracao] = a.quadros.criacao.etiquetas
    const d = await a.criarDemanda({ etiquetaIds: [urgente!.id, alteracao!.id] })
    const eu = a.como(a.pessoas.am)
    const r = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Fila').id })
    assert.equal(r.status, 200)
    assert.deepEqual(r.corpo.etiquetasDeixadas, ['Urgente'])
    assert.deepEqual(r.corpo.etiquetasCriadas, [])
    const alteracaoSocial = a.quadros.social.etiquetas[0]!
    assert.deepEqual(r.corpo.demanda.etiquetaIds, [alteracaoSocial.id])
    assert.equal(r.corpo.demanda.quadroId, a.quadros.social.quadro.id)
    assert.equal(r.corpo.demanda.numero, d.numero)
    const volta = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Fila').id })
    assert.deepEqual(volta.corpo.demanda.etiquetaIds, [urgente!.id, alteracao!.id])
    assert.deepEqual(volta.corpo.etiquetasDeixadas, [])
    // nada se perde: as linhas de origem continuam
    assert.equal(etiquetasDe(a.db, d.id).length, 3)
  })

  test('etiquetasSemPar "criar" cria no destino; etiquetaIds do quadro errado → 400; etiquetaIds substitui (Desfazer)', async () => {
    const a = await ambiente()
    const [urgente] = a.quadros.criacao.etiquetas
    const d = await a.criarDemanda({ etiquetaIds: [urgente!.id] })
    const eu = a.como(a.pessoas.am)
    const ruim = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Fila').id, etiquetaIds: [urgente!.id] })
    assert.equal(ruim.status, 400)
    const seq = ultimoSeq(a.db)
    const r = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Fila').id, etiquetasSemPar: 'criar' })
    assert.equal(r.corpo.etiquetasCriadas.length, 1)
    const criada = um<{ nome: string; cor: string; quadro_id: string }>(a.db, 'SELECT nome, cor, quadro_id FROM etiqueta WHERE id = ?', r.corpo.etiquetasCriadas[0])!
    assert.deepEqual({ ...criada }, { nome: 'Urgente', cor: 'rosa', quadro_id: a.quadros.social.quadro.id })
    const evs = eventos(a.db, seq)
    assert.ok(evs.findIndex((e) => e.entidade === 'etiqueta') < evs.findIndex((e) => e.entidade === 'demanda'))
    const desfazer = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Agendar').id, etiquetaIds: [] })
    assert.deepEqual(desfazer.corpo.demanda.etiquetaIds, [])
  })

  test('coluna de pessoa: Design → Design2 troca e notifica; Fila → Design só acrescenta; sair para comum não tira', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ membroIds: [a.pessoas.am2.id] })
    const eu = a.como(a.pessoas.am)
    let r = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Design').id })
    assert.deepEqual(r.corpo.demanda.membroIds, [a.pessoas.am2.id, a.pessoas.design.id])
    r = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Design2').id })
    assert.deepEqual(r.corpo.demanda.membroIds, [a.pessoas.am2.id, a.pessoas.design2.id])
    assert.equal(notificacoesDe(a.db, a.pessoas.design2.id).filter((n) => n.tipo === 'membro').length, 1)
    const atv = JSON.parse(um<{ dados: string }>(a.db, "SELECT dados FROM atividade WHERE tipo = 'demanda.movida' AND demanda_id = ? ORDER BY id DESC LIMIT 1", d.id)!.dados)
    assert.deepEqual(atv.membrosEntraram, [a.pessoas.design2.id])
    assert.deepEqual(atv.membrosSairam, [a.pessoas.design.id])
    r = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Pronto').id })
    assert.deepEqual(r.corpo.demanda.membroIds, [a.pessoas.am2.id, a.pessoas.design2.id])
    // quem moveu para a própria coluna não se notifica
    const n = notificacoesDe(a.db, a.pessoas.design.id).filter((x) => x.tipo === 'membro').length
    await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Design').id })
    assert.equal(notificacoesDe(a.db, a.pessoas.design.id).filter((x) => x.tipo === 'membro').length, n)
    // Desfazer com membroIds
    const des = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Pronto').id, membroIds: [a.pessoas.am2.id] })
    assert.deepEqual(des.corpo.demanda.membroIds, [a.pessoas.am2.id])
  })

  test('membros "responsavel_destino" para o Social troca pelo social; cliente sem responsável mantém', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const d = await a.criarDemanda({ membroIds: [a.pessoas.design.id] })
    const r = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Fila').id, membros: 'responsavel_destino' })
    assert.deepEqual(r.corpo.demanda.membroIds, [a.pessoas.social.id])
    const icc = await a.criarDemanda({ clienteId: a.clientes.icc.id, membroIds: [a.pessoas.design.id] })
    const s = await eu.post(`/api/demandas/${icc.id}/mover`, { colunaId: a.coluna('social', 'Fila').id, membros: 'responsavel_destino' })
    assert.deepEqual(s.corpo.demanda.membroIds, [a.pessoas.design.id])
    const semCliente = await a.criarDemanda({ clienteId: null, membroIds: [a.pessoas.design.id] })
    const t = await eu.post(`/api/demandas/${semCliente.id}/mover`, { colunaId: a.coluna('social', 'Fila').id, membros: 'responsavel_destino' })
    assert.deepEqual(t.corpo.demanda.membroIds, [a.pessoas.design.id])
  })

  test('destino arquivado → 422; coluna inexistente → 400; rev diferente → 409; mover não sobe o rev', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const eu = a.como(a.pessoas.am)
    const pronto = a.coluna('criacao', 'Pronto')
    await eu.post(`/api/colunas/${pronto.id}/arquivar`)
    assert.equal((await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: pronto.id })).status, 422)
    assert.equal((await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: 'nada' })).status, 400)
    const c = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Fila').id, rev: d.rev + 5 })
    assert.equal(c.status, 409)
    assert.equal(c.corpo.erro.codigo, 'conflito_rev')
    const ok = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Fila').id, rev: d.rev })
    assert.equal(ok.corpo.demanda.rev, d.rev)
    await a.como(a.pessoas.admin).post(`/api/quadros/${a.quadros.atendimento.quadro.id}/arquivar`)
    assert.equal((await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('atendimento', 'Fazendo').id })).status, 422)
  })

  test('entrar numa concluida conclui e cria a repetição uma vez só (concluir, reabrir, concluir); sair reabre', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ prazo: '2026-10-16', repetir: 'semanal' })
    const eu = a.como(a.pessoas.design)
    const concluido = a.coluna('criacao', 'Concluído').id
    const r = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: concluido })
    assert.ok(r.corpo.demanda.concluidaEm)
    assert.equal(r.corpo.demanda.concluidaPor, a.pessoas.design.id)
    assert.equal(r.corpo.proxima.prazo, '2026-10-23')
    assert.equal(r.corpo.proxima.colunaId, a.coluna('criacao', 'Fila').id)
    const via = JSON.parse(um<{ dados: string }>(a.db, "SELECT dados FROM atividade WHERE tipo = 'demanda.concluida' AND demanda_id = ?", d.id)!.dados)
    assert.equal(via.via, 'coluna')
    assert.equal(via.proximaId, r.corpo.proxima.id)
    const fora = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Pronto').id })
    assert.equal(fora.corpo.demanda.concluidaEm, null)
    assert.ok(um(a.db, "SELECT 1 FROM atividade WHERE tipo = 'demanda.reaberta' AND demanda_id = ?", d.id))
    const de = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: concluido })
    assert.equal(de.corpo.proxima, null)
    assert.equal(um<{ n: number }>(a.db, "SELECT count(*) AS n FROM demanda WHERE origem = 'repeticao'")!.n, 1)
  })

  test('passar do WIP avisa limite_wip (sem bloquear)', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const pronto = a.coluna('criacao', 'Pronto')
    await eu.patch(`/api/colunas/${pronto.id}`, { limiteWip: 1 })
    const d1 = await a.criarDemanda()
    const d2 = await a.criarDemanda()
    assert.deepEqual((await eu.post(`/api/demandas/${d1.id}/mover`, { colunaId: pronto.id })).corpo.avisos, [])
    const r = await eu.post(`/api/demandas/${d2.id}/mover`, { colunaId: pronto.id })
    assert.equal(r.status, 200)
    assert.deepEqual(r.corpo.avisos, ['limite_wip'])
  })

  test('chegou: aos seguidores só sem membro da equipe do destino; nunca por automação em aguardando_cliente', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const comDesign = await a.criarDemanda({ membroIds: [a.pessoas.design.id] })
    await eu.post(`/api/demandas/${comDesign.id}/mover`, { colunaId: a.coluna('social', 'Fila').id })
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.social.id).map((n) => n.tipo), ['chegou'])
    const comSocial = await a.criarDemanda({ membroIds: [a.pessoas.social.id] })
    await eu.post(`/api/demandas/${comSocial.id}/mover`, { colunaId: a.coluna('social', 'Fila').id })
    assert.equal(notificacoesDe(a.db, a.pessoas.social.id).filter((n) => n.tipo === 'chegou').length, 1)
    // automação "enviado ao cliente" para Atendimento › Com o cliente não avisa os seguidores do Atendimento
    const env = await a.criarDemanda({ membroIds: [a.pessoas.design.id] })
    const moveu = tx(a.db, () => executarAutomacao(a.db, env.id, 'enviado_ao_cliente', a.ator(a.pessoas.am)))
    assert.equal(moveu, true)
    assert.equal(notificacoesDe(a.db, a.pessoas.am2.id).filter((n) => n.tipo === 'chegou').length, 0)
    // movimento manual para o Atendimento sem ninguém da equipe: avisa
    const man = await a.criarDemanda({ membroIds: [a.pessoas.design.id] })
    await eu.post(`/api/demandas/${man.id}/mover`, { colunaId: a.coluna('atendimento', 'Com o cliente').id })
    assert.equal(notificacoesDe(a.db, a.pessoas.am2.id).filter((n) => n.tipo === 'chegou').length, 1)
  })

  test('ator cliente (decisão pelo link): histórico com por nulo e atualizado_por nulo', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const cliente = { tipo: 'cliente' as const, usuario: null, papel: null, traceId: null, ip: '1.2.3.4' }
    tx(a.db, () => mover(a.db, { demandaId: d.id, ator: cliente, colunaId: a.coluna('criacao', 'Pronto').id, via: 'automacao', gatilho: 'aprovado' }))
    const m = um<{ por: string | null }>(a.db, 'SELECT por FROM demanda_movimento WHERE demanda_id = ? AND saiu_em IS NULL', d.id)!
    assert.equal(m.por, null)
    assert.equal(um<{ p: string | null }>(a.db, 'SELECT atualizado_por AS p FROM demanda WHERE id = ?', d.id)!.p, null)
    const atv = um<{ ator_tipo: string; ator_id: string | null }>(a.db, "SELECT ator_tipo, ator_id FROM atividade WHERE tipo = 'demanda.movida' AND demanda_id = ?", d.id)!
    assert.deepEqual({ ...atv }, { ator_tipo: 'cliente', ator_id: null })
  })

  test('demanda concluída antiga que volta ao quadro é emitida inteira', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Concluído').id })
    a.db.prepare("UPDATE demanda SET concluida_em = '2026-10-01T10:00:00.000Z' WHERE id = ?").run(d.id)
    const seq = ultimoSeq(a.db)
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Fila').id })
    const ev = eventos(a.db, seq).find((e) => e.entidade === 'demanda')!
    assert.equal(ev.campos, null)
    assert.equal(ev.patch!.concluidaEm, null)
  })
})
