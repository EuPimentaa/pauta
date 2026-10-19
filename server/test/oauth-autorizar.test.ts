/** F7 · /oauth/autorizar, a tela (GET /api/oauth/pedidos/:id) e a decisão (API.md §F.3). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todos, um } from '../src/db.ts'
import { ORIGEM, sessaoPara } from './ajuda.ts'
import {
  abrirPedido, ambienteMcp, cabecalhosTela, conectar, cookieDoPedido, decidir, pkce, registrarCliente, req, urlAutorizar,
  REDIRECT_CLAUDE, REDIRECT_LOOPBACK, RECURSO,
} from './mcp-ajuda.ts'

async function cliente(amb: Awaited<ReturnType<typeof ambienteMcp>>, redirect = REDIRECT_CLAUDE): Promise<string> {
  return (await registrarCliente(amb, redirect)).corpo.client_id
}

function base(clientId: string, redirect = REDIRECT_CLAUDE): Record<string, string> {
  return { response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: pkce().desafio,
    code_challenge_method: 'S256', scope: 'pauta', state: 'st-123', resource: RECURSO }
}

test('cliente desconhecido ou redirect fora dos registrados → 400 em texto, sem Location', async () => {
  const amb = await ambienteMcp()
  const id = await cliente(amb)
  for (const q of [{ ...base(id), client_id: 'nao-existe' }, { ...base(id), redirect_uri: 'https://evil.example/cb' },
    { ...base(id), redirect_uri: 'https://claude.com/api/mcp/auth_callback' }, { ...base(id), redirect_uri: undefined }]) {
    const r = await req(amb, urlAutorizar(q))
    assert.equal(r.status, 400)
    assert.equal(r.headers.get('location'), null)
    assert.equal(r.texto, 'Este pedido de conexão não é válido.')
  }
})

test('os outros erros voltam ao redirect com error, state e iss', async () => {
  const amb = await ambienteMcp()
  const id = await cliente(amb)
  const casos: [Record<string, string | undefined>, string][] = [
    [{ ...base(id), code_challenge_method: 'plain' }, 'invalid_request'],
    [{ ...base(id), code_challenge: undefined }, 'invalid_request'],
    [{ ...base(id), response_type: 'token' }, 'unsupported_response_type'],
    [{ ...base(id), scope: 'pauta admin' }, 'invalid_scope'],
    [{ ...base(id), resource: 'https://outro.exemplo/mcp' }, 'invalid_target'],
  ]
  for (const [q, erro] of casos) {
    const r = await req(amb, urlAutorizar(q))
    assert.equal(r.status, 302, erro)
    const u = new URL(r.headers.get('location')!)
    assert.equal(`${u.origin}${u.pathname}`, REDIRECT_CLAUDE)
    assert.equal(u.searchParams.get('error'), erro)
    assert.equal(u.searchParams.get('state'), 'st-123')
    assert.equal(u.searchParams.get('iss'), ORIGEM)
  }
  // resource com barra no fim e caixa diferente é o mesmo; ausente também
  for (const resource of [`${ORIGEM.toUpperCase().replace('HTTP:', 'http:')}/mcp/`, undefined]) {
    const r = await req(amb, urlAutorizar({ ...base(id), resource }))
    assert.equal(r.status, 302)
    assert.match(r.headers.get('location')!, /^\/autorizar\?pedido=/)
  }
})

test('pedido gravado, cookie do pedido e 302 para a tela; loopback com outra porta', async () => {
  const amb = await ambienteMcp()
  const id = await cliente(amb)
  const r = await req(amb, urlAutorizar(base(id)))
  assert.equal(r.status, 302)
  const pedido = new URL(r.headers.get('location')!, ORIGEM).searchParams.get('pedido')!
  const cookie = r.headers.get('set-cookie')!
  assert.match(cookie, /^pauta_oauth=[A-Za-z0-9_-]{43};/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Max-Age=600/)
  assert.match(cookie, /Path=\//)
  const l = um<{ expira_em: string; state: string; navegador_hash: string; resource: string }>(amb.db, 'SELECT * FROM oauth_pedido WHERE id = ?', pedido)!
  assert.equal(l.expira_em, '2026-10-14T13:10:00.000Z')
  assert.equal(l.state, 'st-123')
  assert.equal(l.resource, RECURSO)
  assert.notEqual(l.navegador_hash, cookieDoPedido(r))

  const loop = await cliente(amb, REDIRECT_LOOPBACK)
  const outra = await req(amb, urlAutorizar(base(loop, 'http://127.0.0.1:50999/callback')))
  assert.equal(outra.status, 302)
  assert.match(outra.headers.get('location')!, /^\/autorizar\?pedido=/)
  const outroHost = await req(amb, urlAutorizar(base(loop, 'http://localhost:43123/callback')))
  assert.equal(outroHost.status, 400)
})

test('o 6º pedido pendente do mesmo cliente apaga o mais antigo; o 61º na hora do mesmo IP → 429', async () => {
  const amb = await ambienteMcp()
  const id = await cliente(amb)
  const ids: string[] = []
  for (let i = 0; i < 6; i++) {
    amb.relogio(new Date(Date.parse('2026-10-14T13:00:00.000Z') + i * 1000).toISOString())
    const r = await req(amb, urlAutorizar(base(id)), { headers: { 'X-Forwarded-For': '198.51.100.7' } })
    ids.push(new URL(r.headers.get('location')!, ORIGEM).searchParams.get('pedido')!)
  }
  const vivos = todos<{ id: string }>(amb.db, 'SELECT id FROM oauth_pedido WHERE cliente_id = ?', id).map((l) => l.id)
  assert.equal(vivos.length, 5)
  assert.ok(!vivos.includes(ids[0]!))
  for (let i = 6; i < 60; i++) {
    assert.equal((await req(amb, urlAutorizar(base(id)), { headers: { 'X-Forwarded-For': '198.51.100.7' } })).status, 302)
  }
  const r = await req(amb, urlAutorizar(base(id)), { headers: { 'X-Forwarded-For': '198.51.100.7' } })
  assert.equal(r.status, 429)
  assert.equal(r.headers.get('location'), null)
})

test('a tela: só no navegador do pedido; título pelo destino; anteriores do mesmo destino', async () => {
  const amb = await ambienteMcp()
  const p = await abrirPedido(amb)
  const sessao = sessaoPara(amb.db, amb.pessoas.design.id)
  const sem = await req(amb, `/api/oauth/pedidos/${p.pedidoId}`, { headers: cabecalhosTela(sessao, null) })
  assert.equal(sem.status, 410)
  assert.equal(sem.corpo.erro.mensagem, 'Abra a conexão pelo Claude neste navegador.')
  const outro = await req(amb, `/api/oauth/pedidos/${p.pedidoId}`, { headers: cabecalhosTela(sessao, 'x'.repeat(43)) })
  assert.equal(outro.status, 410)
  assert.equal(outro.corpo.erro.mensagem, 'Abra a conexão pelo Claude neste navegador.')
  const semSessao = await req(amb, `/api/oauth/pedidos/${p.pedidoId}`, { headers: { Cookie: `pauta_oauth=${p.cookie}` } })
  assert.equal(semSessao.status, 401)
  assert.equal((await req(amb, '/api/oauth/pedidos/nao-existe', { headers: cabecalhosTela(sessao, p.cookie) })).status, 404)

  const ok = await req(amb, `/api/oauth/pedidos/${p.pedidoId}`, { headers: cabecalhosTela(sessao, p.cookie) })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.corpo, {
    id: p.pedidoId, nomeCliente: 'Claude', destino: 'claude_ai', hostRedirect: 'claude.ai',
    criadoEm: '2026-10-14T13:00:00.000Z', expiraEm: '2026-10-14T13:10:00.000Z', anteriores: 0,
  })

  await conectar(amb, amb.pessoas.design)
  const p2 = await abrirPedido(amb)
  const de2 = await req(amb, `/api/oauth/pedidos/${p2.pedidoId}`, { headers: cabecalhosTela(sessao, p2.cookie) })
  assert.equal(de2.corpo.anteriores, 1)
  const loop = await abrirPedido(amb, { redirect: REDIRECT_LOOPBACK })
  const deLoop = await req(amb, `/api/oauth/pedidos/${loop.pedidoId}`, { headers: cabecalhosTela(sessao, loop.cookie) })
  assert.equal(deLoop.corpo.destino, 'claude_code')
  assert.equal(deLoop.corpo.hostRedirect, '127.0.0.1')
  assert.equal(deLoop.corpo.anteriores, 0)
})

test('decisão: anti-CSRF, permitir com code/state/iss, negar com access_denied, segunda decisão e vencido → 410', async () => {
  const amb = await ambienteMcp()
  const sessao = sessaoPara(amb.db, amb.pessoas.design.id)
  const p = await abrirPedido(amb)
  const csrf = await req(amb, `/api/oauth/pedidos/${p.pedidoId}/decisao`, {
    method: 'POST', headers: { ...cabecalhosTela(sessao, p.cookie), 'Content-Type': 'application/json' }, body: '{"permitir":true}',
  })
  assert.equal(csrf.status, 403)
  assert.equal(csrf.corpo.erro.codigo, 'csrf')
  const semCookie = await req(amb, `/api/oauth/pedidos/${p.pedidoId}/decisao`, {
    method: 'POST', headers: cabecalhosTela(sessao, null, true), body: '{"permitir":true}',
  })
  assert.equal(semCookie.status, 410)

  const ok = await decidir(amb, p, amb.pessoas.design)
  assert.equal(ok.status, 200)
  const u = new URL(ok.corpo.redirecionar)
  assert.equal(`${u.origin}${u.pathname}`, REDIRECT_CLAUDE)
  assert.match(u.searchParams.get('code')!, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(u.searchParams.get('state'), p.state)
  assert.equal(u.searchParams.get('iss'), ORIGEM)
  assert.match(ok.headers.get('set-cookie') ?? '', /pauta_oauth=;.*Max-Age=0/)
  const l = um<{ decisao: string; usuario_id: string; substituir: number; codigo_expira_em: string }>(amb.db,
    'SELECT * FROM oauth_pedido WHERE id = ?', p.pedidoId)!
  assert.equal(l.decisao, 'permitido')
  assert.equal(l.usuario_id, amb.pessoas.design.id)
  assert.equal(l.substituir, 1)
  assert.equal(l.codigo_expira_em, '2026-10-14T13:05:00.000Z')
  assert.equal((await decidir(amb, p, amb.pessoas.design)).status, 410)

  const n = await abrirPedido(amb)
  const negado = await decidir(amb, n, amb.pessoas.design, false)
  const un = new URL(negado.corpo.redirecionar)
  assert.equal(un.searchParams.get('error'), 'access_denied')
  assert.equal(un.searchParams.get('state'), n.state)
  assert.equal(un.searchParams.get('iss'), ORIGEM)
  assert.equal(un.searchParams.get('code'), null)

  const v = await abrirPedido(amb)
  amb.relogio('2026-10-14T13:10:01.000Z')
  const vencido = await decidir(amb, v, amb.pessoas.design)
  assert.equal(vencido.status, 410)
  assert.equal(vencido.corpo.erro.mensagem, 'Este pedido expirou. Volte ao Claude e conecte de novo.')
})
