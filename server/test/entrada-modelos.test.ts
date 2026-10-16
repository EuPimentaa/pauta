/** Modelos de demanda (API.md §4.9): permissões por escopo, nome único, desativar, ordem e "Revisei os modelos". */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lerConfig } from '../src/servicos/config-app.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'

const NOVO = {
  nome: 'Convite digital', descricao: 'Arte de convite para evento.', icone: 'mail', briefingMd: '## Evento\nData, local e horário.',
  prazoDiasUteis: 2, prioridade: 'alta', estimativaMin: 45,
  itens: [{ texto: 'Conferir os dados do evento' }, { checklist: 'Entrega', texto: 'Exportar em PDF' }],
  etiquetas: [{ nome: 'Evento', cor: 'magenta' }, { nome: ' evento ', cor: 'azul' }],
}

describe('modelos de demanda', () => {
  test('global pela equipe → 403; do quadro pela equipe → 201 com itens, etiquetas e o evento', async () => {
    const a = await ambiente()
    const equipe = a.como(a.pessoas.design)
    const global = await equipe.post('/api/modelos-demanda', NOVO)
    assert.equal(global.status, 403)
    assert.equal(global.corpo.erro.codigo, 'sem_permissao')
    const seq = ultimoSeq(a.db)
    const r = await equipe.post('/api/modelos-demanda', { ...NOVO, quadroId: a.quadros.criacao.quadro.id })
    assert.equal(r.status, 201)
    const m = r.corpo
    assert.equal(m.quadroId, a.quadros.criacao.quadro.id)
    assert.equal(m.ativo, true)
    assert.deepEqual(m.itens.map((i: { checklist: string; texto: string }) => [i.checklist, i.texto]),
      [['Checklist', 'Conferir os dados do evento'], ['Entrega', 'Exportar em PDF']])
    assert.deepEqual(m.etiquetas, [{ nome: 'Evento', cor: 'magenta' }], 'nome repetido (sem caixa) fica uma vez')
    const ev = eventos(a.db, seq).find((e) => e.entidade === 'modelo_demanda' && e.entidade_id === m.id)
    assert.ok(ev && ev.campos === null)
    // o modelo do quadro vale na criação
    const d = await a.como(a.pessoas.am).post('/api/demandas', { quadroId: a.quadros.criacao.quadro.id, titulo: 'Convite', modeloId: m.id })
    assert.equal(d.status, 201)
    assert.equal(d.corpo.demanda.nCheckTotal, 2)
    assert.equal(d.corpo.demanda.prioridade, 'alta')
    // e o admin cria global
    assert.equal((await a.como(a.pessoas.admin).post('/api/modelos-demanda', NOVO)).status, 201)
  })

  test('nome repetido no escopo → 409 (sem caixa e sem acento); em outro escopo pode', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const criacao = a.quadros.criacao.quadro.id
    assert.equal((await eu.post('/api/modelos-demanda', { quadroId: criacao, nome: 'Folder' })).status, 201)
    const repetido = await eu.post('/api/modelos-demanda', { quadroId: criacao, nome: 'FÓLDER' })
    assert.equal(repetido.status, 409)
    assert.equal(repetido.corpo.erro.codigo, 'conflito')
    assert.equal((await eu.post('/api/modelos-demanda', { quadroId: a.quadros.social.quadro.id, nome: 'Folder' })).status, 201)
    const admin = a.como(a.pessoas.admin)
    assert.equal((await admin.post('/api/modelos-demanda', { nome: 'carrossel' })).status, 409, 'Carrossel global já existe')
    const outro = await eu.post('/api/modelos-demanda', { quadroId: criacao, nome: 'Outro folder' })
    assert.equal((await eu.patch(`/api/modelos-demanda/${outro.corpo.id}`, { nome: 'folder' })).status, 409)
  })

  test('desativar some do bootstrap e da lista; inativos=1 mostra; reativar confere o nome', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const criacao = a.quadros.criacao.quadro.id
    const m = (await eu.post('/api/modelos-demanda', { quadroId: criacao, nome: 'Cartaz' })).corpo
    assert.ok((await eu.get('/api/bootstrap')).corpo.modelosDemanda.some((x: { id: string }) => x.id === m.id))
    const seq = ultimoSeq(a.db)
    const off = await eu.patch(`/api/modelos-demanda/${m.id}`, { ativo: false })
    assert.equal(off.status, 200)
    assert.equal(off.corpo.ativo, false)
    assert.ok(eventos(a.db, seq).some((e) => e.entidade === 'modelo_demanda' && e.entidade_id === m.id && (e.patch as { ativo: boolean }).ativo === false))
    assert.ok(!(await eu.get('/api/bootstrap')).corpo.modelosDemanda.some((x: { id: string }) => x.id === m.id))
    assert.ok(!(await eu.get('/api/modelos-demanda')).corpo.some((x: { id: string }) => x.id === m.id))
    assert.ok((await eu.get('/api/modelos-demanda?inativos=1')).corpo.some((x: { id: string }) => x.id === m.id))
    // com o nome livre de novo, outro "Cartaz" nasce; reativar o antigo dá 409
    const novo = await eu.post('/api/modelos-demanda', { quadroId: criacao, nome: 'Cartaz' })
    assert.equal(novo.status, 201)
    assert.equal((await eu.patch(`/api/modelos-demanda/${m.id}`, { ativo: true })).status, 409)
    // desativado não vale na criação
    const d = await eu.post('/api/demandas', { quadroId: criacao, titulo: 'X', modeloId: m.id })
    assert.equal(d.status, 400)
  })

  test('editar global pela equipe → 403; listas substituem; ordem; quadro arquivado → 422', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    assert.equal((await eu.patch('/api/modelos-demanda/md-post', { nome: 'Post único' })).status, 403)
    const admin = a.como(a.pessoas.admin)
    const editado = await admin.patch('/api/modelos-demanda/md-post', { itens: [{ texto: 'Só um' }], etiquetas: [], prazoDiasUteis: null })
    assert.equal(editado.status, 200)
    assert.deepEqual(editado.corpo.itens.map((i: { texto: string }) => i.texto), ['Só um'])
    assert.equal(editado.corpo.prazoDiasUteis, null)
    const topo = await admin.patch('/api/modelos-demanda/md-outro', { posicao: { depoisDeId: null } })
    assert.equal(topo.status, 200)
    const globais = (await admin.get('/api/modelos-demanda')).corpo.filter((m: { quadroId: string | null }) => m.quadroId === null)
    assert.equal(globais[0].id, 'md-outro')
    assert.equal((await admin.patch('/api/modelos-demanda/nao-existe', { nome: 'x' })).status, 404)
    const social = a.quadros.social.quadro.id
    const m = (await eu.post('/api/modelos-demanda', { quadroId: social, nome: 'Agenda' })).corpo
    await admin.post(`/api/quadros/${social}/arquivar`)
    assert.equal((await eu.patch(`/api/modelos-demanda/${m.id}`, { nome: 'Agenda 2' })).status, 422)
    assert.equal((await eu.post('/api/modelos-demanda', { quadroId: social, nome: 'Outra' })).status, 422)
    assert.equal((await eu.post('/api/modelos-demanda', { quadroId: 'nao-existe', nome: 'Outra' })).status, 400)
    assert.equal((await eu.post('/api/modelos-demanda', { quadroId: a.quadros.criacao.quadro.id, nome: 'Ícone', icone: 'Image!' })).status, 400)
  })

  test('"Revisei os modelos": equipe e atendimento → 403; admin grava o instante (e de novo)', async () => {
    const a = await ambiente()
    assert.equal((await a.como(a.pessoas.design).post('/api/modelos-demanda/revisados')).status, 403)
    assert.equal((await a.como(a.pessoas.am).post('/api/modelos-demanda/revisados')).status, 403)
    assert.equal(lerConfig(a.db).modelosRevisadosEm, null)
    const r = await a.como(a.pessoas.admin).post('/api/modelos-demanda/revisados')
    assert.equal(r.status, 200)
    assert.equal(r.corpo.modelosRevisadosEm, '2026-10-14T13:00:00.000Z')
    assert.equal(lerConfig(a.db).modelosRevisadosEm, '2026-10-14T13:00:00.000Z')
    a.relogio('2026-10-15T13:00:00.000Z')
    assert.equal((await a.como(a.pessoas.admin).post('/api/modelos-demanda/revisados')).corpo.modelosRevisadosEm, '2026-10-15T13:00:00.000Z')
    assert.equal((await a.como(a.pessoas.admin).get('/api/bootstrap')).corpo.config.modelosRevisadosEm, '2026-10-15T13:00:00.000Z')
  })
})
