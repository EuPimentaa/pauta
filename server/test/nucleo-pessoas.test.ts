/** Pessoas (API.md §4.3) e equipes (§4.4): admin, validação, conflitos e "entrar numa equipe". */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { todos, um } from '../src/db.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'

describe('pessoas', () => {
  test('GET /api/pessoas: admin vê e-mail e convite; os outros → 403', async () => {
    const a = await ambiente()
    const r = await a.como(a.pessoas.admin).get('/api/pessoas')
    assert.equal(r.status, 200)
    assert.equal(r.corpo.length, 7)
    assert.ok(r.corpo.every((u: { email: string }) => u.email.endsWith('@melt.test')))
    for (const p of [a.pessoas.am, a.pessoas.design]) {
      const n = await a.como(p).get('/api/pessoas')
      assert.equal(n.status, 403)
      assert.equal(n.corpo.erro.codigo, 'sem_permissao')
    }
  })

  test('POST: cria com convite de 7 dias; e-mail ou apelido repetido → 409; não admin → 403; inválido → 400', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const r = await admin.post('/api/pessoas', { nome: 'Lia Nova', apelido: 'Lia', email: ' LIA@melt.test ', papel: 'atendimento', cor: 'verde' })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.usuario.email, 'lia@melt.test')
    assert.equal(r.corpo.usuario.temSenha, false)
    assert.equal(r.corpo.usuario.conviteExpiraEm, '2026-10-21T13:00:00.000Z')
    assert.equal(r.corpo.convite.expiraEm, '2026-10-21T13:00:00.000Z')
    assert.equal((await admin.post('/api/pessoas', { nome: 'X', email: 'lia@melt.test', papel: 'equipe' })).status, 409)
    assert.equal((await admin.post('/api/pessoas', { nome: 'X', apelido: 'lia', email: 'x@melt.test', papel: 'equipe' })).status, 409)
    assert.equal((await admin.post('/api/pessoas', { nome: 'X', email: 'nao-email', papel: 'equipe' })).status, 400)
    assert.equal((await admin.post('/api/pessoas', { nome: 'X', email: 'y@melt.test', papel: 'chefe' })).status, 400)
    assert.equal((await admin.post('/api/pessoas', { nome: 'X', email: 'z@melt.test', papel: 'equipe', equipes: [{ equipeId: 'eq-nada' }] })).status, 400)
    assert.equal((await a.como(a.pessoas.am).post('/api/pessoas', { nome: 'X', email: 'w@melt.test', papel: 'equipe' })).status, 403)
  })

  test('entrar na equipe pelo POST: segue os quadros e ganha uma coluna logo depois da última coluna de pessoa', async () => {
    const a = await ambiente()
    const seq = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.admin).post('/api/pessoas', {
      nome: 'Teo Alves', email: 'teo@melt.test', papel: 'equipe', cor: 'turquesa', equipes: [{ equipeId: 'eq-criacao', funcao: 'design' }],
    })
    assert.equal(r.status, 201)
    const id = r.corpo.usuario.id
    const q = await a.como(a.pessoas.admin).get(`/api/quadros/${a.quadros.criacao.quadro.id}`)
    const ativas = q.corpo.colunas.filter((c: { arquivadaEm: string | null }) => !c.arquivadaEm)
    assert.deepEqual(ativas.map((c: { nome: string }) => c.nome), ['Fila', 'Design', 'Design2', 'Teo', 'Pronto', 'Concluído'])
    const teo = ativas.find((c: { nome: string }) => c.nome === 'Teo')
    assert.equal(teo.responsavelId, id)
    assert.equal(teo.cor, 'turquesa')
    assert.ok(um(a.db, 'SELECT 1 FROM quadro_usuario WHERE usuario_id = ? AND quadro_id = ? AND seguindo = 1', id, a.quadros.criacao.quadro.id))
    const evs = eventos(a.db, seq)
    assert.ok(evs.some((e) => e.entidade === 'usuario' && e.entidade_id === id))
    assert.ok(evs.some((e) => e.entidade === 'equipe' && e.entidade_id === 'eq-criacao'))
    assert.ok(evs.some((e) => e.entidade === 'coluna' && e.entidade_id === teo.id))
    const qu = evs.find((e) => e.entidade === 'quadro_usuario')!
    assert.equal(qu.publico, 'usuario')
    assert.equal(qu.usuario_id, id)
  })

  test('entrar pelo PATCH e pelo PUT membros cria uma coluna só; sair não arquiva; quadro sem colunaPorMembro não ganha', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const web = a.pessoas.web.id
    await admin.patch(`/api/pessoas/${web}`, { equipes: [{ equipeId: 'eq-web' }, { equipeId: 'eq-criacao' }] })
    await admin.patch(`/api/pessoas/${web}`, { equipes: [{ equipeId: 'eq-web' }, { equipeId: 'eq-criacao' }] })
    const contar = () => um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM coluna WHERE responsavel_id = ? AND arquivada_em IS NULL', web)!.n
    assert.equal(contar(), 1)
    const atual = await admin.get('/api/equipes')
    const criacao = atual.corpo.find((e: { id: string }) => e.id === 'eq-criacao')
    assert.ok(criacao.membros.some((m: { usuarioId: string }) => m.usuarioId === web))
    await admin.put('/api/equipes/eq-criacao/membros', { membros: criacao.membros.filter((m: { usuarioId: string }) => m.usuarioId !== web) })
    assert.equal(contar(), 1)
    await admin.put('/api/equipes/eq-criacao/membros', { membros: criacao.membros })
    assert.equal(contar(), 1)
    // o Social não tem colunaPorMembro: entrar só segue
    await admin.put('/api/equipes/eq-social/membros', { membros: [{ usuarioId: web, funcao: null, principal: false }] })
    assert.equal(contar(), 1)
    assert.ok(um(a.db, 'SELECT 1 FROM quadro_usuario WHERE usuario_id = ? AND quadro_id = ? AND seguindo = 1', web, a.quadros.social.quadro.id))
  })

  test('PATCH: desativar revoga sessões e tokens e para o cronômetro; último admin não sai', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const d = await a.criarDemanda()
    const design = a.como(a.pessoas.design)
    a.db.prepare(`INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, iniciado_em, origem, criado_em, atualizado_em)
      VALUES ('cron', ?, ?, ?, '2026-10-14', '2026-10-14T12:00:00.000Z', 'cronometro', '2026-10-14T12:00:00.000Z', '2026-10-14T12:00:00.000Z')`)
      .run(a.pessoas.design.id, d.id, d.clienteId)
    const r = await admin.patch(`/api/pessoas/${a.pessoas.design.id}`, { ativo: false })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.ativo, false)
    assert.equal((await design.get('/api/auth/eu')).status, 401)
    const ap = um<{ minutos: number; parado_em: string }>(a.db, "SELECT minutos, parado_em FROM apontamento WHERE id = 'cron'")!
    assert.equal(ap.minutos, 60)
    assert.equal(ap.parado_em, '2026-10-14T13:00:00.000Z')
    // continua membro e a coluna dele continua lá
    assert.ok(um(a.db, 'SELECT 1 FROM coluna WHERE responsavel_id = ? AND arquivada_em IS NULL', a.pessoas.design.id))
    assert.equal((await admin.patch(`/api/pessoas/${a.pessoas.admin.id}`, { papel: 'equipe' })).status, 409)
    assert.equal((await admin.patch(`/api/pessoas/${a.pessoas.admin.id}`, { ativo: false })).status, 409)
    assert.equal((await admin.patch(`/api/pessoas/${a.pessoas.am.id}`, { email: 'am2@melt.test' })).status, 409)
    assert.equal((await admin.patch(`/api/pessoas/${a.pessoas.am.id}`, { apelido: 'gabi' })).status, 409)
    assert.equal((await admin.patch('/api/pessoas/nao-existe', { nome: 'X' })).status, 404)
  })

  test('mudar o papel revoga as sessões', async () => {
    const a = await ambiente()
    const web = a.como(a.pessoas.web)
    assert.equal((await web.get('/api/auth/eu')).status, 200)
    const r = await a.como(a.pessoas.admin).patch(`/api/pessoas/${a.pessoas.web.id}`, { papel: 'atendimento' })
    assert.equal(r.corpo.papel, 'atendimento')
    assert.equal((await web.get('/api/auth/eu')).status, 401)
  })

  test('redefinição de pessoa inativa → 409', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    await admin.patch(`/api/pessoas/${a.pessoas.web.id}`, { ativo: false })
    assert.equal((await admin.post(`/api/pessoas/${a.pessoas.web.id}/redefinicao`)).status, 409)
    assert.equal((await admin.post(`/api/pessoas/${a.pessoas.web.id}/convite`)).status, 409)
  })
})

describe('equipes', () => {
  test('listar para todos; criar e editar só admin; nome e slug repetidos → 409', async () => {
    const a = await ambiente()
    const lista = await a.como(a.pessoas.design).get('/api/equipes')
    assert.equal(lista.status, 200)
    assert.deepEqual(lista.corpo.map((e: { slug: string }) => e.slug), ['atendimento', 'criacao', 'social', 'web', 'trafego', 'producao'])
    const admin = a.como(a.pessoas.admin)
    const r = await admin.post('/api/equipes', { nome: 'Eventos', slug: 'eventos', cor: 'verde', modeloQuadroId: 'mq-kanban' })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.pos, 7168)
    assert.equal((await admin.post('/api/equipes', { nome: 'eventos', slug: 'eventos-2' })).status, 409)
    assert.equal((await admin.post('/api/equipes', { nome: 'Outra', slug: 'eventos' })).status, 409)
    assert.equal((await admin.post('/api/equipes', { nome: 'Outra', slug: 'Com Espaço' })).status, 400)
    assert.equal((await admin.post('/api/equipes', { nome: 'Outra', slug: 'outra', modeloQuadroId: 'mq-nada' })).status, 400)
    assert.equal((await a.como(a.pessoas.am).post('/api/equipes', { nome: 'X', slug: 'x' })).status, 403)
    const e = await admin.patch(`/api/equipes/${r.corpo.id}`, { nome: 'Eventos e Ativações', ativa: false, posicao: { depoisDeId: null } })
    assert.equal(e.status, 200)
    assert.equal(e.corpo.ativa, false)
    assert.equal(e.corpo.pos, 0)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/equipes/${r.corpo.id}`, { nome: 'Y' })).status, 403)
  })

  test('PUT membros substitui; pessoa repetida ou inexistente → 400; eventos de quem entrou e saiu', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const seq = ultimoSeq(a.db)
    const r = await admin.put('/api/equipes/eq-web/membros', { membros: [{ usuarioId: a.pessoas.am.id, funcao: 'dev', principal: true }] })
    assert.equal(r.status, 200)
    assert.deepEqual(r.corpo.membros, [{ usuarioId: a.pessoas.am.id, funcao: 'dev', principal: true }])
    const usuarios = eventos(a.db, seq).filter((e) => e.entidade === 'usuario').map((e) => e.entidade_id).sort()
    assert.deepEqual(usuarios, [a.pessoas.am.id, a.pessoas.web.id].sort())
    const dup = { usuarioId: a.pessoas.am.id, funcao: null, principal: false }
    assert.equal((await admin.put('/api/equipes/eq-web/membros', { membros: [dup, dup] })).status, 400)
    assert.equal((await admin.put('/api/equipes/eq-web/membros', { membros: [{ ...dup, usuarioId: 'x' }] })).status, 400)
    assert.equal((await a.como(a.pessoas.web).put('/api/equipes/eq-web/membros', { membros: [] })).status, 403)
    assert.equal((await admin.put('/api/equipes/eq-nada/membros', { membros: [] })).status, 404)
    assert.deepEqual(todos<{ usuario_id: string }>(a.db, "SELECT usuario_id FROM equipe_membro WHERE equipe_id = 'eq-web'").map((l) => l.usuario_id), [a.pessoas.am.id])
  })
})
