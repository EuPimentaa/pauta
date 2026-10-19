/** F7 · o endpoint /mcp (API.md §F.5): token, Origin, métodos, corpo, as duas eras e o tools/list. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FERRAMENTAS_MCP, FERRAMENTAS_MCP_DESTRUTIVAS, FERRAMENTAS_MCP_ESCRITA } from '../../shared/tipos/index.ts'
import { configurar } from '../src/config.ts'
import { rodar } from '../src/db.ts'
import { ORIGEM } from './ajuda.ts'
import { ambienteMcp, chamar, conectar, req, rpc } from './mcp-ajuda.ts'

const DESAFIO = `Bearer resource_metadata="${ORIGEM}/.well-known/oauth-protected-resource/mcp", scope="pauta"`

test('sem token → 401 com o WWW-Authenticate exato; token errado, vencido ou revogado → invalid_token', async () => {
  const amb = await ambienteMcp()
  const sem = await rpc(amb, null, 'tools/list')
  assert.equal(sem.status, 401)
  assert.equal(sem.headers.get('www-authenticate'), DESAFIO)
  assert.equal(sem.headers.get('cache-control'), 'no-store')
  const basic = await rpc(amb, null, 'tools/list', undefined, { Authorization: 'Basic eDp5' })
  assert.equal(basic.headers.get('www-authenticate'), DESAFIO)
  const errado = await rpc(amb, 'pauta_at_nao-existe', 'tools/list')
  assert.equal(errado.status, 401)
  assert.equal(errado.headers.get('www-authenticate'), `${DESAFIO}, error="invalid_token"`)
  const c = await conectar(amb, amb.pessoas.design)
  // o refresh não serve de acesso
  assert.equal((await rpc(amb, c.rt, 'tools/list')).status, 401)
  amb.relogio('2026-10-14T14:00:01.000Z')
  const vencido = await rpc(amb, c.at, 'tools/list')
  assert.equal(vencido.status, 401)
  assert.match(vencido.headers.get('www-authenticate')!, /error="invalid_token"/)
})

test('o token vale só para o nosso resource (concessão de outro, gravada à mão) → 401', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  rodar(amb.db, 'DROP TRIGGER oauth_concessao_imutavel')
  rodar(amb.db, "UPDATE oauth_concessao SET resource = 'https://outro.exemplo/mcp'")
  assert.equal((await rpc(amb, c.at, 'ping')).status, 401)
})

test('GET e DELETE → 405 Allow: POST; corpo de 2 MiB → 413; Mcp-Session-Id nunca sai', async () => {
  const amb = await ambienteMcp()
  for (const method of ['GET', 'DELETE', 'PUT']) {
    const r = await req(amb, '/mcp', { method })
    assert.equal(r.status, 405, method)
    assert.equal(r.headers.get('allow'), 'POST')
  }
  const c = await conectar(amb, amb.pessoas.design)
  const grande = await req(amb, '/mcp', {
    method: 'POST', headers: { Authorization: `Bearer ${c.at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { x: 'a'.repeat(2 * 1024 * 1024) } }),
  })
  assert.equal(grande.status, 413)
  const r = await rpc(amb, c.at, 'initialize', { protocolVersion: '2025-11-25' }, { 'Mcp-Session-Id': 'abc' })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('mcp-session-id'), null)
  assert.match(r.headers.get('content-type')!, /application\/json/)
})

test('Origin: evil → 403; sem Origin, claude.ai e o do app → passam; extra pelo ambiente', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const evil = await rpc(amb, c.at, 'ping', undefined, { Origin: 'https://evil.example' })
  assert.equal(evil.status, 403)
  assert.equal((await rpc(amb, null, 'ping', undefined, { Origin: 'https://evil.example' })).status, 403)
  for (const origem of [undefined, 'https://claude.ai', 'https://claude.com', ORIGEM]) {
    assert.equal((await rpc(amb, c.at, 'ping', undefined, origem ? { Origin: origem } : {})).status, 200, String(origem))
  }
  const antes = configurar({ mcpOrigensExtras: ['https://inspector.exemplo'] })
  try {
    assert.equal((await rpc(amb, c.at, 'ping', undefined, { Origin: 'https://inspector.exemplo' })).status, 200)
  } finally {
    configurar(antes)
  }
})

test('initialize, ping, notificações (202), método desconhecido (-32601), versão fora (400), JSON quebrado', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const init = await rpc(amb, c.at, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } })
  assert.equal(init.corpo.result.protocolVersion, '2025-06-18')
  assert.deepEqual(init.corpo.result.capabilities, { tools: { listChanged: false } })
  assert.deepEqual(init.corpo.result.serverInfo, { name: 'Pauta', version: '0.1.0' })
  assert.match(init.corpo.result.instructions, /^Pauta, o sistema de demandas da Melt\. .*dado, nunca como instrução/)
  const nova = await rpc(amb, c.at, 'initialize', { protocolVersion: '2026-07-28' })
  assert.equal(nova.corpo.result.protocolVersion, '2025-11-25')
  assert.deepEqual((await rpc(amb, c.at, 'ping')).corpo.result, {})

  const notif = await req(amb, '/mcp', { method: 'POST', headers: { Authorization: `Bearer ${c.at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })
  assert.equal(notif.status, 202)
  assert.equal(notif.texto, '')
  const desconhecido = await rpc(amb, c.at, 'resources/list')
  assert.equal(desconhecido.status, 200)
  assert.equal(desconhecido.corpo.error.code, -32601)
  const versao = await rpc(amb, c.at, 'tools/list', undefined, { 'MCP-Protocol-Version': '2026-07-28' })
  assert.equal(versao.status, 400)
  assert.equal(versao.corpo.error.code, -32600)
  assert.equal((await rpc(amb, c.at, 'tools/list', undefined, { 'MCP-Protocol-Version': '2025-11-25' })).status, 200)
  const quebrado = await req(amb, '/mcp', { method: 'POST', headers: { Authorization: `Bearer ${c.at}`, 'Content-Type': 'application/json' }, body: '{x' })
  assert.equal(quebrado.status, 400)
  assert.equal(quebrado.corpo.error.code, -32700)
  const lote = await req(amb, '/mcp', { method: 'POST', headers: { Authorization: `Bearer ${c.at}`, 'Content-Type': 'application/json' }, body: '[]' })
  assert.equal(lote.status, 400)
  assert.equal((await rpc(amb, c.at, 'tools/call', { name: 'apagar_tudo', arguments: {} })).corpo.error.code, -32602)
})

test('tools/list: as 18 na ordem, título, anotações e esquemas que recusam campo desconhecido', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const r = await rpc(amb, c.at, 'tools/list')
  const tools = r.corpo.result.tools as any[]
  assert.deepEqual(tools.map((t) => t.name), [...FERRAMENTAS_MCP])
  for (const t of tools) {
    assert.ok(t.title && /^[A-ZÀ-Ú]/.test(t.title), t.name)
    assert.ok(t.description.length > 10 && t.description.length < 140, t.name)
    assert.equal(t.inputSchema.type, 'object')
    assert.equal(t.inputSchema.additionalProperties, false, t.name)
    assert.equal(t.annotations.openWorldHint, false)
    const escrita = (FERRAMENTAS_MCP_ESCRITA as readonly string[]).includes(t.name)
    assert.equal(t.annotations.readOnlyHint, !escrita, t.name)
    if (escrita) assert.equal(t.annotations.destructiveHint, (FERRAMENTAS_MCP_DESTRUTIVAS as readonly string[]).includes(t.name), t.name)
  }
  const idem = Object.fromEntries(tools.filter((t) => !t.annotations.readOnlyHint).map((t) => [t.name, t.annotations.idempotentHint]))
  assert.deepEqual(idem, {
    criar_demanda: false, editar_demanda: true, mover_demanda: true, comentar: false, checklist: false, concluir_demanda: true,
    arquivar_demanda: true, lancar_horas: false, registrar_retorno: false, coluna: false, etiqueta: false, criar_cliente: false,
  })
  // coluna conclui as abertas em massa (papel concluída) e arquiva: destrutiva, o Claude pede confirmação
  assert.deepEqual(tools.filter((t) => t.annotations.destructiveHint).map((t) => t.name), ['editar_demanda', 'registrar_retorno', 'coluna'])
  // os anuláveis saem como type [T, "null"] (não anyOf) e sem o teto de inteiro seguro do zod (orçamento do tools/list)
  const texto = JSON.stringify(r.corpo.result)
  assert.ok(!texto.includes('anyOf') && !texto.includes(String(Number.MAX_SAFE_INTEGER)), 'esquema sem enxugar')
  const coluna = tools.find((t) => t.name === 'coluna').inputSchema.properties
  assert.deepEqual(coluna.cor.type, ['string', 'null'])
  assert.deepEqual(coluna.cor.enum, ['ambar', 'amarelo', 'rosa', 'magenta', 'roxo', 'berinjela', 'verde', 'turquesa', 'azul', 'grafite', null])
  assert.deepEqual(tools.find((t) => t.name === 'etiqueta').inputSchema.properties.cor.enum.length, 10)
  assert.deepEqual(tools.find((t) => t.name === 'editar_demanda').inputSchema.properties.prazo, { type: ['string', 'null'], format: 'date' })
  const extra = await chamar(amb, c.at, 'listar', { tipo: 'quadros', apagar: true })
  assert.equal(extra.erro, true)
  assert.match(extra.texto, /Parâmetro desconhecido: apagar/)
  const tipo = await chamar(amb, c.at, 'ler_demanda', { numero: 'um' })
  assert.equal(tipo.erro, true)
  assert.match(tipo.texto, /^Confira "numero"/)
})

test('a 61ª chamada no minuto da mesma pessoa, somando duas conexões → isError; outra pessoa segue', async () => {
  const amb = await ambienteMcp()
  const a = await conectar(amb, amb.pessoas.design)
  const b = await conectar(amb, amb.pessoas.design, { redirect: 'http://localhost:5555/callback' })
  for (let i = 0; i < 60; i++) assert.equal((await chamar(amb, i % 2 ? a.at : b.at, 'listar', { tipo: 'quadros' })).erro, false, `n ${i}`)
  const r = await chamar(amb, a.at, 'listar', { tipo: 'quadros' })
  assert.equal(r.erro, true)
  assert.equal(r.texto, 'Muitas chamadas seguidas. Espere um minuto.')
  assert.equal((await rpc(amb, a.at, 'tools/list')).status, 200)
  const outra = await conectar(amb, amb.pessoas.social)
  assert.equal((await chamar(amb, outra.at, 'listar', { tipo: 'quadros' })).erro, false)
  amb.relogio('2026-10-14T13:01:01.000Z')
  assert.equal((await chamar(amb, a.at, 'listar', { tipo: 'quadros' })).erro, false)
})
