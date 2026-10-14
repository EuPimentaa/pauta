/** Quadros (API.md §4.5) e etiquetas (§4.7). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rodar, todos, um } from '../src/db.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'

describe('criar quadro', () => {
  test('Por pessoa com 3 membros: Fila + uma coluna por pessoa (apelido, cor, responsável) e colunaPorMembro', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    await admin.put('/api/equipes/eq-producao/membros', { membros: [
      { usuarioId: a.pessoas.web.id, funcao: null, principal: false },
      { usuarioId: a.pessoas.social.id, funcao: null, principal: true },
      { usuarioId: a.pessoas.design2.id, funcao: null, principal: false },
    ] })
    const seq = ultimoSeq(a.db)
    const r = await admin.post('/api/quadros', { nome: 'Produção', equipeId: 'eq-producao', modeloQuadroId: 'mq-por-pessoa' })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.quadro.slug, 'producao')
    assert.equal(r.corpo.quadro.colunaPorMembro, true)
    assert.deepEqual(r.corpo.colunas.map((c: { nome: string }) => c.nome), ['Fila', 'Social', 'Web', 'Design2'])
    const social = r.corpo.colunas[1]
    assert.equal(social.responsavelId, a.pessoas.social.id)
    assert.equal(social.cor, 'roxo')
    // os membros passam a seguir; eventos de quadro, colunas e quadro_usuario (usuário)
    const seguidores = todos<{ usuario_id: string }>(a.db, 'SELECT usuario_id FROM quadro_usuario WHERE quadro_id = ? AND seguindo = 1',
      r.corpo.quadro.id).map((l) => l.usuario_id).sort()
    assert.deepEqual(seguidores, [a.pessoas.web.id, a.pessoas.social.id, a.pessoas.design2.id].sort())
    const evs = eventos(a.db, seq)
    assert.equal(evs.filter((e) => e.entidade === 'quadro').length, 1)
    assert.equal(evs.filter((e) => e.entidade === 'coluna').length, 4)
    assert.ok(evs.filter((e) => e.entidade === 'quadro_usuario').every((e) => e.publico === 'usuario' && e.usuario_id))
  })

  test('equipe sem membros: só a Fila e a flag ligada (quem entrar depois ganha a coluna)', async () => {
    const a = await ambiente()
    const r = await a.como(a.pessoas.admin).post('/api/quadros', { nome: 'Tráfego', equipeId: 'eq-trafego', modeloQuadroId: 'mq-por-pessoa' })
    assert.deepEqual(r.corpo.colunas.map((c: { nome: string }) => c.nome), ['Fila'])
    assert.equal(r.corpo.quadro.colunaPorMembro, true)
    await a.como(a.pessoas.admin).patch(`/api/pessoas/${a.pessoas.web.id}`, { equipes: [{ equipeId: 'eq-trafego' }] })
    const q = await a.como(a.pessoas.admin).get(`/api/quadros/${r.corpo.quadro.id}`)
    assert.deepEqual(q.corpo.colunas.map((c: { nome: string }) => c.nome), ['Fila', 'Web'])
  })

  test('Kanban simples cria as 2 automações; com "Com o cliente" desmarcada, só a de ajuste; colunas do corpo vencem', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const r = await admin.post('/api/quadros', { nome: 'Web', equipeId: 'eq-web', modeloQuadroId: 'mq-kanban' })
    assert.deepEqual(r.corpo.colunas.map((c: { nome: string }) => c.nome), ['A fazer', 'Fazendo', 'Revisão', 'Com o cliente', 'Concluído'])
    const porNome = (n: string) => r.corpo.colunas.find((c: { nome: string }) => c.nome === n).id
    assert.deepEqual(r.corpo.automacoes.map((x: { gatilho: string; destinoColunaId: string }) => [x.gatilho, x.destinoColunaId]).sort(),
      [['ajuste_pedido', porNome('Fazendo')], ['enviado_ao_cliente', porNome('Com o cliente')]])
    assert.equal(r.corpo.quadro.colunaPorMembro, false)

    const s = await admin.post('/api/quadros', { nome: 'Produção', equipeId: 'eq-producao', modeloQuadroId: 'mq-kanban', colunas: [
      { nome: 'Pauta', modeloColunaId: 'mqc-kanban-a-fazer' },
      { nome: 'Em produção', modeloColunaId: 'mqc-kanban-fazendo', cor: 'azul' },
      { nome: 'Feito', papel: 'concluida', modeloColunaId: 'mqc-kanban-concluido' },
    ] })
    assert.equal(s.status, 201)
    assert.deepEqual(s.corpo.colunas.map((c: { nome: string }) => c.nome), ['Pauta', 'Em produção', 'Feito'])
    assert.deepEqual(s.corpo.automacoes.map((x: { gatilho: string }) => x.gatilho), ['ajuste_pedido'])
    assert.equal(s.corpo.automacoes[0].destinoColunaId, s.corpo.colunas[1].id)
  })

  test('validação: responsável repetido ou inativo → 400; modelo ou equipe inexistente → 400; nome ativo repetido → 409; não admin → 403', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const rep = { nome: 'X', responsavelId: a.pessoas.web.id }
    assert.equal((await admin.post('/api/quadros', { nome: 'Q1', colunas: [rep, rep] })).status, 400)
    await admin.patch(`/api/pessoas/${a.pessoas.web.id}`, { ativo: false })
    assert.equal((await admin.post('/api/quadros', { nome: 'Q1', colunas: [rep] })).status, 400)
    assert.equal((await admin.post('/api/quadros', { nome: 'Q1', colunas: [{ nome: 'P', papel: 'concluida', responsavelId: a.pessoas.am.id }] })).status, 400)
    assert.equal((await admin.post('/api/quadros', { nome: 'Q1', modeloQuadroId: 'mq-nada' })).status, 400)
    assert.equal((await admin.post('/api/quadros', { nome: 'Q1', equipeId: 'eq-nada' })).status, 400)
    const dup = await admin.post('/api/quadros', { nome: 'criacao' })
    assert.equal(dup.status, 409)
    assert.equal((await admin.post('/api/quadros', { nome: 'Outro', slug: 'criacao' })).status, 409)
    assert.equal((await admin.post('/api/quadros', { nome: 'Outro', slug: 'Com Espaço' })).status, 400)
    for (const p of [a.pessoas.am, a.pessoas.design]) assert.equal((await a.como(p).post('/api/quadros', { nome: 'Q2' })).status, 403)
    // slug automático com sufixo
    const v = await admin.post('/api/quadros', { nome: 'Criação!' })
    assert.equal(v.status, 201)
    assert.equal(v.corpo.quadro.slug, 'criacao-2')
    const w = await admin.post('/api/quadros', { nome: 'Criação de vídeo' })
    assert.equal(w.corpo.quadro.slug, 'criacao-de-video')
    assert.deepEqual(w.corpo.colunas, [])
  })
})

describe('copiar, editar, arquivar, restaurar e excluir', () => {
  test('copiar a Criação: colunas com responsável, etiquetas, automações remapeadas, modelos do quadro; sem cards', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    await a.criarDemanda()
    await admin.post('/api/quadros/x/copiar', { nome: 'Y' }).then((r) => assert.equal(r.status, 404))
    rodar(a.db, `INSERT INTO modelo_demanda (id, quadro_id, nome, pos, criado_em, atualizado_em) VALUES ('md-q', ?, 'Banner', 1024, ?, ?)`,
      a.quadros.criacao.quadro.id, '2026-10-14T13:00:00.000Z', '2026-10-14T13:00:00.000Z')
    rodar(a.db, `INSERT INTO modelo_demanda_item (id, modelo_id, texto, pos) VALUES ('mdi-q', 'md-q', 'Medir', 1024)`)
    assert.equal((await a.como(a.pessoas.am).post(`/api/quadros/${a.quadros.criacao.quadro.id}/copiar`, { nome: 'Criação 2' })).status, 403)
    const seq = ultimoSeq(a.db)
    const r = await admin.post(`/api/quadros/${a.quadros.criacao.quadro.id}/copiar`, { nome: 'Criação 2' })
    assert.equal(r.status, 201)
    const c = r.corpo
    assert.equal(c.quadro.slug, 'criacao-2')
    assert.equal(c.quadro.equipeId, 'eq-criacao')
    assert.equal(c.quadro.colunaPorMembro, true)
    assert.deepEqual(c.colunas.map((x: { nome: string }) => x.nome), ['Fila', 'Design', 'Design2', 'Pronto', 'Concluído'])
    assert.equal(c.colunas[1].responsavelId, a.pessoas.design.id)
    assert.deepEqual(c.etiquetas.map((e: { nome: string }) => e.nome), ['Urgente', 'Alteração'])
    const auto = Object.fromEntries(c.automacoes.map((x: { gatilho: string }) => [x.gatilho, x]))
    assert.equal(auto.ajuste_pedido.destinoColunaId, c.colunas[0].id)
    assert.equal(auto.ajuste_pedido.destinoQuadroId, c.quadro.id)
    assert.equal(auto.aprovado.destinoColunaId, a.coluna('social', 'Agendar').id)
    assert.equal(auto.aprovado.membros, 'responsavel_destino')
    assert.equal(auto.enviado_ao_cliente.destinoColunaId, a.coluna('atendimento', 'Com o cliente').id)
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM demanda WHERE quadro_id = ?', c.quadro.id)!.n, 0)
    const modelos = todos<{ id: string; nome: string }>(a.db, 'SELECT id, nome FROM modelo_demanda WHERE quadro_id = ?', c.quadro.id)
    assert.deepEqual(modelos.map((m) => m.nome), ['Banner'])
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM modelo_demanda_item WHERE modelo_id = ?', modelos[0]!.id)!.n, 1)
    const entidades = new Set(eventos(a.db, seq).map((e) => e.entidade))
    for (const e of ['quadro', 'coluna', 'etiqueta', 'automacao', 'modelo_demanda', 'quadro_usuario']) assert.ok(entidades.has(e), e)
    assert.equal((await admin.post(`/api/quadros/${a.quadros.criacao.quadro.id}/copiar`, { nome: 'Criação 2' })).status, 409)
  })

  test('PATCH só admin: nome, slug, cor, fundo, equipe e posição; nome ou slug repetido → 409', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const id = a.quadros.social.quadro.id
    const r = await admin.patch(`/api/quadros/${id}`, { nome: 'Social e Mídia', slug: 'social-midia', fundo: 'aurora', posicao: { depoisDeId: null } })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.slug, 'social-midia')
    assert.equal(r.corpo.fundo, 'aurora')
    assert.ok(r.corpo.pos < a.quadros.atendimento.quadro.pos)
    assert.equal((await admin.get('/api/quadros/social-midia')).corpo.quadro.id, id)
    assert.equal((await admin.patch(`/api/quadros/${id}`, { nome: 'Atendimento' })).status, 409)
    assert.equal((await admin.patch(`/api/quadros/${id}`, { slug: 'criacao' })).status, 409)
    assert.equal((await admin.patch(`/api/quadros/${id}`, { fundo: 'xadrez' })).status, 400)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/quadros/${id}`, { nome: 'Z' })).status, 403)
  })

  test('arquivar tira as demandas do bootstrap, desliga automações de outros quadros e para cronômetros; restaurar volta', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const d = await a.criarDemanda({ quadroId: a.quadros.social.quadro.id })
    const social = a.quadros.social.quadro.id
    const seq = ultimoSeq(a.db)
    const r = await admin.post(`/api/quadros/${social}/arquivar`)
    assert.equal(r.status, 200)
    assert.ok(r.corpo.arquivadoEm)
    const auto = um<{ ativa: number }>(a.db, "SELECT ativa FROM automacao_quadro WHERE quadro_id = ? AND gatilho = 'aprovado'", a.quadros.criacao.quadro.id)!
    assert.equal(auto.ativa, 0)
    const evs = eventos(a.db, seq)
    assert.ok(evs.some((e) => e.entidade === 'automacao' && e.patch?.ativa === false))
    assert.ok(evs.some((e) => e.entidade === 'quadro' && e.patch?.arquivadoEm))
    const boot = await a.como(a.pessoas.design).get('/api/bootstrap')
    assert.ok(!boot.corpo.quadros.some((q: { id: string }) => q.id === social))
    assert.ok(!boot.corpo.demandas.some((x: { id: string }) => x.id === d.id))
    assert.ok(!boot.corpo.colunas.some((c: { quadroId: string }) => c.quadroId === social))
    assert.equal((await admin.get('/api/quadros?arquivados=1')).corpo.length, 1)
    assert.equal((await admin.post(`/api/quadros/${social}/arquivar`)).status, 409)
    // o detalhe da demanda continua abrindo
    assert.equal((await a.como(a.pessoas.design).get(`/api/demandas/${d.numero}`)).corpo.quadro.arquivadoEm, r.corpo.arquivadoEm)

    const seq2 = ultimoSeq(a.db)
    const v = await admin.post(`/api/quadros/${social}/restaurar`)
    assert.equal(v.status, 200)
    assert.equal(v.corpo.quadro.arquivadoEm, null)
    const ev = eventos(a.db, seq2).find((e) => e.entidade === 'quadro')!
    assert.equal(ev.patch!.arquivadoEm, null)
    assert.ok((await a.como(a.pessoas.design).get('/api/bootstrap')).corpo.demandas.some((x: { id: string }) => x.id === d.id))
    assert.equal((await admin.post(`/api/quadros/${social}/restaurar`)).status, 409)
  })

  test('restaurar com nome igual ao de um quadro ativo → 409', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    await admin.post(`/api/quadros/${a.quadros.social.quadro.id}/arquivar`)
    assert.equal((await admin.post('/api/quadros', { nome: 'Social' })).status, 201)
    assert.equal((await admin.post(`/api/quadros/${a.quadros.social.quadro.id}/restaurar`)).status, 409)
  })

  test('excluir: com demanda (mesmo arquivada ou de passagem) → 409; vazio → 204 levando o que apontava para ele', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const d = await a.criarDemanda({ quadroId: a.quadros.social.quadro.id })
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/arquivar`)
    const r = await admin.del(`/api/quadros/${a.quadros.social.quadro.id}`)
    assert.equal(r.status, 409)
    assert.equal(r.corpo.erro.mensagem, 'Este quadro já teve demandas. Arquive em vez de excluir.')

    const passagem = await admin.post('/api/quadros', { nome: 'Passagem', colunas: [{ nome: 'Um' }] })
    const outra = await a.criarDemanda()
    await a.como(a.pessoas.am).post(`/api/demandas/${outra.id}/mover`, { colunaId: passagem.corpo.colunas[0].id })
    await a.como(a.pessoas.am).post(`/api/demandas/${outra.id}/mover`, { colunaId: a.coluna('criacao', 'Fila').id })
    assert.equal((await admin.del(`/api/quadros/${passagem.corpo.quadro.id}`)).status, 409)

    const vazio = await admin.post('/api/quadros', { nome: 'Vazio', modeloQuadroId: 'mq-kanban' })
    const id = vazio.corpo.quadro.id
    await a.como(a.pessoas.am).post(`/api/quadros/${id}/etiquetas`, { nome: 'Teste', cor: 'azul' })
    await admin.put(`/api/quadros/${id}/favorito`, { favorito: true })
    rodar(a.db, `INSERT INTO automacao_quadro (quadro_id, gatilho, destino_quadro_id, destino_coluna_id, atualizado_em)
                 VALUES (?, 'concluida', ?, ?, '2026-10-14T13:00:00.000Z')`, a.quadros.social.quadro.id, id, vazio.corpo.colunas[0].id)
    assert.equal((await a.como(a.pessoas.am).del(`/api/quadros/${id}`)).status, 403)
    const seq = ultimoSeq(a.db)
    assert.equal((await admin.del(`/api/quadros/${id}`)).status, 204)
    for (const t of ['quadro', 'coluna', 'etiqueta', 'quadro_usuario']) {
      assert.equal(um<{ n: number }>(a.db, `SELECT count(*) AS n FROM ${t} WHERE ${t === 'quadro' ? 'id' : 'quadro_id'} = ?`, id)!.n, 0, t)
    }
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM automacao_quadro WHERE quadro_id = ? OR destino_quadro_id = ?', id, id)!.n, 0)
    const deletes = eventos(a.db, seq).filter((e) => e.op === 'delete').map((e) => e.entidade)
    for (const e of ['quadro', 'coluna', 'etiqueta', 'automacao', 'quadro_usuario']) assert.ok(deletes.includes(e), e)
  })
})

describe('estrela e seguir', () => {
  test('favoritos em ordem, arrastar no menu, sem estrela e sem seguir a linha sai', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.web)
    const [at, cr, so] = [a.quadros.atendimento.quadro.id, a.quadros.criacao.quadro.id, a.quadros.social.quadro.id]
    assert.equal((await eu.put(`/api/quadros/${at}/favorito`, { favorito: true })).corpo.favoritoPos, 1024)
    assert.equal((await eu.put(`/api/quadros/${cr}/favorito`, { favorito: true })).corpo.favoritoPos, 2048)
    await eu.put(`/api/quadros/${so}/favorito`, { favorito: true, posicao: { depoisDeQuadroId: null } })
    await eu.put(`/api/quadros/${at}/favorito`, { favorito: true, posicao: { depoisDeQuadroId: cr } })
    assert.deepEqual((await eu.get('/api/auth/eu')).corpo.favoritos, [so, cr, at])
    assert.equal((await eu.put(`/api/quadros/${at}/favorito`, { favorito: true, posicao: { depoisDeQuadroId: 'x' } })).status, 400)
    const seq = ultimoSeq(a.db)
    const r = await eu.put(`/api/quadros/${so}/favorito`, { favorito: false })
    assert.deepEqual(r.corpo, { quadroId: so, favoritoPos: null, seguindo: false })
    assert.equal(um(a.db, 'SELECT 1 FROM quadro_usuario WHERE quadro_id = ? AND usuario_id = ?', so, a.pessoas.web.id), undefined)
    const ev = eventos(a.db, seq)[0]!
    assert.equal(ev.publico, 'usuario')
    assert.equal(ev.usuario_id, a.pessoas.web.id)
    const s = await eu.put(`/api/quadros/${so}/seguir`, { seguindo: true })
    assert.deepEqual(s.corpo, { quadroId: so, favoritoPos: null, seguindo: true })
    assert.equal((await eu.put('/api/quadros/x/seguir', { seguindo: true })).status, 404)
    assert.equal((await eu.put(`/api/quadros/${so}/seguir`, {})).status, 400)
  })
})

describe('etiquetas', () => {
  test('criar, editar e excluir; nome repetido (sem caixa e sem acento) → 409; só cor vale', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const q = a.quadros.criacao.quadro.id
    const r = await eu.post(`/api/quadros/${q}/etiquetas`, { nome: ' Revisão ', cor: 'azul' })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.nome, 'Revisão')
    assert.equal((await eu.post(`/api/quadros/${q}/etiquetas`, { nome: 'revisao', cor: 'verde' })).status, 409)
    assert.equal((await eu.post(`/api/quadros/${q}/etiquetas`, { cor: 'verde' })).status, 201)
    assert.equal((await eu.post(`/api/quadros/${q}/etiquetas`, { cor: 'verde' })).status, 201)
    assert.equal((await eu.post(`/api/quadros/${q}/etiquetas`, { nome: 'x', cor: 'laranja' })).status, 400)
    assert.equal((await eu.patch(`/api/etiquetas/${r.corpo.id}`, { nome: 'URGENTE' })).status, 409)
    const e = await eu.patch(`/api/etiquetas/${r.corpo.id}`, { nome: 'Revisar', cor: 'roxo', posicao: { depoisDeId: null } })
    assert.equal(e.status, 200)
    assert.equal(e.corpo.cor, 'roxo')
    assert.equal((await eu.patch('/api/etiquetas/nao-existe', { cor: 'roxo' })).status, 404)
  })

  test('excluir tira de todas as demandas, inclusive da guardada em outro quadro, e emite etiquetaIds', async () => {
    const a = await ambiente()
    const urgente = a.quadros.criacao.etiquetas.find((e) => e.nome === 'Urgente')!
    const d1 = await a.criarDemanda({ etiquetaIds: [urgente.id] })
    const d2 = await a.criarDemanda({ etiquetaIds: [urgente.id] })
    const eu = a.como(a.pessoas.am)
    await eu.post(`/api/demandas/${d2.id}/mover`, { colunaId: a.coluna('social', 'Fila').id })
    assert.ok(um(a.db, 'SELECT 1 FROM demanda_etiqueta WHERE demanda_id = ? AND etiqueta_id = ?', d2.id, urgente.id))
    const seq = ultimoSeq(a.db)
    assert.equal((await eu.del(`/api/etiquetas/${urgente.id}`)).status, 204)
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM demanda_etiqueta WHERE etiqueta_id = ?', urgente.id)!.n, 0)
    const evs = eventos(a.db, seq)
    assert.ok(evs.some((e) => e.entidade === 'etiqueta' && e.op === 'delete'))
    const ev = evs.find((e) => e.entidade === 'demanda')!
    assert.equal(ev.entidade_id, d1.id)
    assert.deepEqual(ev.patch!.etiquetaIds, [])
    assert.equal(evs.filter((e) => e.entidade === 'demanda').length, 1)
  })
})
