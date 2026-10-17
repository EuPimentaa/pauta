/**
 * Painéis (F3), lógica do front que roda sem navegador: a lista do sino em cache e o tratador do tempo real, o
 * "há 5 min", a Agenda (bootstrap + extras da API), as Horas e o resumo do Início.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/query-core'
import type {
  AgendaSaida, Apontamento, InicioSaida, ListarNotificacoesSaida, Notificacao,
} from '../../shared/tipos/index.ts'
import { tratarNotificacao } from '../../web/src/funcionalidades/paineis/cache.ts'
import {
  comMaisAntigas, comNotificacao, comPatchNotificacao, dataPorExtenso, diasDaSemanaDe, intervaloDaGrade, juntarAgenda,
  lancamentosDoDia, marcarNaLista, mesDe, partesDoResumo, quando, saudacao, totaisPorDia,
} from '../../web/src/funcionalidades/paineis/logica.ts'
import { demanda as demandaBase } from './nucleo-web-ajuda.ts'

function notif(id: number, extra: Partial<Notificacao> = {}): Notificacao {
  return { id, usuarioId: 'u-eu', tipo: 'chegou', demandaId: 'd1', demandaNumero: 1, atorId: null, resumo: `Aviso ${id}`,
    lidaEm: null, criadoEm: '2026-10-14T12:00:00.000Z', ...extra }
}

const lista = (itens: Notificacao[], naoLidas = itens.filter((n) => !n.lidaEm).length, proximo: number | null = null): ListarNotificacoesSaida =>
  ({ itens, naoLidas, proximo })

describe('sino em cache', () => {
  test('nova entra no topo e soma; a mesma de novo não soma; antiga fora da página não entra', () => {
    let l = lista([notif(5), notif(4, { lidaEm: '2026-10-14T13:00:00.000Z' })])
    l = comNotificacao(l, notif(7))
    assert.deepEqual(l.itens.map((n) => n.id), [7, 5, 4])
    assert.equal(l.naoLidas, 2)
    assert.equal(comNotificacao(l, notif(7)).naoLidas, 2)                              // idempotente
    assert.equal(comNotificacao(l, notif(3)), l)                                       // mais antiga que a página: fica de fora
    const vazia = comNotificacao(lista([]), notif(1))
    assert.deepEqual([vazia.itens.length, vazia.naoLidas], [1, 1])
  })

  test('patch lidaEm desconta uma vez; desconhecida avisa para reler', () => {
    const l = lista([notif(5), notif(4)])
    const r = comPatchNotificacao(l, 5, { lidaEm: '2026-10-14T13:00:00.000Z' })
    assert.equal(r.conhecida, true)
    assert.equal(r.lista.naoLidas, 1)
    assert.equal(comPatchNotificacao(r.lista, 5, { lidaEm: '2026-10-14T13:00:00.000Z' }).lista.naoLidas, 1)
    assert.equal(comPatchNotificacao(l, 99, { lidaEm: 'x' }).conhecida, false)
  })

  test('marcar: por ids desconta só elas; "todas até X" zera (inclusive as não carregadas)', () => {
    const l = lista([notif(5), notif(4), notif(3)], 10, 3)
    const porIds = marcarNaLista(l, { ids: [4] }, 'agora')
    assert.equal(porIds.naoLidas, 9)
    assert.deepEqual(porIds.itens.map((n) => n.lidaEm), [null, 'agora', null])
    const todas = marcarNaLista(l, { ate: 5 }, 'agora')
    assert.equal(todas.naoLidas, 0)
    assert.ok(todas.itens.every((n) => n.lidaEm === 'agora'))
  })

  test('mais antigas vão para o fim, sem repetir, com o próximo cursor e a contagem do servidor', () => {
    const l = lista([notif(5), notif(4)], 3, 4)
    const m = comMaisAntigas(l, lista([notif(4), notif(3), notif(2)], 3, 2))
    assert.deepEqual(m.itens.map((n) => n.id), [5, 4, 3, 2])
    assert.equal(m.proximo, 2)
  })

  test('tratador: nova notificação soma no sino e a menção entra no Início; lida em outra aba desconta nos dois', () => {
    const qc = new QueryClient()
    qc.setQueryData(['notificacoes'], lista([notif(5)]))
    const inicio = { mencoes: [notif(4, { tipo: 'mencao' })] } as unknown as InicioSaida
    qc.setQueryData(['inicio'], inicio)
    const ev = (n: Notificacao) => ({ s: 1, e: 'notificacao', id: String(n.id), d: n.demandaId, t: null, a: null, op: 'upsert', p: n, c: null }) as const
    tratarNotificacao(ev(notif(6, { tipo: 'mencao' })) as never, qc)
    tratarNotificacao(ev(notif(6, { tipo: 'mencao' })) as never, qc)                  // de novo (reconexão): nada muda
    assert.deepEqual(qc.getQueryData<ListarNotificacoesSaida>(['notificacoes'])!.itens.map((n) => n.id), [6, 5])
    assert.equal(qc.getQueryData<ListarNotificacoesSaida>(['notificacoes'])!.naoLidas, 2)
    assert.deepEqual(qc.getQueryData<InicioSaida>(['inicio'])!.mencoes.map((m) => m.id), [6, 4])

    tratarNotificacao({ s: 2, e: 'notificacao', id: '6', d: null, t: null, a: null, op: 'upsert', p: { lidaEm: '2026-10-14T14:00:00.000Z' }, c: ['lidaEm'] } as never, qc)
    assert.equal(qc.getQueryData<ListarNotificacoesSaida>(['notificacoes'])!.naoLidas, 1)
    assert.equal(qc.getQueryData<InicioSaida>(['inicio'])!.mencoes[0]!.lidaEm, '2026-10-14T14:00:00.000Z')
  })

  test('"há 5 min", "ontem, 14h", dia da semana e data', () => {
    const agora = new Date('2026-10-16T18:00:00.000Z')                              // sex, 15h em SP
    assert.equal(quando('2026-10-16T17:59:40.000Z', agora), 'agora')
    assert.equal(quando('2026-10-16T17:55:00.000Z', agora), 'há 5 min')
    assert.equal(quando('2026-10-16T13:00:00.000Z', agora), 'há 5 h')
    assert.equal(quando('2026-10-15T17:00:00.000Z', agora), 'ontem, 14h')
    assert.equal(quando('2026-10-15T17:30:00.000Z', agora), 'ontem, 14h30')
    assert.equal(quando('2026-10-12T17:00:00.000Z', agora), 'seg, 12/10')
    assert.equal(quando('2026-09-01T17:00:00.000Z', agora), '01/09')
    assert.equal(quando('2025-09-01T17:00:00.000Z', agora), '01/09/2025')
  })
})

describe('Início, Agenda e Horas', () => {
  test('resumo só com o que não é zero; saudação pela hora de São Paulo; data por extenso', () => {
    assert.deepEqual(partesDoResumo({ atrasadas: 3, hoje: 0, comCliente: 1 }).map((p) => p.texto), ['3 atrasadas', '1 com o cliente'])
    assert.deepEqual(partesDoResumo({ atrasadas: 1, hoje: 2, comCliente: 0 }).map((p) => p.texto), ['1 atrasada', '2 para hoje'])
    assert.equal(saudacao(new Date('2026-10-16T11:00:00.000Z')), 'Bom dia')       // 8h
    assert.equal(saudacao(new Date('2026-10-16T18:00:00.000Z')), 'Boa tarde')     // 15h
    assert.equal(saudacao(new Date('2026-10-17T01:00:00.000Z')), 'Boa noite')     // 22h
    assert.equal(dataPorExtenso('2026-10-16'), 'sexta, 16 de outubro')
  })

  test('Agenda: itens do bootstrap mais os das concluídas antigas da API, em ordem; o intervalo da grade', () => {
    const noBootstrap = demandaBase({ id: 'b1', numero: 10, prazo: '2026-10-15', membroIds: ['u-eu'] })
    const antiga = demandaBase({ id: 'x1', numero: 3, prazo: '2026-10-15', prazoHora: '09:00', concluidaEm: '2026-10-01T12:00:00.000Z' })
    const api: AgendaSaida = {
      de: '2026-09-28', ate: '2026-11-01', feriados: [], extras: [antiga],
      itens: [{ demandaId: 'x1', campo: 'prazo', data: '2026-10-15', hora: '09:00' }, { demandaId: 'b1', campo: 'prazo', data: '2026-10-15', hora: null }],
    }
    const itens = juntarAgenda([noBootstrap], { de: '2026-09-28', ate: '2026-11-01' }, 'u-eu', api)
    assert.deepEqual(itens.map((i) => i.demanda.id), ['x1', 'b1'])                   // 9h antes do sem hora; sem repetir b1
    // a mudança no bootstrap vale na hora (a API ainda tem o prazo antigo)
    const mudou = juntarAgenda([{ ...noBootstrap, prazo: '2026-10-20' }], { de: '2026-09-28', ate: '2026-11-01' }, 'u-eu', api)
    assert.deepEqual(mudou.map((i) => `${i.demanda.id}:${i.data}`), ['x1:2026-10-15', 'b1:2026-10-20'])
    assert.deepEqual(intervaloDaGrade('mes', '2026-10-16'), { de: '2026-09-28', ate: '2026-11-01' })
    assert.deepEqual(intervaloDaGrade('semana', '2026-10-16'), { de: '2026-10-12', ate: '2026-10-18' })
    assert.deepEqual(intervaloDaGrade('mes', '2026-02-10'), { de: '2026-01-26', ate: '2026-03-01' })
  })

  test('Horas: dias da semana, total por dia sem o cronômetro ligado, ligado primeiro, mês', () => {
    const a = (id: string, data: string, minutos: number | null, criadoEm: string): Apontamento => ({
      id, usuarioId: 'u-eu', demandaId: 'd1', clienteId: null, data, minutos, iniciadoEm: minutos === null ? criadoEm : null,
      paradoEm: null, origem: minutos === null ? 'cronometro' : 'manual', nota: null, criadoEm,
    })
    const itens = [a('1', '2026-10-14', 30, '2026-10-14T12:00:00Z'), a('2', '2026-10-14', 45, '2026-10-14T15:00:00Z'),
      a('3', '2026-10-14', null, '2026-10-14T16:00:00Z'), a('4', '2026-10-16', 60, '2026-10-16T12:00:00Z')]
    assert.deepEqual(diasDaSemanaDe('2026-10-16'), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
    assert.deepEqual([...totaisPorDia(itens)], [['2026-10-14', 75], ['2026-10-16', 60]])
    assert.deepEqual(lancamentosDoDia(itens, '2026-10-14').map((x) => x.id), ['3', '2', '1'])
    assert.deepEqual(mesDe('2026-12-09'), { de: '2026-12-01', ate: '2026-12-31' })
    assert.deepEqual(mesDe('2028-02-10'), { de: '2028-02-01', ate: '2028-02-29' })
  })
})
