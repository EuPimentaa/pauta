/** F7 · POST /oauth/token (API.md §F.3): PKCE, resource, código de uso único, rotação do refresh e substituição. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { configurar } from '../src/config.ts'
import { todos, um } from '../src/db.ts'
import {
  abrirPedido, ambienteMcp, conectar, decidir, form, pkce, req, rpc, REDIRECT_CLAUDE, REDIRECT_LOOPBACK, RECURSO,
} from './mcp-ajuda.ts'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

async function codigoPermitido(amb: Awaited<ReturnType<typeof ambienteMcp>>, o: { redirect?: string } = {}) {
  const p = await abrirPedido(amb, o)
  const d = await decidir(amb, p, amb.pessoas.design)
  return { ...p, codigo: new URL(d.corpo.redirecionar).searchParams.get('code')! }
}

function trocar(p: { codigo: string; clientId: string; redirect: string; verificador: string }, extra: Record<string, string> = {}) {
  return form({ grant_type: 'authorization_code', code: p.codigo, client_id: p.clientId, redirect_uri: p.redirect,
    code_verifier: p.verificador, ...extra })
}

test('só form-urlencoded; cliente desconhecido → 401 invalid_client; grant desconhecido → unsupported_grant_type', async () => {
  const amb = await ambienteMcp()
  const p = await codigoPermitido(amb)
  const json = await req(amb, '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code: p.codigo }) })
  assert.equal(json.status, 400)
  assert.equal(json.corpo.error, 'invalid_request')
  const desconhecido = await req(amb, '/oauth/token', form({ grant_type: 'authorization_code', client_id: 'x', code: 'y' }))
  assert.equal(desconhecido.status, 401)
  assert.equal(desconhecido.corpo.error, 'invalid_client')
  const grant = await req(amb, '/oauth/token', form({ grant_type: 'password', client_id: p.clientId }))
  assert.equal(grant.corpo.error, 'unsupported_grant_type')
})

test('PKCE certo → par com Cache-Control e Pragma; a concessão guarda o resource; offline_access aceito', async () => {
  const amb = await ambienteMcp()
  const p = await codigoPermitido(amb)
  const r = await req(amb, '/oauth/token', trocar(p, { resource: `${RECURSO}/` }))
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'no-store')
  assert.equal(r.headers.get('pragma'), 'no-cache')
  assert.match(r.corpo.access_token, /^pauta_at_[A-Za-z0-9_-]{43}$/)
  assert.match(r.corpo.refresh_token, /^pauta_rt_[A-Za-z0-9_-]{43}$/)
  assert.equal(r.corpo.token_type, 'Bearer')
  assert.equal(r.corpo.expires_in, 3600)
  assert.equal(r.corpo.scope, 'pauta')
  const c = um<{ resource: string; redirect_uri: string; usuario_id: string }>(amb.db, 'SELECT * FROM oauth_concessao')!
  assert.equal(c.resource, RECURSO)
  assert.equal(c.redirect_uri, REDIRECT_CLAUDE)
  assert.equal(c.usuario_id, amb.pessoas.design.id)
  // só o hash vai para o banco
  assert.ok(um(amb.db, 'SELECT 1 FROM oauth_token WHERE hash = ?', sha(r.corpo.access_token)))
  assert.equal(todos(amb.db, "SELECT 1 FROM oauth_token WHERE hash LIKE 'pauta_%'").length, 0)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_pedido WHERE codigo_hash = ?', p.codigo)!.n, 0)
  assert.equal((await rpc(amb, r.corpo.access_token, 'ping')).status, 200)
})

test('verificador errado, redirect diferente, código vencido ou de outro cliente → invalid_grant', async () => {
  const amb = await ambienteMcp()
  const p = await codigoPermitido(amb)
  for (const extra of [{ code_verifier: pkce().verificador }, { code_verifier: 'curto' }, { redirect_uri: 'https://claude.com/api/mcp/auth_callback' }]) {
    const r = await req(amb, '/oauth/token', trocar(p, extra))
    assert.equal(r.status, 400)
    assert.equal(r.corpo.error, 'invalid_grant')
  }
  const outro = await codigoPermitido(amb)
  assert.equal((await req(amb, '/oauth/token', trocar({ ...p, clientId: outro.clientId }))).corpo.error, 'invalid_grant')
  const alvo = await req(amb, '/oauth/token', trocar(p, { resource: 'https://outro.exemplo/mcp' }))
  assert.equal(alvo.corpo.error, 'invalid_target')
  amb.relogio('2026-10-14T13:05:01.000Z')
  assert.equal((await req(amb, '/oauth/token', trocar(p))).corpo.error, 'invalid_grant')
})

test('código usado de novo → invalid_grant e a concessão que ele emitiu revogada (codigo_reusado)', async () => {
  const amb = await ambienteMcp()
  const p = await codigoPermitido(amb)
  const r = await req(amb, '/oauth/token', trocar(p))
  assert.equal(r.status, 200)
  const de2 = await req(amb, '/oauth/token', trocar(p))
  assert.equal(de2.corpo.error, 'invalid_grant')
  const c = um<{ motivo_revogacao: string }>(amb.db, 'SELECT motivo_revogacao FROM oauth_concessao')!
  assert.equal(c.motivo_revogacao, 'codigo_reusado')
  const mcp = await rpc(amb, r.corpo.access_token, 'ping')
  assert.equal(mcp.status, 401)
  assert.match(mcp.headers.get('www-authenticate')!, /error="invalid_token"/)
})

test('refresh roda; dois reusos do antigo em 60 s devolvem o mesmo par sem linha nova; depois de 61 s, revoga', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const ref = (rt: string, extra: Record<string, string> = {}) => req(amb, '/oauth/token',
    form({ grant_type: 'refresh_token', refresh_token: rt, client_id: c.clientId, ...extra }))
  amb.relogio('2026-10-14T13:30:00.000Z')
  const r1 = await ref(c.rt)
  assert.equal(r1.status, 200)
  assert.notEqual(r1.corpo.refresh_token, c.rt)
  assert.notEqual(r1.corpo.access_token, c.at)
  const linhas = um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_token')!.n
  amb.relogio('2026-10-14T13:30:30.000Z')
  const r2 = await ref(c.rt)
  const r3 = await ref(c.rt)
  assert.equal(r2.status, 200)
  assert.equal(r2.corpo.refresh_token, r1.corpo.refresh_token)
  assert.equal(r2.corpo.access_token, r1.corpo.access_token)
  assert.equal(r3.corpo.refresh_token, r1.corpo.refresh_token)
  assert.equal(r2.corpo.expires_in, 3570)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_token')!.n, linhas)
  // o novo continua valendo
  assert.equal((await rpc(amb, r1.corpo.access_token, 'ping')).status, 200)

  amb.relogio('2026-10-14T13:31:01.000Z')
  const tarde = await ref(c.rt)
  assert.equal(tarde.status, 400)
  assert.equal(tarde.corpo.error, 'invalid_grant')
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_token WHERE filho_cifrado IS NOT NULL')!.n, 0)
  assert.equal(um<{ motivo_revogacao: string }>(amb.db, 'SELECT motivo_revogacao FROM oauth_concessao')!.motivo_revogacao, 'reuso_refresh')
  assert.equal((await rpc(amb, r1.corpo.access_token, 'ping')).status, 401)
  assert.equal((await ref(r1.corpo.refresh_token)).corpo.error, 'invalid_grant')
})

test('refresh com outro resource → invalid_target; vencido ou desconhecido → invalid_grant; a validade desliza', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const ref = (rt: string, extra: Record<string, string> = {}) => req(amb, '/oauth/token',
    form({ grant_type: 'refresh_token', refresh_token: rt, client_id: c.clientId, ...extra }))
  assert.equal((await ref(c.rt, { resource: 'https://outro.exemplo/mcp' })).corpo.error, 'invalid_target')
  assert.equal((await ref('pauta_rt_desconhecido')).corpo.error, 'invalid_grant')
  amb.relogio('2026-11-12T13:00:00.000Z')
  const r = await ref(c.rt)
  assert.equal(r.status, 200)
  const t = um<{ expira_em: string }>(amb.db, "SELECT expira_em FROM oauth_token WHERE hash = ?", sha(r.corpo.refresh_token))!
  assert.equal(t.expira_em, '2026-12-12T13:00:00.000Z')
  amb.relogio('2026-12-12T13:00:01.000Z')
  assert.equal((await ref(r.corpo.refresh_token)).corpo.error, 'invalid_grant')
})

test('redirect tirado de MCP_REDIRECTS_EXTRAS: refresh invalid_grant e /mcp 401', async () => {
  const amb = await ambienteMcp()
  const extra = 'https://inspector.exemplo/oauth/callback'
  const antes = configurar({ mcpRedirectsExtras: [extra] })
  let c: Awaited<ReturnType<typeof conectar>>
  try {
    c = await conectar(amb, amb.pessoas.design, { redirect: extra })
    assert.equal((await rpc(amb, c.at, 'ping')).status, 200)
  } finally {
    configurar(antes)
  }
  assert.equal((await rpc(amb, c.at, 'ping')).status, 401)
  const r = await req(amb, '/oauth/token', form({ grant_type: 'refresh_token', refresh_token: c.rt, client_id: c.clientId }))
  assert.equal(r.corpo.error, 'invalid_grant')
})

test('substituir: o mesmo cliente de novo substitui; outro cliente com o mesmo destino só com a caixa marcada', async () => {
  const amb = await ambienteMcp()
  const ativas = () => todos<{ id: string; cliente_id: string }>(amb.db,
    'SELECT id, cliente_id FROM oauth_concessao WHERE usuario_id = ? AND revogada_em IS NULL', amb.pessoas.design.id)
  const a = await conectar(amb, amb.pessoas.design)
  const a2 = await conectar(amb, amb.pessoas.design, { clientId: a.clientId })
  assert.equal(ativas().length, 1)
  assert.equal((await rpc(amb, a.at, 'ping')).status, 401)
  assert.equal((await rpc(amb, a2.at, 'ping')).status, 200)
  assert.equal(um<{ motivo_revogacao: string }>(amb.db, "SELECT motivo_revogacao FROM oauth_concessao WHERE revogada_em IS NOT NULL")!.motivo_revogacao, 'substituida')

  const b = await conectar(amb, amb.pessoas.design, { substituir: false })
  assert.equal(ativas().length, 2)
  const c = await conectar(amb, amb.pessoas.design)
  assert.deepEqual(ativas().map((x) => x.cliente_id), [c.clientId])
  assert.equal((await rpc(amb, b.at, 'ping')).status, 401)
  // outro destino (Claude Code) não substitui o do claude.ai
  await conectar(amb, amb.pessoas.design, { redirect: REDIRECT_LOOPBACK })
  assert.equal(ativas().length, 2)
})

test('o 31º token no minuto do mesmo cliente → 429', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  for (let i = 0; i < 29; i++) {
    await req(amb, '/oauth/token', form({ grant_type: 'refresh_token', refresh_token: 'pauta_rt_x', client_id: c.clientId }))
  }
  const r = await req(amb, '/oauth/token', form({ grant_type: 'refresh_token', refresh_token: 'pauta_rt_x', client_id: c.clientId }))
  assert.equal(r.status, 429)
  assert.ok(Number(r.headers.get('retry-after')) > 0)
})
