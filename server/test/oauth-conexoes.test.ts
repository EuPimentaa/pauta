/** F7 · revogação (RFC 7009), Conexões (API.md §F.4), as conexões seguem as sessões e a poda. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rodar, todos, um } from '../src/db.ts'
import { podarOAuth } from '../src/servicos/oauth.ts'
import { tarefa } from '../src/tarefas/oauth-poda.ts'
import { ORIGEM, SENHA_TESTE, eventos, ultimoSeq } from './ajuda.ts'
import { ambienteMcp, conectar, form, req, rpc, REDIRECT_LOOPBACK } from './mcp-ajuda.ts'

type Amb = Awaited<ReturnType<typeof ambienteMcp>>

async function refresh(amb: Amb, c: { rt: string; clientId: string }) {
  return req(amb, '/oauth/token', form({ grant_type: 'refresh_token', refresh_token: c.rt, client_id: c.clientId }))
}

async function cortada(amb: Amb, c: { at: string; rt: string; clientId: string }): Promise<void> {
  const m = await rpc(amb, c.at, 'ping')
  assert.equal(m.status, 401)
  assert.match(m.headers.get('www-authenticate')!, /error="invalid_token"/)
  assert.equal((await refresh(amb, c)).corpo.error, 'invalid_grant')
}

function motivo(amb: Amb, usuarioId: string): string[] {
  return todos<{ motivo_revogacao: string }>(amb.db, 'SELECT motivo_revogacao FROM oauth_concessao WHERE usuario_id = ? ORDER BY criada_em',
    usuarioId).map((l) => l.motivo_revogacao)
}

test('/oauth/revogar: 200 sempre (até com token desconhecido); a próxima chamada ao /mcp → 401', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const lixo = await req(amb, '/oauth/revogar', form({ token: 'pauta_at_nao_existe', client_id: c.clientId }))
  assert.equal(lixo.status, 200)
  assert.equal(lixo.texto, '')
  assert.equal((await req(amb, '/oauth/revogar', { method: 'POST', body: 'x' })).status, 200)
  const r = await req(amb, '/oauth/revogar', form({ token: c.rt, token_type_hint: 'refresh_token', client_id: c.clientId }))
  assert.equal(r.status, 200)
  await cortada(amb, c)
  assert.deepEqual(motivo(amb, amb.pessoas.design.id), ['pedido_cliente'])
})

test('Conexões: as minhas; todas só admin; revogar a minha; a de outra pessoa → 404; o admin revoga qualquer uma', async () => {
  const amb = await ambienteMcp()
  const minha = await conectar(amb, amb.pessoas.design)
  const loop = await conectar(amb, amb.pessoas.design, { redirect: REDIRECT_LOOPBACK })
  const daAna = await conectar(amb, amb.pessoas.social)
  const eu = amb.como(amb.pessoas.design)
  const lista = await eu.get('/api/conexoes')
  assert.equal(lista.status, 200)
  assert.equal(lista.corpo.urlMcp, `${ORIGEM}/mcp`)
  assert.equal(lista.corpo.conexoes.length, 2)
  const porDestino = Object.fromEntries(lista.corpo.conexoes.map((x: any) => [x.destino, x]))
  assert.deepEqual(Object.keys(porDestino).sort(), ['claude_ai', 'claude_code'])
  assert.equal(porDestino.claude_ai.hostRedirect, 'claude.ai')
  assert.equal(porDestino.claude_ai.nomeCliente, 'Claude')
  assert.equal(porDestino.claude_ai.revogadaEm, null)
  assert.equal((await eu.get('/api/conexoes?todas=1')).status, 403)
  const todas = await amb.como(amb.pessoas.admin).get('/api/conexoes?todas=1')
  assert.equal(todas.corpo.conexoes.length, 3)

  const idAna = todas.corpo.conexoes.find((x: any) => x.usuarioId === amb.pessoas.social.id).id
  assert.equal((await eu.post(`/api/conexoes/${idAna}/revogar`)).status, 404)
  assert.equal((await rpc(amb, daAna.at, 'ping')).status, 200)

  const seq = ultimoSeq(amb.db)
  const r = await eu.post(`/api/conexoes/${porDestino.claude_ai.id}/revogar`)
  assert.equal(r.status, 200)
  assert.equal(r.corpo.motivoRevogacao, 'usuario')
  assert.ok(r.corpo.revogadaEm)
  await cortada(amb, minha)
  assert.equal((await rpc(amb, loop.at, 'ping')).status, 200)
  const ev = eventos(amb.db, seq).filter((e) => e.entidade === 'conexao')
  assert.equal(ev.length, 1)
  assert.equal(ev[0]!.publico, 'usuario_admin')
  assert.equal(ev[0]!.usuario_id, amb.pessoas.design.id)
  assert.equal((ev[0]!.patch as any).motivoRevogacao, 'usuario')
  // de novo: 200 com o estado atual, sem efeito
  const de2 = await eu.post(`/api/conexoes/${porDestino.claude_ai.id}/revogar`)
  assert.equal(de2.status, 200)
  assert.equal(eventos(amb.db, seq).filter((e) => e.entidade === 'conexao').length, 1)

  const admin = await amb.como(amb.pessoas.admin).post(`/api/conexoes/${idAna}/revogar`)
  assert.equal(admin.corpo.motivoRevogacao, 'admin')
  assert.equal(um<{ revogada_por: string }>(amb.db, 'SELECT revogada_por FROM oauth_concessao WHERE id = ?', idAna)!.revogada_por,
    amb.pessoas.admin.id)
  await cortada(amb, daAna)
  assert.equal((await amb.como(amb.pessoas.admin).post('/api/conexoes/nao-existe/revogar')).status, 404)
  const revogadas = await eu.get('/api/conexoes?incluirRevogadas=1')
  assert.equal(revogadas.corpo.conexoes.length, 2)
  assert.equal(revogadas.corpo.conexoes[0].revogadaEm, null)
})

test('SSE conexao: criada na troca do código, só para a dona e os admins', async () => {
  const amb = await ambienteMcp()
  const seq = ultimoSeq(amb.db)
  await conectar(amb, amb.pessoas.design)
  const ev = eventos(amb.db, seq).filter((e) => e.entidade === 'conexao')
  assert.equal(ev.length, 1)
  assert.equal(ev[0]!.publico, 'usuario_admin')
  assert.equal(ev[0]!.usuario_id, amb.pessoas.design.id)
  assert.equal(ev[0]!.campos, null)
  assert.equal((ev[0]!.patch as any).destino, 'claude_ai')
})

test('as conexões seguem as sessões: trocar a senha (credenciais)', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const r = await amb.como(amb.pessoas.design).post('/api/auth/senha', { senhaAtual: SENHA_TESTE, senhaNova: 'Outra-senha-bem-longa-42' })
  assert.equal(r.status, 204)
  await cortada(amb, c)
  assert.deepEqual(motivo(amb, amb.pessoas.design.id), ['credenciais'])
})

test('as conexões seguem as sessões: redefinir a senha pelo link (credenciais)', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const link = await amb.como(amb.pessoas.admin).post(`/api/pessoas/${amb.pessoas.design.id}/redefinicao`)
  assert.equal(link.status, 200)
  const token = String(link.corpo.url).split('#')[1]!
  const r = await req(amb, '/api/auth/redefinicao', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'X-Trace-Id': crypto.randomUUID() },
    body: JSON.stringify({ token, senha: 'Nova-senha-bem-longa-77' }),
  })
  assert.equal(r.status, 200)
  await cortada(amb, c)
  assert.deepEqual(motivo(amb, amb.pessoas.design.id), ['credenciais'])
})

test('as conexões seguem as sessões: mudar o papel (papel) e desativar (desativacao); trocar o e-mail não revoga', async () => {
  const amb = await ambienteMcp()
  const admin = amb.como(amb.pessoas.admin)
  const c = await conectar(amb, amb.pessoas.design)
  assert.equal((await admin.patch(`/api/pessoas/${amb.pessoas.design.id}`, { email: 'rafa.novo@melt.test' })).status, 200)
  assert.equal((await rpc(amb, c.at, 'ping')).status, 200)
  assert.equal((await admin.patch(`/api/pessoas/${amb.pessoas.design.id}`, { papel: 'atendimento' })).status, 200)
  await cortada(amb, c)
  assert.deepEqual(motivo(amb, amb.pessoas.design.id), ['papel'])

  const d = await conectar(amb, amb.pessoas.social)
  assert.equal((await admin.patch(`/api/pessoas/${amb.pessoas.social.id}`, { ativo: false })).status, 200)
  await cortada(amb, d)
  assert.deepEqual(motivo(amb, amb.pessoas.social.id), ['desativacao'])
})

test('pessoa inativa sem revogação (gravada à mão): /mcp → 401 invalid_token', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  rodar(amb.db, 'UPDATE usuario SET ativo = 0 WHERE id = ?', amb.pessoas.design.id)
  await cortada(amb, c)
})

test('oauth-poda: pedidos e tokens vencidos há mais de 1 dia, clientes sem concessão com mais de 24 h, o par guardado', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  await req(amb, '/oauth/token', form({ grant_type: 'refresh_token', refresh_token: c.rt, client_id: c.clientId }))
  await req(amb, '/oauth/registrar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }) })
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_cliente')!.n, 2)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_token WHERE filho_cifrado IS NOT NULL')!.n, 1)
  amb.relogio('2026-10-15T15:00:00.000Z')
  assert.equal(tarefa.nome, 'oauth-poda')
  assert.equal(tarefa.horario, '03:30')
  const r = podarOAuth(amb.db)
  assert.equal(r.clientes, 1)
  assert.equal(r.filhos, 1)
  assert.ok(r.pedidos >= 1)
  assert.equal(r.tokens, 2) // os dois de acesso (1 h); os refresh valem 30 dias
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_cliente')!.n, 1)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM oauth_concessao')!.n, 1)
})
