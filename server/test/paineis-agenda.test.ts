/** GET /api/agenda (F3, API.md §4.18): intervalo, filtros, campos, concluídas e extras. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tx } from '../src/db.ts'
import { criarQuadro } from '../src/servicos/quadros.ts'
import { ambiente } from './ajuda.ts'
import { agendaDe, arquivar, arquivarQuadro, concluidaHa } from './paineis-ajuda.ts'

describe('GET /api/agenda', () => {
  test('intervalo: até 62 dias (63 → 400), fim antes do começo → 400, data inválida → 400', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    assert.equal((await eu.get('/api/agenda?de=2026-10-01&ate=2026-12-01')).status, 200)        // 62 dias
    const longo = await eu.get('/api/agenda?de=2026-10-01&ate=2026-12-02')                       // 63 dias
    assert.equal(longo.status, 400)
    assert.equal(longo.corpo.erro.codigo, 'validacao')
    assert.equal((await eu.get('/api/agenda?de=2026-10-10&ate=2026-10-09')).status, 400)
    assert.equal((await eu.get('/api/agenda?de=2026-02-30&ate=2026-03-01')).status, 400)
    assert.equal((await eu.get('/api/agenda?de=2026-10-01')).status, 400)
    assert.equal((await eu.get('/api/agenda?de=2026-10-01&ate=2026-10-31&campos=entrega')).status, 400)
  })

  test('todos os quadros ativos, em ordem de data, hora (sem hora por último) e número; feriados do intervalo', async () => {
    const a = await ambiente()
    const { design, social, admin } = a.pessoas
    const semHora = await a.criarDemanda({ titulo: 'Sem hora', prazo: '2026-10-16' })
    const as9 = await a.criarDemanda({ titulo: 'Às 9h', prazo: '2026-10-16', prazoHora: '09:00' })
    const noSocial = await a.criarDemanda({ titulo: 'No Social', prazo: '2026-10-13', quadroId: a.quadros.social.quadro.id, membroIds: [social.id] })
    const noAtendimento = await a.criarDemanda({ titulo: 'No Atendimento', prazo: '2026-10-20', quadroId: a.quadros.atendimento.quadro.id })
    await a.criarDemanda({ titulo: 'Fora do mês', prazo: '2026-11-03' })
    const arquivada = await a.criarDemanda({ titulo: 'Arquivada', prazo: '2026-10-16' })
    arquivar(a, arquivada)
    const extra = tx(a.db, () => criarQuadro(a.db, { nome: 'Extra', cor: 'azul', colunas: [{ nome: 'A fazer' }] }, a.ator(admin)))
    await a.criarDemanda({ titulo: 'Quadro arquivado', prazo: '2026-10-16', quadroId: extra.quadro.id, como: admin })
    arquivarQuadro(a.db, extra.quadro.id)

    const r = await agendaDe(a, design, 'de=2026-10-01&ate=2026-10-31')
    assert.equal(r.de, '2026-10-01')
    assert.equal(r.ate, '2026-10-31')
    assert.deepEqual(r.itens.map((i) => i.demandaId), [noSocial.id, as9.id, semHora.id, noAtendimento.id])
    assert.deepEqual(r.itens[1], { demandaId: as9.id, campo: 'prazo', data: '2026-10-16', hora: '09:00' })
    assert.deepEqual(r.feriados.map((f) => f.data), ['2026-10-12'])
    assert.deepEqual(r.extras, [])
  })

  test('"Só as minhas" (membro ou AM) e quadroIds filtram; quadroIds aceita a chave repetida ou vírgulas', async () => {
    const a = await ambiente()
    const { design, am } = a.pessoas
    const minha = await a.criarDemanda({ titulo: 'Minha', prazo: '2026-10-15', clienteId: a.clientes.icc.id, membroIds: [design.id] })
    const doAm = await a.criarDemanda({ titulo: 'Do AM', prazo: '2026-10-16' })
    const social = await a.criarDemanda({ titulo: 'Social', prazo: '2026-10-17', clienteId: a.clientes.icc.id, quadroId: a.quadros.social.quadro.id })
    const soMinhas = await agendaDe(a, design, 'de=2026-10-01&ate=2026-10-31&soMinhas=1')
    assert.deepEqual(soMinhas.itens.map((i) => i.demandaId), [minha.id])
    const doAmSo = await agendaDe(a, am, 'de=2026-10-01&ate=2026-10-31&soMinhas=true')
    assert.deepEqual(doAmSo.itens.map((i) => i.demandaId), [doAm.id])
    const criacao = a.quadros.criacao.quadro.id
    const soCriacao = await agendaDe(a, design, `de=2026-10-01&ate=2026-10-31&quadroIds=${criacao}`)
    assert.deepEqual(soCriacao.itens.map((i) => i.demandaId), [minha.id, doAm.id])
    const repetida = await agendaDe(a, design, `de=2026-10-01&ate=2026-10-31&quadroIds=${criacao}&quadroIds=${a.quadros.social.quadro.id}`)
    assert.equal(repetida.itens.length, 3)
    const virgulas = await agendaDe(a, design, `de=2026-10-01&ate=2026-10-31&quadroIds=${a.quadros.social.quadro.id},${criacao}`)
    assert.deepEqual(virgulas.itens.map((i) => i.demandaId), [minha.id, doAm.id, social.id])
  })

  test('campos: prazo por padrão; início e publicação quando pedidos, cada um no seu dia', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ titulo: 'Campanha', inicio: '2026-10-13', prazo: '2026-10-16', prazoHora: '12:00',
      publicacaoData: '2026-10-20', publicacaoHora: '19:00' })
    const padrao = await agendaDe(a, a.pessoas.am, 'de=2026-10-01&ate=2026-10-31')
    assert.deepEqual(padrao.itens.map((i) => i.campo), ['prazo'])
    const todos = await agendaDe(a, a.pessoas.am, 'de=2026-10-01&ate=2026-10-31&campos=prazo&campos=inicio&campos=publicacao')
    assert.deepEqual(todos.itens.map((i) => [i.campo, i.data, i.hora]), [
      ['inicio', '2026-10-13', null], ['prazo', '2026-10-16', '12:00'], ['publicacao', '2026-10-20', '19:00'],
    ])
    assert.ok(todos.itens.every((i) => i.demandaId === d.id))
    // só a publicação, mesmo com o prazo fora do intervalo
    const soPublicacao = await agendaDe(a, a.pessoas.am, 'de=2026-10-19&ate=2026-10-25&campos=publicacao')
    assert.deepEqual(soPublicacao.itens.map((i) => i.campo), ['publicacao'])
  })

  test('concluídas aparecem por padrão; a concluída antiga (fora do bootstrap) vem em extras; incluirConcluidas=0 tira', async () => {
    const a = await ambiente()
    const recente = await a.criarDemanda({ titulo: 'Concluída ontem', prazo: '2026-10-02' })
    concluidaHa(a.db, recente.id, '2026-10-13T13:00:00.000Z')
    const antiga = await a.criarDemanda({ titulo: 'Concluída há 10 dias', prazo: '2026-10-01' })
    concluidaHa(a.db, antiga.id, '2026-10-04T13:00:00.000Z')
    const aberta = await a.criarDemanda({ titulo: 'Aberta', prazo: '2026-10-05' })

    const r = await agendaDe(a, a.pessoas.am, 'de=2026-10-01&ate=2026-10-31')
    assert.deepEqual(r.itens.map((i) => i.demandaId), [antiga.id, recente.id, aberta.id])
    assert.deepEqual(r.extras.map((d) => d.id), [antiga.id])
    assert.equal(r.extras[0]!.concluidaEm, '2026-10-04T13:00:00.000Z')
    const semConcluidas = await agendaDe(a, a.pessoas.am, 'de=2026-10-01&ate=2026-10-31&incluirConcluidas=0')
    assert.deepEqual(semConcluidas.itens.map((i) => i.demandaId), [aberta.id])
    assert.deepEqual(semConcluidas.extras, [])
  })
})
