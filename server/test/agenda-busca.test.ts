/**
 * Busca do iCal por HTTP de verdade contra um servidor falso local que serve as fixtures (F9; pesquisa-ical §7 H e
 * API.md §F.9 "Busca"): gzip, 404, HTML, 5xx, 429, redirecionamento, tempo esgotado, teto em fluxo, gzip que estoura
 * descomprimido, teto de ocorrências, o mesmo feed com outro DTSTAMP e a janela que anda um dia.
 */
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AgendaExterna } from '../../shared/tipos/index.ts'
import { um } from '../src/db.ts'
import { buscarAgenda, lerIcalHttp } from '../src/servicos/agenda-busca.ts'
import { eventos, ultimoSeq, type Ambiente } from './ajuda.ts'
import { ambienteAgenda, apontarPara, criarAgendaTeste, fixture, ical, servidorFalso, URL_TESTE, type ServidorFalso } from './agenda-ajuda.ts'

let s: ServidorFalso
before(async () => { s = await servidorFalso() })
after(async () => { await s.fechar() })

const estado = (a: Ambiente, id: string) => um<{
  buscada_em: string | null; ok_em: string | null; erro: string | null; hash_conteudo: string | null; ocorrencias_em: string | null
}>(a.db, 'SELECT buscada_em, ok_em, erro, hash_conteudo, ocorrencias_em FROM agenda_externa WHERE id = ?', id)!
const total = (a: Ambiente, id: string) => um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM agenda_ocorrencia WHERE agenda_id = ?', id)!.n
const eventosDaAgenda = (a: Ambiente, desde: number) => eventos(a.db, desde).filter((e) => e.entidade === 'agenda_externa')

/** Agenda criada com a fixture servida pelo servidor falso (busca boa). */
async function agendaBoa(a: Ambiente): Promise<AgendaExterna> {
  s.servir(fixture('google-2026.ics'))
  apontarPara(s, '/ical')
  return criarAgendaTeste(a)
}

describe('lerIcalHttp contra o servidor falso', () => {
  test('200 text/calendar: o corpo inteiro; com gzip, descomprimido pelo fetch', async () => {
    const corpo = fixture('google-2026.ics')
    const r = await lerIcalHttp(`${s.base}/ical`)
    assert.ok(r.ok && Buffer.from(r.corpo).equals(corpo))
    const g = await lerIcalHttp(`${s.base}/ical-gzip`)
    assert.ok(g.ok && Buffer.from(g.corpo).equals(corpo))
  })

  test('404 → endereco_invalido; HTML → nao_e_ical; 500 e 429 → fora_do_ar; 302 não é seguido → fora_do_ar', async () => {
    assert.deepEqual(await lerIcalHttp(`${s.base}/404`), { ok: false, erro: 'endereco_invalido' })
    assert.deepEqual(await lerIcalHttp(`${s.base}/html`), { ok: false, erro: 'nao_e_ical' })
    assert.deepEqual(await lerIcalHttp(`${s.base}/500`), { ok: false, erro: 'fora_do_ar' })
    assert.deepEqual(await lerIcalHttp(`${s.base}/429`), { ok: false, erro: 'fora_do_ar' })
    assert.deepEqual(await lerIcalHttp(`${s.base}/302`), { ok: false, erro: 'fora_do_ar' })
  })

  test('tempo esgotado no meio do corpo → tempo_esgotado; servidor fora → fora_do_ar', async () => {
    assert.deepEqual(await lerIcalHttp(`${s.base}/lento`, { tempoMs: 300 }), { ok: false, erro: 'tempo_esgotado' })
    assert.deepEqual(await lerIcalHttp('http://127.0.0.1:1/ical', { tempoMs: 2000 }), { ok: false, erro: 'fora_do_ar' })
  })

  test('H3 corpo acima do teto, lido em fluxo (o servidor nunca termina) → grande_demais', async () => {
    const t0 = performance.now()
    assert.deepEqual(await lerIcalHttp(`${s.base}/grande`, { tetoBytes: 256 * 1024 }), { ok: false, erro: 'grande_demais' })
    assert.ok(performance.now() - t0 < 5000)
  })

  test('gzip pequeno que passa de 32 MB descomprimido → grande_demais (o teto conta depois de descomprimir)', async () => {
    assert.deepEqual(await lerIcalHttp(`${s.base}/bomba`), { ok: false, erro: 'grande_demais' })
  })
})

describe('busca de uma agenda (estado, ocorrências e tempo real)', () => {
  test('busca boa pelo HTTP: ocorrências gravadas; a busca recebe o endereço validado do Google', async () => {
    const a = await ambienteAgenda()
    s.servir(fixture('google-2026.ics'))
    const recebidos = apontarPara(s, '/ical-gzip')
    const ag = await criarAgendaTeste(a)
    assert.deepEqual(recebidos, [URL_TESTE])
    const e = estado(a, ag.id)
    assert.deepEqual([e.erro, e.ok_em], [null, '2026-10-19T13:00:00.000Z'])
    assert.ok(total(a, ag.id) > 200)
  })

  test('H5 mesmo feed com outro DTSTAMP: só buscada_em muda; nada regravado e nenhum evento de tempo real', async () => {
    const a = await ambienteAgenda()
    const ag = await agendaBoa(a)
    const antes = estado(a, ag.id)
    const seq = ultimoSeq(a.db)
    a.relogio('2026-10-19T13:20:00.000Z')
    s.servir(Buffer.from(fixture('google-2026.ics').toString('latin1').replace(/DTSTAMP:\d{8}T\d{6}Z/g, 'DTSTAMP:20261019T132000Z'), 'latin1'))
    await buscarAgenda(a.db, ag.id)
    const depois = estado(a, ag.id)
    assert.equal(depois.buscada_em, '2026-10-19T13:20:00.000Z')
    assert.deepEqual([depois.ok_em, depois.hash_conteudo, depois.ocorrencias_em], [antes.ok_em, antes.hash_conteudo, antes.ocorrencias_em])
    assert.equal(ultimoSeq(a.db), seq)
  })

  test('feed mudou: as ocorrências são substituídas numa transação, ocorrenciasEm muda e sai um evento', async () => {
    const a = await ambienteAgenda()
    const ag = await agendaBoa(a)
    const seq = ultimoSeq(a.db)
    a.relogio('2026-10-19T13:30:00.000Z')
    s.servir(ical(['UID:novo@x', 'DTSTART:20261021T120000Z', 'DTEND:20261021T130000Z', 'SUMMARY:Único evento']))
    await buscarAgenda(a.db, ag.id)
    assert.equal(total(a, ag.id), 1)
    const e = estado(a, ag.id)
    assert.deepEqual([e.ok_em, e.ocorrencias_em], ['2026-10-19T13:30:00.000Z', '2026-10-19T13:30:00.000Z'])
    const evs = eventosDaAgenda(a, seq)
    assert.equal(evs.length, 1)
    assert.equal((evs[0]!.patch as unknown as AgendaExterna).contagens!.ocorrencias, 1)
  })

  test('conteúdo mudou fora da janela: grava o hash e publica o estado, mas não mexe nas ocorrências (ocorrenciasEm igual)', async () => {
    const a = await ambienteAgenda()
    const ag = await agendaBoa(a)
    const antes = estado(a, ag.id)
    a.relogio('2026-10-19T13:30:00.000Z')
    // latin1: os bytes ficam iguais (o G1 tem um "ã" partido pela dobra, que o UTF-8 estragaria)
    const corpo = fixture('google-2026.ics').toString('latin1')
      .replace('END:VCALENDAR', 'BEGIN:VEVENT\r\nUID:velho@x\r\nDTSTART:20150101T120000Z\r\nSUMMARY:antigo\r\nEND:VEVENT\r\nEND:VCALENDAR')
    s.servir(Buffer.from(corpo, 'latin1'))
    await buscarAgenda(a.db, ag.id)
    const depois = estado(a, ag.id)
    assert.notEqual(depois.hash_conteudo, antes.hash_conteudo)
    assert.equal(depois.ocorrencias_em, antes.ocorrencias_em)
    assert.equal(depois.ok_em, '2026-10-19T13:30:00.000Z')
  })

  test('H1 404: endereco_invalido, as ocorrências anteriores ficam; o evento sai só quando o erro muda', async () => {
    const a = await ambienteAgenda()
    const ag = await agendaBoa(a)
    const n = total(a, ag.id)
    const seq = ultimoSeq(a.db)
    apontarPara(s, '/404')
    a.relogio('2026-10-19T13:20:00.000Z')
    await buscarAgenda(a.db, ag.id)
    assert.equal(estado(a, ag.id).erro, 'endereco_invalido')
    assert.equal(estado(a, ag.id).ok_em, '2026-10-19T13:00:00.000Z')
    assert.equal(total(a, ag.id), n)
    assert.equal(eventosDaAgenda(a, seq).length, 1)
    a.relogio('2026-10-19T13:40:00.000Z')
    await buscarAgenda(a.db, ag.id)
    assert.equal(eventosDaAgenda(a, seq).length, 1)                 // mesmo erro: sem evento novo
    assert.equal(estado(a, ag.id).buscada_em, '2026-10-19T13:40:00.000Z')
    // volta a funcionar: erro limpo, mesmo hash mas o estado muda → evento
    apontarPara(s, '/ical')
    a.relogio('2026-10-19T14:00:00.000Z')
    await buscarAgenda(a.db, ag.id)
    assert.deepEqual([estado(a, ag.id).erro, estado(a, ag.id).ok_em], [null, '2026-10-19T14:00:00.000Z'])
    assert.equal(eventosDaAgenda(a, seq).length, 2)
  })

  test('H2 HTML (página de login), H4 500/429/tempo e o 302: erro gravado, anteriores mantidas', async () => {
    const a = await ambienteAgenda()
    const ag = await agendaBoa(a)
    const n = total(a, ag.id)
    for (const [rota, erro, o] of [['/html', 'nao_e_ical', {}], ['/500', 'fora_do_ar', {}], ['/429', 'fora_do_ar', {}],
      ['/302', 'fora_do_ar', {}], ['/lento', 'tempo_esgotado', { tempoMs: 300 }], ['/grande', 'grande_demais', { tetoBytes: 128 * 1024 }]] as const) {
      apontarPara(s, rota, o)
      await buscarAgenda(a.db, ag.id)
      assert.equal(estado(a, ag.id).erro, erro, rota)
      assert.equal(total(a, ag.id), n, rota)
    }
  })

  test('mais de 20.000 ocorrências na janela → teto_ocorrencias e as anteriores ficam', async () => {
    const a = await ambienteAgenda()
    const ag = await agendaBoa(a)
    const n = total(a, ag.id)
    s.servir(ical(...Array.from({ length: 95 }, (_, i) => [`UID:s${i}@x`, 'DTSTART;TZID=America/Sao_Paulo:20260101T090000', 'RRULE:FREQ=DAILY', `SUMMARY:s${i}`])))
    await buscarAgenda(a.db, ag.id)
    assert.equal(estado(a, ag.id).erro, 'teto_ocorrencias')
    assert.equal(total(a, ag.id), n)
  })

  test('a janela anda: no dia seguinte, o mesmo feed é lido de novo (sai o dia −31, entra o +181)', async () => {
    const a = await ambienteAgenda()
    const ag = await agendaBoa(a)
    const antes = estado(a, ag.id)
    assert.equal(um<{ n: number }>(a.db, "SELECT count(*) AS n FROM agenda_ocorrencia WHERE agenda_id = ? AND dia_inicio = '2026-09-21'", ag.id)!.n, 4)
    a.relogio('2026-10-22T13:00:00.000Z')                          // janela de 22/09 a 20/04/2027
    await buscarAgenda(a.db, ag.id)
    const depois = estado(a, ag.id)
    assert.equal(depois.hash_conteudo, antes.hash_conteudo)
    assert.equal(depois.ok_em, '2026-10-22T13:00:00.000Z')
    assert.equal(um<{ n: number }>(a.db, "SELECT count(*) AS n FROM agenda_ocorrencia WHERE agenda_id = ? AND dia_inicio < '2026-09-22'", ag.id)!.n, 0)
    assert.notEqual(depois.ocorrencias_em, antes.ocorrencias_em)
  })

  test('duas buscas da mesma agenda ao mesmo tempo viram uma', async () => {
    const a = await ambienteAgenda()
    const ag = await agendaBoa(a)
    const antes = s.pedidos.get('/ical') ?? 0
    s.servir(ical(['UID:x@y', 'DTSTART:20261021T120000Z', 'SUMMARY:x']))
    await Promise.all([buscarAgenda(a.db, ag.id), buscarAgenda(a.db, ag.id), buscarAgenda(a.db, ag.id)])
    assert.equal((s.pedidos.get('/ical') ?? 0) - antes, 1)
  })
})
