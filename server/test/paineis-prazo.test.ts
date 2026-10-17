/** Avisos de prazo das 8h (F3, API.md §5.9): `prazo` e `atrasada`, só em dia útil. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rodar, todos, tx } from '../src/db.ts'
import { atualizarDemanda } from '../src/servicos/demandas.ts'
import { avisarPrazos } from '../src/servicos/paineis-prazo.ts'
import { carregarTarefas, executarTarefa, tarefasDevidas } from '../src/tarefas.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'
import { arquivar, arquivarQuadro, concluidaHa, tiposDe } from './paineis-ajuda.ts'

/** 8h de São Paulo (11h UTC) do dia. */
const oitoHoras = (dia: string) => `${dia}T11:00:00.000Z`

function resumos(db: Parameters<typeof tiposDe>[0], usuarioId: string, tipo: string): string[] {
  return todos<{ resumo: string }>(db, 'SELECT resumo FROM notificacao WHERE usuario_id = ? AND tipo = ? ORDER BY id', usuarioId, tipo)
    .map((l) => l.resumo)
}

describe('avisos de prazo · prazo', () => {
  test('vence hoje: os membros recebem (ou o AM, sem membros); não repete no mesmo dia', async () => {
    const a = await ambiente()
    const { design, design2, am } = a.pessoas
    a.relogio(oitoHoras('2026-10-13'))
    const comMembros = await a.criarDemanda({ titulo: 'Carrossel', prazo: '2026-10-14', membroIds: [design.id, design2.id] })
    const semMembros = await a.criarDemanda({ titulo: 'Banner', prazo: '2026-10-14', prazoHora: '15:30' })
    await a.criarDemanda({ titulo: 'Amanhã', prazo: '2026-10-15', membroIds: [design.id] })

    a.relogio(oitoHoras('2026-10-14'))
    const seq = ultimoSeq(a.db)
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 3, atrasada: 0 })
    assert.deepEqual(resumos(a.db, design.id, 'prazo'), [`#${comMembros.numero} Carrossel HE vence hoje, 18h`])
    assert.deepEqual(resumos(a.db, design2.id, 'prazo'), [`#${comMembros.numero} Carrossel HE vence hoje, 18h`])
    assert.deepEqual(resumos(a.db, am.id, 'prazo'), [`#${semMembros.numero} Banner HE vence hoje, 15h30`])
    // o evento vai só a quem recebeu, sem ator
    const evs = eventos(a.db, seq).filter((e) => e.entidade === 'notificacao')
    assert.equal(evs.length, 3)
    assert.ok(evs.every((e) => e.publico === 'usuario' && e.ator_id === null && e.trace_id === null))

    a.relogio('2026-10-14T15:00:00.000Z')                                             // ao meio-dia de novo: nada
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 0, atrasada: 0 })
    assert.equal(resumos(a.db, design.id, 'prazo').length, 1)
  })

  test('ignora concluídas, com o cliente, arquivadas e de quadro arquivado; membro inativo não conta (vai para o AM)', async () => {
    const a = await ambiente()
    const { design, am, admin, web } = a.pessoas
    a.relogio(oitoHoras('2026-10-13'))
    const concluida = await a.criarDemanda({ titulo: 'Concluída', prazo: '2026-10-14', membroIds: [design.id] })
    concluidaHa(a.db, concluida.id, oitoHoras('2026-10-13'))
    await a.criarDemanda({ titulo: 'Com o cliente', prazo: '2026-10-14', membroIds: [design.id], ate: 'enviada' })
    const arquivada = await a.criarDemanda({ titulo: 'Arquivada', prazo: '2026-10-14', membroIds: [design.id] })
    arquivar(a, arquivada)
    await a.criarDemanda({ titulo: 'Quadro arquivado', prazo: '2026-10-14', membroIds: [design.id], quadroId: a.quadros.social.quadro.id, como: admin })
    arquivarQuadro(a.db, a.quadros.social.quadro.id)
    const inativo = await a.criarDemanda({ titulo: 'Do Igor', prazo: '2026-10-14', membroIds: [web.id] })
    rodar(a.db, 'UPDATE usuario SET ativo = 0 WHERE id = ?', web.id)

    a.relogio(oitoHoras('2026-10-14'))
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 1, atrasada: 0 })
    assert.deepEqual(tiposDe(a.db, design.id).filter((t) => t === 'prazo' || t === 'atrasada'), [])
    assert.deepEqual(resumos(a.db, am.id, 'prazo'), [`#${inativo.numero} Do Igor HE vence hoje, 18h`])
  })
})

describe('avisos de prazo · atrasada', () => {
  test('uma vez por pessoa, demanda e prazo; de novo depois de um prazo novo', async () => {
    const a = await ambiente()
    const { design, am } = a.pessoas
    a.relogio(oitoHoras('2026-10-09'))
    const d = await a.criarDemanda({ titulo: 'Folder', prazo: '2026-10-13', membroIds: [design.id] })

    a.relogio(oitoHoras('2026-10-14'))                                                // venceu ontem às 18h
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 0, atrasada: 1 })
    assert.deepEqual(resumos(a.db, design.id, 'atrasada'), [`#${d.numero} Folder HE está atrasada desde ter, 13/10`])
    a.relogio(oitoHoras('2026-10-15'))
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 0, atrasada: 0 })    // continua atrasada: não repete

    // prazo renegociado para sexta: vence de novo, avisa `prazo` no dia e `atrasada` de novo depois
    tx(a.db, () => atualizarDemanda(a.db, d.id, { prazo: '2026-10-16' }, a.ator(am)))
    a.relogio(oitoHoras('2026-10-16'))
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 1, atrasada: 0 })
    a.relogio(oitoHoras('2026-10-19'))                                                // segunda
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 0, atrasada: 1 })
    assert.deepEqual(resumos(a.db, design.id, 'atrasada').length, 2)
    assert.match(resumos(a.db, design.id, 'atrasada')[1]!, /desde sex, 16\/10$/)
    assert.deepEqual(tiposDe(a.db, am.id).filter((t) => t === 'atrasada'), [])          // tem membro: o AM não recebe
  })

  test('prazo de hoje com a hora já passada às 8h é atrasada, não prazo', async () => {
    const a = await ambiente()
    const { design } = a.pessoas
    a.relogio(oitoHoras('2026-10-13'))
    await a.criarDemanda({ titulo: 'Cedo', prazo: '2026-10-14', prazoHora: '07:30', membroIds: [design.id] })
    a.relogio(oitoHoras('2026-10-14'))
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 0, atrasada: 1 })
  })
})

describe('avisos de prazo · dia útil e a tarefa', () => {
  test('nada sai em sábado, domingo ou feriado', async () => {
    const a = await ambiente()
    const { design } = a.pessoas
    a.relogio(oitoHoras('2026-10-09'))
    await a.criarDemanda({ titulo: 'Atrasada', prazo: '2026-10-09', membroIds: [design.id] })
    await a.criarDemanda({ titulo: 'No feriado', prazo: '2026-10-12', membroIds: [design.id] })
    for (const dia of ['2026-10-10', '2026-10-11', '2026-10-12']) {                     // sábado, domingo, Nossa Senhora Aparecida
      a.relogio(oitoHoras(dia))
      assert.deepEqual(avisarPrazos(a.db), { diaUtil: false, prazo: 0, atrasada: 0 }, dia)
    }
    assert.deepEqual(tiposDe(a.db, design.id).filter((t) => t === 'prazo' || t === 'atrasada'), [])
    a.relogio(oitoHoras('2026-10-13'))                                                // terça: as duas atrasadas
    assert.deepEqual(avisarPrazos(a.db), { diaUtil: true, prazo: 0, atrasada: 2 })
  })

  test('a tarefa `paineis-prazo` roda às 8h uma vez por dia', async () => {
    const a = await ambiente()
    const { design } = a.pessoas
    const tarefa = (await carregarTarefas()).find((t) => t.nome === 'paineis-prazo')
    assert.ok(tarefa)
    assert.equal(tarefa.horario, '08:00')
    a.relogio('2026-10-14T10:30:00.000Z')                                             // 7h30: ainda não
    assert.deepEqual(tarefasDevidas(a.db, [tarefa]).map((t) => t.nome), [])
    await a.criarDemanda({ titulo: 'Hoje', prazo: '2026-10-14', membroIds: [design.id] })
    a.relogio(oitoHoras('2026-10-14'))
    assert.deepEqual(tarefasDevidas(a.db, [tarefa]).map((t) => t.nome), ['paineis-prazo'])
    assert.equal(await executarTarefa(a.db, tarefa), true)
    assert.deepEqual(tiposDe(a.db, design.id).filter((t) => t === 'prazo'), ['prazo'])
    assert.deepEqual(tarefasDevidas(a.db, [tarefa]), [])
  })
})
