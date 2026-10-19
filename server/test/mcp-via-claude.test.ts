/** F7 · "via Claude" (API.md §F.6): traço na mesma transação, histórico, comentário, SSE e notificação. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atorDe } from '../src/auth.ts'
import { todos, tx, um } from '../src/db.ts'
import { gravarAutomacao } from '../src/servicos/automacoes.ts'
import { eventos, ultimoSeq } from './ajuda.ts'
import { ambienteMcp, chamar, conectar } from './mcp-ajuda.ts'

const TRACE = /^mcp-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('criar, editar, mover, comentar e concluir pelo MCP: o histórico marca via claude, inclusive a automação disparada', async () => {
  const amb = await ambienteMcp()
  tx(amb.db, () => gravarAutomacao(amb.db, { quadroId: amb.quadros.criacao.quadro.id, gatilho: 'concluida',
    destinoColunaId: amb.coluna('criacao', 'Pronto').id, ator: atorDe(amb.pessoas.admin) }))
  const c = await conectar(amb, amb.pessoas.design)
  const seq = ultimoSeq(amb.db)
  await chamar(amb, c.at, 'criar_demanda', { titulo: 'Pelo Claude', quadro: 'criacao', membros: ['pri'] })
  await chamar(amb, c.at, 'editar_demanda', { numero: 1, prazo: '2026-10-20' })
  await chamar(amb, c.at, 'mover_demanda', { numero: 1, coluna: '@design2' })
  await chamar(amb, c.at, 'comentar', { numero: 1, texto: 'Feito' })
  await chamar(amb, c.at, 'concluir_demanda', { numero: 1 })
  const id = um<{ id: string }>(amb.db, 'SELECT id FROM demanda WHERE numero = 1')!.id

  const h = await amb.como(amb.pessoas.am).get(`/api/demandas/${id}/historico`)
  assert.equal(h.status, 200)
  const itens = h.corpo.itens as { tipo: string; via?: string; atorId: string }[]
  assert.ok(itens.length >= 6)
  for (const a of itens) {
    assert.equal(a.via, 'claude', a.tipo)
    assert.equal(a.atorId, amb.pessoas.design.id)
  }
  assert.equal(itens.filter((a) => a.tipo === 'demanda.movida').length, 2)
  assert.ok(itens.some((a) => a.tipo === 'demanda.concluida'))
  // a automação 'concluida' moveu para Pronto: o que ela registrou também é do mesmo trace
  const traces = new Set(todos<{ trace_id: string }>(amb.db, 'SELECT trace_id FROM atividade WHERE demanda_id = ?', id).map((l) => l.trace_id))
  for (const t of traces) assert.match(t, TRACE)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n, 5)
  const ferramentas = todos<{ ferramenta: string }>(amb.db, 'SELECT ferramenta FROM mcp_traco ORDER BY criado_em, rowid').map((l) => l.ferramenta)
  assert.deepEqual(ferramentas.sort(), ['comentar', 'concluir_demanda', 'criar_demanda', 'editar_demanda', 'mover_demanda'])

  // SSE: t = o trace mcp-…, a = a pessoa
  const ev = eventos(amb.db, seq).filter((e) => e.entidade === 'demanda')
  assert.ok(ev.length > 0)
  for (const e of ev) {
    if (e.trace_id === null) continue
    assert.match(e.trace_id, TRACE)
    assert.equal(e.ator_id, amb.pessoas.design.id)
  }
  const evComentario = eventos(amb.db, seq).find((e) => e.entidade === 'comentario')!
  assert.equal((evComentario.patch as any).via, 'claude')
  const lista = await amb.como(amb.pessoas.am).get(`/api/demandas/${id}/comentarios`)
  assert.equal(lista.corpo[0].via, 'claude')
  // notificação: "Design via Claude pôs você em #1"
  const n = um<{ resumo: string }>(amb.db, "SELECT resumo FROM notificacao WHERE tipo = 'membro' AND usuario_id = ?", amb.pessoas.am.id)!
  assert.equal(n.resumo, 'Design via Claude pôs você em #1 Pelo Claude')
})

test('o mesmo pela tela: via ausente; leitura não grava traço; ferramenta que falha não deixa traço', async () => {
  const amb = await ambienteMcp()
  const d = await amb.criarDemanda({ titulo: 'Pela tela' })
  const tela = amb.como(amb.pessoas.design)
  await tela.post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Pela tela' })
  await tela.post(`/api/demandas/${d.id}/concluir`, { concluida: true })
  const h = await tela.get(`/api/demandas/${d.id}/historico`)
  for (const a of h.corpo.itens) assert.equal(a.via, undefined)
  assert.equal((await tela.get(`/api/demandas/${d.id}/comentarios`)).corpo[0].via, undefined)

  const c = await conectar(amb, amb.pessoas.design)
  await chamar(amb, c.at, 'ler_demanda', { numero: d.numero })
  await chamar(amb, c.at, 'minhas_demandas')
  await chamar(amb, c.at, 'buscar_demandas', { texto: 'tela' })
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n, 0)
  const falha = await chamar(amb, c.at, 'criar_demanda', { titulo: 'X', quadro: 'criacao', prazo: '2026-10-10', inicio: '2026-10-20' })
  assert.equal(falha.erro, true)
  assert.equal(falha.texto, 'O início vem depois do prazo.')
  const regra = await chamar(amb, c.at, 'arquivar_demanda', { numero: d.numero, arquivar: false })
  assert.equal(regra.erro, false)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n, 1)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM demanda')!.n, 1)
})

test('o trace de outra pessoa não marca (a junção exige o mesmo usuário)', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  await chamar(amb, c.at, 'criar_demanda', { titulo: 'Do Claude', quadro: 'criacao' })
  const trace = um<{ trace_id: string }>(amb.db, 'SELECT trace_id FROM mcp_traco')!.trace_id
  const d = um<{ id: string }>(amb.db, 'SELECT id FROM demanda')!
  // a mesma string de trace, gravada por outra pessoa (o navegador não manda esse formato; aqui à mão)
  tx(amb.db, () => {
    const ator = { ...atorDe(amb.pessoas.social), traceId: trace }
    amb.db.prepare("INSERT INTO atividade (demanda_id, ator_id, ator_tipo, tipo, dados, trace_id, criado_em) VALUES (?, ?, 'usuario', 'demanda.editada', '{\"campos\":[]}', ?, ?)")
      .run(d.id, ator.usuario.id, trace, '2026-10-14T13:00:01.000Z')
  })
  const h = await amb.como(amb.pessoas.am).get(`/api/demandas/${d.id}/historico`)
  const daSocial = h.corpo.itens.find((a: any) => a.atorId === amb.pessoas.social.id)
  assert.equal(daSocial.via, undefined)
  assert.ok(h.corpo.itens.some((a: any) => a.via === 'claude'))
})
