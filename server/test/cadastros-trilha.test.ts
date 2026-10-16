/** Trilha de aprovações do cliente (API.md §4.10, aba Aprovações). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rodar, um } from '../src/db.ts'
import { ambiente } from './ajuda.ts'

describe('trilha de aprovações do cliente', () => {
  test('inclui anuladas, mais novas primeiro, só do cliente, com versão, quem e via', async () => {
    const a = await ambiente()
    a.relogio('2026-10-14T13:00:00.000Z')
    const anulada = await a.criarDemanda({ titulo: 'Carrossel de outubro', ate: 'anulada' })
    a.relogio('2026-10-15T13:00:00.000Z')
    const aprovada = await a.criarDemanda({ titulo: 'Post do dia das crianças', ate: 'aprovada' })
    a.relogio('2026-10-16T13:00:00.000Z')
    await a.criarDemanda({ titulo: 'Outro cliente', clienteId: a.clientes.icc.id, ate: 'aprovada' })

    const r = await a.como(a.pessoas.design).get(`/api/clientes/${a.clientes.he.id}/aprovacoes`)
    assert.equal(r.status, 200)
    assert.equal(r.corpo.length, 2)
    const [primeiro, segundo] = r.corpo
    assert.equal(primeiro.demanda.numero, aprovada.numero)
    assert.equal(primeiro.demanda.titulo, 'Post do dia das crianças')
    assert.equal(primeiro.decisao, 'aprovado')
    assert.equal(primeiro.via, 'manual')
    assert.equal(primeiro.canal, 'whatsapp')
    assert.equal(primeiro.versaoNumero, 1)
    assert.equal(primeiro.quem, 'Fulana', 'o contato que aprovou')
    assert.equal(primeiro.registradoPor, a.pessoas.am.id)
    assert.equal(primeiro.anuladaEm, null)
    assert.equal(primeiro.criadoEm, '2026-10-15T13:00:00.000Z')
    assert.equal(segundo.demanda.id, anulada.id)
    assert.equal(segundo.anuladaEm, '2026-10-14T13:00:00.000Z', 'a anulada continua na trilha')

    const icc = await a.como(a.pessoas.web).get(`/api/clientes/${a.clientes.icc.id}/aprovacoes`)
    assert.deepEqual(icc.corpo.map((i: { demanda: { titulo: string } }) => i.demanda.titulo), ['Outro cliente'])
  })

  test('sem contato: o nome informado ou "registrado por"; cliente sem decisões → []; inexistente → 404', async () => {
    const a = await ambiente()
    // cliente sem contato padrão: a aprovação registrada fica sem contato
    const sc = await a.como(a.pessoas.am).post('/api/clientes', { sigla: 'SC', nome: 'Sem Contato' })
    await a.criarDemanda({ clienteId: sc.corpo.id, ate: 'aprovada' })
    const r = await a.como(a.pessoas.am).get(`/api/clientes/${sc.corpo.id}/aprovacoes`)
    assert.equal(r.corpo[0].quem, 'registrado por Pri')
    // o nome que a pessoa informou (sem contato cadastrado)
    a.relogio('2026-10-15T13:00:00.000Z')
    const outra = await a.criarDemanda({ clienteId: sc.corpo.id, ate: 'enviada' })
    const v = um<{ id: string }>(a.db, 'SELECT id FROM versao WHERE demanda_id = ?', outra.id)!
    rodar(a.db, `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, nome_informado, registrado_por,
                   quadro_antes_id, coluna_antes_id, criado_em) VALUES ('ap-x', ?, ?, 'aprovado', 'manual', 'reuniao', 'Dona Maria', ?, ?, ?, ?)`,
    outra.id, v.id, a.pessoas.am.id, outra.quadroId, outra.colunaId, '2026-10-15T13:00:00.000Z')
    const r2 = await a.como(a.pessoas.am).get(`/api/clientes/${sc.corpo.id}/aprovacoes`)
    assert.deepEqual(r2.corpo.map((i: { quem: string; canal: string }) => [i.quem, i.canal]),
      [['Dona Maria', 'reuniao'], ['registrado por Pri', 'whatsapp']])

    const vazio = await a.como(a.pessoas.am).get(`/api/clientes/${a.clientes.icc.id}/aprovacoes`)
    assert.deepEqual(vazio.corpo, [])
    assert.equal((await a.como(a.pessoas.am).get('/api/clientes/nao-existe/aprovacoes')).status, 404)
    assert.equal((await a.como(a.pessoas.am).get('/api/clientes/HE/aprovacoes')).status, 404, 'pelo id, não pela sigla')
  })
})
