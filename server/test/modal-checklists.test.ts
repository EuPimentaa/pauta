/** Checklists e itens do modal (F1, API.md §4.15): contadores no evento, ordem, marcar e o checklist de rodada. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChecklistComItens, ChecklistItem } from '../../shared/tipos/index.ts'
import { um } from '../src/db.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'
import { abrirAjustes } from './modal-ajuda.ts'

function contadores(a: Awaited<ReturnType<typeof ambiente>>, id: string) {
  return { ...um<{ t: number; f: number }>(a.db, 'SELECT n_check_total AS t, n_check_feitos AS f FROM demanda WHERE id = ?', id)! }
}

describe('checklists', () => {
  test('criar, marcar e apagar mandam nCheckTotal/nCheckFeitos no evento da demanda', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    let seq = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/checklists`, { titulo: '  Entrega  ', itens: ['Arte', ' ', 'Legenda', 'Revisão'] })
    assert.equal(r.status, 201)
    const c: ChecklistComItens = r.corpo
    assert.equal(c.titulo, 'Entrega')
    assert.deepEqual(c.itens.map((i) => i.texto), ['Arte', 'Legenda', 'Revisão'])
    let evs = eventos(a.db, seq)
    assert.ok(evs.some((e) => e.entidade === 'checklist' && e.entidade_id === c.id))
    assert.equal(evs.filter((e) => e.entidade === 'checklist_item').length, 3)
    assert.deepEqual(evs.find((e) => e.entidade === 'demanda' && e.campos?.includes('nCheckTotal'))?.patch, { nCheckTotal: 3 })

    seq = ultimoSeq(a.db)
    const feito = await a.como(a.pessoas.design).patch(`/api/checklist-itens/${c.itens[0]!.id}`, { feito: true })
    assert.equal(feito.status, 200)
    assert.equal(feito.corpo.feitoPor, a.pessoas.design.id)
    assert.ok(feito.corpo.feitoEm)
    evs = eventos(a.db, seq)
    assert.deepEqual(evs.find((e) => e.entidade === 'demanda')?.patch, { nCheckFeitos: 1 })
    assert.deepEqual(contadores(a, d.id), { t: 3, f: 1 })
    // marcar de novo não muda nada nem gera atividade nova
    const atividades = um<{ n: number }>(a.db, `SELECT count(*) AS n FROM atividade WHERE tipo = 'checklist.item_feito'`)!.n
    await a.como(a.pessoas.design).patch(`/api/checklist-itens/${c.itens[0]!.id}`, { feito: true })
    assert.equal(um<{ n: number }>(a.db, `SELECT count(*) AS n FROM atividade WHERE tipo = 'checklist.item_feito'`)!.n, atividades)

    const desfeito = await a.como(a.pessoas.am).patch(`/api/checklist-itens/${c.itens[0]!.id}`, { feito: false })
    assert.equal(desfeito.corpo.feitoEm, null)
    assert.equal(desfeito.corpo.feitoPor, null)

    seq = ultimoSeq(a.db)
    assert.equal((await a.como(a.pessoas.design).del(`/api/checklists/${c.id}`)).status, 204)
    evs = eventos(a.db, seq)
    assert.ok(evs.some((e) => e.entidade === 'checklist' && e.op === 'delete'))
    assert.equal(evs.filter((e) => e.entidade === 'checklist_item' && e.op === 'delete').length, 3)
    assert.deepEqual(contadores(a, d.id), { t: 0, f: 0 })
    assert.equal((await a.como(a.pessoas.design).get(`/api/demandas/${d.numero}`)).corpo.checklists.length, 0)
  })

  test('itens em posição, texto, reordenar e apagar; checklists reordenam', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const c: ChecklistComItens = (await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/checklists`, { titulo: 'A', itens: ['1', '4'] })).corpo
    const novos: ChecklistItem[] = (await a.como(a.pessoas.am).post(`/api/checklists/${c.id}/itens`,
      { textos: ['2', '3'], posicao: { depoisDeId: c.itens[0]!.id } })).corpo
    assert.equal(novos.length, 2)
    const ordem = async () => ((await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo.checklists as ChecklistComItens[])
    assert.deepEqual((await ordem())[0]!.itens.map((i) => i.texto), ['1', '2', '3', '4'])
    await a.como(a.pessoas.am).patch(`/api/checklist-itens/${c.itens[1]!.id}`, { posicao: { depoisDeId: null }, texto: 'Quatro' })
    assert.deepEqual((await ordem())[0]!.itens.map((i) => i.texto), ['Quatro', '1', '2', '3'])
    assert.equal((await a.como(a.pessoas.am).patch(`/api/checklist-itens/${c.itens[1]!.id}`, { texto: '  ' })).status, 400)
    assert.equal((await a.como(a.pessoas.am).del(`/api/checklist-itens/${novos[0]!.id}`)).status, 204)
    assert.deepEqual(contadores(a, d.id), { t: 3, f: 0 })

    const b: ChecklistComItens = (await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/checklists`, { titulo: 'B' })).corpo
    const renomeado = await a.como(a.pessoas.am).patch(`/api/checklists/${b.id}`, { titulo: 'Bê', posicao: { depoisDeId: null } })
    assert.equal(renomeado.corpo.titulo, 'Bê')
    assert.deepEqual((await ordem()).map((x) => x.titulo), ['Bê', 'A'])
    // item de referência de outro checklist → 400
    const outro = await a.como(a.pessoas.am).post(`/api/checklists/${b.id}/itens`, { textos: ['x'], posicao: { depoisDeId: c.itens[0]!.id } })
    assert.equal(outro.status, 400)
    assert.equal((await a.como(a.pessoas.am).post(`/api/checklists/${b.id}/itens`, { textos: [' ', ''] })).status, 400)
  })

  test('equipe apagando o checklist de rodada → 403; atendimento apaga; o checklist comum, qualquer um', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const ajustes = abrirAjustes(a, d.id)
    const r = await a.como(a.pessoas.design).del(`/api/checklists/${ajustes}`)
    assert.equal(r.status, 403)
    assert.equal(r.corpo.erro.codigo, 'sem_permissao')
    assert.match(r.corpo.erro.mensagem, /atendimento e o admin/)
    // os itens dele a equipe marca normalmente
    const det = (await a.como(a.pessoas.design).get(`/api/demandas/${d.numero}`)).corpo
    const item = det.checklists.find((c: ChecklistComItens) => c.id === ajustes).itens[0]
    assert.equal((await a.como(a.pessoas.design).patch(`/api/checklist-itens/${item.id}`, { feito: true })).status, 200)
    assert.equal((await a.como(a.pessoas.am).del(`/api/checklists/${ajustes}`)).status, 204)
    const comum: ChecklistComItens = (await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/checklists`, { titulo: 'Comum' })).corpo
    assert.equal((await a.como(a.pessoas.design).del(`/api/checklists/${comum.id}`)).status, 204)
  })

  test('o checklist de rodada: a equipe não renomeia, não acrescenta, não reescreve e não tira itens; tudo vai ao histórico', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const ajustes = abrirAjustes(a, d.id)
    const equipe = a.como(a.pessoas.design)
    const itens = (): ChecklistItem[] => a.db.prepare('SELECT id, texto FROM checklist_item WHERE checklist_id = ? ORDER BY pos')
      .all(ajustes) as unknown as ChecklistItem[]
    const [i1, i2] = itens()
    const tentativas = [
      await equipe.patch(`/api/checklists/${ajustes}`, { titulo: 'Lista qualquer' }),
      await equipe.post(`/api/checklists/${ajustes}/itens`, { textos: ['Item da equipe'] }),
      await equipe.patch(`/api/checklist-itens/${i1!.id}`, { texto: 'texto trocado pela equipe' }),
      await equipe.del(`/api/checklist-itens/${i2!.id}`),
    ]
    for (const r of tentativas) {
      assert.equal(r.status, 403)
      assert.equal(r.corpo.erro.codigo, 'sem_permissao')
      assert.match(r.corpo.erro.mensagem, /pedido do cliente/)
    }
    assert.deepEqual(itens().map((i) => i.texto), [i1!.texto, i2!.texto], 'nada mudou')
    // marcar e reordenar continuam livres
    assert.equal((await equipe.patch(`/api/checklist-itens/${i1!.id}`, { feito: true })).status, 200)
    assert.equal((await equipe.patch(`/api/checklist-itens/${i2!.id}`, { posicao: { antesDeId: i1!.id } })).status, 200)
    assert.equal((await equipe.patch(`/api/checklists/${ajustes}`, { titulo: 'Ajustes R2' })).status, 200, 'o mesmo título não é mudança')
    // o atendimento muda, e cada mudança fica no histórico
    const am = a.como(a.pessoas.am)
    const seq = Number(um<{ m: number }>(a.db, 'SELECT max(id) AS m FROM atividade')!.m)
    assert.equal((await am.patch(`/api/checklists/${ajustes}`, { titulo: 'Ajustes do cliente' })).status, 200)
    assert.equal((await am.patch(`/api/checklist-itens/${i1!.id}`, { texto: 'Trocar a foto da fachada (a nova)' })).status, 200)
    assert.equal((await am.del(`/api/checklist-itens/${i2!.id}`)).status, 204)
    assert.equal((await am.post(`/api/checklists/${ajustes}/itens`, { textos: ['Mais um ajuste'] })).status, 201)
    const novas = a.db.prepare('SELECT tipo, dados FROM atividade WHERE id > ? AND demanda_id = ? ORDER BY id').all(seq, d.id) as { tipo: string; dados: string }[]
    assert.deepEqual(novas.map((n) => n.tipo), ['checklist.editado', 'checklist.item_editado', 'checklist.item_removido'])
    assert.deepEqual(JSON.parse(novas[0]!.dados), { checklistId: ajustes, titulo: 'Ajustes do cliente', tituloAntes: 'Ajustes R2' })
    assert.equal(JSON.parse(novas[1]!.dados).textoAntes, i1!.texto)
    // no checklist comum a equipe continua mexendo em tudo
    const comum: ChecklistComItens = (await equipe.post(`/api/demandas/${d.id}/checklists`, { titulo: 'Comum', itens: ['a', 'b'] })).corpo
    assert.equal((await equipe.patch(`/api/checklists/${comum.id}`, { titulo: 'Comum 2' })).status, 200)
    assert.equal((await equipe.patch(`/api/checklist-itens/${comum.itens[0]!.id}`, { texto: 'a2' })).status, 200)
    assert.equal((await equipe.del(`/api/checklist-itens/${comum.itens[1]!.id}`)).status, 204)
    assert.equal((await equipe.post(`/api/checklists/${comum.id}/itens`, { textos: ['c'] })).status, 201)
  })

  test('demanda arquivada → 422; de quadro arquivado → 422', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const c: ChecklistComItens = (await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/checklists`, { titulo: 'A', itens: ['1'] })).corpo
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/arquivar`)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/checklist-itens/${c.itens[0]!.id}`, { feito: true })).status, 422)
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/checklists`, { titulo: 'B' })).status, 422)
    const outra = await a.criarDemanda({ quadroId: a.quadros.social.quadro.id })
    await a.como(a.pessoas.admin).post(`/api/quadros/${a.quadros.social.quadro.id}/arquivar`)
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${outra.id}/checklists`, { titulo: 'B' })).status, 422)
  })
})
