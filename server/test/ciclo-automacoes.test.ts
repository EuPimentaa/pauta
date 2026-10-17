/** Automações do quadro (F2, API.md §4.8 e §5.5): PUT e DELETE, quem pode, destino em outro quadro e execução. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AutomacaoQuadro } from '../../shared/tipos/index.ts'
import { eventos, ultimoSeq } from './ajuda.ts'
import { ambiente, enviarAoCliente } from './ciclo-ajuda.ts'

describe('PUT e DELETE /api/quadros/:id/automacoes/:gatilho', () => {
  test('admin e atendimento definem; equipe → 403; destino arquivado → 400; gatilho desconhecido → 400; evento automacao', async () => {
    const a = await ambiente()
    const social = a.quadros.social.quadro.id
    const destino = a.coluna('social', 'Publicado').id
    assert.equal((await a.como(a.pessoas.design).put(`/api/quadros/${social}/automacoes/concluida`, { destinoColunaId: destino })).status, 403)
    assert.equal((await a.como(a.pessoas.am).put(`/api/quadros/${social}/automacoes/xpto`, { destinoColunaId: destino })).status, 400)
    const seq = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.am).put(`/api/quadros/${social}/automacoes/concluida`, { destinoColunaId: destino })
    assert.equal(r.status, 200, r.texto)
    const auto = r.corpo as AutomacaoQuadro
    assert.equal(auto.id, `${social}:concluida`)
    assert.equal(auto.destinoQuadroId, social)
    assert.equal(auto.membros, 'manter')
    assert.ok(eventos(a.db, seq).some((e) => e.entidade === 'automacao' && e.entidade_id === auto.id))

    // outro quadro, com o responsável do cliente no destino
    const criacao = a.quadros.criacao.quadro.id
    const outra = await a.como(a.pessoas.admin).put(`/api/quadros/${criacao}/automacoes/aprovado`,
      { destinoColunaId: a.coluna('social', 'Fila').id, membros: 'responsavel_destino' })
    assert.equal(outra.corpo.destinoQuadroId, social)
    assert.equal(outra.corpo.membros, 'responsavel_destino')

    // coluna arquivada não serve de destino
    const nova = await a.como(a.pessoas.am).post(`/api/quadros/${social}/colunas`, { nome: 'Velha' })
    await a.como(a.pessoas.am).post(`/api/colunas/${nova.corpo.id}/arquivar`, {})
    const arq = await a.como(a.pessoas.am).put(`/api/quadros/${social}/automacoes/aprovado`, { destinoColunaId: nova.corpo.id })
    assert.equal(arq.status, 400)

    const seq2 = ultimoSeq(a.db)
    assert.equal((await a.como(a.pessoas.design).del(`/api/quadros/${social}/automacoes/concluida`)).status, 403)
    assert.equal((await a.como(a.pessoas.am).del(`/api/quadros/${social}/automacoes/concluida`)).status, 204)
    assert.equal((await a.como(a.pessoas.am).del(`/api/quadros/${social}/automacoes/concluida`)).status, 204, 'idempotente')
    assert.ok(eventos(a.db, seq2).some((e) => e.entidade === 'automacao' && e.op === 'delete'))
    const boot = (await a.como(a.pessoas.design).get('/api/bootstrap')).corpo
    assert.ok(!boot.automacoes.some((x: AutomacaoQuadro) => x.id === `${social}:concluida`))
  })

  test('a automação "concluida" do Social roda no checkbox; sem a de envio, enviar não move', async () => {
    const a = await ambiente()
    const social = a.quadros.social.quadro.id
    await a.como(a.pessoas.am).put(`/api/quadros/${social}/automacoes/concluida`, { destinoColunaId: a.coluna('social', 'Publicado').id })
    const d = await a.criarDemanda({ quadroId: social })
    const r = await a.como(a.pessoas.social).post(`/api/demandas/${d.id}/concluir`, { concluida: true })
    assert.equal(r.corpo.automacao, true)
    assert.equal(r.corpo.demanda.colunaId, a.coluna('social', 'Publicado').id)

    await a.como(a.pessoas.admin).del(`/api/quadros/${a.quadros.criacao.quadro.id}/automacoes/enviado_ao_cliente`)
    const e = await a.criarDemanda({ ate: 'entregue' })
    const s = await enviarAoCliente(a, e, { via: 'fora' })
    assert.equal(s.automacao, false)
    assert.equal(s.demanda.colunaId, e.colunaId)
  })
})
