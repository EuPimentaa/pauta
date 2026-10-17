/** Enviar ao cliente, texto para WhatsApp e links da demanda (F2, API.md §4.16 e §6). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { EnviarAoClienteSaida, LinkPublicoComUrl } from '../../shared/tipos/index.ts'
import { todos, um } from '../src/db.ts'
import { eventos, ultimoSeq } from './ajuda.ts'
import { ambiente, enviarAoCliente, enviarPng, entregar, linkDrive, publico, situacaoDrive, tokenDe } from './ciclo-ajuda.ts'

describe('POST /api/demandas/:id/enviar', () => {
  test('sem cliente ou sem versão → 422; equipe → 403; por fora exige o canal', async () => {
    const a = await ambiente()
    const semCliente = await a.criarDemanda({ clienteId: null })
    const am = a.como(a.pessoas.am)
    const r1 = await am.post(`/api/demandas/${semCliente.id}/enviar`, { via: 'fora', canal: 'whatsapp' })
    assert.equal(r1.status, 422)
    assert.equal(r1.corpo.erro.mensagem, 'Escolha o cliente antes de enviar.')
    const semVersao = await a.criarDemanda()
    const r2 = await am.post(`/api/demandas/${semVersao.id}/enviar`, { via: 'link' })
    assert.equal(r2.status, 422)
    assert.equal(r2.corpo.erro.mensagem, 'Entregue uma versão antes de enviar.')
    const entregue = await a.criarDemanda({ ate: 'entregue' })
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${entregue.id}/enviar`, { via: 'link' })).status, 403)
    assert.equal((await am.post(`/api/demandas/${entregue.id}/enviar`, { via: 'fora' })).status, 400)
    assert.equal((await am.post(`/api/demandas/${entregue.id}/enviar`, { via: 'fora', canal: 'whatsapp', versaoId: 'outra' })).corpo.erro.codigo, 'versao_desatualizada')
  })

  test('envio grava o quadro de antes da automação; sem automação não move; o primeiro envio fica na versão', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ quadroId: a.quadros.social.quadro.id, ate: 'entregue' })
    const seq = ultimoSeq(a.db)
    const s = await enviarAoCliente(a, d, { via: 'fora' })
    assert.equal(s.automacao, false)
    assert.equal(s.envio.quadroId, a.quadros.social.quadro.id)
    assert.equal(s.envio.canal, 'whatsapp')
    assert.equal(s.envio.contatoId, a.clientes.he.contatos[0]!.id)
    assert.equal(s.envio.prazoRetorno, '2026-10-16')
    assert.equal(s.link, null)
    assert.equal(s.demanda.colunaId, d.colunaId)
    assert.equal(s.demanda.versaoEnviadaId, d.versaoAtualId)
    assert.match(s.textoWhatsapp, /^Olá, Fulana\. Segue Post de outubro \(V1\) para aprovação\. Prazo para retorno: sex, 16\/10, 18h\.$/)
    const v = um<{ enviada_cliente_em: string; enviada_via: string }>(a.db, 'SELECT enviada_cliente_em, enviada_via FROM versao WHERE id = ?', d.versaoAtualId)!
    assert.equal(v.enviada_via, 'fora')
    const evs = eventos(a.db, seq)
    assert.ok(evs.some((e) => e.entidade === 'envio'))
    assert.ok(evs.some((e) => e.entidade === 'versao'))
    assert.ok(evs.some((e) => e.entidade === 'demanda' && e.campos?.includes('envioPendenteEm')))
    // reenviar a mesma versão por link: o primeiro envio continua "por fora"
    const link = await enviarAoCliente(a, s.demanda, { via: 'link' })
    assert.ok(link.link)
    assert.equal(um<{ enviada_via: string }>(a.db, 'SELECT enviada_via FROM versao WHERE id = ?', d.versaoAtualId)!.enviada_via, 'fora')
  })

  test('por link reaproveita o link ativo do contato; outro contato ganha outro link; contato de outro cliente → 400', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue' })
    const um1 = await enviarAoCliente(a, d)
    const dois = await enviarAoCliente(a, um1.demanda)
    assert.equal(dois.link!.id, um1.link!.id)
    assert.equal(dois.link!.url, um1.link!.url)
    const semContato = await enviarAoCliente(a, dois.demanda, { contatoId: null })
    assert.notEqual(semContato.link!.id, um1.link!.id)
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/enviar`, { via: 'link', contatoId: a.clientes.icc.contatos[0]!.id })
    assert.equal(r.status, 400)
    // o link_publico só vai ao atendimento e ao admin
    const pubs = todos<{ publico: string }>(a.db, `SELECT publico FROM evento WHERE entidade = 'link_publico'`)
    assert.ok(pubs.length > 0 && pubs.every((p) => p.publico === 'gestao'))
    assert.equal(um<{ n: number }>(a.db, `SELECT count(*) AS n FROM atividade WHERE tipo = 'link.gerado'`)!.n, 2)
  })

  test('Drive privado → 422 drive_privado com os itens, e nada é gravado; por fora passa', async () => {
    const a = await ambiente()
    situacaoDrive('privado-9999', 'privado')
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const v = await entregar(a, d, { itens: [{ tipo: 'link', url: linkDrive('privado-9999'), nome: 'Arte' }] })
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/enviar`, { via: 'link' })
    assert.equal(r.status, 422)
    assert.equal(r.corpo.erro.codigo, 'drive_privado')
    assert.deepEqual(r.corpo.erro.detalhes.itens.map((i: { nome: string }) => i.nome), ['Arte'])
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM envio')!.n, 0)
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM link_publico')!.n, 0)
    // "[Enviar arquivo (até 10 MB)]": com um arquivo na versão o link passa, e a página deixa o Drive privado de fora
    const comArquivo = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id, titulo: 'Banner' })
    const v2 = await entregar(a, comArquivo, { itens: [{ tipo: 'link', url: linkDrive('privado-9999'), nome: 'Arte' }] })
    await a.como(a.pessoas.design).post(`/api/versoes/${v2.versao.id}/itens`, { itens: [{ tipo: 'arquivo', arquivoId: enviarPng(a, a.pessoas.design) }] })
    const passou = await a.como(a.pessoas.am).post(`/api/demandas/${comArquivo.id}/enviar`, { via: 'link' })
    assert.equal(passou.status, 200, passou.texto)
    const pag = (await publico(a).pagina(tokenDe(passou.corpo.link.url))).corpo
    assert.deepEqual(pag.itens[0].versao.itens.map((i: { tipo: string }) => i.tipo), ['arquivo'])
    // o compartilhamento foi aberto: testar de novo libera
    situacaoDrive('privado-9999', 'publico')
    const ok = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/enviar`, { via: 'link' })
    assert.equal(ok.status, 200, ok.texto)
    assert.equal(v.versao.id, (ok.corpo as EnviarAoClienteSaida).envio.versaoId)
  })

  test('prazo de retorno não passa da véspera útil da publicação; versão já decidida → 409 ja_decidida', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue', publicacaoData: '2026-10-15' })
    const s = await enviarAoCliente(a, d, { via: 'fora' })
    assert.equal(s.envio.prazoRetorno, '2026-10-14')
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/aprovado-whatsapp`, {})
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/enviar`, { via: 'fora', canal: 'email' })
    assert.equal(r.status, 409)
    assert.equal(r.corpo.erro.codigo, 'ja_decidida')
  })
})

describe('texto para WhatsApp e links', () => {
  test('envio, lembrete (mesmo link), aprovado e ajuste; sem envio → 409; equipe → 403', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue' })
    const am = a.como(a.pessoas.am)
    assert.equal((await am.get(`/api/demandas/${d.id}/whatsapp?modelo=lembrete`)).status, 409)
    const s = await enviarAoCliente(a, d)
    const lembrete = (await am.get(`/api/demandas/${d.id}/whatsapp?modelo=lembrete`)).corpo
    assert.equal(lembrete.linkUrl, s.link!.url)
    assert.equal(lembrete.texto, `Olá, Fulana. Passando para lembrar de Post de outubro (V1), que aguarda o seu retorno: ${s.link!.url}`)
    assert.equal((await am.get(`/api/demandas/${d.id}/whatsapp?modelo=envio`)).corpo.texto, s.textoWhatsapp)
    assert.equal((await am.get(`/api/demandas/${d.id}/whatsapp?modelo=aprovado`)).status, 409)
    await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['x'] })
    assert.equal((await am.get(`/api/demandas/${d.id}/whatsapp?modelo=ajuste`)).corpo.texto,
      'Obrigado, Fulana. Recebemos os ajustes de Post de outubro. A V2 fica pronta até qui, 15/10, 18h.')
    assert.equal((await am.get(`/api/demandas/${d.id}/whatsapp?modelo=xpto`)).status, 400)
    assert.equal((await a.como(a.pessoas.design).get(`/api/demandas/${d.id}/whatsapp?modelo=envio`)).status, 403)
  })

  test('links da demanda com a URL; revogar desliga a página (410) e 2× → 409', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue' })
    const s = await enviarAoCliente(a, d)
    const am = a.como(a.pessoas.am)
    const links = (await am.get(`/api/demandas/${d.id}/links`)).corpo as LinkPublicoComUrl[]
    assert.equal(links.length, 1)
    assert.equal(links[0]!.url, s.link!.url)
    assert.equal(links[0]!.ativo, true)
    assert.equal((await a.como(a.pessoas.design).get(`/api/demandas/${d.id}/links`)).status, 403)
    const rev = await am.post(`/api/links-publicos/${links[0]!.id}/revogar`, {})
    assert.equal(rev.status, 200)
    assert.equal(rev.corpo.ativo, false)
    assert.equal((await am.post(`/api/links-publicos/${links[0]!.id}/revogar`, {})).status, 409)
    const pag = await publico(a).pagina(tokenDe(s.link!.url))
    assert.equal(pag.status, 410)
    assert.equal(pag.corpo.erro.mensagem, 'Este link de aprovação não está mais ativo. Peça um novo ao seu atendimento.')
    // o próximo envio por link gera outro
    const novo = await enviarAoCliente(a, s.demanda)
    assert.notEqual(novo.link!.id, links[0]!.id)
  })
})

describe('versão só com caminho de rede', () => {
  test('enviar por link → 422 (o cliente não veria nada); por fora passa', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const v = await entregar(a, d, { itens: [{ tipo: 'caminho', caminho: String.raw`M:\Clientes\HE\2026\SAIDA\Banner V1` }] })
    const am = a.como(a.pessoas.am)
    const r = await am.post(`/api/demandas/${d.id}/enviar`, { via: 'link' })
    assert.equal(r.status, 422, r.texto)
    assert.equal(r.corpo.erro.codigo, 'estado_invalido')
    assert.equal(r.corpo.erro.detalhes.motivo, 'sem_itens_visiveis')
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM link_publico')!.n, 0)
    const fora = await am.post(`/api/demandas/${d.id}/enviar`, { via: 'fora', canal: 'whatsapp' })
    assert.equal(fora.status, 200, fora.texto)
    assert.equal(fora.corpo.envio.versaoId, v.versao.id)
  })
})
