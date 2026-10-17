/** Versões (F2, API.md §4.16): entregar, editar a nota, acrescentar itens e o teste de Drive público. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { TestarVersaoSaida, VersaoComItens } from '../../shared/tipos/index.ts'
import { um } from '../src/db.ts'
import { aguardarTestesDrive } from '../src/servicos/ciclo.ts'
import { lerLinkDrive, testarLinkDrive } from '../src/servicos/drive.ts'
import { eventos, notificacoesDe, ultimoSeq } from './ajuda.ts'
import { ambiente, buscasDrive, enviarAoCliente, enviarPng, entregar, linkDrive, situacaoDrive } from './ciclo-ajuda.ts'

describe('POST /api/demandas/:id/versoes (Entregar versão)', () => {
  test('membro entrega: V1 na rodada 1, não muda a coluna, notifica o AM e testa o Drive depois do commit', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const seq = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/versoes`, {
      nota: 'Versão com a foto nova',
      itens: [
        { tipo: 'link', url: linkDrive('arte-final-123') },
        { tipo: 'caminho', caminho: 'M:\\Clientes\\HE\\Saída\\post.png' },
        { tipo: 'arquivo', arquivoId: enviarPng(a, a.pessoas.design, 'post.png') },
        { tipo: 'link', url: 'https://www.figma.com/file/abc/Post' },
      ],
    })
    assert.equal(r.status, 201, r.texto)
    const v = r.corpo.versao as VersaoComItens
    assert.equal(v.numero, 1)
    assert.equal(v.nota, 'Versão com a foto nova')
    assert.deepEqual(v.itens.map((i) => [i.tipo, i.provedor, i.nome]), [
      ['link', 'drive', 'Arquivo no Google Drive'], ['caminho', 'rede', 'post.png'], ['arquivo', 'arquivo', 'post.png'],
      ['link', 'figma', 'Arquivo no Figma'],
    ])
    assert.equal(r.corpo.demanda.colunaId, d.colunaId)
    assert.equal(r.corpo.demanda.nVersoes, 1)
    assert.equal(r.corpo.demanda.versaoAtualId, v.id)
    assert.equal(r.corpo.demanda.versaoEnviadaId, null)
    assert.ok(notificacoesDe(a.db, a.pessoas.am.id).some((n) => n.tipo === 'versao_entregue' && n.resumo === 'Design entregou a V1 de #1 Post de outubro'))
    await aguardarTestesDrive()
    const item = um<{ drive_status: string; previa_url: string }>(a.db, 'SELECT drive_status, previa_url FROM versao_item WHERE id = ?', v.itens[0]!.id)!
    assert.equal(item.drive_status, 'publico')
    assert.equal(item.previa_url, 'https://drive.google.com/thumbnail?id=arte-final-123&sz=w400')
    const evs = eventos(a.db, seq).filter((e) => e.entidade === 'versao')
    assert.equal(evs.length, 2, 'a entrega e o resultado do teste do Drive')
    assert.equal(evs[1]!.trace_id, null, 'o resultado do teste chega também à janela de quem entregou')
    assert.equal(um<{ n: number }>(a.db, `SELECT count(*) AS n FROM atividade WHERE tipo = 'versao.entregue'`)!.n, 1)
  })

  test('equipe que não é membro → 403; AM e atendimento entregam; sem item → 400; arquivada ou aprovada → 422', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const item = [{ tipo: 'link', url: linkDrive('xyz-arquivo-1') }]
    const negado = await a.como(a.pessoas.design2).post(`/api/demandas/${d.id}/versoes`, { itens: item })
    assert.equal(negado.status, 403)
    assert.equal(negado.corpo.erro.mensagem, 'Entre na demanda para entregar.')
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/versoes`, { itens: [] })).status, 400)
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/versoes`, { itens: [{ tipo: 'link', url: 'http://x.com/a' }] })).status, 400)
    assert.equal((await a.como(a.pessoas.am2).post(`/api/demandas/${d.id}/versoes`, { itens: item })).status, 201)
    const aprovada = await a.criarDemanda({ ate: 'aprovada' })
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${aprovada.id}/versoes`, { itens: item })
    assert.equal(r.status, 422)
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/arquivar`, {})
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/versoes`, { itens: item })).status, 422)
  })
})

describe('editar versão e acrescentar itens', () => {
  test('nota: autor e atendimento sim, outra pessoa da equipe não; itens só antes do envio (409 depois)', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const { versao } = await entregar(a, d)
    assert.equal((await a.como(a.pessoas.design2).patch(`/api/versoes/${versao.id}`, { nota: 'x' })).status, 403)
    const r = await a.como(a.pessoas.design).patch(`/api/versoes/${versao.id}`, { nota: 'Ajustei o contraste' })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.nota, 'Ajustei o contraste')
    const mais = await a.como(a.pessoas.am).post(`/api/versoes/${versao.id}/itens`, { itens: [{ tipo: 'arquivo', arquivoId: enviarPng(a, a.pessoas.am) }] })
    assert.equal(mais.status, 201)
    assert.equal(mais.corpo.itens.length, 2)
    await enviarAoCliente(a, (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo.demanda)
    const depois = await a.como(a.pessoas.am).post(`/api/versoes/${versao.id}/itens`, { itens: [{ tipo: 'link', url: 'https://figma.com/x' }] })
    assert.equal(depois.status, 409)
  })
})

describe('teste de Drive público', () => {
  test('da versão: privado bloqueia o envio por link; pasta só avisa; link de fora do Drive não é buscado', async () => {
    const a = await ambiente()
    situacaoDrive('privado-0001', 'privado')
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const { versao } = await entregar(a, d, { itens: [
      { tipo: 'link', url: linkDrive('privado-0001') },
      { tipo: 'link', url: 'https://drive.google.com/drive/folders/pasta-0001' },
      { tipo: 'link', url: 'https://www.youtube.com/watch?v=abc' },
    ] })
    const r = await a.como(a.pessoas.design2).post(`/api/versoes/${versao.id}/testar-drive`, {})
    assert.equal(r.status, 200)
    const s = r.corpo as TestarVersaoSaida
    assert.deepEqual(s.itens.map((i) => i.status), ['privado', 'pasta', 'nao_drive'])
    assert.equal(s.bloqueiaEnvio, true)
    assert.ok(buscasDrive.every((u) => /drive\.google\.com|googleusercontent\.com/.test(u)))
    assert.ok(!buscasDrive.some((u) => u.includes('youtube')))
  })

  test('avulso: não grava nada; mensagens; leitura do link', async () => {
    const a = await ambiente()
    situacaoDrive('erro-00001', 'erro')
    const r = await a.como(a.pessoas.design).post('/api/drive/testar', { url: linkDrive('abc-publico-1') })
    assert.equal(r.corpo.status, 'publico')
    assert.match(r.corpo.previaUrl, /^https:\/\/drive\.google\.com\/thumbnail\?id=abc-publico-1/)
    assert.equal((await a.como(a.pessoas.design).post('/api/drive/testar', { url: linkDrive('erro-00001') })).corpo.status, 'erro')
    assert.equal((await a.como(a.pessoas.design).post('/api/drive/testar', { url: 'https://canva.com/x' })).corpo.status, 'nao_drive')
    assert.deepEqual(lerLinkDrive('https://drive.google.com/open?id=1AbCdEfGhIjK'), { tipo: 'arquivo', id: '1AbCdEfGhIjK' })
    assert.deepEqual(lerLinkDrive('https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjK'), { tipo: 'pasta' })
    assert.equal(lerLinkDrive('https://evil.com/file/d/1AbCdEfGhIjK'), null)
    // redirecionamento para a tela de login (fora do Drive) = privado
    const { definirBuscaDrive } = await import('../src/servicos/drive.ts')
    definirBuscaDrive(async () => ({ status: 302, tipo: null, local: 'https://accounts.google.com/ServiceLogin?continue=x' }))
    assert.equal((await testarLinkDrive(linkDrive('qualquer-1234'))).status, 'privado')
    definirBuscaDrive(async () => { throw new Error('rede') })
    assert.equal((await testarLinkDrive(linkDrive('qualquer-1234'))).status, 'erro')
  })
})
