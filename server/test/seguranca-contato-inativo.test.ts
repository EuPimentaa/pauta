/**
 * Segurança 3 (revisão da leva 2): desativar ("excluir") um contato revoga os links ativos dele na mesma transação, e o
 * link de um contato inativo vale como link inativo (410) na página, no /visto e na decisão. O retorno pelo link também
 * confere o contato, como o manual.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaginaAprovacao } from '../../shared/tipos/index.ts'
import { rodar, todos, tx, um } from '../src/db.ts'
import { registrarRetorno } from '../src/servicos/ciclo.ts'
import { eventos, ultimoSeq } from './ajuda.ts'
import { ambiente, enviarAoCliente, publico, tokenDe } from './ciclo-ajuda.ts'

async function comLink() {
  const a = await ambiente()
  const d = await a.criarDemanda({ ate: 'entregue' })
  const s = await enviarAoCliente(a, d)
  const token = tokenDe(s.link!.url)
  const pag = (await publico(a).pagina(token)).corpo as PaginaAprovacao
  return { a, d, s, token, pag, contatoId: pag.contato!.id, versaoId: pag.itens[0]!.versao!.id }
}

describe('contato desativado', () => {
  test('PATCH ativo:false revoga os links dele (atividade e evento para a gestão) e a página responde 410', async () => {
    const { a, d, s, token, contatoId, versaoId } = await comLink()
    const seq = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.am).patch(`/api/clientes/${a.clientes.he.id}/contatos/${contatoId}`, { ativo: false })
    assert.equal(r.status, 200, r.texto)
    assert.equal(r.corpo.ativo, false)
    const link = um<{ revogado_em: string | null; revogado_por: string | null }>(a.db, 'SELECT revogado_em, revogado_por FROM link_publico WHERE id = ?', s.link!.id)!
    assert.ok(link.revogado_em, 'o link do contato foi revogado')
    assert.equal(link.revogado_por, a.pessoas.am.id)
    const atividades = todos<{ demanda_id: string; dados: string }>(a.db, `SELECT demanda_id, dados FROM atividade WHERE tipo = 'link.revogado'`)
    assert.deepEqual(atividades.map((x) => [x.demanda_id, JSON.parse(x.dados).linkId]), [[d.id, s.link!.id]])
    const ev = eventos(a.db, seq).filter((e) => e.entidade === 'link_publico')
    assert.equal(ev.length, 1)
    assert.equal(ev[0]!.publico, 'gestao')
    assert.ok(ev[0]!.patch!.revogadoEm)

    const pagina = await publico(a).pagina(token)
    assert.equal(pagina.status, 410)
    assert.equal(pagina.corpo.erro.codigo, 'link_inativo')
    const decisao = await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId })
    assert.equal(decisao.status, 410, decisao.texto)
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM aprovacao')!.n, 0)
  })

  test('link de contato inativo que escapou da revogação (desativado antes desta correção) também é 410', async () => {
    const { a, d, token, contatoId, versaoId } = await comLink()
    rodar(a.db, 'UPDATE cliente_contato SET ativo = 0, padrao = 0 WHERE id = ?', contatoId)
    assert.equal((await publico(a).pagina(token)).status, 410)
    assert.equal((await publico(a).visto(token)).status, 410)
    const r = await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', nomeInformado: 'Luíza' })
    assert.equal(r.status, 410, r.texto)
    assert.equal(r.corpo.erro.codigo, 'link_inativo')
  })

  test('o retorno pelo link confere o contato como o manual (inativo → 400)', async () => {
    const { a, d, s, contatoId } = await comLink()
    rodar(a.db, 'UPDATE cliente_contato SET ativo = 0, padrao = 0 WHERE id = ?', contatoId)
    assert.throws(() => tx(a.db, () => registrarRetorno(a.db, {
      demandaId: d.id, ator: { tipo: 'cliente', usuario: null, papel: null, traceId: null, ip: '200.1.1.1' }, via: 'link',
      decisao: 'aprovado', contatoId, linkId: s.link!.id,
    })), (e: { status?: number }) => e.status === 400)
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM aprovacao')!.n, 0)
  })

  test('desativar outro contato, ou editar o contato sem desativar, não mexe no link', async () => {
    const { a, s, token, contatoId } = await comLink()
    const outro = await a.como(a.pessoas.am).post(`/api/clientes/${a.clientes.he.id}/contatos`, { nome: 'Ciclana' })
    assert.equal(outro.status, 201, outro.texto)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/clientes/${a.clientes.he.id}/contatos/${outro.corpo.id}`, { ativo: false })).status, 200)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/clientes/${a.clientes.he.id}/contatos/${contatoId}`, { cargo: 'Marketing' })).status, 200)
    assert.equal(um<{ r: string | null }>(a.db, 'SELECT revogado_em AS r FROM link_publico WHERE id = ?', s.link!.id)!.r, null)
    assert.equal((await publico(a).pagina(token)).status, 200)
  })
})
