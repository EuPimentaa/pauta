/** concluir() e repetição (API.md §5.3), automações (§5.5) e rodadas (§5.7). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rodar, todos, tx, um } from '../src/db.ts'
import { executarAutomacao, quadroDoEnvio } from '../src/servicos/automacoes.ts'
import { abrirRodada } from '../src/servicos/demandas.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'

describe('concluir', () => {
  test('checkbox roda a automação "concluida" do quadro; soltar na coluna não roda', async () => {
    const a = await ambiente()
    rodar(a.db, `INSERT INTO automacao_quadro (quadro_id, gatilho, destino_quadro_id, destino_coluna_id, atualizado_em)
                 VALUES (?, 'concluida', ?, ?, '2026-10-14T13:00:00.000Z')`,
    a.quadros.criacao.quadro.id, a.quadros.criacao.quadro.id, a.coluna('criacao', 'Concluído').id)
    const eu = a.como(a.pessoas.design)
    const d = await a.criarDemanda()
    const r = await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: true })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.automacao, true)
    assert.equal(r.corpo.demanda.colunaId, a.coluna('criacao', 'Concluído').id)
    assert.ok(r.corpo.demanda.concluidaEm)
    const atv = JSON.parse(um<{ dados: string }>(a.db, "SELECT dados FROM atividade WHERE tipo = 'demanda.movida' AND demanda_id = ?", d.id)!.dados)
    assert.equal(atv.via, 'automacao')
    assert.equal(atv.gatilho, 'concluida')
    // soltar numa outra coluna concluida (do Social): a automação da Criação não roda
    const s = await a.criarDemanda()
    const m = await eu.post(`/api/demandas/${s.id}/mover`, { colunaId: a.coluna('social', 'Publicado').id })
    assert.equal(m.corpo.demanda.colunaId, a.coluna('social', 'Publicado').id)
    // já concluída: sem efeito
    const de = await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: true })
    assert.equal(de.corpo.automacao, false)
  })

  test('desmarcar numa coluna concluida volta para a coluna anterior; numa coluna comum só desmarca', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Pronto').id })
    await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Concluído').id })
    const r = await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: false })
    assert.equal(r.corpo.demanda.colunaId, a.coluna('criacao', 'Pronto').id)
    assert.equal(r.corpo.demanda.concluidaEm, null)
    const atv = JSON.parse(um<{ dados: string }>(a.db, "SELECT dados FROM atividade WHERE tipo = 'demanda.movida' AND demanda_id = ? ORDER BY id DESC LIMIT 1", d.id)!.dados)
    assert.equal(atv.via, 'reabrir')
    // coluna de antes arquivada: volta para a de entrada
    await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Concluído').id })
    const pronto = a.coluna('criacao', 'Pronto')
    await eu.post(`/api/colunas/${pronto.id}/arquivar`)
    const v = await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: false })
    assert.equal(v.corpo.demanda.colunaId, a.coluna('criacao', 'Fila').id)
    // numa comum
    const c = await a.criarDemanda()
    await eu.post(`/api/demandas/${c.id}/concluir`, { concluida: true })
    const x = await eu.post(`/api/demandas/${c.id}/concluir`, { concluida: false })
    assert.equal(x.corpo.demanda.colunaId, a.coluna('criacao', 'Fila').id)
    assert.equal(x.corpo.demanda.concluidaEm, null)
    assert.equal((await eu.post(`/api/demandas/${c.id}/concluir`, {})).status, 400)
  })

  test('repetição: semanal, mensal (31 → último dia) e diária com feriado; leva título, checklists desmarcados e datas', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const sem = await a.criarDemanda({ prazo: '2026-10-05', inicio: '2026-10-01', repetir: 'semanal', membroIds: [a.pessoas.design.id],
      modeloId: 'md-post', etiquetaIds: [a.quadros.criacao.etiquetas[0]!.id] })
    await eu.patch(`/api/checklist-itens/x`, {}) // rota do F1 ainda não existe: 404 não atrapalha
    rodar(a.db, "UPDATE checklist_item SET feito_em = '2026-10-14T13:00:00.000Z', feito_por = ? WHERE demanda_id = ?", a.pessoas.design.id, sem.id)
    const r = await eu.post(`/api/demandas/${sem.id}/concluir`, { concluida: true })
    const p = r.corpo.proxima
    assert.equal(p.prazo, '2026-10-13')
    assert.equal(p.inicio, '2026-10-09')
    assert.equal(p.titulo, sem.titulo)
    assert.equal(p.repetir, 'semanal')
    assert.equal(p.origem, 'repeticao')
    assert.equal(p.origemDemandaId, sem.id)
    assert.equal(p.modeloId, 'md-post')
    assert.deepEqual(p.membroIds, [a.pessoas.design.id])
    assert.deepEqual(p.etiquetaIds, [a.quadros.criacao.etiquetas[0]!.id])
    assert.equal(p.nCheckTotal, 4)
    assert.equal(p.nCheckFeitos, 0)
    assert.equal(p.posicao < sem.posicao, true)
    assert.ok(um(a.db, "SELECT 1 FROM atividade WHERE tipo = 'demanda.repetida' AND demanda_id = ?", p.id))
    const mes = await a.criarDemanda({ prazo: '2026-03-31', repetir: 'mensal' })
    assert.equal((await eu.post(`/api/demandas/${mes.id}/concluir`, { concluida: true })).corpo.proxima.prazo, '2026-04-30')
    const dia = await a.criarDemanda({ prazo: '2026-10-09', prazoHora: '10:00', repetir: 'diaria' })
    const pd = (await eu.post(`/api/demandas/${dia.id}/concluir`, { concluida: true })).corpo.proxima
    assert.equal(pd.prazo, '2026-10-13')
    assert.equal(pd.prazoHora, '10:00')
  })

  test('criada na Criação e concluída no Social: a próxima nasce na Fila da Criação com o responsável do cliente', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ prazo: '2026-10-16', repetir: 'semanal', membroIds: [a.pessoas.design2.id] })
    const eu = a.como(a.pessoas.social)
    await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Agendar').id, membros: 'responsavel_destino' })
    const r = await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Publicado').id })
    const p = r.corpo.proxima
    assert.equal(p.quadroId, a.quadros.criacao.quadro.id)
    assert.equal(p.colunaId, a.coluna('criacao', 'Fila').id)
    assert.deepEqual(p.membroIds, [a.pessoas.design.id])
    assert.equal(p.criadoPor, a.pessoas.social.id)
  })

  test('concluir → Desfazer (arquiva a próxima) → concluir de novo restaura a mesma próxima', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const d = await a.criarDemanda({ prazo: '2026-10-16', repetir: 'semanal' })
    const p1 = (await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: true })).corpo.proxima
    await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: false })
    await eu.post(`/api/demandas/${p1.id}/arquivar`)
    const seq = ultimoSeq(a.db)
    const r = await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: true })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.proxima.id, p1.id)
    assert.equal(r.corpo.proxima.arquivadoEm, null)
    assert.equal(um<{ n: number }>(a.db, "SELECT count(*) AS n FROM demanda WHERE origem = 'repeticao'")!.n, 1)
    const ev = eventos(a.db, seq).find((e) => e.entidade === 'demanda' && e.entidade_id === p1.id)!
    assert.equal(ev.campos, null)
    // concluir de novo com a próxima ativa: nada
    await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: false })
    assert.equal((await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: true })).corpo.proxima, null)
  })

  test('concluir para o cronômetro; desmarcar uma concluída antiga devolve ao quadro (objeto inteiro)', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    rodar(a.db, `INSERT INTO apontamento (id, usuario_id, demanda_id, data, iniciado_em, origem, criado_em, atualizado_em)
      VALUES ('cron', ?, ?, '2026-10-14', '2026-10-14T12:00:00.000Z', 'cronometro', '2026-10-14T12:00:00.000Z', '2026-10-14T12:00:00.000Z')`,
    a.pessoas.design.id, d.id)
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/concluir`, { concluida: true })
    assert.equal(r.corpo.demanda.minutosRegistrados, 60)
    rodar(a.db, "UPDATE demanda SET concluida_em = '2026-10-01T10:00:00.000Z' WHERE id = ?", d.id)
    assert.ok(!(await a.como(a.pessoas.am).get('/api/bootstrap')).corpo.demandas.some((x: { id: string }) => x.id === d.id))
    const seq = ultimoSeq(a.db)
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/concluir`, { concluida: false })
    assert.equal(eventos(a.db, seq).find((e) => e.entidade === 'demanda')!.campos, null)
    assert.equal((await a.como(a.pessoas.am).post('/api/demandas/nada/concluir', { concluida: true })).status, 404)
  })
})

describe('automações', () => {
  test('destino arquivado não move e não falha; já no destino: nada', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    await a.como(a.pessoas.admin).post(`/api/quadros/${a.quadros.atendimento.quadro.id}/arquivar`)
    assert.equal(tx(a.db, () => executarAutomacao(a.db, d.id, 'enviado_ao_cliente', a.ator(a.pessoas.am))), false)
    assert.equal(tx(a.db, () => executarAutomacao(a.db, d.id, 'ajuste_pedido', a.ator(a.pessoas.am))), false)
    assert.equal(tx(a.db, () => executarAutomacao(a.db, d.id, 'concluida', a.ator(a.pessoas.am))), false)
  })

  test('ajuste_pedido com quadroId = Criação, estando no Atendimento, leva para a Fila da Criação (topo)', async () => {
    const a = await ambiente()
    const outra = await a.criarDemanda()
    const d = await a.criarDemanda({ ate: 'enviada', membroIds: [a.pessoas.design.id] })
    tx(a.db, () => executarAutomacao(a.db, d.id, 'enviado_ao_cliente', a.ator(a.pessoas.am)))
    assert.equal(um<{ c: string }>(a.db, 'SELECT coluna_id AS c FROM demanda WHERE id = ?', d.id)!.c, a.coluna('atendimento', 'Com o cliente').id)
    const versao = um<{ id: string }>(a.db, 'SELECT id FROM versao WHERE demanda_id = ?', d.id)!.id
    const quadro = quadroDoEnvio(a.db, versao)
    assert.equal(quadro, a.quadros.criacao.quadro.id)
    // sem quadroId seria a do Atendimento (→ Fazendo)
    const moveu = tx(a.db, () => executarAutomacao(a.db, d.id, 'ajuste_pedido', a.ator(a.pessoas.am), quadro))
    assert.equal(moveu, true)
    const l = um<{ coluna_id: string; posicao: number }>(a.db, 'SELECT coluna_id, posicao FROM demanda WHERE id = ?', d.id)!
    assert.equal(l.coluna_id, a.coluna('criacao', 'Fila').id)
    assert.ok(l.posicao < outra.posicao)
    assert.throws(() => quadroDoEnvio(a.db, 'nada'), /não foi enviada/)
  })

  test('aprovado leva ao Social › Agendar com o responsável do cliente e deixa "Urgente" guardada', async () => {
    const a = await ambiente()
    const [urgente, alteracao] = a.quadros.criacao.etiquetas
    const d = await a.criarDemanda({ ate: 'aprovada', membroIds: [a.pessoas.design.id], etiquetaIds: [urgente!.id, alteracao!.id] })
    tx(a.db, () => executarAutomacao(a.db, d.id, 'aprovado', { tipo: 'cliente', usuario: null, papel: null, traceId: null, ip: '' }))
    const l = (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo.demanda
    assert.equal(l.colunaId, a.coluna('social', 'Agendar').id)
    assert.deepEqual(l.membroIds, [a.pessoas.social.id])
    assert.deepEqual(l.etiquetaIds, [a.quadros.social.etiquetas[0]!.id])
    assert.equal(todos(a.db, "SELECT 1 FROM notificacao WHERE tipo = 'chegou'").length, 0)
  })
})

describe('rodadas', () => {
  test('abrirRodada: fecha a atual, prazo em dias úteis, checklist "Ajustes R2" e sugerirExtra além das inclusas', async () => {
    const a = await ambiente()
    a.relogio('2026-10-09T13:00:00.000Z')
    const d = await a.criarDemanda({ prazo: '2026-10-09', rodadasInclusas: 1 })
    const seq = ultimoSeq(a.db)
    const r = tx(a.db, () => abrirRodada(a.db, { demandaId: d.id, origem: 'cliente', motivo: 'cliente_mudou',
      linhas: ['- trocar a foto', '', '• aumentar o logo'], ator: a.ator(a.pessoas.am) }))
    assert.equal(r.rodada.numero, 2)
    assert.equal(r.rodada.prazo, '2026-10-13')
    assert.equal(r.rodada.prazoOriginal, '2026-10-13')
    assert.equal(r.rodada.inclusa, false)
    assert.equal(r.sugerirExtra, true)
    assert.equal(r.checklist.titulo, 'Ajustes R2')
    assert.deepEqual(r.checklist.itens.map((i) => i.texto), ['trocar a foto', 'aumentar o logo'])
    assert.equal(r.checklist.rodadaId, r.rodada.id)
    const dem = um<{ rodada_atual: number; prazo: string }>(a.db, 'SELECT rodada_atual, prazo FROM demanda WHERE id = ?', d.id)!
    assert.deepEqual({ ...dem }, { rodada_atual: 2, prazo: '2026-10-13' })
    assert.ok(um(a.db, 'SELECT fechada_em FROM rodada WHERE demanda_id = ? AND numero = 1 AND fechada_em IS NOT NULL', d.id))
    const ents = eventos(a.db, seq).map((e) => e.entidade)
    for (const e of ['rodada', 'checklist', 'checklist_item', 'demanda']) assert.ok(ents.includes(e), e)
    // PATCH do prazo renegocia a rodada atual
    const atual = (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo.demanda
    await a.como(a.pessoas.am).patch(`/api/demandas/${d.id}`, { prazo: '2026-10-15' }, { ifMatch: atual.rev })
    const rod = um<{ prazo: string; prazo_original: string }>(a.db, 'SELECT prazo, prazo_original FROM rodada WHERE id = ?', r.rodada.id)!
    assert.deepEqual({ ...rod }, { prazo: '2026-10-15', prazo_original: '2026-10-13' })
  })
})
