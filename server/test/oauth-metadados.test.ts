/** F7 · metadados do OAuth (API.md §F.2) e o MCP_ATIVO (§F.1). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configurar } from '../src/config.ts'
import { ORIGEM, sessaoPara } from './ajuda.ts'
import { ambienteMcp, cabecalhosTela, conectar, req, rpc } from './mcp-ajuda.ts'

test('metadados do recurso: o mesmo JSON nos dois caminhos, a partir do APP_URL', async () => {
  const amb = await ambienteMcp()
  for (const caminho of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
    const r = await req(amb, caminho)
    assert.equal(r.status, 200)
    assert.deepEqual(r.corpo, {
      resource: `${ORIGEM}/mcp`, authorization_servers: [ORIGEM], scopes_supported: ['pauta'],
      bearer_methods_supported: ['header'], resource_name: 'Pauta',
    })
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.equal(r.headers.get('access-control-allow-origin'), null)
  }
})

test('metadados do servidor de autorização: JSON exato da API §F.2', async () => {
  const amb = await ambienteMcp()
  const r = await req(amb, '/.well-known/oauth-authorization-server')
  assert.equal(r.status, 200)
  assert.deepEqual(r.corpo, {
    issuer: ORIGEM,
    authorization_endpoint: `${ORIGEM}/oauth/autorizar`,
    token_endpoint: `${ORIGEM}/oauth/token`,
    registration_endpoint: `${ORIGEM}/oauth/registrar`,
    revocation_endpoint: `${ORIGEM}/oauth/revogar`,
    scopes_supported: ['pauta', 'offline_access'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
  })
  assert.equal(r.headers.get('cache-control'), 'no-store')
  assert.equal(r.headers.get('access-control-allow-origin'), null)
})

test('o resto de /.well-known, /oauth e /mcp/*: 404 em texto, nunca o index.html', async () => {
  const amb = await ambienteMcp()
  for (const caminho of ['/.well-known/openid-configuration', '/.well-known/qualquer', '/oauth/qualquer', '/mcp/x']) {
    const r = await req(amb, caminho)
    assert.equal(r.status, 404, caminho)
    assert.match(r.headers.get('content-type') ?? '', /text\/plain/, caminho)
    assert.equal(r.headers.get('cache-control'), 'no-store', caminho)
  }
  const post = await req(amb, '/oauth/autorizar', { method: 'POST' })
  assert.equal(post.status, 404)
})

test('APP_NOME vira o resource_name e o APP_URL de produção vira o emissor', async () => {
  const amb = await ambienteMcp()
  const antes = configurar({ appNome: 'Demandas', appUrl: 'https://demandas.meltcomunicacao.com.br' })
  try {
    const r = await req(amb, '/.well-known/oauth-protected-resource/mcp')
    assert.equal(r.corpo.resource, 'https://demandas.meltcomunicacao.com.br/mcp')
    assert.equal(r.corpo.resource_name, 'Demandas')
    const s = await req(amb, '/.well-known/oauth-authorization-server')
    assert.equal(s.corpo.issuer, 'https://demandas.meltcomunicacao.com.br')
  } finally {
    configurar(antes)
  }
})

test('MCP_ATIVO=0: 404 em /mcp, /oauth/*, /.well-known/oauth-* e /api/oauth/*; Conexões continua', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const antes = configurar({ mcpAtivo: false })
  try {
    assert.equal((await rpc(amb, c.at, 'tools/list')).status, 404)
    assert.equal((await req(amb, '/oauth/registrar', { method: 'POST', body: '{}' })).status, 404)
    assert.equal((await req(amb, '/.well-known/oauth-authorization-server')).status, 404)
    assert.equal((await req(amb, '/.well-known/oauth-protected-resource/mcp')).status, 404)
    const sessao = sessaoPara(amb.db, amb.pessoas.design.id)
    assert.equal((await req(amb, '/api/oauth/pedidos/x', { headers: cabecalhosTela(sessao, null) })).status, 404)
    const lista = await amb.como(amb.pessoas.design).get('/api/conexoes')
    assert.equal(lista.status, 200)
    assert.equal(lista.corpo.conexoes.length, 1)
    const revogar = await amb.como(amb.pessoas.design).post(`/api/conexoes/${lista.corpo.conexoes[0].id}/revogar`)
    assert.equal(revogar.status, 200)
  } finally {
    configurar(antes)
  }
})
