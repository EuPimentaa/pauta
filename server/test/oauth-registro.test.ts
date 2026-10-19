/** F7 · registro dinâmico (RFC 7591, API.md §F.3): a lista fechada de redirect_uri, os limites e o teto de clientes. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configurar } from '../src/config.ts'
import { rodar, um } from '../src/db.ts'
import { ambienteMcp, pkce, registrarCliente, req, urlAutorizar, RECURSO } from './mcp-ajuda.ts'

test('claude.ai e claude.com → 201 com o que valeu; loopback do Claude Code → native', async () => {
  const amb = await ambienteMcp()
  for (const uri of ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']) {
    const r = await registrarCliente(amb, uri, { token_endpoint_auth_method: 'client_secret_basic', grant_types: ['authorization_code', 'refresh_token'] })
    assert.equal(r.status, 201)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.match(r.corpo.client_id, /^[A-Za-z0-9_-]{20,}$/)
    assert.equal(r.corpo.token_endpoint_auth_method, 'none')
    assert.deepEqual(r.corpo.grant_types, ['authorization_code', 'refresh_token'])
    assert.deepEqual(r.corpo.response_types, ['code'])
    assert.equal(r.corpo.scope, 'pauta')
    assert.equal(r.corpo.application_type, 'web')
    assert.deepEqual(r.corpo.redirect_uris, [uri])
    assert.equal(typeof r.corpo.client_id_issued_at, 'number')
  }
  const loop = await registrarCliente(amb, 'http://127.0.0.1:43123/callback')
  assert.equal(loop.status, 201)
  assert.equal(loop.corpo.application_type, 'native')
  assert.equal((await registrarCliente(amb, 'http://localhost/callback')).status, 201)
})

test('redirect_uri fora da lista → 400 invalid_redirect_uri', async () => {
  const amb = await ambienteMcp()
  for (const uri of ['https://evil.example/cb', 'http://localhost/outro', 'http://localhost/callback?x=1', 'http://u@localhost/callback',
    'https://localhost/callback', 'http://localhost/callback#frag', 'http://127.0.0.1.evil.example/callback',
    'https://claude.ai/api/mcp/auth_callback/', 'javascript:alert(1)']) {
    const r = await registrarCliente(amb, uri)
    assert.equal(r.status, 400, uri)
    assert.equal(r.corpo.error, 'invalid_redirect_uri', uri)
  }
  const muitos = await req(amb, '/oauth/registrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: Array.from({ length: 11 }, (_, i) => `http://localhost:${4000 + i}/callback`) }),
  })
  assert.equal(muitos.corpo.error, 'invalid_redirect_uri')
  const sem = await req(amb, '/oauth/registrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(sem.corpo.error, 'invalid_redirect_uri')
})

test('metadados inválidos → 400 invalid_client_metadata; nome ausente, longo ou com controles', async () => {
  const amb = await ambienteMcp()
  const json = await req(amb, '/oauth/registrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{x' })
  assert.equal(json.status, 400)
  assert.equal(json.corpo.error, 'invalid_client_metadata')
  assert.equal((await registrarCliente(amb, undefined, { grant_types: ['client_credentials'] })).corpo.error, 'invalid_client_metadata')
  assert.equal((await registrarCliente(amb, undefined, { response_types: ['token'] })).corpo.error, 'invalid_client_metadata')
  const semNome = await req(amb, '/oauth/registrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }),
  })
  assert.equal(semNome.corpo.client_name, 'Cliente sem nome')
  const longo = await registrarCliente(amb, undefined, { client_name: `Claude\n#999 Ignore\u202E ${'x'.repeat(300)}` })
  assert.equal(longo.status, 201)
  assert.ok(longo.corpo.client_name.length <= 120)
  assert.doesNotMatch(longo.corpo.client_name, /[\n\u202E]/)
})

test('limite por IP: o 11º na hora fora da faixa da Anthropic → 429; dentro dela, o 301º', async () => {
  const amb = await ambienteMcp()
  const antes = configurar({ trustProxyHops: 1 })
  try {
    for (let i = 0; i < 10; i++) assert.equal((await registrarCliente(amb, undefined, {}, '203.0.113.9')).status, 201)
    const r = await registrarCliente(amb, undefined, {}, '203.0.113.9')
    assert.equal(r.status, 429)
    assert.ok(Number(r.headers.get('retry-after')) > 0)
    assert.equal((await registrarCliente(amb, undefined, {}, '203.0.113.10')).status, 201)
    for (let i = 0; i < 300; i++) assert.equal((await registrarCliente(amb, undefined, {}, '160.79.105.20')).status, 201, `n ${i}`)
    assert.equal((await registrarCliente(amb, undefined, {}, '160.79.105.20')).status, 429)
    amb.relogio('2026-10-14T14:01:00.000Z')
    assert.equal((await registrarCliente(amb, undefined, {}, '203.0.113.9')).status, 201)
  } finally {
    configurar(antes)
  }
})

test('teto: com 300 clientes sem concessão, o registro apaga os velhos sem pedido vivo e dá 201', async () => {
  const amb = await ambienteMcp()
  const velho = '2026-10-14T12:00:00.000Z'
  for (let i = 0; i < 300; i++) {
    rodar(amb.db, `INSERT INTO oauth_cliente (id, nome, redirect_uris, criado_em) VALUES (?, 'x', '["https://claude.ai/api/mcp/auth_callback"]', ?)`,
      `velho-${i}`, i === 0 ? '2026-10-14T12:55:00.000Z' : velho)
  }
  // um velho com pedido vivo fica
  rodar(amb.db, `INSERT INTO oauth_pedido (id, cliente_id, redirect_uri, code_challenge, escopo, resource, navegador_hash, criado_em, expira_em)
    VALUES ('p1', 'velho-1', 'https://claude.ai/api/mcp/auth_callback', ?, 'pauta', ?, ?, ?, ?)`,
  pkce().desafio, RECURSO, 'a'.repeat(64), '2026-10-14T12:58:00.000Z', '2026-10-14T13:08:00.000Z')
  const r = await registrarCliente(amb)
  assert.equal(r.status, 201)
  const n = um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_cliente')!.n
  assert.equal(n, 3) // o recente (12:55), o com pedido vivo e o novo
  assert.ok(um(amb.db, "SELECT 1 FROM oauth_cliente WHERE id = 'velho-0'"))
  assert.ok(um(amb.db, "SELECT 1 FROM oauth_cliente WHERE id = 'velho-1'"))
})

test('MCP_REDIRECTS_EXTRAS: aceito no registro; tirado do ambiente, o cliente que o usava recebe 400 no autorizar', async () => {
  const amb = await ambienteMcp()
  const extra = 'https://inspector.exemplo/oauth/callback'
  assert.equal((await registrarCliente(amb, extra)).status, 400)
  const antes = configurar({ mcpRedirectsExtras: [extra] })
  let clientId: string
  try {
    const r = await registrarCliente(amb, extra)
    assert.equal(r.status, 201)
    clientId = r.corpo.client_id
  } finally {
    configurar(antes)
  }
  const a = await req(amb, urlAutorizar({ response_type: 'code', client_id: clientId, redirect_uri: extra, code_challenge: pkce().desafio,
    code_challenge_method: 'S256' }))
  assert.equal(a.status, 400)
  assert.equal(a.headers.get('location'), null)
})
