/** Cronômetro e "Lançar tempo" (F1, API.md §4.15): um ligado por pessoa, minutos, limite, eventos e arquivar. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Apontamento, CronometroSaida } from '../../shared/tipos/index.ts'
import { todos, um } from '../src/db.ts'
import { ambiente, eventos, INICIO, ultimoSeq } from './ajuda.ts'

const depois = (min: number) => new Date(Date.parse(INICIO) + min * 60_000).toISOString()
const ligados = (a: Awaited<ReturnType<typeof ambiente>>, usuarioId: string) =>
  todos(a.db, `SELECT id FROM apontamento WHERE usuario_id = ? AND origem = 'cronometro' AND parado_em IS NULL AND excluido_em IS NULL`, usuarioId).length
const minutos = (a: Awaited<ReturnType<typeof ambiente>>, demandaId: string) =>
  um<{ m: number }>(a.db, 'SELECT minutos_registrados AS m FROM demanda WHERE id = ?', demandaId)!.m

describe('cronômetro', () => {
  test('iniciar outro para o anterior e soma os minutos dele', async () => {
    const a = await ambiente()
    const d1 = await a.criarDemanda({ titulo: 'Uma' })
    const d2 = await a.criarDemanda({ titulo: 'Outra' })
    const r1 = await a.como(a.pessoas.design).post(`/api/demandas/${d1.id}/cronometro`)
    assert.equal(r1.status, 200)
    const s1: CronometroSaida = r1.corpo
    assert.equal(s1.parado, null)
    assert.equal(s1.ativo?.demandaId, d1.id)
    assert.equal(s1.ativo?.minutos, null)
    assert.equal(s1.ativo?.origem, 'cronometro')
    assert.equal(s1.ativo?.data, '2026-10-14')
    assert.equal(s1.ativo?.clienteId, a.clientes.he.id)

    a.relogio(depois(30))
    const s2: CronometroSaida = (await a.como(a.pessoas.design).post(`/api/demandas/${d2.id}/cronometro`)).corpo
    assert.equal(s2.parado?.id, s1.ativo?.id)
    assert.equal(s2.parado?.minutos, 30)
    assert.equal(s2.ativo?.demandaId, d2.id)
    assert.equal(minutos(a, d1.id), 30)
    assert.equal(ligados(a, a.pessoas.design.id), 1)
    // o detalhe mostra o total e o meu
    const det = (await a.como(a.pessoas.design).get(`/api/demandas/${d1.numero}`)).corpo
    assert.deepEqual(det.tempo, { totalMin: 30, meusMin: 30 })
    const doOutro = (await a.como(a.pessoas.am).get(`/api/demandas/${d1.numero}`)).corpo
    assert.deepEqual(doOutro.tempo, { totalMin: 30, meusMin: 0 })
    // o bootstrap traz o meu cronômetro ligado
    assert.equal((await a.como(a.pessoas.design).get('/api/bootstrap')).corpo.eu.cronometro.demandaId, d2.id)
  })

  test('ligar e parar no mesmo instante (relógio parado) grava 1 minuto', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/cronometro`)
    const s: CronometroSaida = (await a.como(a.pessoas.design).post('/api/cronometro/parar')).corpo
    assert.equal(s.ativo, null)
    assert.equal(s.parado?.minutos, 1)
    assert.equal(s.parado?.paradoEm, s.parado?.iniciadoEm)
    assert.deepEqual(s.avisos, [])
    // parar sem nada ligado
    assert.deepEqual((await a.como(a.pessoas.design).post('/api/cronometro/parar')).corpo, { ativo: null, parado: null, avisos: [] })
  })

  test('dois inícios simultâneos da mesma pessoa: os dois 200 e nunca dois ligados', async () => {
    const a = await ambiente()
    const d1 = await a.criarDemanda({ titulo: 'Uma' })
    const d2 = await a.criarDemanda({ titulo: 'Outra' })
    const quem = a.como(a.pessoas.design)
    const [r1, r2] = await Promise.all([quem.post(`/api/demandas/${d1.id}/cronometro`), quem.post(`/api/demandas/${d2.id}/cronometro`)])
    assert.equal(r1.status, 200)
    assert.equal(r2.status, 200)
    assert.equal(ligados(a, a.pessoas.design.id), 1)
    const parados = [r1.corpo.parado, r2.corpo.parado].filter(Boolean) as Apontamento[]
    assert.equal(parados.length, 1)
    assert.equal(parados[0]!.minutos, 1)
  })

  test('parar depois de 11 h grava 10 h e avisa', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/cronometro`)
    a.relogio(depois(11 * 60))
    const s: CronometroSaida = (await a.como(a.pessoas.design).post('/api/cronometro/parar')).corpo
    assert.equal(s.parado?.minutos, 600)
    assert.deepEqual(s.avisos, ['cronometro_longo'])
  })

  test('arquivar a demanda para o cronômetro; ligar numa arquivada → 422', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/cronometro`)
    a.relogio(depois(45))
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/arquivar`)).status, 200)
    assert.equal(ligados(a, a.pessoas.design.id), 0)
    assert.equal(minutos(a, d.id), 45)
    const r = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/cronometro`)
    assert.equal(r.status, 422)
    assert.equal(r.corpo.erro.codigo, 'estado_invalido')
  })

  test('eventos: `apontamento` só ao dono e ao admin; minutosRegistrados com ator e trace nulos', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    let seq = ultimoSeq(a.db)
    await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/cronometro`)
    let evs = eventos(a.db, seq)
    const ligou = evs.find((e) => e.entidade === 'apontamento')!
    assert.equal(ligou.publico, 'usuario_admin')
    assert.equal(ligou.usuario_id, a.pessoas.design.id)
    a.relogio(depois(20))
    seq = ultimoSeq(a.db)
    await a.como(a.pessoas.design).post('/api/cronometro/parar')
    evs = eventos(a.db, seq)
    assert.ok(evs.filter((e) => e.entidade === 'apontamento').every((e) => e.publico === 'usuario_admin' && e.usuario_id === a.pessoas.design.id))
    const min = evs.find((e) => e.entidade === 'demanda' && e.campos?.includes('minutosRegistrados'))!
    assert.deepEqual(min.patch, { minutosRegistrados: 20 })
    assert.equal(min.ator_id, null)
    assert.equal(min.trace_id, null)
    assert.equal(min.publico, 'interno')
    // o SSE de outra pessoa da equipe não recebe o apontamento (o filtro do bootstrap/sync é o mesmo)
    const sync = (await a.como(a.pessoas.design2).get(`/api/sync?desde=${seq}`)).corpo
    assert.ok(!sync.eventos.some((e: { e: string }) => e.e === 'apontamento'))
    assert.ok(sync.eventos.some((e: { e: string; c: string[] | null }) => e.e === 'demanda' && e.c?.includes('minutosRegistrados')))
    const doAdmin = (await a.como(a.pessoas.admin).get(`/api/sync?desde=${seq}`)).corpo
    assert.ok(doAdmin.eventos.some((e: { e: string }) => e.e === 'apontamento'))
  })
})

describe('POST /api/demandas/:id/apontamentos', () => {
  test('lança para mim com o cliente da demanda; fora da faixa → 400; data inválida → 400', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const r = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/apontamentos`, { minutos: 90, nota: ' Ajustes finais ', data: '2026-10-13' })
    assert.equal(r.status, 201)
    const ap: Apontamento = r.corpo
    assert.equal(ap.usuarioId, a.pessoas.design.id)
    assert.equal(ap.clienteId, a.clientes.he.id)
    assert.equal(ap.minutos, 90)
    assert.equal(ap.nota, 'Ajustes finais')
    assert.equal(ap.data, '2026-10-13')
    assert.equal(ap.origem, 'manual')
    assert.equal(minutos(a, d.id), 90)
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/apontamentos`, { minutos: 0 })).status, 400)
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/apontamentos`, { minutos: 1441 })).status, 400)
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/apontamentos`, { minutos: 10, data: '14/10' })).status, 400)
    // sem data: hoje
    const hoje: Apontamento = (await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/apontamentos`, { minutos: 15 })).corpo
    assert.equal(hoje.data, '2026-10-14')
    assert.equal((await a.como(a.pessoas.design).post('/api/demandas/nao-existe/apontamentos', { minutos: 15 })).status, 404)
  })
})
