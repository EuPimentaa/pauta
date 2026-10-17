/**
 * Decisão pela página pública (F2, API.md §4.17): Idempotency-Key por link, identidade, corrida entre versões,
 * decisões simultâneas e a automação do quadro do envio levando a demanda para outro quadro.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PaginaAprovacao } from '../../shared/tipos/index.ts'
import { um } from '../src/db.ts'
import { ambiente, enviarAoCliente, entregar, publico, tokenDe } from './ciclo-ajuda.ts'

async function comLink(opcoes: { contato?: boolean } = {}) {
  const a = await ambiente()
  const d = await a.criarDemanda({ ate: 'entregue' })
  const s = await enviarAoCliente(a, d, opcoes.contato === false ? { contatoId: null } : {})
  const token = tokenDe(s.link!.url)
  const pag = (await publico(a).pagina(token)).corpo as PaginaAprovacao
  return { a, d, s, token, pag, versaoId: pag.itens[0]!.versao!.id }
}

const contagem = (a: Awaited<ReturnType<typeof ambiente>>) => um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM aprovacao')!.n

describe('Idempotency-Key', () => {
  test('mesma chave 2× → uma aprovação e duas 200; mesma chave com outra decisão → 422; sem chave → 400', async () => {
    const { a, d, token, pag, versaoId } = await comLink()
    const chave = randomUUID()
    const corpo = { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId: pag.contato!.id }
    assert.equal((await publico(a).decidir(token, corpo, null)).status, 400)
    const r1 = await publico(a).decidir(token, corpo, chave)
    const r2 = await publico(a).decidir(token, corpo, chave)
    assert.equal(r1.status, 200, r1.texto)
    assert.equal(r2.status, 200, r2.texto)
    assert.equal(contagem(a), 1)
    assert.deepEqual(r2.corpo.item.decisao, r1.corpo.item.decisao)
    const outra = await publico(a).decidir(token, { ...corpo, decisao: 'ajuste', linhas: ['x'] }, chave)
    assert.equal(outra.status, 422)
    assert.equal(outra.corpo.erro.codigo, 'idempotencia')
  })

  test('a mesma chave em outro link é outra decisão', async () => {
    const a = await ambiente()
    const d1 = await a.criarDemanda({ ate: 'entregue' })
    const d2 = await a.criarDemanda({ ate: 'entregue', titulo: 'Banner' })
    const t1 = tokenDe((await enviarAoCliente(a, d1)).link!.url)
    const t2 = tokenDe((await enviarAoCliente(a, d2)).link!.url)
    const p1 = (await publico(a).pagina(t1)).corpo as PaginaAprovacao
    const p2 = (await publico(a).pagina(t2)).corpo as PaginaAprovacao
    const chave = randomUUID()
    assert.equal((await publico(a).decidir(t1, { demandaId: d1.id, versaoId: p1.itens[0]!.versao!.id, decisao: 'aprovado', contatoId: p1.contato!.id }, chave)).status, 200)
    assert.equal((await publico(a).decidir(t2, { demandaId: d2.id, versaoId: p2.itens[0]!.versao!.id, decisao: 'aprovado', contatoId: p2.contato!.id }, chave)).status, 200)
    assert.equal(contagem(a), 2)
  })
})

describe('identidade', () => {
  test('contatoId diferente do link → 400; sem contato o nome é obrigatório (1 a 120) e fica guardado como texto', async () => {
    const { a, d, token, versaoId } = await comLink()
    const outro = await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId: a.clientes.icc.contatos[0]!.id })
    assert.equal(outro.status, 400)
    const semNome = await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado' })
    assert.equal(semNome.status, 400)
    assert.equal((await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', nomeInformado: 'x'.repeat(121) })).status, 400)
    const ok = await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'ajuste', nomeInformado: '  <b>Ciclana</b>\n Souza ', linhas: ['Trocar foto'] })
    assert.equal(ok.status, 200, ok.texto)
    const ap = um<{ nome_informado: string; contato_id: string | null; ip_hmac: string | null; via: string }>(a.db, 'SELECT * FROM aprovacao')!
    assert.equal(ap.nome_informado, '<b>Ciclana</b> Souza')
    assert.equal(ap.contato_id, null)
    assert.equal(ap.via, 'link')
    assert.equal(ok.corpo.item.decisao.nome, '<b>Ciclana</b> Souza')
  })

  test('ajuste sem linha → 400', async () => {
    const { a, d, token, pag, versaoId } = await comLink()
    assert.equal((await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'ajuste', contatoId: pag.contato!.id, linhas: [' ', '•'] })).status, 400)
  })
})

describe('corrida entre versões e decisões', () => {
  test('versão antiga → 409 versao_desatualizada com a versão atual deste link ("Chegou a V2")', async () => {
    const { a, d, token, pag, versaoId } = await comLink()
    const am = a.como(a.pessoas.am)
    await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['x'] })
    const v2 = await entregar(a, (await am.get(`/api/demandas/${d.numero}`)).corpo.demanda, { como: a.pessoas.am })
    await enviarAoCliente(a, v2.demanda)
    const r = await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId: pag.contato!.id })
    assert.equal(r.status, 409)
    assert.equal(r.corpo.erro.codigo, 'versao_desatualizada')
    assert.equal(r.corpo.erro.mensagem, 'Chegou a V2. Veja a versão nova antes de decidir.')
    assert.equal(r.corpo.erro.detalhes.versaoAtual.numero, 2)
    assert.equal(r.corpo.erro.detalhes.versaoAtual.id, v2.versao.id)
  })

  test('última versão enviada por fora → 409 "Esta peça não aguarda mais sua decisão" (sem versão) e a página já diz isso', async () => {
    const { a, d, token, pag, versaoId } = await comLink()
    const am = a.como(a.pessoas.am)
    await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['x'] })
    const v2 = await entregar(a, (await am.get(`/api/demandas/${d.numero}`)).corpo.demanda, { como: a.pessoas.am })
    await enviarAoCliente(a, v2.demanda, { via: 'fora' })
    const r = await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId: pag.contato!.id })
    assert.equal(r.status, 409)
    assert.equal(r.corpo.erro.codigo, 'conflito')
    assert.equal(r.corpo.erro.mensagem, 'Esta peça não aguarda mais sua decisão.')
    assert.equal(r.corpo.erro.detalhes, undefined)
  })

  test('duas decisões simultâneas → uma 200 e uma 409 ja_decidida', async () => {
    const { a, d, token, pag, versaoId } = await comLink()
    const [x, y] = await Promise.all([
      publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId: pag.contato!.id }),
      publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'ajuste', contatoId: pag.contato!.id, linhas: ['Outra cor'] }),
    ])
    assert.deepEqual([x.status, y.status].sort(), [200, 409])
    assert.equal([x, y].find((r) => r.status === 409)!.corpo.erro.codigo, 'ja_decidida')
    assert.equal(contagem(a), 1)
  })

  test('aprovado pelo link com a automação da Criação: vai ao Social › Agendar com "Alteração" mapeada e "Urgente" guardada', async () => {
    const a = await ambiente()
    // sem a automação de envio a demanda espera o cliente na própria Criação
    await a.como(a.pessoas.admin).del(`/api/quadros/${a.quadros.criacao.quadro.id}/automacoes/enviado_ao_cliente`)
    const et = (n: string) => a.quadros.criacao.etiquetas.find((e) => e.nome === n)!.id
    const d = await a.criarDemanda({ ate: 'entregue', etiquetaIds: [et('Urgente'), et('Alteração')] })
    const s = await enviarAoCliente(a, d)
    assert.equal(s.automacao, false)
    const token = tokenDe(s.link!.url)
    const pag = (await publico(a).pagina(token)).corpo as PaginaAprovacao
    const r = await publico(a).decidir(token, { demandaId: d.id, versaoId: pag.itens[0]!.versao!.id, decisao: 'aprovado', contatoId: pag.contato!.id })
    assert.equal(r.status, 200)
    const det = (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo
    assert.equal(det.demanda.colunaId, a.coluna('social', 'Agendar').id)
    const nomes = det.demanda.etiquetaIds.map((id: string) => a.quadros.social.etiquetas.find((e) => e.id === id)?.nome)
    assert.deepEqual(nomes, ['Alteração'])
    const guardada = um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM demanda_etiqueta WHERE demanda_id = ? AND etiqueta_id = ?', d.id, et('Urgente'))!.n
    assert.equal(guardada, 1)
    // a página fica só leitura, com o selo
    const depois = (await publico(a).pagina(token)).corpo as PaginaAprovacao
    assert.equal(depois.itens[0]!.decisao!.decisao, 'aprovado')
    assert.match(depois.itens[0]!.proximoPasso!, /^V1 aprovada por Fulana em 14\/10 às 10:00\.$/)
  })
})
