/**
 * Estrutura pelo MCP · `criar_cliente` (API.md §F.5, 18): a criação na hora da API (`criarCliente`), com
 * `exigir('cliente.criar')`, os campos do papel (`CAMPOS_CLIENTE_EQUIPE`) e o esquema da rota. O resto do cadastro fica
 * na tela.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todos, um } from '../src/db.ts'
import { eventos, ultimoSeq } from './ajuda.ts'
import { ambienteMcp, chamar, conectar } from './mcp-ajuda.ts'

type Amb = Awaited<ReturnType<typeof ambienteMcp>>

const quantos = (amb: Amb) => um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM cliente')!.n

test('criar_cliente pelo atendimento: AM = quem criou, apelidos normalizados, evento cliente e o endereço', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.am)
  const seq = ultimoSeq(amb.db)
  const r = await chamar(amb, c.at, 'criar_cliente', { sigla: 'cla', nome: '  Clínica Aurora ', apelidos: ['Clínica Aurora', 'aurora'] })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto, 'Criado o cliente CLA · Clínica Aurora · AM @pri · apelidos: aurora, clinica aurora · http://localhost:5173/clientes/CLA')
  const cli = um<{ id: string; sigla: string; nome: string; atendimento_id: string; status: string }>(amb.db, "SELECT * FROM cliente WHERE sigla = 'CLA'")!
  assert.deepEqual([cli.nome, cli.atendimento_id, cli.status], ['Clínica Aurora', amb.pessoas.am.id, 'recorrente'])
  assert.deepEqual(todos<{ alias_norm: string; origem: string }>(amb.db, 'SELECT alias_norm, origem FROM cliente_alias WHERE cliente_id = ? ORDER BY alias_norm', cli.id)
    .map((l) => `${l.alias_norm}:${l.origem}`), ['aurora:manual', 'cla:sigla', 'clinica aurora:manual'])
  const ev = eventos(amb.db, seq).filter((e) => e.entidade === 'cliente')
  assert.deepEqual(ev.map((e) => [e.entidade_id, e.op, e.publico]), [[cli.id, 'upsert', 'interno']])
  // já serve nas outras ferramentas, pela sigla ou por um apelido
  const d = await chamar(amb, c.at, 'criar_demanda', { titulo: 'Primeira da Aurora', quadro: 'criacao', cliente: 'aurora' })
  assert.equal(d.erro, false, d.texto)
  assert.match((await chamar(amb, c.at, 'listar', { tipo: 'clientes', texto: 'aurora' })).texto, /^CLA · Clínica Aurora · AM @pri · 1 aberta$/)
})

test('criar_cliente pela equipe: só sigla e nome (nasce sem AM, "Completar cadastro"); com apelidos, a regra da rota', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const proibido = await chamar(amb, c.at, 'criar_cliente', { sigla: 'CLB', nome: 'Clínica B', apelidos: ['clinica b'] })
  assert.equal(proibido.erro, true)
  assert.equal(proibido.texto, 'Você cria o cliente só com sigla e nome. O atendimento completa o cadastro.')
  assert.equal(quantos(amb), 2)
  const r = await chamar(amb, c.at, 'criar_cliente', { sigla: 'CLB', nome: 'Clínica B', apelidos: [] })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto, 'Criado o cliente CLB · Clínica B · sem AM (o atendimento completa o cadastro) · http://localhost:5173/clientes/CLB')
  const tela = await amb.como(amb.pessoas.am).get('/api/clientes/CLB')
  assert.equal(tela.status, 200)
  assert.equal(tela.corpo.atendimentoId, null)
  assert.ok(tela.corpo.pendencias.includes('sem_am'), JSON.stringify(tela.corpo.pendencias))
  // o admin cria como na rota: AM só se mandar (pela tela); aqui, sem AM
  const a = await conectar(amb, amb.pessoas.admin)
  assert.match((await chamar(amb, a.at, 'criar_cliente', { sigla: 'ADM', nome: 'Do admin', apelidos: ['admin cli'] })).texto,
    /^Criado o cliente ADM · Do admin · sem AM \(o atendimento completa o cadastro\) · apelidos: admin cli · /)
})

test('criar_cliente conflito: sigla ou apelido de outro cliente; nada grava', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.am)
  const casos: [Record<string, unknown>, string][] = [
    [{ sigla: 'he', nome: 'Outro HE' }, 'A sigla HE já é de outro cliente.'],
    [{ sigla: 'HOSPITALEVAN', nome: 'X', apelidos: ['Hospital Evangélico'] }, 'O apelido "hospital evangelico" já é de outro cliente.'],
  ]
  for (const [args, esperado] of casos) {
    const r = await chamar(amb, c.at, 'criar_cliente', args)
    assert.equal(r.erro, true, JSON.stringify(args))
    assert.equal(r.texto, esperado)
  }
  await chamar(amb, c.at, 'criar_cliente', { sigla: 'AUR', nome: 'Aurora', apelidos: ['clin'] })
  assert.equal((await chamar(amb, c.at, 'criar_cliente', { sigla: 'CLIN', nome: 'Clin' })).texto, '"CLIN" já é apelido de outro cliente.')
  assert.equal(quantos(amb), 3)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n, 1)
})

test('criar_cliente validação: sigla de 1 a 12 letras ou números, nome obrigatório, parâmetro desconhecido', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.am)
  const casos: [Record<string, unknown>, string | RegExp][] = [
    [{ sigla: 'H-E', nome: 'Hífen' }, 'Confira "sigla": de 1 a 12 letras (A–Z) ou números'],
    [{ sigla: 'ABCDEFGHIJKLM', nome: 'Longa' }, 'Confira "sigla": de 1 a 12 letras (A–Z) ou números'],
    [{ sigla: 'OK', nome: '  ' }, /^Confira "nome"/],
    [{ sigla: 'OK' }, /^Confira "nome"/],
    [{ sigla: 'OK', nome: 'Ok', atendimento: 'pri' }, 'Parâmetro desconhecido: atendimento.'],
    [{ sigla: 'OK', nome: 'Ok', rodadasInclusas: 3 }, 'Parâmetro desconhecido: rodadasInclusas.'],
  ]
  for (const [args, esperado] of casos) {
    const r = await chamar(amb, c.at, 'criar_cliente', args)
    assert.equal(r.erro, true, JSON.stringify(args))
    if (typeof esperado === 'string') assert.equal(r.texto, esperado, JSON.stringify(args))
    else assert.match(r.texto, esperado, JSON.stringify(args))
  }
  assert.equal(quantos(amb), 2)
})
