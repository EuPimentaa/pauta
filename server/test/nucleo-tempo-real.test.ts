/** Tempo real (API.md §3): SSE com retomada e resync, filtro de público, ping que revalida a sessão, sync e bootstrap. */
import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { agora, novoId, rodar, todos, tx, um } from '../src/db.ts'
import { emitir } from '../src/servicos/eventos.ts'
import { lancarApontamento } from '../src/servicos/horas.ts'
import { criarQuadro } from '../src/servicos/quadros.ts'
import { criarDemanda as criarDemandaServico } from '../src/servicos/demandas.ts'
import { podar } from '../src/tarefas/nucleo-poda.ts'
import { definirIntervaloPing } from '../src/tempo-real.ts'
import { ambiente, eventos, lerSse, notificacoesDe, ultimoSeq, type Ambiente, type Cliente_ } from './ajuda.ts'

after(() => definirIntervaloPing(25_000))

/** Abre o SSE (com `desde` e/ou Last-Event-ID) e confere os cabeçalhos. */
async function abrirSse(cli: Cliente_, o: { desde?: number; ultimo?: number } = {}): Promise<Response> {
  const headers: Record<string, string> = {}
  if (o.ultimo !== undefined) headers['Last-Event-ID'] = String(o.ultimo)
  const r = await cli.bruto(`/api/eventos${o.desde !== undefined ? `?desde=${o.desde}` : ''}`, { headers })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type') ?? '', /^text\/event-stream/)
  assert.equal(r.headers.get('cache-control'), 'no-cache')
  assert.equal(r.headers.get('x-accel-buffering'), 'no')
  return r
}

/** Seqs dos blocos `d` lidos. */
const seqs = (blocos: { evento: string; id: string | null }[]) => blocos.filter((b) => b.evento === 'd').map((b) => Number(b.id))

/** Uma mutação qualquer pela API (renomeia a demanda): devolve os seqs que ela gravou. */
async function mutacao(a: Ambiente, demandaId: string, titulo: string): Promise<number[]> {
  const antes = ultimoSeq(a.db)
  const rev = um<{ rev: number }>(a.db, 'SELECT rev FROM demanda WHERE id = ?', demandaId)!.rev
  const r = await a.como(a.pessoas.am).patch(`/api/demandas/${demandaId}`, { titulo }, { ifMatch: rev })
  assert.equal(r.status, 200)
  return eventos(a.db, antes).map((e) => e.seq)
}

describe('SSE /api/eventos', () => {
  test('começa com retry: 1000 e entrega o mesmo evento a dois clientes, com o trace e o ator de quem mudou', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const desde = ultimoSeq(a.db)
    const rAm = await abrirSse(a.como(a.pessoas.am), { desde })
    const rDesign = await abrirSse(a.como(a.pessoas.design), { desde })
    const leitor = rAm.body!.getReader()
    const primeiro = new TextDecoder().decode((await leitor.read()).value)
    assert.equal(primeiro, 'retry: 1000\n\n')
    leitor.releaseLock()

    const trace = randomUUID()
    const m = await a.como(a.pessoas.design).bruto(`/api/demandas/${d.id}/mover`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trace-Id': trace },
      body: JSON.stringify({ colunaId: a.coluna('criacao', 'Design').id }),
    })
    assert.equal(m.status, 200)
    const gravados = eventos(a.db, desde)
    assert.ok(gravados.length > 0)
    const [blocosAm, blocosDesign] = await Promise.all([lerSse(rAm, gravados.length), lerSse(rDesign, gravados.length)])
    assert.deepEqual(seqs(blocosAm), gravados.map((e) => e.seq))
    assert.deepEqual(seqs(blocosDesign), gravados.map((e) => e.seq))
    const ev = blocosAm.find((b) => b.dados.e === 'demanda' && b.dados.id === d.id)!.dados
    assert.equal(ev.op, 'upsert')
    assert.equal(ev.t, trace)
    assert.equal(ev.a, a.pessoas.design.id)
    assert.equal(ev.d, d.id)
    assert.equal(ev.p.colunaId, a.coluna('criacao', 'Design').id)
    assert.ok(ev.c.includes('colunaId'))
  })

  test('reconexão com Last-Event-ID (que vence o ?desde=) não perde nem repete, e segue ao vivo sem buraco', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const desde = ultimoSeq(a.db)
    const r1 = await abrirSse(a.como(a.pessoas.design), { desde })
    const primeira = await mutacao(a, d.id, 'Post 1')
    const lidos = seqs(await lerSse(r1, primeira.length))
    assert.deepEqual(lidos, primeira)
    const ultimo = lidos.at(-1)!

    // desconectado: duas mutações se perdem para esta janela
    const perdidas = [...await mutacao(a, d.id, 'Post 2'), ...await mutacao(a, d.id, 'Post 3')]
    const r2 = await abrirSse(a.como(a.pessoas.design), { desde: 0, ultimo })
    const leitura = lerSse(r2, perdidas.length + 1, 3000)
    const aoVivo = await mutacao(a, d.id, 'Post 4')
    const recebidos = seqs(await leitura)
    assert.deepEqual(recebidos, [...perdidas, aoVivo[0]])
    assert.equal(new Set(recebidos).size, recebidos.length)
    assert.ok(recebidos.every((s) => s > ultimo))
  })

  test('desde maior que o seq atual → resync servidor_reiniciado e segue ao vivo', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const r = await abrirSse(a.como(a.pessoas.am), { desde: ultimoSeq(a.db) + 50 })
    const leitura = lerSse(r, 2)
    await mutacao(a, d.id, 'Depois do resync')
    const blocos = await leitura
    assert.equal(blocos[0]!.evento, 'resync')
    assert.deepEqual(blocos[0]!.dados, { motivo: 'servidor_reiniciado' })
    assert.equal(blocos[1]!.evento, 'd')
  })

  test('histórico podado → resync historico_podado; desde = menor − 1 ainda reenvia; tabela vazia → resync', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const antigo = ultimoSeq(a.db)
    a.relogio('2026-10-23T13:00:00.000Z')                       // 9 dias depois
    const novos = await mutacao(a, d.id, 'Nove dias depois')
    assert.ok(podar(a.db).eventos > 0)
    const menor = Number(um<{ m: number }>(a.db, 'SELECT min(seq) AS m FROM evento')!.m)
    assert.equal(menor, novos[0])

    const podado = await lerSse(await abrirSse(a.como(a.pessoas.am), { desde: antigo - 5 }), 1)
    assert.deepEqual(podado.map((b) => [b.evento, b.dados]), [['resync', { motivo: 'historico_podado' }]])

    const noLimite = await lerSse(await abrirSse(a.como(a.pessoas.am), { desde: menor - 1 }), novos.length)
    assert.deepEqual(seqs(noLimite), novos)

    rodar(a.db, 'DELETE FROM evento')
    const vazia = await lerSse(await abrirSse(a.como(a.pessoas.am), { desde: antigo }), 1)
    assert.deepEqual(vazia.map((b) => [b.evento, b.dados]), [['resync', { motivo: 'historico_podado' }]])
    // em dia (desde = atual) com a tabela vazia: nada a reenviar, sem resync
    const emDia = await lerSse(await abrirSse(a.como(a.pessoas.am), { desde: ultimoSeq(a.db) || novos.at(-1)! }), 1, 300)
    assert.deepEqual(emDia, [])
  })

  test('a poda nunca apaga o último evento', async () => {
    const a = await ambiente()
    const ultimo = ultimoSeq(a.db)
    a.relogio('2026-12-01T13:00:00.000Z')
    podar(a.db)
    assert.deepEqual(todos<{ seq: number }>(a.db, 'SELECT seq FROM evento').map((l) => Number(l.seq)), [ultimo])
  })

  test('filtro de público: notificação e estrela só ao dono; apontamento ao dono e aos admins; link público só à gestão', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const desde = ultimoSeq(a.db)
    const nomes = ['admin', 'am', 'design', 'design2'] as const
    const conexoes = await Promise.all(nomes.map((n) => abrirSse(a.como(a.pessoas[n]), { desde })))
    const leituras = conexoes.map((r) => lerSse(r, 999, 600))

    assert.equal((await a.como(a.pessoas.design).put(`/api/quadros/${a.quadros.criacao.quadro.id}/favorito`, { favorito: true })).status, 200)
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/membros`, { usuarioId: a.pessoas.design2.id })).status, 200)
    tx(a.db, () => lancarApontamento(a.db, { demandaId: d.id, ator: a.ator(a.pessoas.design), entrada: { minutos: 30 } }))
    tx(a.db, () => emitir(a.db, { entidade: 'link_publico', id: novoId(), demandaId: d.id, op: 'upsert', patch: { ativo: true },
      campos: null, publico: 'gestao', ator: a.ator(a.pessoas.am) }))

    const recebido = Object.fromEntries((await Promise.all(leituras)).map((blocos, i) => [nomes[i], blocos.map((b) => b.dados)]))
    const entidades = (n: (typeof nomes)[number]) => new Set(recebido[n]!.map((e: { e: string }) => e.e))
    assert.ok(entidades('design').has('quadro_usuario'))
    for (const n of ['admin', 'am', 'design2'] as const) assert.ok(!entidades(n).has('quadro_usuario'), n)
    assert.ok(entidades('design2').has('notificacao'))
    for (const n of ['admin', 'am', 'design'] as const) assert.ok(!entidades(n).has('notificacao'), n)
    for (const n of ['admin', 'design'] as const) assert.ok(entidades(n).has('apontamento'), n)
    for (const n of ['am', 'design2'] as const) assert.ok(!entidades(n).has('apontamento'), n)
    for (const n of ['admin', 'am'] as const) assert.ok(entidades(n).has('link_publico'), n)
    for (const n of ['design', 'design2'] as const) assert.ok(!entidades(n).has('link_publico'), n)
    // os minutos chegam a todos, sem revelar quem lançou
    for (const n of nomes) {
      const minutos = recebido[n]!.find((e: { e: string; c: string[] | null }) => e.e === 'demanda' && e.c?.includes('minutosRegistrados'))
      assert.ok(minutos, n)
      assert.equal(minutos.p.minutosRegistrados, 30)
      assert.equal(minutos.a, null)
      assert.equal(minutos.t, null)
    }

    // /api/sync aplica o mesmo filtro: os mesmos seqs, na mesma ordem
    for (const n of nomes) {
      const s = await a.como(a.pessoas[n]).get(`/api/sync?desde=${desde}`)
      assert.equal(s.status, 200)
      assert.equal(s.corpo.resync, false)
      assert.deepEqual(s.corpo.eventos.map((e: { s: number }) => e.s), recebido[n]!.map((e: { s: number }) => e.s), n)
      assert.equal(s.corpo.seq, ultimoSeq(a.db))
    }
  })

  test('ping revalida a sessão: papel mudou → resync papel_alterado e filtra pelo papel novo; sessão revogada → fecha', async () => {
    definirIntervaloPing(40)
    try {
      const a = await ambiente()
      const r = await abrirSse(a.como(a.pessoas.am), { desde: ultimoSeq(a.db) })
      rodar(a.db, "UPDATE usuario SET papel = 'equipe' WHERE id = ?", a.pessoas.am.id)
      const blocos = await lerSse(r, 2)
      assert.equal(blocos[0]!.evento, 'resync')
      assert.deepEqual(blocos[0]!.dados, { motivo: 'papel_alterado' })
      assert.equal(blocos[1]!.evento, 'ping')
      assert.equal(blocos[1]!.dados.seq, ultimoSeq(a.db))

      const r2 = await abrirSse(a.como(a.pessoas.am), { desde: ultimoSeq(a.db) })
      const leitor = r2.body!.getReader()
      rodar(a.db, 'UPDATE sessao SET revogada_em = ? WHERE usuario_id = ?', agora(), a.pessoas.am.id)
      const decod = new TextDecoder()
      let texto = ''
      for (;;) {
        const parte = await leitor.read()
        if (parte.done) break
        texto += decod.decode(parte.value)
      }
      assert.ok(!texto.includes('event: ping'), 'fecha sem mandar o ping')
    } finally {
      definirIntervaloPing(25_000)
    }
  })

  test('desativar a pessoa manda resync e fecha o SSE dela na hora; o dos outros continua', async () => {
    const a = await ambiente()
    const rDesign = await abrirSse(a.como(a.pessoas.design), { desde: ultimoSeq(a.db) })
    const rAm = await abrirSse(a.como(a.pessoas.am), { desde: ultimoSeq(a.db) })
    const leituraAm = lerSse(rAm, 999, 400)
    const desde = ultimoSeq(a.db)
    assert.equal((await a.como(a.pessoas.admin).patch(`/api/pessoas/${a.pessoas.design.id}`, { ativo: false })).status, 200)
    const leitor = rDesign.body!.getReader()
    let texto = ''
    for (;;) {
      const parte = await leitor.read()
      if (parte.done) break
      texto += new TextDecoder().decode(parte.value)
    }
    assert.match(texto, /event: resync\ndata: \{"motivo":"papel_alterado"\}/)
    assert.deepEqual(seqs(await leituraAm), eventos(a.db, desde).map((e) => e.seq))
    // e a sessão não reabre o SSE
    assert.equal((await a.como(a.pessoas.design).bruto('/api/eventos')).status, 401)
  })

  test('sem sessão → 401; seq inválido → 400', async () => {
    const a = await ambiente()
    assert.equal((await a.app.request('/api/eventos')).status, 401)
    assert.equal((await a.como(a.pessoas.am).bruto('/api/eventos?desde=abc')).status, 400)
  })
})

describe('GET /api/sync', () => {
  test('sem desde → 400; resync nas mesmas condições do SSE; até 500 eventos por vez', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    assert.equal((await eu.get('/api/sync')).status, 400)
    const atual = ultimoSeq(a.db)
    assert.deepEqual((await eu.get(`/api/sync?desde=${atual + 3}`)).corpo, { resync: true, seq: atual })
    assert.deepEqual((await eu.get(`/api/sync?desde=${atual}`)).corpo, { resync: false, seq: atual, eventos: [] })

    tx(a.db, () => {
      for (let i = 0; i < 620; i++) {
        emitir(a.db, { entidade: 'etiqueta', id: `e${i}`, op: 'upsert', patch: { nome: `E${i}` }, campos: ['nome'], ator: a.ator(a.pessoas.am) })
      }
    })
    const p1 = (await eu.get(`/api/sync?desde=${atual}`)).corpo
    assert.equal(p1.eventos.length, 500)
    assert.equal(p1.seq, p1.eventos.at(-1).s)
    const p2 = (await eu.get(`/api/sync?desde=${p1.seq}`)).corpo
    assert.equal(p2.eventos.length, 120)
    assert.equal(p2.seq, ultimoSeq(a.db))

    rodar(a.db, 'DELETE FROM evento WHERE seq <= ?', atual + 10)
    assert.equal((await eu.get(`/api/sync?desde=${atual}`)).corpo.resync, true)
  })
})

describe('GET /api/bootstrap', () => {
  test('seq lido antes das consultas: o SSE aberto com ?desde=seq recebe o que veio depois', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const b = await a.como(a.pessoas.design).get('/api/bootstrap')
    assert.equal(b.status, 200)
    assert.equal(b.corpo.seq, ultimoSeq(a.db))
    assert.ok(b.corpo.demandas.some((x: { id: string }) => x.id === d.id))
    const novos = await mutacao(a, d.id, 'Depois do bootstrap')
    const r = await abrirSse(a.como(a.pessoas.design), { desde: b.corpo.seq })
    assert.deepEqual(seqs(await lerSse(r, novos.length)), novos)
  })

  test('o que é da pessoa (estrelas, cronômetro, não lidas) e o conjunto das demandas', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    await a.como(a.pessoas.design).put(`/api/quadros/${a.quadros.social.quadro.id}/favorito`, { favorito: true })
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/membros`, { usuarioId: a.pessoas.design.id })
    rodar(a.db, `INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, minutos, iniciado_em, origem, criado_em, atualizado_em)
                 VALUES (?, ?, ?, ?, '2026-10-14', NULL, ?, 'cronometro', ?, ?)`,
    novoId(), a.pessoas.design.id, d.id, d.clienteId, agora(), agora(), agora())

    const doDesign = (await a.como(a.pessoas.design).get('/api/bootstrap')).corpo
    const doAm = (await a.como(a.pessoas.am).get('/api/bootstrap')).corpo
    assert.deepEqual(doDesign.eu.favoritos, [a.quadros.social.quadro.id])
    assert.deepEqual(doAm.eu.favoritos, [])
    assert.equal(doDesign.eu.cronometro.demandaId, d.id)
    assert.equal(doAm.eu.cronometro, null)
    // design: "chegou" (segue a Criação e a demanda nasceu sem membro) e "membro"
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.design.id).map((n) => n.tipo), ['chegou', 'membro'])
    assert.equal(doDesign.naoLidas, 2)
    assert.equal(doAm.naoLidas, 0)
    assert.ok(!('email' in doAm.usuarios[0]), 'o resumo das pessoas não leva e-mail')

    // etiquetaIds: só as do quadro atual (a "Urgente" fica guardada na Criação)
    const urgente = a.quadros.criacao.etiquetas.find((e) => e.nome === 'Urgente')!
    const alteracao = a.quadros.criacao.etiquetas.find((e) => e.nome === 'Alteração')!
    const e = await a.criarDemanda({ etiquetaIds: [urgente.id, alteracao.id] })
    await a.como(a.pessoas.am).post(`/api/demandas/${e.id}/mover`, { colunaId: a.coluna('social', 'Fila').id })
    const noSocial = (await a.como(a.pessoas.am).get('/api/bootstrap')).corpo.demandas.find((x: { id: string }) => x.id === e.id)
    assert.deepEqual(noSocial.etiquetaIds, [a.quadros.social.etiquetas.find((x) => x.nome === 'Alteração')!.id])

    // concluída há mais de quadroConcluidasDias sai; arquivada sai
    const c = await a.criarDemanda()
    await a.como(a.pessoas.am).post(`/api/demandas/${c.id}/concluir`, { concluida: true })
    const arq = await a.criarDemanda()
    await a.como(a.pessoas.am).post(`/api/demandas/${arq.id}/arquivar`)
    const ids = (corpo: { demandas: { id: string }[] }) => new Set(corpo.demandas.map((x) => x.id))
    const hoje = ids((await a.como(a.pessoas.am).get('/api/bootstrap')).corpo)
    assert.ok(hoje.has(c.id))
    assert.ok(!hoje.has(arq.id))
    a.relogio('2026-10-22T13:00:00.000Z')
    assert.ok(!ids((await a.como(a.pessoas.am).get('/api/bootstrap')).corpo).has(c.id))
  })

  test('500 demandas em 8 quadros respondem em menos de 1 s', async () => {
    const a = await ambiente()
    const admin = a.ator(a.pessoas.admin)
    const quadros = [a.quadros.atendimento.quadro.id, a.quadros.criacao.quadro.id, a.quadros.social.quadro.id]
    tx(a.db, () => {
      for (const nome of ['Web', 'Tráfego', 'Produção', 'Eventos', 'Vídeo']) {
        quadros.push(criarQuadro(a.db, { nome, cor: 'azul', modeloQuadroId: 'mq-kanban' }, admin).quadro.id)
      }
      for (let i = 0; i < 500; i++) {
        criarDemandaServico(a.db, { titulo: `Demanda ${i}`, quadroId: quadros[i % quadros.length]!,
          clienteId: i % 2 ? a.clientes.he.id : a.clientes.icc.id, descricaoMd: 'Briefing com **negrito** e uma lista.' }, admin)
      }
    })
    const eu = a.como(a.pessoas.am)
    await eu.get('/api/bootstrap')                                  // aquece as consultas preparadas
    const inicio = performance.now()
    const b = await eu.get('/api/bootstrap')
    const ms = performance.now() - inicio
    assert.equal(b.corpo.demandas.length, 500)
    assert.equal(b.corpo.quadros.length, 8)
    assert.ok(ms < 1000, `bootstrap levou ${Math.round(ms)} ms`)
  })
})
