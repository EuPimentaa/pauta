import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ajuda.ts'

test('fixture: quadros, colunas, automações, clientes e seguidores', async () => {
  const a = await ambiente()
  assert.deepEqual(a.quadros.criacao.colunas.map((c) => c.nome), ['Fila', 'Design', 'Design2', 'Pronto', 'Concluído'])
  assert.equal(a.coluna('criacao', 'Design').responsavelId, a.pessoas.design.id)
  assert.equal(a.quadros.criacao.quadro.colunaPorMembro, true)
  assert.deepEqual(a.quadros.atendimento.colunas.map((c) => c.nome), ['A fazer', 'Fazendo', 'Revisão', 'Com o cliente', 'Concluído'])
  assert.deepEqual(a.quadros.atendimento.automacoes.map((x) => x.gatilho).sort(), ['ajuste_pedido', 'enviado_ao_cliente'])
  assert.deepEqual(a.quadros.criacao.automacoes.map((x) => x.gatilho).sort(), ['ajuste_pedido', 'aprovado', 'enviado_ao_cliente'])
  assert.deepEqual(a.quadros.social.colunas.map((c) => c.nome), ['Fila', 'Agendar', 'Publicado'])
  assert.equal(a.clientes.he.atendimentoId, a.pessoas.am.id)
  assert.deepEqual(a.clientes.he.apelidos.sort(), ['he', 'hospital evangelico'])
  assert.deepEqual(a.clientes.he.pendencias, [])
  const d = await a.criarDemanda({ ate: 'anulada' })
  assert.equal(d.nVersoes, 1)
  assert.ok(d.envioPendenteEm)
  const r = await a.como(a.pessoas.design).get('/api/bootstrap')
  assert.equal(r.status, 200)
  assert.ok(r.corpo.eu.seguindo.includes(a.quadros.criacao.quadro.id))
})
