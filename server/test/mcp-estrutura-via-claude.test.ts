/**
 * Estrutura pelo MCP · "via Claude" (API.md §F.6) e tempo real: `coluna`, `etiqueta` e `criar_cliente` gravam o
 * mcp_traco na mesma transação, o histórico do cliente marca via claude e os eventos SSE são os mesmos da rota (só o
 * trace muda: mcp-… em vez do uuid da tela).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todos, um } from '../src/db.ts'
import { SQL_VIA_ATIVIDADE } from '../src/servicos/modal-comum.ts'
import { eventos, ultimoSeq } from './ajuda.ts'
import { ambienteMcp, chamar, conectar } from './mcp-ajuda.ts'

type Amb = Awaited<ReturnType<typeof ambienteMcp>>

const TRACE_MCP = /^mcp-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const TRACE_TELA = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** O que o navegador recebe de cada evento, sem o id e o trace: entidade, op, público, campos e as chaves do patch. */
function forma(amb: Amb, desde: number): string[] {
  return eventos(amb.db, desde).map((e) => [e.entidade, e.op, e.publico, JSON.stringify(e.campos),
    Object.keys(e.patch ?? {}).sort().join(',')].join(' '))
}

/** Roda pela tela e pelo MCP e devolve as duas formas e os eventos do MCP. */
async function lado(amb: Amb, tela: () => Promise<{ status: number }>, mcp: () => Promise<{ erro: boolean; texto: string }>) {
  const s0 = ultimoSeq(amb.db)
  const t = await tela()
  assert.ok(t.status < 300, `tela: ${t.status}`)
  const s1 = ultimoSeq(amb.db)
  const m = await mcp()
  assert.equal(m.erro, false, m.texto)
  const s2 = ultimoSeq(amb.db)
  const daTela = eventos(amb.db, s0).filter((e) => e.seq <= s1)
  const doMcp = eventos(amb.db, s1)
  assert.ok(doMcp.length > 0 && doMcp.every((e) => e.seq <= s2))
  for (const e of daTela) assert.match(e.trace_id ?? '', TRACE_TELA)
  return { tela: forma(amb, s0).slice(0, daTela.length), mcp: forma(amb, s1), doMcp }
}

test('coluna, etiqueta e criar_cliente: os mesmos eventos SSE da rota, com t = o trace mcp-… e a = a pessoa', async () => {
  const amb = await ambienteMcp()
  const p = amb.pessoas.design
  const tela = amb.como(p)
  const c = await conectar(amb, p)
  const criacao = amb.quadros.criacao.quadro.id
  const chamarMcp = (nome: string, args: Record<string, unknown>) => () => chamar(amb, c.at, nome, args)
  const pares = [
    await lado(amb, () => tela.post(`/api/quadros/${criacao}/colunas`, { nome: 'A', cor: 'azul', limiteWip: 3 }),
      chamarMcp('coluna', { acao: 'criar', quadro: 'criacao', coluna: 'B', cor: 'azul', limiteWip: 3 })),
    await lado(amb, () => tela.patch(`/api/colunas/${amb.coluna('criacao', 'A').id}`, { nome: 'A2', papel: 'aguardando_cliente' }),
      chamarMcp('coluna', { acao: 'editar', quadro: 'criacao', coluna: 'B', nome: 'B2', papel: 'aguardando_cliente' })),
    await lado(amb, () => tela.patch(`/api/colunas/${amb.coluna('criacao', 'A2').id}`, { posicao: { depoisDeId: null } }),
      chamarMcp('coluna', { acao: 'mover', quadro: 'criacao', coluna: 'B2', antesDe: 'A2' })),
    await lado(amb, () => tela.post(`/api/colunas/${amb.coluna('criacao', 'A2').id}/arquivar`),
      chamarMcp('coluna', { acao: 'arquivar', quadro: 'criacao', coluna: 'B2' })),
    await lado(amb, () => tela.post(`/api/quadros/${criacao}/etiquetas`, { nome: 'Tela', cor: 'roxo' }),
      chamarMcp('etiqueta', { acao: 'criar', quadro: 'criacao', etiqueta: 'Claude', cor: 'roxo' })),
    await lado(amb, async () => {
      const id = um<{ id: string }>(amb.db, "SELECT id FROM etiqueta WHERE nome = 'Tela'")!.id
      return tela.patch(`/api/etiquetas/${id}`, { nome: 'Tela 2', cor: 'verde' })
    }, chamarMcp('etiqueta', { acao: 'editar', quadro: 'criacao', etiqueta: 'Claude', nome: 'Claude 2', cor: 'verde' })),
    await lado(amb, () => tela.post('/api/clientes', { sigla: 'TEL', nome: 'Pela tela' }),
      chamarMcp('criar_cliente', { sigla: 'CLD', nome: 'Pelo Claude' })),
  ]
  for (const [i, par] of pares.entries()) {
    assert.deepEqual(par.mcp, par.tela, `par ${i}`)
    for (const e of par.doMcp) {
      assert.match(e.trace_id ?? '', TRACE_MCP, `par ${i}`)
      assert.equal(e.ator_id, p.id)
    }
  }
  // um traço por chamada, com o nome da ferramenta, da pessoa e da conexão
  const tracos = todos<{ ferramenta: string; usuario_id: string }>(amb.db, 'SELECT ferramenta, usuario_id FROM mcp_traco ORDER BY rowid')
  assert.deepEqual(tracos.map((t) => t.ferramenta), ['coluna', 'coluna', 'coluna', 'coluna', 'etiqueta', 'etiqueta', 'criar_cliente'])
  assert.ok(tracos.every((t) => t.usuario_id === p.id))
  // cada evento do MCP leva o trace de um traço
  const comTraco = um<{ n: number }>(amb.db, `SELECT count(*) AS n FROM evento e JOIN mcp_traco m ON m.trace_id = e.trace_id
    AND m.usuario_id = e.ator_id WHERE e.entidade IN ('coluna', 'etiqueta', 'cliente')`)!.n
  assert.equal(comTraco, pares.reduce((s, par) => s + par.doMcp.length, 0))
})

test('criar_cliente: a atividade cliente.criado é via claude; pela tela, não; falha não deixa traço', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.am)
  await amb.como(amb.pessoas.am).post('/api/clientes', { sigla: 'TEL', nome: 'Pela tela' })
  await chamar(amb, c.at, 'criar_cliente', { sigla: 'CLD', nome: 'Pelo Claude' })
  const via = todos<{ sigla: string; via: string | null; ator_id: string }>(amb.db, `SELECT json_extract(a.dados, '$.sigla') AS sigla,
    a.ator_id, ${SQL_VIA_ATIVIDADE} FROM atividade a WHERE a.tipo = 'cliente.criado' AND json_extract(a.dados, '$.sigla') IN ('TEL', 'CLD')
    ORDER BY a.id`)
  assert.deepEqual(via.map((l) => [l.sigla, l.via, l.ator_id]), [['TEL', null, amb.pessoas.am.id], ['CLD', 'claude', amb.pessoas.am.id]])

  const antes = um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n
  assert.equal((await chamar(amb, c.at, 'criar_cliente', { sigla: 'CLD', nome: 'De novo' })).erro, true)
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'criacao', coluna: 'Fila' })).erro, true)
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'criar', quadro: 'criacao', etiqueta: 'Urgente', cor: 'rosa' })).erro, true)
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'arquivar', quadro: 'criacao', coluna: 'Fila' })).erro, false)
  await amb.criarDemanda({ titulo: 'Segura a coluna', colunaId: amb.coluna('criacao', 'Pronto').id })
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'arquivar', quadro: 'criacao', coluna: 'Pronto' })).erro, true)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n, antes + 1)
})
