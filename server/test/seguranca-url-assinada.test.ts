/**
 * Segurança 6 (revisão da leva 2): as URLs assinadas da página pública cobriam só id.exp, sem ligação com o link:
 * revogar o link não cortava as URLs já emitidas (até linkPublicoArquivoMinutos). Agora a assinatura inclui o id do link
 * e a rota confere que o link segue ativo e contém aquele arquivo (item de versão enviada por ele ou o logo do cliente).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaginaAprovacao } from '../../shared/tipos/index.ts'
import { tx } from '../src/db.ts'
import { urlAssinada } from '../src/servicos/arquivos.ts'
import { ambiente, enviarAoCliente, enviarPng, entregar, publico, tokenDe } from './ciclo-ajuda.ts'

async function comLink(titulo = 'Post de outubro') {
  const a = await ambiente()
  return { a, ...(await outroLink(a, titulo)) }
}

async function outroLink(a: Awaited<ReturnType<typeof ambiente>>, titulo: string) {
  const d = await a.criarDemanda({ titulo, colunaId: a.coluna('criacao', 'Design').id })
  const arquivoId = enviarPng(a, a.pessoas.design, `${titulo}.png`)
  const v = await entregar(a, d, { itens: [{ tipo: 'arquivo', arquivoId }] })
  const s = await enviarAoCliente(a, v.demanda)
  const token = tokenDe(s.link!.url)
  const pag = (await publico(a).pagina(token)).corpo as PaginaAprovacao
  return { d, arquivoId, linkId: s.link!.id, token, url: pag.itens[0]!.versao!.itens[0]!.url }
}

describe('URL assinada ligada ao link', () => {
  test('a URL leva o id do link; revogar o link corta as URLs já emitidas (410)', async () => {
    const { a, linkId, url } = await comLink()
    assert.equal((await publico(a).get(url)).status, 200)
    assert.equal((await a.como(a.pessoas.am).post(`/api/links-publicos/${linkId}/revogar`, {})).status, 200)
    const r = await publico(a).get(url)
    assert.equal(r.status, 410, r.texto)
    assert.equal(r.corpo.erro.codigo, 'link_inativo')
    assert.match(url, new RegExp(`^/api/publico/arquivos/[^?]+\\?l=${linkId}&exp=\\d+&sig=`))
  })

  test('a assinatura de um link não vale com o id de outro, e o link não serve arquivo que não é dele', async () => {
    const { a, url } = await comLink()
    const outro = await outroLink(a, 'Banner')
    const trocada = url.replace(/l=[^&]+/, `l=${outro.linkId}`)
    assert.equal((await publico(a).get(trocada)).status, 403, 'o id do link entra na assinatura')
    // assinatura certa, mas o arquivo é de outro link
    const alheio = tx(a.db, () => urlAssinada(outro.linkId, enviarPng(a, a.pessoas.design, 'interno.png'), 10))
    assert.equal((await publico(a).get(alheio)).status, 403)
  })

  test('demanda arquivada sai do link: a URL emitida para o arquivo dela deixa de valer (sem item, 410 como a página)', async () => {
    const { a, d, url } = await comLink()
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/arquivar`, {})
    const r = await publico(a).get(url)
    assert.equal(r.status, 410, r.texto)
    assert.equal(r.corpo.erro.codigo, 'link_inativo')
  })

  test('o logo do cliente do link abre; trocado o logo, a URL do antigo deixa de valer', async () => {
    const { a, token } = await comLink()
    const logo1 = enviarPng(a, a.pessoas.am, 'logo.png')
    assert.equal((await a.como(a.pessoas.am).patch(`/api/clientes/${a.clientes.he.id}`, { logoArquivoId: logo1 })).status, 200)
    const url1 = ((await publico(a).pagina(token)).corpo as PaginaAprovacao).cliente.logoUrl!
    assert.ok(url1)
    assert.equal((await publico(a).get(url1)).status, 200)
    const logo2 = enviarPng(a, a.pessoas.am, 'logo-novo.png')
    assert.equal((await a.como(a.pessoas.am).patch(`/api/clientes/${a.clientes.he.id}`, { logoArquivoId: logo2 })).status, 200)
    assert.equal((await publico(a).get(url1)).status, 403)
  })
})
