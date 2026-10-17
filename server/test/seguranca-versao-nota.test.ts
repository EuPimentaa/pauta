/**
 * Segurança 1 (revisão da leva 2): a nota da versão não muda depois do envio ao cliente (409, como acrescentar itens) e
 * a edição de antes do envio fica no histórico (`versao.editada`, com a nota de antes).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Atividade } from '../../shared/tipos/index.ts'
import { fraseAtividade } from '../../shared/logica/modal-atividade.ts'
import { todos, um } from '../src/db.ts'
import { ambiente, enviarAoCliente, entregar } from './ciclo-ajuda.ts'

const atividades = (a: Awaited<ReturnType<typeof ambiente>>, tipo: string) =>
  todos<{ ator_id: string; dados: string; antes: string | null }>(a.db, 'SELECT ator_id, dados, antes FROM atividade WHERE tipo = ? ORDER BY id', tipo)

describe('PATCH /api/versoes/:id depois do envio', () => {
  test('versão enviada ao cliente: autora, atendimento e admin recebem 409 e a nota fica como estava', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const { versao } = await entregar(a, d, { nota: 'Primeira proposta' })
    await enviarAoCliente(a, (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo.demanda)
    for (const quem of [a.pessoas.design, a.pessoas.am, a.pessoas.admin]) {
      const r = await a.como(quem).patch(`/api/versoes/${versao.id}`, { nota: 'Trocada depois do envio' })
      assert.equal(r.status, 409, `${quem.apelido}: ${r.texto}`)
      assert.equal(r.corpo.erro.codigo, 'conflito')
      assert.match(r.corpo.erro.mensagem, /^Esta versão já foi enviada ao cliente/)
    }
    assert.equal(um<{ nota: string }>(a.db, 'SELECT nota FROM versao WHERE id = ?', versao.id)!.nota, 'Primeira proposta')
    assert.equal(atividades(a, 'versao.editada').length, 0)
  })

  test('antes do envio a autora edita, e o histórico guarda quem, qual versão e a nota de antes', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const { versao } = await entregar(a, d, { nota: 'Primeira proposta' })
    const r = await a.como(a.pessoas.design).patch(`/api/versoes/${versao.id}`, { nota: 'Ajustei o contraste' })
    assert.equal(r.status, 200, r.texto)
    assert.equal(r.corpo.nota, 'Ajustei o contraste')
    const [linha, ...resto] = atividades(a, 'versao.editada')
    assert.equal(resto.length, 0)
    assert.equal(linha!.ator_id, a.pessoas.design.id)
    assert.deepEqual(JSON.parse(linha!.dados), { versaoId: versao.id, numero: 1 })
    assert.deepEqual(JSON.parse(linha!.antes!), { nota: 'Primeira proposta' })
    const historico = await a.como(a.pessoas.am).get(`/api/demandas/${d.id}/historico`)
    const editada = historico.corpo.itens.find((x: Atividade) => x.tipo === 'versao.editada') as Atividade
    assert.ok(editada, historico.texto)
    const nomes = { pessoa: () => 'Design', coluna: () => null, quadro: () => null, data: (x: string) => x, eu: null }
    assert.deepEqual(fraseAtividade(editada, nomes), { ator: 'Design', texto: 'editou a nota da V1', grupo: 'entrega' })
    // mandar a mesma nota não é edição
    assert.equal((await a.como(a.pessoas.design).patch(`/api/versoes/${versao.id}`, { nota: 'Ajustei o contraste' })).status, 200)
    assert.equal(atividades(a, 'versao.editada').length, 1)
  })
})
