/** Criação rápida (API.md §4.13): marcadores, prévia, contexto do filtro, coluna de pessoa e erros. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { um } from '../src/db.ts'
import { ambiente, eventos, notificacoesDe, ultimoSeq } from './ajuda.ts'
import { criarPessoa, rafaEAna } from './entrada-ajuda.ts'

describe('POST /api/demandas/rapida', () => {
  test('"HE: Carrossel @rafa @ana" → cliente HE, membros Rafa e Ana, título "Carrossel"', async () => {
    const a = await ambiente()
    const { rafa, ana } = rafaEAna(a)
    const fila = a.coluna('criacao', 'Fila')
    const seq = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.am).post('/api/demandas/rapida', { texto: 'HE: Carrossel @rafa @ana', colunaId: fila.id })
    assert.equal(r.status, 201)
    const d = r.corpo.demanda
    assert.equal(d.titulo, 'Carrossel')
    assert.equal(d.clienteId, a.clientes.he.id)
    assert.deepEqual(d.membroIds, [rafa.id, ana.id])
    assert.equal(d.origem, 'rapida')
    assert.equal(d.colunaId, fila.id)
    assert.equal(d.atendimentoId, a.pessoas.am.id, 'o AM vem do cliente')
    assert.equal(r.corpo.analise.previa, 'HE · Rafa · Ana · Fila')
    assert.deepEqual(r.corpo.analise.marcadores.map((m: { tipo: string; texto: string }) => [m.tipo, m.texto]),
      [['cliente', 'HE:'], ['membro', '@rafa'], ['membro', '@ana']])
    // atividade, SSE e notificações de POST /api/demandas
    const atividade = um<{ dados: string }>(a.db, "SELECT dados FROM atividade WHERE tipo = 'demanda.criada' AND demanda_id = ?", d.id)!
    assert.equal(JSON.parse(atividade.dados).origem, 'rapida')
    const ev = eventos(a.db, seq).find((e) => e.entidade === 'demanda' && e.entidade_id === d.id)
    assert.ok(ev && ev.campos === null, 'a demanda inteira vai no evento')
    assert.equal(notificacoesDe(a.db, rafa.id).filter((n) => n.tipo === 'membro').length, 1)
    assert.equal(notificacoesDe(a.db, ana.id).filter((n) => n.tipo === 'membro').length, 1)
  })

  test('"he outubro" não vira marcador; marcador sem espaço depois dos dois pontos também não', async () => {
    const a = await ambiente()
    const fila = a.coluna('criacao', 'Fila')
    const eu = a.como(a.pessoas.design)
    const r1 = await eu.post('/api/demandas/rapida', { texto: 'he outubro', colunaId: fila.id })
    assert.equal(r1.status, 201)
    assert.equal(r1.corpo.demanda.titulo, 'he outubro')
    assert.equal(r1.corpo.demanda.clienteId, null)
    assert.equal(r1.corpo.analise.siglaNova, null)
    const r2 = await eu.post('/api/demandas/rapida', { texto: 'HE:15 posts', colunaId: fila.id })
    assert.equal(r2.corpo.demanda.clienteId, null)
    assert.equal(r2.corpo.demanda.titulo, 'HE:15 posts')
  })

  test('os três formatos do cliente, o apelido com espaço e [HE] no meio', async () => {
    const a = await ambiente()
    const fila = a.coluna('criacao', 'Fila')
    const eu = a.como(a.pessoas.design)
    for (const [texto, titulo] of [
      ['[HE] Banner', 'Banner'], ['HE - Banner', 'Banner'], ['hospital evangélico: Banner', 'Banner'], ['Banner [he] maio', 'Banner maio'],
      ['  he:  Banner  ', 'Banner'],
    ] as const) {
      const r = await eu.post('/api/demandas/rapida', { texto, colunaId: fila.id })
      assert.equal(r.status, 201, texto)
      assert.equal(r.corpo.demanda.clienteId, a.clientes.he.id, texto)
      assert.equal(r.corpo.demanda.titulo, titulo, texto)
    }
  })

  test('"XYZ: Banner" com XYZ desconhecida → siglaNova e o texto fica no título; minúsculas não oferecem', async () => {
    const a = await ambiente()
    const fila = a.coluna('criacao', 'Fila')
    const eu = a.como(a.pessoas.design)
    const p = await eu.post('/api/demandas/rapida/previa', { texto: 'XYZ: Banner', colunaId: fila.id })
    assert.equal(p.status, 200)
    assert.equal(p.corpo.siglaNova, 'XYZ')
    assert.equal(p.corpo.titulo, 'XYZ: Banner')
    assert.equal(p.corpo.clienteId, null)
    const r = await eu.post('/api/demandas/rapida', { texto: 'XYZ: Banner', colunaId: fila.id })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.analise.siglaNova, 'XYZ')
    assert.equal(r.corpo.demanda.titulo, 'XYZ: Banner')
    const minusculas = await eu.post('/api/demandas/rapida/previa', { texto: 'obs: ver depois', colunaId: fila.id })
    assert.equal(minusculas.corpo.siglaNova, null)
    const palavra = await eu.post('/api/demandas/rapida/previa', { texto: '[URGENTE] Banner', colunaId: fila.id })
    assert.equal(palavra.corpo.siglaNova, null)
  })

  test('sem cliente cria normalmente (sem AM para a equipe); @ desconhecido fica no título', async () => {
    const a = await ambiente()
    const fila = a.coluna('criacao', 'Fila')
    const r = await a.como(a.pessoas.design).post('/api/demandas/rapida', { texto: 'Ideia de post @ninguem', colunaId: fila.id })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.demanda.clienteId, null)
    assert.equal(r.corpo.demanda.atendimentoId, null)
    assert.equal(r.corpo.demanda.titulo, 'Ideia de post @ninguem')
    assert.deepEqual(r.corpo.demanda.membroIds, [])
  })

  test('clienteId do contexto vale sem marcador e o marcador vence', async () => {
    const a = await ambiente()
    const fila = a.coluna('criacao', 'Fila')
    const eu = a.como(a.pessoas.am)
    const r1 = await eu.post('/api/demandas/rapida', { texto: 'Post de outubro', colunaId: fila.id, clienteId: a.clientes.icc.id })
    assert.equal(r1.corpo.demanda.clienteId, a.clientes.icc.id)
    assert.equal(r1.corpo.demanda.atendimentoId, a.pessoas.am2.id)
    const r2 = await eu.post('/api/demandas/rapida', { texto: 'HE: Post de outubro', colunaId: fila.id, clienteId: a.clientes.icc.id })
    assert.equal(r2.corpo.demanda.clienteId, a.clientes.he.id)
    assert.equal(r2.corpo.demanda.titulo, 'Post de outubro')
  })

  test('na coluna de uma pessoa ela entra como membro e aparece na prévia; posição no fim ou a pedida', async () => {
    const a = await ambiente()
    const col = a.coluna('criacao', 'Design')
    const eu = a.como(a.pessoas.am)
    const p = await eu.post('/api/demandas/rapida/previa', { texto: 'HE: Post', colunaId: col.id })
    assert.deepEqual(p.corpo.membroIds, [a.pessoas.design.id])
    assert.equal(p.corpo.previa, 'HE · Design', 'a pessoa da coluna não se repete como coluna')
    const r1 = await eu.post('/api/demandas/rapida', { texto: 'Um', colunaId: col.id })
    const r2 = await eu.post('/api/demandas/rapida', { texto: 'Dois', colunaId: col.id })
    assert.deepEqual(r1.corpo.demanda.membroIds, [a.pessoas.design.id])
    assert.ok(r2.corpo.demanda.posicao > r1.corpo.demanda.posicao, 'Enter seguido: cada uma no fim')
    const topo = await eu.post('/api/demandas/rapida', { texto: 'Zero', colunaId: col.id, posicao: { depoisDeId: null } })
    assert.ok(topo.corpo.demanda.posicao < r1.corpo.demanda.posicao)
  })

  test('a prévia não cria nada; pessoa desativada e apelido repetido não casam', async () => {
    const a = await ambiente()
    criarPessoa(a, { nome: 'Lia Antiga', apelido: 'Lia', ativo: false })
    criarPessoa(a, { nome: 'Bruno Alves', apelido: null })
    criarPessoa(a, { nome: 'Bruno Dias', apelido: null })
    const fila = a.coluna('criacao', 'Fila')
    const antes = um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM demanda')!.n
    const p = await a.como(a.pessoas.am).post('/api/demandas/rapida/previa', { texto: 'Post @lia @bruno @Pri', colunaId: fila.id })
    assert.equal(p.status, 200)
    assert.deepEqual(p.corpo.membroIds, [a.pessoas.am.id], '@Pri casa o apelido sem caixa; Lia está desativada; dois Brunos')
    assert.equal(p.corpo.titulo, 'Post @lia @bruno')
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM demanda')!.n, antes)
  })

  test('primeiro nome vale para quem não tem apelido', async () => {
    const a = await ambiente()
    const marta = criarPessoa(a, { nome: 'Márta Nunes', apelido: null })
    const p = await a.como(a.pessoas.am).post('/api/demandas/rapida/previa', { texto: 'Post @marta', colunaId: a.coluna('criacao', 'Fila').id })
    assert.deepEqual(p.corpo.membroIds, [marta.id])
    assert.equal(p.corpo.titulo, 'Post')
  })

  test('coluna arquivada → 422; quadro arquivado → 422; coluna inexistente e título vazio → 400', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const nova = await admin.post(`/api/quadros/${a.quadros.criacao.quadro.id}/colunas`, { nome: 'Velha' })
    assert.equal(nova.status, 201)
    assert.equal((await admin.post(`/api/colunas/${nova.corpo.id}/arquivar`)).status, 200)
    const eu = a.como(a.pessoas.design)
    const arq = await eu.post('/api/demandas/rapida', { texto: 'Post', colunaId: nova.corpo.id })
    assert.equal(arq.status, 422)
    assert.equal(arq.corpo.erro.codigo, 'estado_invalido')
    assert.equal((await eu.post('/api/demandas/rapida/previa', { texto: 'Post', colunaId: nova.corpo.id })).status, 422)
    assert.equal((await eu.post('/api/demandas/rapida', { texto: 'Post', colunaId: 'nao-existe' })).status, 400)
    const vazio = await eu.post('/api/demandas/rapida', { texto: 'HE: @design', colunaId: a.coluna('criacao', 'Fila').id })
    assert.equal(vazio.status, 400)
    assert.equal(vazio.corpo.erro.codigo, 'validacao')
    assert.equal((await admin.post(`/api/quadros/${a.quadros.social.quadro.id}/arquivar`)).status, 200)
    const social = await eu.post('/api/demandas/rapida', { texto: 'Post', colunaId: a.coluna('social', 'Fila').id })
    assert.equal(social.status, 422)
  })

  test('limite do texto e sem sessão', async () => {
    const a = await ambiente()
    const fila = a.coluna('criacao', 'Fila')
    assert.equal((await a.como(a.pessoas.am).post('/api/demandas/rapida', { texto: 'x'.repeat(1001), colunaId: fila.id })).status, 400)
    const r = await a.app.request('/api/demandas/rapida/previa', { method: 'POST' })
    assert.equal(r.status, 403, 'sem X-Trace-Id e Origin: o anti-CSRF recusa antes')
  })
})
