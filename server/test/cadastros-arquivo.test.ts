/** Arquivo (API.md §4.19): o que saiu do quadro, filtros, texto, cursor. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Demanda } from '../../shared/tipos/index.ts'
import { ambiente, type Ambiente } from './ajuda.ts'

/**
 * Linha do tempo (relógio monotônico), consultada em 14/10/2026 10h de São Paulo (concluídas saem do quadro em 7 dias):
 * - d1 Carrossel institucional (HE, Criação): arquivada em 25/09;
 * - d4 Ação de outubro (HE, Atendimento): arquivada em 30/09 às 23h30 de São Paulo (01/10 02h30 UTC: mês 09);
 * - d3 Post semanal (HE, Social): arquivada em 02/10;
 * - d2 Banner do site (ICC, Criação): concluída em 06/10 (há 8 dias), sem arquivar;
 * - d5 Recente (HE): concluída em 10/10 (há 4 dias: ainda no quadro); d6 aberta; d7 anonimizada.
 */
async function montar(): Promise<{ a: Ambiente; d: Record<'d1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7', Demanda> }> {
  const a = await ambiente()
  a.relogio('2026-09-20T13:00:00.000Z')
  const social = a.quadros.social.quadro.id
  const atendimento = a.quadros.atendimento.quadro.id
  const d = {
    d1: await a.criarDemanda({ titulo: 'Carrossel institucional' }),
    d2: await a.criarDemanda({ titulo: 'Banner do site', clienteId: a.clientes.icc.id }),
    d3: await a.criarDemanda({ titulo: 'Post semanal', quadroId: social }),
    d4: await a.criarDemanda({ titulo: 'Ação de outubro', quadroId: atendimento }),
    d5: await a.criarDemanda({ titulo: 'Recente' }),
    d6: await a.criarDemanda({ titulo: 'Aberta' }),
    d7: await a.criarDemanda({ titulo: 'Será excluída' }),
  }
  const am = a.como(a.pessoas.am)
  const passo = async (instante: string, fn: () => Promise<unknown>) => { a.relogio(instante); await fn() }
  await passo('2026-09-25T13:00:00.000Z', () => am.post(`/api/demandas/${d.d1.id}/arquivar`))
  await passo('2026-10-01T02:30:00.000Z', () => am.post(`/api/demandas/${d.d4.id}/arquivar`))
  await passo('2026-10-02T13:00:00.000Z', () => am.post(`/api/demandas/${d.d3.id}/arquivar`))
  await passo('2026-10-06T13:00:00.000Z', () => am.post(`/api/demandas/${d.d2.id}/concluir`, { concluida: true }))
  await passo('2026-10-10T13:00:00.000Z', () => am.post(`/api/demandas/${d.d5.id}/concluir`, { concluida: true }))
  await passo('2026-10-11T13:00:00.000Z', () => a.como(a.pessoas.admin).post(`/api/demandas/${d.d7.id}/excluir`, { confirmarNumero: d.d7.numero }))
  a.relogio('2026-10-14T13:00:00.000Z')
  return { a, d }
}

const numeros = (r: { corpo: { itens: Demanda[] } }) => r.corpo.itens.map((x) => x.numero)

describe('Arquivo', () => {
  test('lista arquivadas e a concluída há 8 dias sem arquivar, mais recentes primeiro; nunca a recente, a aberta nem a anonimizada', async () => {
    const { a, d } = await montar()
    const r = await a.como(a.pessoas.design).get('/api/arquivo')
    assert.equal(r.status, 200)
    assert.deepEqual(numeros(r), [d.d2.numero, d.d3.numero, d.d4.numero, d.d1.numero])
    assert.equal(r.corpo.proximo, null)
    const banner = r.corpo.itens[0]
    assert.equal(banner.arquivadoEm, null, 'concluída e não arquivada: aparece igual')
    assert.equal(banner.concluidaEm, '2026-10-06T13:00:00.000Z')
    assert.equal(r.corpo.itens[1].arquivadoEm, '2026-10-02T13:00:00.000Z')
  })

  test('filtra por mês (no fuso de São Paulo), cliente e quadro', async () => {
    const { a, d } = await montar()
    const eu = a.como(a.pessoas.am)
    assert.deepEqual(numeros(await eu.get('/api/arquivo?mes=2026-10')), [d.d2.numero, d.d3.numero])
    assert.deepEqual(numeros(await eu.get('/api/arquivo?mes=2026-09')), [d.d4.numero, d.d1.numero], '23h30 de 30/09 é setembro')
    assert.deepEqual(numeros(await eu.get('/api/arquivo?mes=2026-08')), [])
    assert.deepEqual(numeros(await eu.get(`/api/arquivo?clienteId=${a.clientes.icc.id}`)), [d.d2.numero])
    assert.deepEqual(numeros(await eu.get(`/api/arquivo?quadroId=${a.quadros.social.quadro.id}`)), [d.d3.numero])
    assert.deepEqual(numeros(await eu.get(`/api/arquivo?clienteId=${a.clientes.he.id}&mes=2026-10`)), [d.d3.numero])
    assert.equal((await eu.get('/api/arquivo?mes=2026-13')).status, 400)
    assert.equal((await eu.get('/api/arquivo?limite=500')).status, 400)
  })

  test('texto: sigla ou apelido do cliente no começo, palavras do título sem acento, número', async () => {
    const { a, d } = await montar()
    const eu = a.como(a.pessoas.web)
    const q = async (texto: string) => numeros(await eu.get(`/api/arquivo?q=${encodeURIComponent(texto)}`))
    assert.deepEqual(await q('he'), [d.d3.numero, d.d4.numero, d.d1.numero])
    assert.deepEqual(await q('HE acao'), [d.d4.numero])
    assert.deepEqual(await q('hospital evangélico carros'), [d.d1.numero])
    assert.deepEqual(await q('banner'), [d.d2.numero])
    assert.deepEqual(await q('he banner'), [], 'o banner é do ICC')
    assert.deepEqual(await q(`#${d.d1.numero}`), [d.d1.numero])
    assert.deepEqual(await q(String(d.d2.numero)), [d.d2.numero])
    assert.deepEqual(await q(`#${d.d7.numero}`), [], 'a anonimizada nunca, nem pelo número')
    assert.deepEqual(await q(`#${d.d5.numero}`), [], 'a recente ainda está no quadro')
    assert.deepEqual(await q('nada "parecido" *'), [])
    assert.deepEqual(await q('acao - !!'), [d.d4.numero], 'pontuação solta não zera a busca')
    assert.deepEqual(await q('excluída'), [])
  })

  test('cursor: páginas sem repetir nem pular; cursor inválido → 400', async () => {
    const { a, d } = await montar()
    const eu = a.como(a.pessoas.am)
    const p1 = await eu.get('/api/arquivo?limite=2')
    assert.deepEqual(numeros(p1), [d.d2.numero, d.d3.numero])
    assert.equal(typeof p1.corpo.proximo, 'string')
    const p2 = await eu.get(`/api/arquivo?limite=2&cursor=${p1.corpo.proximo}`)
    assert.deepEqual(numeros(p2), [d.d4.numero, d.d1.numero])
    assert.equal(p2.corpo.proximo, null)
    assert.equal((await eu.get('/api/arquivo?cursor=bobagem')).status, 400)
  })

  test('mesmo instante: desempata pelo número, sem perder nenhum entre as páginas', async () => {
    const a = await ambiente()
    const criadas: Demanda[] = []
    for (let i = 0; i < 5; i++) criadas.push(await a.criarDemanda({ titulo: `Peça ${i}` }))
    for (const c of criadas) await a.como(a.pessoas.am).post(`/api/demandas/${c.id}/arquivar`)
    const vistos: number[] = []
    let cursor: string | null = null
    do {
      const r: { corpo: { itens: Demanda[]; proximo: string | null } } = await a.como(a.pessoas.am)
        .get(`/api/arquivo?limite=2${cursor ? `&cursor=${cursor}` : ''}`)
      vistos.push(...numeros(r))
      cursor = r.corpo.proximo
    } while (cursor)
    assert.deepEqual(vistos, criadas.map((c) => c.numero).reverse())
  })

  test('desmarcar a concluída antiga a devolve ao quadro (some do Arquivo); restaurar a arquivada também', async () => {
    const { a, d } = await montar()
    const am = a.como(a.pessoas.am)
    assert.equal((await am.post(`/api/demandas/${d.d2.id}/concluir`, { concluida: false })).status, 200)
    assert.equal((await am.post(`/api/demandas/${d.d1.id}/restaurar`, {})).status, 200)
    assert.deepEqual(numeros(await am.get('/api/arquivo')), [d.d3.numero, d.d4.numero])
  })
})
