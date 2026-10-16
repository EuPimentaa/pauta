/** Busca (API.md §4.13, GET /api/busca): número, cliente, FTS sem acento, arquivadas, anonimizada e o tempo com 5 mil. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownParaTexto, trechoCom, trechoDaDescricao } from '../src/servicos/entrada-busca.ts'
import { ambiente } from './ajuda.ts'
import { demandasEmMassa } from './entrada-ajuda.ts'

describe('GET /api/busca', () => {
  test('"#12" e "12" acham pelo número (o número exato primeiro)', async () => {
    const a = await ambiente()
    for (let i = 1; i <= 12; i++) await a.criarDemanda({ titulo: i === 3 ? 'Relatório 12 de outubro' : `Demanda ${i}` })
    const eu = a.como(a.pessoas.design)
    const r = await eu.get('/api/busca?q=%2312')
    assert.equal(r.status, 200)
    assert.deepEqual(r.corpo.demandas.map((d: { numero: number }) => d.numero), [12])
    const semCerquilha = await eu.get('/api/busca?q=12')
    assert.deepEqual(semCerquilha.corpo.demandas.map((d: { numero: number }) => d.numero), [12, 3], 'o número e depois o texto')
    const d = r.corpo.demandas[0]
    for (const k of ['id', 'titulo', 'clienteId', 'quadroId', 'colunaId', 'concluida', 'arquivado', 'trecho']) assert.ok(k in d, k)
  })

  test('"he outubro" filtra o cliente HE; "acao" acha "Ação"; prefixo e trecho da descrição', async () => {
    const a = await ambiente()
    await a.criarDemanda({ titulo: 'Post de outubro' })
    await a.criarDemanda({ titulo: 'Post de outubro', clienteId: a.clientes.icc.id })
    await a.criarDemanda({ titulo: 'Ação de Dia das Crianças', clienteId: null })
    await a.criarDemanda({ titulo: 'Campanha', descricaoMd: '## Objetivo\nDivulgar a **vacinação** de outono no @[Rafa](mencao:u1).' })
    const eu = a.como(a.pessoas.am)
    const he = await eu.get('/api/busca?q=he%20outubro')
    assert.equal(he.corpo.demandas.length, 1)
    assert.equal(he.corpo.demandas[0].clienteId, a.clientes.he.id)
    const multi = await eu.get(`/api/busca?q=${encodeURIComponent('hospital evangélico outubro')}`)
    assert.equal(multi.corpo.demandas.length, 1, 'apelido de duas palavras também filtra')
    const acao = await eu.get('/api/busca?q=acao')
    assert.equal(acao.corpo.demandas[0].titulo, 'Ação de Dia das Crianças')
    assert.equal(acao.corpo.demandas[0].trecho, null, 'o termo está no título')
    const prefixo = await eu.get('/api/busca?q=vacin')
    assert.equal(prefixo.corpo.demandas.length, 1)
    assert.equal(prefixo.corpo.demandas[0].trecho, 'Objetivo Divulgar a vacinação de outono no @Rafa.')
    const soCliente = await eu.get('/api/busca?q=icc')
    assert.deepEqual(soCliente.corpo.demandas.map((d: { clienteId: string }) => d.clienteId), [a.clientes.icc.id])
    assert.deepEqual((await eu.get('/api/busca?q=')).corpo.demandas, [])
    assert.deepEqual((await eu.get(`/api/busca?q=${encodeURIComponent('"*) OR (')}`)).corpo.demandas, [], 'sintaxe do FTS não passa')
  })

  test('arquivadas e de quadro arquivado só com incluirArquivadas; a anonimizada nunca, nem por "#12"', async () => {
    const a = await ambiente()
    const arquivada = await a.criarDemanda({ titulo: 'Banner arquivado' })
    const anonimizada = await a.criarDemanda({ titulo: 'Banner excluído' })
    const social = await a.criarDemanda({ titulo: 'Banner do Social', quadroId: a.quadros.social.quadro.id })
    const admin = a.como(a.pessoas.admin)
    assert.equal((await admin.post(`/api/demandas/${arquivada.id}/arquivar`)).status, 200)
    assert.equal((await admin.post(`/api/demandas/${anonimizada.id}/excluir`, { confirmarNumero: anonimizada.numero })).status, 204)
    assert.equal((await admin.post(`/api/quadros/${a.quadros.social.quadro.id}/arquivar`)).status, 200)
    const eu = a.como(a.pessoas.design)
    assert.deepEqual((await eu.get('/api/busca?q=banner')).corpo.demandas, [])
    const com = await eu.get('/api/busca?q=banner&incluirArquivadas=1')
    assert.deepEqual(com.corpo.demandas.map((d: { numero: number }) => d.numero).sort(), [arquivada.numero, social.numero].sort())
    assert.ok(com.corpo.demandas.every((d: { arquivado: boolean }) => d.arquivado))
    for (const q of [`%23${anonimizada.numero}`, String(anonimizada.numero), 'exclu', 'Demanda']) {
      assert.deepEqual((await eu.get(`/api/busca?q=${q}&incluirArquivadas=1`)).corpo.demandas.filter((d: { id: string }) => d.id === anonimizada.id), [], q)
    }
  })

  test('quadroId e limite; abertas antes das concluídas; validação', async () => {
    const a = await ambiente()
    const concluida = await a.criarDemanda({ titulo: 'Logo nova', colunaId: a.coluna('criacao', 'Concluído').id })
    const aberta = await a.criarDemanda({ titulo: 'Logo antiga' })
    await a.criarDemanda({ titulo: 'Logo do Social', quadroId: a.quadros.social.quadro.id })
    const eu = a.como(a.pessoas.design)
    const r = await eu.get(`/api/busca?q=logo&quadroId=${a.quadros.criacao.quadro.id}`)
    assert.deepEqual(r.corpo.demandas.map((d: { id: string }) => d.id), [aberta.id, concluida.id])
    assert.equal(r.corpo.demandas[1].concluida, true)
    assert.equal((await eu.get('/api/busca?q=logo&limite=1')).corpo.demandas.length, 1)
    assert.equal((await eu.get('/api/busca?q=logo&limite=50')).status, 400)
    assert.equal((await eu.get(`/api/busca?q=${'x'.repeat(201)}`)).status, 400)
  })

  test('menos de 150 ms com 5 mil demandas', async () => {
    const a = await ambiente()
    const palavras = ['carrossel', 'post', 'reels', 'banner', 'relatório', 'campanha', 'vídeo', 'stories', 'ação', 'site']
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro']
    demandasEmMassa(a.db, {
      n: 5000, quadroId: a.quadros.criacao.quadro.id, colunaId: a.coluna('criacao', 'Fila').id, criadoPor: a.pessoas.am.id,
      titulo: (i) => `${palavras[i % 10]} de ${meses[(i * 7) % 10]} ${i}`,
      descricao: (i) => `## Objetivo\nTexto da demanda ${i} com ${palavras[(i + 3) % 10]} e mais detalhes do briefing.`,
      clienteId: (i) => (i % 3 === 0 ? a.clientes.he.id : i % 3 === 1 ? a.clientes.icc.id : null),
    })
    const eu = a.como(a.pessoas.am)
    await eu.get('/api/busca?q=aquecer')
    for (const q of ['carrossel', 'he outubro', 'acao', '4521', '#4521', 'rel', 'reels maio', 'icc campanha de']) {
      const t0 = performance.now()
      const r = await eu.get(`/api/busca?q=${encodeURIComponent(q)}`)
      const ms = performance.now() - t0
      assert.equal(r.status, 200)
      assert.ok(r.corpo.demandas.length > 0, q)
      assert.ok(r.corpo.demandas.length <= 20, q)
      assert.ok(ms < 150, `${q}: ${ms.toFixed(1)} ms`)
    }
  })
})

describe('trecho (puro)', () => {
  test('Markdown vira texto e o trecho corta em palavra com reticências', () => {
    assert.equal(markdownParaTexto('# Título\n- **um** item\n> citação com [link](https://x.y) e @[Ana](mencao:a1) \\*literal\\*'),
      'Título um item citação com link e @Ana *literal*')
    const texto = `${'antes '.repeat(20)}a palavra Vacinação aparece aqui ${'depois '.repeat(30)}`
    const t = trechoCom(texto, ['vacinacao'])!
    assert.match(t, /^…/)
    assert.match(t, /Vacinação aparece/)
    assert.match(t, /…$/)
    assert.equal(trechoCom('nada aqui', ['vacina']), null)
  })

  test('descrição de 100 mil "[" vira trecho em menos de 50 ms (sem regex quadrática)', () => {
    const md = `zebralunar ${'['.repeat(99_980)}`
    for (const f of [() => trechoDaDescricao(md, ['zebra']), () => trechoDaDescricao(md, ['nada']), () => markdownParaTexto('['.repeat(50_000))]) {
      const t0 = performance.now()
      f()
      const ms = performance.now() - t0
      assert.ok(ms < 50, `${ms.toFixed(1)} ms`)
    }
    assert.equal(trechoDaDescricao(md, ['zebra']), 'zebralunar…')
    // o termo no fim de uma descrição longa ainda dá trecho (a janela vai até ele), com acento e sem caixa
    const longa = `${'texto comum de briefing. '.repeat(400)}Fim com a **Vacinação** de outono.`
    assert.match(trechoDaDescricao(longa, ['vacinacao'])!, /a Vacinação de outono\.$/)
  })
})

describe('busca: sigla do cliente', () => {
  test('"carrossel he" e "HE: carrossel" filtram o HE; a última palavra que não acha nada continua termo', async () => {
    const a = await ambiente()
    await a.criarDemanda({ titulo: 'Carrossel de vacinação' })
    await a.criarDemanda({ titulo: 'Carrossel de outubro' })
    await a.criarDemanda({ titulo: 'Carrossel do ICC', clienteId: a.clientes.icc.id })
    await a.criarDemanda({ titulo: 'Carrossel sem cliente icc solto', clienteId: null })
    const eu = a.como(a.pessoas.am)
    const ids = async (q: string) => (await eu.get(`/api/busca?q=${encodeURIComponent(q)}`)).corpo.demandas
      .map((d: { clienteId: string | null }) => d.clienteId)
    assert.deepEqual(await ids('carrossel he'), [a.clientes.he.id, a.clientes.he.id])
    assert.deepEqual(await ids('HE: carrossel'), [a.clientes.he.id, a.clientes.he.id])
    assert.deepEqual(await ids('carrossel hospital evangélico'), [a.clientes.he.id, a.clientes.he.id])
    assert.deepEqual(await ids('carrossel icc'), [a.clientes.icc.id], 'com o cliente no fim, só as dele')
    // "solto icc": nenhuma do ICC tem "solto", então "icc" volta a ser termo e acha a sem cliente
    assert.deepEqual(await ids('solto icc'), [null])
  })

  test('três descrições plantadas com "[" não travam a busca de outra pessoa', async () => {
    const a = await ambiente()
    const md = `zebralunar ${'['.repeat(99_980)}`
    for (let i = 0; i < 3; i++) await a.criarDemanda({ titulo: `Plantada ${i}`, descricaoMd: md })
    const t0 = performance.now()
    const r = await a.como(a.pessoas.am).get('/api/busca?q=zebra')
    const ms = performance.now() - t0
    assert.equal(r.status, 200)
    assert.equal(r.corpo.demandas.length, 3)
    assert.ok(ms < 300, `${ms.toFixed(1)} ms`)
  })
})
