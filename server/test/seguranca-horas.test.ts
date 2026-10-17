/**
 * Segurança 4 (revisão da leva 2): o atendimento não vê horas de outra pessoa (API.md §2). O `porCliente` que ele
 * recebe sai só por cliente e mês inteiro: o recorte por demanda e por dia não vale para o total de todas as pessoas
 * (com uma demanda e um dia, "54 − 12 próprios" dava os 42 min da Bia). O admin continua livre.
 *
 * Verificação: o total da demanda (`minutosRegistrados`) é de todos e, com uma pessoa a mais, "total − meus" dá as horas
 * dela. Decisão (API.md §2, "Totais de horas"): o total fica (a equipe compara com a estimativa) e não diz de quem são
 * os minutos; o que dá as horas de alguém por si só segue fechado. O último bloco fixa essa fronteira.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Apontamento, Atividade } from '../../shared/tipos/index.ts'
import { tx } from '../src/db.ts'
import { lancarApontamento } from '../src/servicos/horas.ts'
import { ambiente, eventos, ultimoSeq, type Ambiente, type NomePessoa } from './ajuda.ts'

function lancar(a: Ambiente, quem: NomePessoa, demandaId: string, minutos: number, data: string): void {
  tx(a.db, () => lancarApontamento(a.db, { demandaId, ator: a.ator(a.pessoas[quem]), entrada: { minutos, data } }))
}

async function cenario() {
  const a = await ambiente()
  const d = await a.criarDemanda({ titulo: 'Post da campanha' })
  const outra = await a.criarDemanda({ titulo: 'Banner' })
  const icc = await a.criarDemanda({ clienteId: a.clientes.icc.id })
  lancar(a, 'design', d.id, 42, '2026-10-14')
  lancar(a, 'am', d.id, 12, '2026-10-14')
  lancar(a, 'design', outra.id, 30, '2026-10-05')
  lancar(a, 'design2', icc.id, 45, '2026-10-20')
  lancar(a, 'design', d.id, 60, '2026-09-30')
  return { a, d }
}

describe('porCliente do atendimento', () => {
  test('com uma demanda e um dia, o total por cliente é o do mês inteiro (não revela as horas do dia de outra pessoa)', async () => {
    const { a, d } = await cenario()
    const r = await a.como(a.pessoas.am).get(`/api/apontamentos?demandaId=${d.id}&de=2026-10-14&ate=2026-10-14`)
    assert.equal(r.status, 200, r.texto)
    assert.deepEqual(r.corpo.itens.map((x: Apontamento) => [x.usuarioId, x.minutos]), [[a.pessoas.am.id, 12]], 'os próprios, no recorte pedido')
    assert.equal(r.corpo.totalMin, 12)
    assert.deepEqual(r.corpo.porCliente, [{ clienteId: a.clientes.he.id, minutos: 84 }, { clienteId: a.clientes.icc.id, minutos: 45 }])
    const mes = await a.como(a.pessoas.am).get('/api/apontamentos?de=2026-10-01&ate=2026-10-31')
    assert.deepEqual(r.corpo.porCliente, mes.corpo.porCliente, 'o mesmo total do mês pedido inteiro')
    assert.equal(r.corpo.porPessoa, undefined)
  })

  test('o recorte por cliente vale; o período vira os meses inteiros que ele toca', async () => {
    const { a } = await cenario()
    const he = await a.como(a.pessoas.am).get(`/api/apontamentos?clienteId=${a.clientes.he.id}&de=2026-10-13&ate=2026-10-15`)
    assert.deepEqual(he.corpo.porCliente, [{ clienteId: a.clientes.he.id, minutos: 84 }])
    const doisMeses = await a.como(a.pessoas.am).get(`/api/apontamentos?clienteId=${a.clientes.he.id}&de=2026-09-30&ate=2026-10-01`)
    assert.deepEqual(doisMeses.corpo.porCliente, [{ clienteId: a.clientes.he.id, minutos: 144 }])
  })

  test('admin segue com o recorte pedido (demanda e dia)', async () => {
    const { a, d } = await cenario()
    const r = await a.como(a.pessoas.admin).get(`/api/apontamentos?demandaId=${d.id}&de=2026-10-14&ate=2026-10-14`)
    assert.deepEqual(r.corpo.porCliente, [{ clienteId: a.clientes.he.id, minutos: 54 }])
    assert.deepEqual(r.corpo.porPessoa, [{ usuarioId: a.pessoas.design.id, minutos: 42 }, { usuarioId: a.pessoas.am.id, minutos: 12 }])
  })
})

describe('total da demanda: de todos e sem dizer de quem (API.md §2, "Totais de horas")', () => {
  test('equipe fora da demanda vê o total e só os próprios; nenhum caminho diz de quem são os outros minutos', async () => {
    const { a, d } = await cenario()
    const duda = a.como(a.pessoas.web) // da equipe, fora da demanda e sem horas nela
    const det = (await duda.get(`/api/demandas/${d.numero}`)).corpo
    assert.equal(det.demanda.minutosRegistrados, 114, 'o total (42 + 12 + 60) é de todos')
    assert.deepEqual(det.tempo, { totalMin: 114, meusMin: 0 }, 'o detalhe só traz o total e os meus, sem divisão por pessoa')
    assert.deepEqual((await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo.tempo, { totalMin: 114, meusMin: 12 })

    const historico = (await duda.get(`/api/demandas/${d.id}/historico`)).corpo.itens as Atividade[]
    assert.equal(historico.filter((x) => x.tipo === 'tempo.lancado').length, 0, 'os lançamentos dos outros não aparecem no histórico')
    const lista = (await duda.get('/api/apontamentos?de=2026-09-01&ate=2026-10-31')).corpo
    assert.deepEqual(lista.itens, [])
    assert.equal(lista.porCliente, undefined)
    assert.equal(lista.porPessoa, undefined)
    assert.equal((await duda.get(`/api/apontamentos?usuarioId=${a.pessoas.design.id}`)).status, 403)

    // um lançamento novo: o total ao vivo chega a todos sem ator nem trace; o lançamento, só ao dono e aos admins
    const desde = ultimoSeq(a.db)
    lancar(a, 'design', d.id, 7, '2026-10-14')
    const evs = eventos(a.db, desde)
    const total = evs.find((e) => e.entidade === 'demanda' && e.patch && 'minutosRegistrados' in e.patch)!
    assert.deepEqual(total.patch, { minutosRegistrados: 121 })
    assert.equal(total.publico, 'interno')
    assert.equal(total.ator_id, null)
    assert.equal(total.trace_id, null)
    const doLancamento = evs.filter((x) => x.entidade === 'apontamento')
    assert.ok(doLancamento.length > 0)
    for (const e of doLancamento) {
      assert.equal(e.publico, 'usuario_admin')
      assert.equal(e.usuario_id, a.pessoas.design.id)
    }
  })
})
