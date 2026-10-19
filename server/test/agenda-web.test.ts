/**
 * Agenda externa (F9), lógica do front que roda sem navegador: os itens do calendário por dia, a regra do mês (os
 * prazos têm prioridade e os externos viram "3 eventos"), a ordem da semana, o filtro, "Hoje na agenda", os textos de
 * horário e de estado e o tratador do tempo real sobre o cache.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/query-core'
import type { AgendaExterna, EventoAgendaExterna, EventosAgendaSaida, EventoTempoReal, HoraLocal } from '../../shared/tipos/index.ts'
import { diaDoMes, diaPorHorario, rotuloResumo } from '../../web/src/calendario/externos.ts'
import { tratarAgendaExterna } from '../../web/src/funcionalidades/agenda/cache.ts'
import {
  acontecendo, alternarDesligada, chavesAgenda, diasDoEvento, encerrado, estadoDaAgenda, eventosDeHoje, horarioCurto, horarioDoEvento,
  itensDoPeriodo,
} from '../../web/src/funcionalidades/agenda/logica.ts'

function agenda(id: string, extra: Partial<AgendaExterna> = {}): AgendaExterna {
  return {
    id, nome: id === 'a1' ? 'Melt' : 'Outra', cor: id === 'a1' ? 'roxo' : 'verde', urlDica: 'calendar.google.com · x · …abcd', ativa: true,
    buscadaEm: '2026-10-19T13:00:00.000Z', okEm: '2026-10-19T13:00:00.000Z', erro: null,
    contagens: { eventos: 10, ocorrencias: 312, repeticoesNaoEntendidas: 0, fusosDesconhecidos: 0, avisos: 0, bytes: 1000, duracaoMs: 20 },
    ocorrenciasEm: '2026-10-19T13:00:00.000Z', criadaEm: '2026-10-01T12:00:00.000Z', ...extra,
  }
}

function evento(id: string, extra: Partial<EventoAgendaExterna> = {}): EventoAgendaExterna {
  return {
    id: `a1:${id}`, agendaId: 'a1', titulo: id, diaInteiro: false, inicio: '2026-10-20T13:00:00.000Z', fim: '2026-10-20T14:00:00.000Z',
    diaInicio: '2026-10-20', diaFim: '2026-10-20', local: null, linkReuniao: null, descricao: null, tentativo: false, livre: false,
    privado: false, ...extra,
  }
}

const saida = (eventos: EventoAgendaExterna[], agendas = [agenda('a1'), agenda('a2')]): EventosAgendaSaida =>
  ({ de: '2026-10-19', ate: '2026-10-25', agendas, eventos })

describe('itens do calendário', () => {
  test('um item por dia: a hora no primeiro, o fim no último; dia inteiro e os dias do meio sem hora', () => {
    assert.deepEqual(diasDoEvento(evento('b1'), '2026-10-19', '2026-10-25'), [{ data: '2026-10-20', hora: '10:00', horaFim: '11:00' }])
    const noite = evento('festa', { inicio: '2026-10-23T01:00:00.000Z', fim: '2026-10-24T04:00:00.000Z', diaInicio: '2026-10-22', diaFim: '2026-10-24' })
    assert.deepEqual(diasDoEvento(noite, '2026-10-19', '2026-10-25'), [
      { data: '2026-10-22', hora: '22:00', horaFim: null }, { data: '2026-10-23', hora: null, horaFim: null },
      { data: '2026-10-24', hora: null, horaFim: '01:00' },
    ])
    const tres = evento('c2', { diaInteiro: true, inicio: null, fim: null, diaInicio: '2026-10-24', diaFim: '2026-10-27' })
    assert.deepEqual(diasDoEvento(tres, '2026-10-19', '2026-10-25').map((d) => d.data), ['2026-10-24', '2026-10-25'])   // corta no período
    const semFim = evento('d13', { fim: '2026-10-20T13:00:00.000Z' })
    assert.deepEqual(diasDoEvento(semFim, '2026-10-19', '2026-10-25'), [{ data: '2026-10-20', hora: '10:00', horaFim: null }])
  })

  test('só das agendas ativas e ligadas no filtro; cor e nome da agenda; livre e talvez ficam leves', () => {
    const s = saida([evento('x'), evento('y', { agendaId: 'a2', id: 'a2:y', livre: true }), evento('z', { agendaId: 'a3', id: 'a3:z' })])
    const todos = itensDoPeriodo(s, new Set(), '2026-10-19', '2026-10-25')
    assert.deepEqual(todos.map((i) => [i.titulo, i.cor, i.origem, i.leve, i.id]), [
      ['x', 'roxo', 'Melt', false, 'a1:x:2026-10-20'], ['y', 'verde', 'Outra', true, 'a2:y:2026-10-20'],
    ])
    assert.deepEqual(itensDoPeriodo(s, new Set(['a2']), '2026-10-19', '2026-10-25').map((i) => i.titulo), ['x'])
    const pausada = saida([evento('x')], [agenda('a1', { ativa: false })])
    assert.deepEqual(itensDoPeriodo(pausada, new Set(), '2026-10-19', '2026-10-25'), [])
    assert.deepEqual(alternarDesligada(['a1'], 'a2'), ['a1', 'a2'])
    assert.deepEqual(alternarDesligada(['a1', 'a2'], 'a1'), ['a2'])
  })
})

describe('a regra do mês e da semana (componente: CalendarioDemandas)', () => {
  interface D { id: string; hora: HoraLocal | null }
  interface E { id: string; hora: HoraLocal | null; titulo: string }
  const prazos: D[] = [{ id: 'p1', hora: null }, { id: 'p2', hora: '18:00' }]
  const externos: E[] = [
    { id: 'reuniao', hora: '10:00', titulo: 'Reunião' }, { id: 'feriado', hora: null, titulo: 'Feriado' },
    { id: 'plantao', hora: null, titulo: 'Plantão' },
  ]

  test('mês: um dia com 2 eventos de dia inteiro, 1 reunião e 2 prazos → os 2 prazos e "3 eventos"', () => {
    const { demandas, rodape } = diaDoMes(prazos, externos)
    assert.deepEqual(demandas.map((d) => d.id), ['p1', 'p2'])
    assert.equal(rodape?.tipo, 'resumo')
    assert.equal(rotuloResumo(rodape?.tipo === 'resumo' ? rodape.itens.length : 0), '3 eventos')
    assert.deepEqual(rodape?.tipo === 'resumo' ? rodape.itens.map((e) => e.id) : [], ['feriado', 'plantao', 'reuniao'])
    const um = diaDoMes(prazos, [externos[0]!])
    assert.deepEqual(um.rodape, { tipo: 'externo', item: externos[0] })
    assert.equal(diaDoMes(prazos, []).rodape, null)
    assert.equal(rotuloResumo(1), '1 evento')
  })

  test('semana e celular: dia inteiro no topo, depois por horário (demanda primeiro no empate), demandas sem hora no fim', () => {
    const r = diaPorHorario(prazos, [...externos, { id: 'tarde', hora: '18:00', titulo: 'Tarde' }])
    assert.deepEqual(r.map((e) => (e.tipo === 'resumo' ? 'resumo' : e.item.id)), ['feriado', 'plantao', 'reuniao', 'p2', 'tarde', 'p1'])
    // sem externos, o dia fica exatamente como antes (as demandas na ordem que chegaram)
    assert.deepEqual(diaPorHorario(prazos, []).map((e) => (e.tipo === 'demanda' ? e.item.id : '')), ['p1', 'p2'])
  })
})

describe('Hoje na agenda e os textos', () => {
  test('eventos de hoje: dia inteiro primeiro, no máximo 5 e quantos sobraram; todas escondidas', () => {
    const hoje = '2026-10-20'
    const eventos = [
      ...Array.from({ length: 6 }, (_, i) => evento(`r${i}`, { inicio: `2026-10-20T1${i}:00:00.000Z`, fim: `2026-10-20T1${i}:30:00.000Z` })),
      evento('dia', { diaInteiro: true, inicio: null, fim: null }),
      evento('amanha', { diaInicio: '2026-10-21', diaFim: '2026-10-21', inicio: '2026-10-21T13:00:00.000Z', fim: '2026-10-21T14:00:00.000Z' }),
    ]
    const r = eventosDeHoje(saida(eventos), new Set(), hoje, 5)
    assert.deepEqual(r.itens.map((i) => i.titulo), ['dia', 'r0', 'r1', 'r2', 'r3'])
    assert.equal(r.resto, 2)
    assert.equal(r.todasEscondidas, false)
    const escondidas = eventosDeHoje(saida(eventos), new Set(['a1', 'a2']), hoje)
    assert.deepEqual([escondidas.itens, escondidas.todasEscondidas], [[], true])
  })

  test('eventos de hoje com o relógio às 13:30: os que já passaram saem da frente; o que está acontecendo é "agora"', () => {
    // revisão visual, achado 2: à tarde, a seção mostrava o dia inteiro e as reuniões da manhã, já encerradas, e
    // escondia as próximas (14h, 17h, 18h30) atrás do "mais 4"
    const hoje = '2026-10-20'
    const h = (hh: string) => `2026-10-20T${hh}:00.000Z`          // UTC; São Paulo = UTC−3
    const eventos = [
      evento('dia1', { diaInteiro: true, inicio: null, fim: null }),
      evento('dia2', { diaInteiro: true, inicio: null, fim: null }),
      evento('daily', { inicio: h('11:30'), fim: h('11:45') }),      // 8h30–8h45
      evento('call', { inicio: h('13:00'), fim: h('13:30') }),       // 10h–10h30
      evento('reuniao', { inicio: h('13:00'), fim: h('14:00') }),    // 10h–11h
      evento('almoco', { inicio: h('16:00'), fim: h('17:00') }),     // 13h–14h, acontecendo às 13:30
      evento('gravacao', { inicio: h('17:00'), fim: h('18:00') }),   // 14h
      evento('cafe', { inicio: h('20:00'), fim: h('20:30') }),       // 17h
      evento('ocupado', { inicio: h('21:30'), fim: h('22:00') }),    // 18h30
    ]
    const agora = new Date(h('16:30'))                               // 13:30 em São Paulo
    const r = eventosDeHoje(saida(eventos), new Set(), hoje, 5, agora)
    assert.deepEqual(r.itens.map((i) => i.titulo), ['dia1', 'dia2', 'almoco', 'gravacao', 'cafe'])
    assert.equal(r.resto, 1)
    assert.deepEqual(r.passados.map((i) => i.titulo), ['daily', 'call', 'reuniao'])
    assert.equal(r.aindaHoje, 4)
    assert.equal(r.total, 9)
    assert.deepEqual(r.itens.filter((i) => acontecendo(i, agora)).map((i) => i.titulo), ['almoco'])
    assert.equal(encerrado(r.itens[0]!, agora), false, 'dia inteiro nunca "já passou" dentro do dia')
    // às 23h nada mais vem, só os de dia inteiro
    const noite = eventosDeHoje(saida(eventos), new Set(), hoje, 5, new Date('2026-10-21T02:00:00.000Z'))
    assert.deepEqual([noite.itens.map((i) => i.titulo), noite.passados.length, noite.aindaHoje], [['dia1', 'dia2'], 7, 0])
  })

  test('horário dos detalhes e o curto', () => {
    assert.equal(horarioDoEvento(evento('b1')), 'ter, 20 de outubro · 10h–11h')
    assert.equal(horarioDoEvento(evento('c1', { diaInteiro: true, inicio: null, fim: null, diaInicio: '2026-11-02', diaFim: '2026-11-02' })), 'Dia inteiro · seg, 2 de novembro')
    assert.equal(horarioDoEvento(evento('c2', { diaInteiro: true, inicio: null, fim: null, diaInicio: '2026-11-10', diaFim: '2026-11-12' })), '10 a 12 de novembro (dia inteiro)')
    assert.equal(horarioDoEvento(evento('noite', { inicio: '2026-10-24T01:00:00.000Z', fim: '2026-10-24T04:00:00.000Z', diaInicio: '2026-10-23', diaFim: '2026-10-24' })),
      'sex, 23/10, 22h – sáb, 24/10, 1h')
    assert.equal(horarioDoEvento(evento('d13', { fim: '2026-10-20T13:00:00.000Z' })), 'ter, 20 de outubro · 10h')
    assert.equal(horarioCurto({ hora: '10:00', horaFim: '11:30', evento: evento('x') }), '10h–11h30')
    assert.equal(horarioCurto({ hora: null, horaFim: '01:00', evento: evento('x') }), 'até 1h')
    assert.equal(horarioCurto({ hora: null, horaFim: null, evento: evento('x', { diaInteiro: true }) }), 'Dia inteiro')
  })

  test('estado da agenda: atualizada com contagem, buscando, pausada, erro com a última busca boa e os avisos', () => {
    assert.deepEqual(estadoDaAgenda(agenda('a1'), '2026-10-19').texto, 'Atualizada às 10:00 · 312 eventos')
    assert.equal(estadoDaAgenda(agenda('a1', { buscadaEm: '2026-10-19T13:15:00.000Z' }), '2026-10-19').texto, 'Atualizada às 10:15 · 312 eventos')
    assert.equal(estadoDaAgenda(agenda('a1', { okEm: null, buscadaEm: null, contagens: null }), '2026-10-19').texto, 'Buscando a agenda…')
    assert.equal(estadoDaAgenda(agenda('a1', { ativa: false }), '2026-10-19').tom, 'neutro')
    const erro = estadoDaAgenda(agenda('a1', { erro: 'endereco_invalido' }), '2026-10-19')
    assert.equal(erro.tom, 'erro')
    assert.match(erro.texto, /Cole o endereço novo/)
    assert.match(erro.detalhe!, /continuam na Agenda/)
    const c = { eventos: 10, ocorrencias: 1500, repeticoesNaoEntendidas: 1, fusosDesconhecidos: 2, avisos: 0, bytes: 1, duracaoMs: 1 }
    const avisos = estadoDaAgenda(agenda('a1', { contagens: c, buscadaEm: '2026-10-18T13:00:00.000Z' }), '2026-10-19')
    assert.equal(avisos.texto, 'Atualizada em 18/10 às 10:00 · 1.500 eventos')
    assert.equal(avisos.avisos.length, 2)
  })
})

describe('tratador do tempo real (agenda_externa)', () => {
  const ev = (op: 'upsert' | 'delete', a: AgendaExterna): EventoTempoReal =>
    ({ s: 1, e: 'agenda_externa', id: a.id, d: null, t: null, a: null, op, p: op === 'delete' ? null : a, c: null }) as unknown as EventoTempoReal

  test('troca a cor na lista e nos períodos sem buscar de novo; ocorrências novas invalidam os períodos', () => {
    const qc = new QueryClient()
    qc.setQueryData(chavesAgenda.lista, [agenda('a1'), agenda('a2')])
    qc.setQueryData(chavesAgenda.eventos('2026-10-19', '2026-10-25'), saida([evento('x')]))
    tratarAgendaExterna(ev('upsert', agenda('a1', { cor: 'azul' })), qc)
    assert.equal(qc.getQueryData<AgendaExterna[]>(chavesAgenda.lista)![0]!.cor, 'azul')
    const s = qc.getQueryData<EventosAgendaSaida>(chavesAgenda.eventos('2026-10-19', '2026-10-25'))!
    assert.equal(s.agendas[0]!.cor, 'azul')
    assert.equal(qc.getQueryState(chavesAgenda.eventos('2026-10-19', '2026-10-25'))!.isInvalidated, false)
    tratarAgendaExterna(ev('upsert', agenda('a1', { cor: 'azul', ocorrenciasEm: '2026-10-19T13:15:00.000Z' })), qc)
    assert.equal(qc.getQueryState(chavesAgenda.eventos('2026-10-19', '2026-10-25'))!.isInvalidated, true)
  })

  test('pausada e excluída somem dos períodos com os eventos; agenda nova invalida', () => {
    const qc = new QueryClient()
    const chave = chavesAgenda.eventos('2026-10-19', '2026-10-25')
    qc.setQueryData(chavesAgenda.lista, [agenda('a1'), agenda('a2')])
    qc.setQueryData(chave, saida([evento('x'), evento('y', { agendaId: 'a2', id: 'a2:y' })]))
    tratarAgendaExterna(ev('upsert', agenda('a2', { ativa: false })), qc)
    assert.deepEqual(qc.getQueryData<EventosAgendaSaida>(chave)!.eventos.map((e) => e.titulo), ['x'])
    tratarAgendaExterna(ev('delete', agenda('a1')), qc)
    assert.deepEqual(qc.getQueryData<EventosAgendaSaida>(chave)!.agendas, [])
    assert.deepEqual(qc.getQueryData<AgendaExterna[]>(chavesAgenda.lista)!.map((a) => a.id), ['a2'])
    tratarAgendaExterna(ev('upsert', agenda('a3')), qc)
    assert.equal(qc.getQueryState(chave)!.isInvalidated, true)
    assert.deepEqual(qc.getQueryData<AgendaExterna[]>(chavesAgenda.lista)!.map((a) => a.id), ['a2', 'a3'])
  })
})
