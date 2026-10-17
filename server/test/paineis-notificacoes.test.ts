/**
 * Sino (F3, API.md §4.18 e §5.9): GET /api/notificacoes e POST /api/notificacoes/lidas, e as regras de quem recebe o
 * quê vistas pela lista de cada pessoa (membro, menção, comentário e chegou nascem no núcleo e no modal).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Notificacao, SyncSaida } from '../../shared/tipos/index.ts'
import { atorSistema } from '../src/auth.ts'
import { todos, tx } from '../src/db.ts'
import { notificar } from '../src/servicos/notificacoes.ts'
import { ambiente, eventos, ultimoSeq, type Ambiente } from './ajuda.ts'
import { moverPara, notificacoesPelaApi } from './paineis-ajuda.ts'

/** N notificações para a pessoa (resumo "Aviso 1"…"Aviso N"). */
function semear(a: Ambiente, usuarioId: string, n: number): void {
  tx(a.db, () => {
    for (let i = 1; i <= n; i++) notificar(a.db, { para: usuarioId, tipo: 'chegou', ator: atorSistema(), resumo: `Aviso ${i}` })
  })
}

describe('GET /api/notificacoes', () => {
  test('só as minhas, mais novas primeiro, com naoLidas e o cursor `antesDe`', async () => {
    const a = await ambiente()
    const { design, design2 } = a.pessoas
    semear(a, design.id, 35)
    semear(a, design2.id, 2)
    const p1 = await notificacoesPelaApi(a, design)
    assert.equal(p1.itens.length, 30)                                                 // limite padrão
    assert.equal(p1.naoLidas, 35)
    assert.equal(p1.itens[0]!.resumo, 'Aviso 35')
    assert.ok(p1.itens.every((n) => n.usuarioId === design.id && n.lidaEm === null && n.atorId === null))
    assert.equal(p1.proximo, p1.itens.at(-1)!.id)
    const p2 = await notificacoesPelaApi(a, design, `antesDe=${p1.proximo}`)
    assert.deepEqual(p2.itens.map((n) => n.resumo), ['Aviso 5', 'Aviso 4', 'Aviso 3', 'Aviso 2', 'Aviso 1'])
    assert.equal(p2.proximo, null)
    const curta = await notificacoesPelaApi(a, design, 'limite=2')
    assert.deepEqual(curta.itens.map((n) => n.resumo), ['Aviso 35', 'Aviso 34'])
    assert.equal((await a.como(design).get('/api/notificacoes?limite=500')).status, 400)
    assert.equal((await a.como(design).get('/api/notificacoes?antesDe=abc')).status, 400)
    assert.equal((await notificacoesPelaApi(a, design2)).itens.length, 2)
  })

  test('soNaoLidas filtra; a lista traz o número da demanda para o link /d/:numero', async () => {
    const a = await ambiente()
    const { design, am } = a.pessoas
    const d = await a.criarDemanda({ titulo: 'Carrossel' })
    await a.como(design).post('/api/notificacoes/lidas', {})                          // o `chegou` da criação (design segue a Criação)
    await a.como(am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: `Veja @[Design](mencao:${design.id})` })
    semear(a, design.id, 1)
    const todasAsMinhas = await notificacoesPelaApi(a, design)
    const mencao = todasAsMinhas.itens.find((n) => n.tipo === 'mencao')!
    assert.equal(mencao.demandaNumero, d.numero)
    assert.equal(mencao.demandaId, d.id)
    assert.equal(mencao.atorId, am.id)
    await a.como(design).post('/api/notificacoes/lidas', { ids: [mencao.id] })
    const naoLidas = await notificacoesPelaApi(a, design, 'soNaoLidas=1')
    assert.deepEqual(naoLidas.itens.map((n) => n.resumo), ['Aviso 1'])
    assert.equal(naoLidas.naoLidas, 1)
  })
})

describe('POST /api/notificacoes/lidas', () => {
  test('por ids (os de outra pessoa são ignorados), até um id, ou todas; 204 e um evento por notificação, só ao dono', async () => {
    const a = await ambiente()
    const { design, design2 } = a.pessoas
    semear(a, design.id, 5)
    semear(a, design2.id, 1)
    const minhas = (await notificacoesPelaApi(a, design)).itens                      // 5..1
    const daOutra = (await notificacoesPelaApi(a, design2)).itens[0]!

    let seq = ultimoSeq(a.db)
    const r = await a.como(design).post('/api/notificacoes/lidas', { ids: [minhas[0]!.id, daOutra.id] })
    assert.equal(r.status, 204)
    assert.equal((await notificacoesPelaApi(a, design)).naoLidas, 4)
    assert.equal((await notificacoesPelaApi(a, design2)).naoLidas, 1)               // a da outra pessoa não muda
    const evs = eventos(a.db, seq)
    assert.equal(evs.length, 1)
    assert.deepEqual([evs[0]!.entidade, evs[0]!.entidade_id, evs[0]!.publico, evs[0]!.usuario_id, evs[0]!.campos],
      ['notificacao', String(minhas[0]!.id), 'usuario', design.id, ['lidaEm']])
    assert.ok(typeof evs[0]!.patch?.lidaEm === 'string')

    seq = ultimoSeq(a.db)
    await a.como(design).post('/api/notificacoes/lidas', { ate: minhas[2]!.id })     // Aviso 3, 2 e 1 (o 5 já estava lido)
    assert.equal((await notificacoesPelaApi(a, design)).naoLidas, 1)
    assert.equal(eventos(a.db, seq).length, 3)

    seq = ultimoSeq(a.db)
    await a.como(design).post('/api/notificacoes/lidas', {})
    assert.equal((await notificacoesPelaApi(a, design)).naoLidas, 0)
    assert.equal(eventos(a.db, seq).length, 1)
    // de novo: nada muda, nenhum evento
    seq = ultimoSeq(a.db)
    assert.equal((await a.como(design).post('/api/notificacoes/lidas', {})).status, 204)
    assert.equal(eventos(a.db, seq).length, 0)
    assert.equal((await a.como(design).post('/api/notificacoes/lidas', { ids: ['x'] })).status, 400)
    assert.equal((await a.como(design).post('/api/notificacoes/lidas', {}, { semCsrf: true })).status, 403)
  })

  test('o sync (como o SSE) entrega o lidaEm só ao dono', async () => {
    const a = await ambiente()
    const { design, design2 } = a.pessoas
    semear(a, design.id, 2)
    const seq = ultimoSeq(a.db)
    await a.como(design).post('/api/notificacoes/lidas', {})
    const doDono = (await a.como(design).get(`/api/sync?desde=${seq}`)).corpo as SyncSaida
    const deOutro = (await a.como(design2).get(`/api/sync?desde=${seq}`)).corpo as SyncSaida
    assert.equal(doDono.resync, false)
    assert.equal(deOutro.resync, false)
    if (doDono.resync || deOutro.resync) return
    assert.equal(doDono.eventos.filter((e) => e.e === 'notificacao').length, 2)
    assert.equal(deOutro.eventos.filter((e) => e.e === 'notificacao').length, 0)
  })
})

describe('regras de notificação vistas no sino', () => {
  test('membro, menção (sem repetir como comentário), comentário aos membros e AM, e nunca para quem agiu', async () => {
    const a = await ambiente()
    const { am, design, design2 } = a.pessoas
    const d = await a.criarDemanda({ titulo: 'Banner', membroIds: [design.id], como: am })   // design: membro
    await a.como(design2).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: `Pode ver, @[Design](mencao:${design.id})?` })
    const tipos = async (p: typeof am) => (await notificacoesPelaApi(a, p)).itens.map((n: Notificacao) => n.tipo).reverse()
    assert.deepEqual(await tipos(design), ['membro', 'mencao'])                       // a menção não vira "comentário" também
    assert.deepEqual(await tipos(am), ['comentario'])                                 // AM
    assert.deepEqual(await tipos(design2), [])                                        // quem agiu
  })

  test('chegou: entrar num quadro que sigo sem ninguém da equipe dele; com membro da equipe não', async () => {
    const a = await ambiente()
    const { am, social } = a.pessoas                                                  // social segue o quadro Social
    const semEquipe = await a.criarDemanda({ titulo: 'Sem ninguém do Social' })
    moverPara(a, semEquipe, 'social', 'Fila', am)
    assert.deepEqual((await notificacoesPelaApi(a, social)).itens.map((n) => [n.tipo, n.demandaNumero]), [['chegou', semEquipe.numero]])
    const comEquipe = await a.criarDemanda({ titulo: 'Com o Caio', membroIds: [social.id] })
    const antes = (await notificacoesPelaApi(a, social)).itens.length
    moverPara(a, comEquipe, 'social', 'Fila', am)
    assert.equal((await notificacoesPelaApi(a, social)).itens.length, antes)
    assert.equal(todos(a.db, "SELECT 1 FROM notificacao WHERE tipo = 'chegou' AND demanda_id = ? AND usuario_id = ?", comEquipe.id, social.id).length, 0)
  })

  test('tipos do ciclo e dos avisos de prazo chegam pela mesma lista (versão entregue, aprovada, ajuste, prazo, atrasada)', async () => {
    const a = await ambiente()
    const { am } = a.pessoas
    const d = await a.criarDemanda({ titulo: 'Peça' })
    tx(a.db, () => {
      for (const tipo of ['versao_entregue', 'aprovada', 'ajuste_pedido', 'prazo', 'atrasada'] as const) {
        notificar(a.db, { para: am.id, tipo, demandaId: d.id, ator: atorSistema(), resumo: `${tipo} #${d.numero}` })
      }
    })
    const r = await notificacoesPelaApi(a, am)
    assert.deepEqual(r.itens.map((n) => n.tipo), ['atrasada', 'prazo', 'ajuste_pedido', 'aprovada', 'versao_entregue'])
    assert.ok(r.itens.every((n) => n.demandaNumero === d.numero))
    assert.equal(r.naoLidas, 5)
  })
})
