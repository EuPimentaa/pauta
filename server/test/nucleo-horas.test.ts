/** Horas (API.md §4.20): listar por papel, período, editar e excluir; cronômetro parado pelo núcleo (§4.15). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Apontamento } from '../../shared/tipos/index.ts'
import { agora, novoId, rodar, tx, um } from '../src/db.ts'
import { lancarApontamento, pararCronometros } from '../src/servicos/horas.ts'
import { ambiente, eventos, ultimoSeq, type Ambiente, type NomePessoa } from './ajuda.ts'

function lancar(a: Ambiente, quem: NomePessoa, demandaId: string, minutos: number, data?: string): Apontamento {
  return tx(a.db, () => lancarApontamento(a.db, { demandaId, ator: a.ator(a.pessoas[quem]), entrada: { minutos, data } }))
}

/** Cronômetro ligado agora (a rota de ligar é do F1): INSERT direto. */
function ligarCronometro(a: Ambiente, quem: NomePessoa, demandaId: string): string {
  const id = novoId()
  const d = um<{ cliente_id: string | null }>(a.db, 'SELECT cliente_id FROM demanda WHERE id = ?', demandaId)!
  rodar(a.db, `INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, iniciado_em, origem, criado_em, atualizado_em)
               VALUES (?, ?, ?, ?, '2026-10-14', ?, 'cronometro', ?, ?)`, id, a.pessoas[quem].id, demandaId, d.cliente_id, agora(), agora(), agora())
  return id
}

describe('GET /api/apontamentos', () => {
  test('equipe só os próprios; atendimento + porCliente; admin todos + porCliente + porPessoa; cronômetro ligado sem minutos', async () => {
    const a = await ambiente()
    const he = await a.criarDemanda()
    const icc = await a.criarDemanda({ clienteId: a.clientes.icc.id })
    lancar(a, 'design', he.id, 30)
    lancar(a, 'design2', icc.id, 45)
    lancar(a, 'am', he.id, 20)
    ligarCronometro(a, 'design2', he.id)

    const doDesign = (await a.como(a.pessoas.design).get('/api/apontamentos')).corpo
    assert.deepEqual(doDesign.itens.map((x: Apontamento) => [x.usuarioId, x.minutos]), [[a.pessoas.design.id, 30]])
    assert.equal(doDesign.totalMin, 30)
    assert.equal(doDesign.porCliente, undefined)
    assert.equal(doDesign.porPessoa, undefined)

    const doAm = (await a.como(a.pessoas.am).get('/api/apontamentos')).corpo
    assert.deepEqual(doAm.itens.map((x: Apontamento) => x.usuarioId), [a.pessoas.am.id])
    assert.deepEqual(doAm.porCliente, [{ clienteId: a.clientes.he.id, minutos: 50 }, { clienteId: a.clientes.icc.id, minutos: 45 }])
    assert.equal(doAm.porPessoa, undefined)

    const doAdmin = (await a.como(a.pessoas.admin).get('/api/apontamentos')).corpo
    assert.equal(doAdmin.itens.length, 4)
    assert.equal(doAdmin.itens.filter((x: Apontamento) => x.minutos === null).length, 1)
    assert.equal(doAdmin.totalMin, 95)
    assert.deepEqual(doAdmin.porPessoa, [
      { usuarioId: a.pessoas.design2.id, minutos: 45 }, { usuarioId: a.pessoas.design.id, minutos: 30 }, { usuarioId: a.pessoas.am.id, minutos: 20 },
    ])
    const filtrado = (await a.como(a.pessoas.admin).get(`/api/apontamentos?usuarioId=${a.pessoas.design.id}`)).corpo
    assert.deepEqual(filtrado.itens.map((x: Apontamento) => x.usuarioId), [a.pessoas.design.id])
    const porCliente = (await a.como(a.pessoas.admin).get(`/api/apontamentos?clienteId=${a.clientes.icc.id}`)).corpo
    assert.equal(porCliente.totalMin, 45)
    const porDemanda = (await a.como(a.pessoas.admin).get(`/api/apontamentos?demandaId=${he.id}`)).corpo
    assert.equal(porDemanda.itens.length, 3)
  })

  test('usuarioId de outra pessoa sem ser admin → 403; o próprio vale', async () => {
    const a = await ambiente()
    const r = await a.como(a.pessoas.design).get(`/api/apontamentos?usuarioId=${a.pessoas.design2.id}`)
    assert.equal(r.status, 403)
    assert.equal(r.corpo.erro.codigo, 'sem_permissao')
    assert.equal((await a.como(a.pessoas.am).get(`/api/apontamentos?usuarioId=${a.pessoas.design.id}`)).status, 403)
    assert.equal((await a.como(a.pessoas.design).get(`/api/apontamentos?usuarioId=${a.pessoas.design.id}`)).status, 200)
  })

  test('período: padrão = semana atual (segunda a domingo); até 92 dias; 93 → 400; fim antes do começo → 400', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    lancar(a, 'design', d.id, 10, '2026-10-11')                   // domingo da semana anterior
    lancar(a, 'design', d.id, 20, '2026-10-12')                   // segunda
    lancar(a, 'design', d.id, 40, '2026-10-18')                   // domingo
    const eu = a.como(a.pessoas.design)
    assert.equal((await eu.get('/api/apontamentos')).corpo.totalMin, 60)
    assert.equal((await eu.get('/api/apontamentos?de=2026-10-11&ate=2026-10-11')).corpo.totalMin, 10)
    assert.equal((await eu.get('/api/apontamentos?de=2026-08-01&ate=2026-10-31')).status, 200)    // 92 dias
    const longo = await eu.get('/api/apontamentos?de=2026-08-01&ate=2026-11-01')                  // 93 dias
    assert.equal(longo.status, 400)
    assert.equal(longo.corpo.erro.codigo, 'validacao')
    assert.equal((await eu.get('/api/apontamentos?de=2026-10-20&ate=2026-10-19')).status, 400)
    assert.equal((await eu.get('/api/apontamentos?de=2026-13-01')).status, 400)
    assert.equal((await eu.get('/api/apontamentos?usuarioId=')).status, 400)
  })

  test('extras: as demandas dos itens que estão fora do bootstrap (arquivada)', async () => {
    const a = await ambiente()
    const viva = await a.criarDemanda()
    const arquivada = await a.criarDemanda({ titulo: 'Arquivada' })
    lancar(a, 'design', viva.id, 10)
    lancar(a, 'design', arquivada.id, 15)
    await a.como(a.pessoas.am).post(`/api/demandas/${arquivada.id}/arquivar`)
    const r = (await a.como(a.pessoas.design).get('/api/apontamentos')).corpo
    assert.equal(r.itens.length, 2)
    assert.deepEqual(r.extras.map((d: { id: string }) => d.id), [arquivada.id])
  })
})

describe('PATCH e DELETE /api/apontamentos/:id', () => {
  test('o dono edita; outro da equipe → 403; admin edita de qualquer um; eventos ao dono e aos admins, minutos a todos', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const ap = lancar(a, 'design', d.id, 30)
    const outro = await a.como(a.pessoas.design2).patch(`/api/apontamentos/${ap.id}`, { minutos: 10 })
    assert.equal(outro.status, 403)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/apontamentos/${ap.id}`, { minutos: 10 })).status, 403)

    const desde = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.design).patch(`/api/apontamentos/${ap.id}`, { minutos: 50, nota: '  revisão  ', data: '2026-10-13' })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.minutos, 50)
    assert.equal(r.corpo.nota, 'revisão')
    assert.equal(r.corpo.data, '2026-10-13')
    const evs = eventos(a.db, desde)
    const doApontamento = evs.find((e) => e.entidade === 'apontamento')!
    assert.equal(doApontamento.publico, 'usuario_admin')
    assert.equal(doApontamento.usuario_id, a.pessoas.design.id)
    const minutos = evs.find((e) => e.entidade === 'demanda')!
    assert.deepEqual(minutos.patch, { minutosRegistrados: 50 })
    assert.equal(minutos.ator_id, null)
    assert.equal(minutos.trace_id, null)

    const admin = await a.como(a.pessoas.admin).patch(`/api/apontamentos/${ap.id}`, { nota: null })
    assert.equal(admin.status, 200)
    assert.equal(admin.corpo.nota, null)
    assert.equal(admin.corpo.minutos, 50)
  })

  test('validação: minutos fora de 1–1440 ou fracionados → 400; inexistente → 404', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const ap = lancar(a, 'design', d.id, 30)
    const eu = a.como(a.pessoas.design)
    assert.equal((await eu.patch(`/api/apontamentos/${ap.id}`, { minutos: 0 })).status, 400)
    assert.equal((await eu.patch(`/api/apontamentos/${ap.id}`, { minutos: 1441 })).status, 400)
    assert.equal((await eu.patch(`/api/apontamentos/${ap.id}`, { minutos: 1.5 })).status, 400)
    assert.equal((await eu.patch('/api/apontamentos/nao-existe', { minutos: 5 })).status, 404)
    assert.equal((await eu.del('/api/apontamentos/nao-existe')).status, 404)
  })

  test('cronômetro ligado não se edita nem exclui (409: pare antes)', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const id = ligarCronometro(a, 'design', d.id)
    const r = await a.como(a.pessoas.design).patch(`/api/apontamentos/${id}`, { minutos: 5 })
    assert.equal(r.status, 409)
    assert.equal(r.corpo.erro.codigo, 'conflito')
    assert.equal((await a.como(a.pessoas.design).del(`/api/apontamentos/${id}`)).status, 409)
  })

  test('DELETE: dono ou admin; outro → 403; some da lista e do total da demanda; segundo DELETE → 404', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const ap = lancar(a, 'design', d.id, 30)
    lancar(a, 'design', d.id, 15)
    assert.equal((await a.como(a.pessoas.social).del(`/api/apontamentos/${ap.id}`)).status, 403)
    const desde = ultimoSeq(a.db)
    assert.equal((await a.como(a.pessoas.design).del(`/api/apontamentos/${ap.id}`)).status, 204)
    assert.equal(um<{ m: number }>(a.db, 'SELECT minutos_registrados AS m FROM demanda WHERE id = ?', d.id)!.m, 15)
    const apagado = eventos(a.db, desde).find((e) => e.entidade === 'apontamento')!
    assert.equal(apagado.op, 'delete')
    assert.equal(apagado.publico, 'usuario_admin')
    assert.equal((await a.como(a.pessoas.design).get('/api/apontamentos')).corpo.totalMin, 15)
    assert.equal((await a.como(a.pessoas.design).del(`/api/apontamentos/${ap.id}`)).status, 404)
    const outro = lancar(a, 'design', d.id, 5)
    assert.equal((await a.como(a.pessoas.admin).del(`/api/apontamentos/${outro.id}`)).status, 204)
  })
})

describe('cronômetro (serviço do núcleo)', () => {
  test('parar no mesmo instante em que ligou grava 1 minuto; acima do limite grava o limite', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    ligarCronometro(a, 'design', d.id)
    const [parado] = tx(a.db, () => pararCronometros(a.db, { usuarioId: a.pessoas.design.id }, a.ator(a.pessoas.design)))
    assert.equal(parado!.minutos, 1)
    assert.equal(parado!.paradoEm, parado!.iniciadoEm)

    ligarCronometro(a, 'design', d.id)
    a.relogio('2026-10-15T03:00:00.000Z')                         // 14 h depois; limite padrão 10 h
    const [longo] = tx(a.db, () => pararCronometros(a.db, { demandaId: d.id }, a.ator(a.pessoas.design)))
    assert.equal(longo!.minutos, 600)
    assert.equal(um<{ m: number }>(a.db, 'SELECT minutos_registrados AS m FROM demanda WHERE id = ?', d.id)!.m, 601)
    // nada ligado: não para nada
    assert.deepEqual(tx(a.db, () => pararCronometros(a.db, { usuarioId: a.pessoas.design.id }, a.ator(a.pessoas.design))), [])
  })

  test('arquivar o quadro para os cronômetros das demandas dele', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ quadroId: a.quadros.social.quadro.id })
    ligarCronometro(a, 'social', d.id)
    assert.equal((await a.como(a.pessoas.admin).post(`/api/quadros/${a.quadros.social.quadro.id}/arquivar`)).status, 200)
    const l = um<{ minutos: number | null; parado_em: string | null }>(a.db, 'SELECT minutos, parado_em FROM apontamento WHERE demanda_id = ?', d.id)!
    assert.equal(l.minutos, 1)
    assert.ok(l.parado_em)
  })
})
