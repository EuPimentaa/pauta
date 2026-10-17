/**
 * Página pública (F2, API.md §4.17): GET sem efeito, o que o cliente vê, link inativo, URL assinada, limite por
 * IP+token, POST /visto e os cabeçalhos no-store/noindex/no-referrer na API e no HTML de /a/:token.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PaginaAprovacao } from '../../shared/tipos/index.ts'
import { criarApp } from '../src/app.ts'
import { agora, rodar, um } from '../src/db.ts'
import { servirWeb } from '../src/web.ts'
import { ambiente, enviarAoCliente, enviarPng, entregar, linkDrive, publico, tokenDe } from './ciclo-ajuda.ts'

async function comLink() {
  const a = await ambiente()
  const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
  const v = await entregar(a, d, { nota: 'Primeira proposta', itens: [
    { tipo: 'link', url: linkDrive('arte-v1-publica') },
    { tipo: 'caminho', caminho: 'M:\\Clientes\\HE\\post.png' },
    { tipo: 'arquivo', arquivoId: enviarPng(a, a.pessoas.design, 'post.png') },
  ] })
  const s = await enviarAoCliente(a, v.demanda)
  return { a, d, v, s, token: tokenDe(s.link!.url) }
}

describe('GET /api/publico/a/:token', () => {
  test('sem efeito colateral; só o que foi enviado por este link; caminho de rede nunca aparece; arquivo por URL assinada', async () => {
    const { a, d, token } = await comLink()
    const antes = um<{ acessos: number; ultimo_acesso_em: string | null }>(a.db, 'SELECT acessos, ultimo_acesso_em FROM link_publico')!
    const r = await publico(a).pagina(token)
    assert.equal(r.status, 200, r.texto)
    const depois = um<{ acessos: number; ultimo_acesso_em: string | null }>(a.db, 'SELECT acessos, ultimo_acesso_em FROM link_publico')!
    assert.deepEqual(depois, antes)
    const p = r.corpo
    assert.equal(p.cliente.sigla, 'HE')
    assert.equal(p.contato!.nome, 'Fulana')
    assert.equal(p.itens.length, 1)
    const item = p.itens[0]!
    assert.equal(item.numero, d.numero)
    assert.equal(item.decisao, null)
    assert.equal(item.proximoPasso, null)
    assert.equal(item.prazoRetorno, '2026-10-16')
    assert.equal(item.versao!.nota, 'Primeira proposta')
    assert.deepEqual(item.versao!.itens.map((i) => i.tipo), ['link', 'arquivo'])
    assert.equal(item.versao!.itens[0]!.embutivel, true)
    assert.match(item.versao!.itens[0]!.previaUrl!, /drive\.google\.com\/thumbnail/)
    assert.match(item.versao!.itens[1]!.url, /^\/api\/publico\/arquivos\/[^?]+\?exp=\d+&sig=/)
    assert.equal(item.versao!.itens[1]!.imagem, true)
    assert.ok(!JSON.stringify(p).includes('M:\\\\'))
    // o arquivo abre pela URL assinada (imagem inline) e não pela rota interna
    const arq = await publico(a).get(item.versao!.itens[1]!.previaUrl!)
    assert.equal(arq.status, 200)
    assert.match(arq.headers.get('content-disposition')!, /^inline/)
    assert.equal(arq.headers.get('cache-control'), 'no-store')
    assert.equal((await publico(a).get(`/api/arquivos/${item.versao!.itens[1]!.url.split('/')[4]!.split('?')[0]}`)).status, 401)
  })

  test('versão entregue e não enviada não aparece; comentários: só os visíveis ao cliente e não excluídos, menção como texto', async () => {
    const { a, d, token } = await comLink()
    await entregar(a, (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo.demanda)
    const am = a.como(a.pessoas.am)
    await am.post(`/api/demandas/${d.id}/comentarios`, { corpoMd: `Oi @[Design](mencao:${a.pessoas.design.id}), segue` })
    await am.post(`/api/demandas/${d.id}/comentarios`, { corpoMd: `Fulana, a cor é a da marca, @[Design](mencao:${a.pessoas.design.id}) confirmou.`, visivelCliente: true })
    const apagado = await am.post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Apagar', visivelCliente: true })
    await am.del(`/api/comentarios/${apagado.corpo.comentario.id}`)
    const p = (await publico(a).pagina(token)).corpo as PaginaAprovacao
    assert.equal(p.itens[0]!.versao!.numero, 1, 'a V2 não foi enviada')
    assert.deepEqual(p.itens[0]!.comentarios.map((c) => [c.autor, c.corpoMd]), [['Pri', 'Fulana, a cor é a da marca, @Design confirmou.']])
  })

  test('token desconhecido → 404; expirado → 410; demanda arquivada some do link (410 sem itens)', async () => {
    const { a, d, token } = await comLink()
    assert.equal((await publico(a).pagina('x'.repeat(43))).status, 404)
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/arquivar`, {})
    const r = await publico(a).pagina(token)
    assert.equal(r.status, 410)
    assert.equal(r.corpo.erro.codigo, 'link_inativo')
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/restaurar`, {})
    assert.equal((await publico(a).pagina(token)).status, 200)
    rodar(a.db, 'UPDATE link_publico SET expira_em = ?', agora())
    assert.equal((await publico(a).pagina(token)).status, 410)
  })

  test('URL assinada vencida ou adulterada → 403', async () => {
    const { a, token } = await comLink()
    const url = (await publico(a).pagina(token)).corpo.itens[0]!.versao!.itens[1]!.url
    assert.equal((await publico(a).get(url.replace(/sig=.*/, 'sig=AAAA'))).status, 403)
    a.relogio('2026-10-14T13:11:00.000Z')
    assert.equal((await publico(a).get(url)).status, 403)
  })

  test('31ª requisição no minuto no mesmo IP+token → 429; outro token segue', async () => {
    const { a, token } = await comLink()
    const p = publico(a)
    for (let i = 0; i < 30; i++) assert.equal((await p.pagina(token)).status, 200)
    const r = await p.pagina(token)
    assert.equal(r.status, 429)
    assert.equal(r.corpo.erro.codigo, 'muitas_tentativas')
    assert.equal((await p.pagina('y'.repeat(43))).status, 404, 'outro token não divide o limite')
    a.relogio('2026-10-14T13:01:01.000Z')
    assert.equal((await p.pagina(token)).status, 200)
  })

  test('cabeçalhos no-store, noindex e no-referrer na API e no HTML de /a/:token', async () => {
    const { a, token } = await comLink()
    const r = await publico(a).pagina(token)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.equal(r.headers.get('x-robots-tag'), 'noindex')
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
    const pasta = mkdtempSync(join(tmpdir(), 'pauta-web-'))
    writeFileSync(join(pasta, 'index.html'), '<!doctype html><title>Pauta</title><div id="root"></div>')
    const app = criarApp(a.db)
    servirWeb(app, pasta)
    const html = await app.request(`/a/${token}`)
    assert.equal(html.status, 200)
    assert.equal(html.headers.get('cache-control'), 'no-store')
    assert.equal(html.headers.get('x-robots-tag'), 'noindex')
    assert.equal(html.headers.get('referrer-policy'), 'no-referrer')
    assert.match(await html.text(), /<div id="root">/)
  })
})

describe('POST /api/publico/a/:token/visto', () => {
  test('soma o acesso; link.visto no máximo a cada 6 h; evento só para a gestão; sem X-Trace-Id → 403', async () => {
    const { a, token } = await comLink()
    assert.equal((await publico(a).visto(token)).status, 204)
    assert.equal((await publico(a).visto(token)).status, 204)
    const l = um<{ acessos: number; ultimo_acesso_em: string }>(a.db, 'SELECT acessos, ultimo_acesso_em FROM link_publico')!
    assert.equal(l.acessos, 2)
    assert.ok(l.ultimo_acesso_em)
    const vistos = () => um<{ n: number }>(a.db, `SELECT count(*) AS n FROM atividade WHERE tipo = 'link.visto'`)!.n
    assert.equal(vistos(), 1)
    a.relogio('2026-10-14T19:00:01.000Z')
    await publico(a).visto(token)
    assert.equal(vistos(), 2)
    const semCsrf = await a.app.request(`/api/publico/a/${token}/visto`, { method: 'POST' })
    assert.equal(semCsrf.status, 403)
    assert.equal(um<{ n: number }>(a.db, `SELECT count(*) AS n FROM evento WHERE entidade = 'link_publico' AND publico <> 'gestao'`)!.n, 0)
  })
})
