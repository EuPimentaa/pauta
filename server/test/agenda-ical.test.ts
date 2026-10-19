/**
 * Leitor iCal próprio (F9; pesquisa-ical §7): os casos sobre as fixtures google-2026.ics (relógio 2026-10-19T13:00Z,
 * janela 19/09/2026 a 17/04/2027) e google-2018.ics (relógio 2018-11-01T12:00Z, janela 02/10/2018 a 30/04/2019).
 * Horas em São Paulo, salvo indicação. Os obrigatórios do FASE2-PLANO §3 F9 estão marcados com ●.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { desdobrar, lerComponentes, lerLinha, textoIcal } from '../src/servicos/agenda-ical-leitura.ts'
import { localParaInstante } from '../src/servicos/agenda-ical-fuso.ts'
import { lerRegra } from '../src/servicos/agenda-ical-repeticao.ts'
import { hashSemDtstamp, htmlParaTexto, lerIcal } from '../src/servicos/agenda-ical.ts'
import { dicaDoEndereco, linkReuniaoValido, validarEnderecoIcal } from '../../shared/logica/agenda-endereco.ts'
import { doCaso, fixture, horaSP, ical, ler2018, ler2026 } from './agenda-ajuda.ts'

const l26 = ler2026()
const l18 = ler2018()
const dias = (lista: { diaInicio: string }[]) => lista.map((o) => o.diaInicio.slice(5))
const inicios = (lista: { inicio: string | null }[]) => lista.map((o) => o.inicio)

describe('A · leitura', () => {
  test('G1 ● dobra no meio do "ã" (octeto 75): desdobra em bytes, sem U+FFFD', () => {
    const [g1] = doCaso(l26, 'g1-')
    assert.ok(g1)
    assert.ok(g1.titulo.endsWith('Reunião'), g1.titulo)
    assert.ok(!g1.titulo.includes('�'))
    // decodificar linha a linha (o erro que o teste pega) daria U+FFFD
    const bytes = fixture('google-2026.ics')
    const ingenuo = bytes.toString('utf8').split('\r\n').find((l) => l.startsWith('SUMMARY:G1'))!
    assert.ok(ingenuo.includes('�'))
  })

  test('G2 o mesmo arquivo com LF solto e com BOM dá o mesmo resultado', () => {
    const lf = Buffer.from(fixture('google-2026.ics').toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture('google-2026.ics')])
    const base = JSON.stringify(l26.ocorrencias)
    assert.equal(JSON.stringify(lerIcal(lf, { hoje: '2026-10-19' }).ocorrencias), base)
    assert.equal(JSON.stringify(lerIcal(bom, { hoje: '2026-10-19' }).ocorrencias), base)
  })

  test('G3 LOCATION desescapado (\\, e \\;) e TEXT com \\n', () => {
    assert.equal(doCaso(l26, 'b1-')[0]!.local, 'Sala 2, 3º andar; fundos')
    assert.equal(textoIcal('a\\nb\\Nc\\\\d\\;e\\,f'), 'a\nb\nc\\d;e,f')
  })

  test('parâmetros com aspas podem ter : ; e ,', () => {
    const p = lerLinha('ATTENDEE;CN="Silva, Ana: RH";ROLE=REQ-PARTICIPANT:mailto:ana@x.test')!
    assert.deepEqual(p.params.CN, ['Silva, Ana: RH'])
    assert.equal(p.valor, 'mailto:ana@x.test')
    assert.equal(lerLinha('sem dois pontos'), null)
    assert.deepEqual(desdobrar(Buffer.from('A:1\r\n 2\r\n\t3\nB:4')), ['A:123', 'B:4'])
  })

  test('H9 VTODO e VALARM (dentro do VEVENT) são ignorados', () => {
    assert.equal(l26.ocorrencias.some((o) => o.titulo.includes('VTODO')), false)
    assert.equal(doCaso(l26, 'g7-').length, 1)
  })

  test('H10 linha sem ":", componente desconhecido, END sem BEGIN: ignorados com aviso, sem exceção', () => {
    const corpo = Buffer.from(['BEGIN:VCALENDAR', 'linha quebrada sem dois pontos', 'END:VTODO', 'BEGIN:X-COISA', 'A:1',
      'END:X-COISA', 'BEGIN:VEVENT', 'UID:h10@x', 'DTSTART:20261020T130000Z', 'SUMMARY:ok', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'))
    const r = lerIcal(corpo, { hoje: '2026-10-19' })
    assert.deepEqual(r.ocorrencias.map((o) => o.titulo), ['ok'])
    assert.ok(r.contagens.avisos >= 2)
    const c = lerComponentes(Buffer.from('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a'))
    assert.equal(c.raiz.length, 1)                                // fechado no fim, com aviso
    assert.equal(c.avisos, 2)
  })

  test('contagens: VEVENT lidos, ocorrências, repetição não entendida, fuso desconhecido', () => {
    assert.deepEqual(l26.contagens, { eventos: 44, ocorrencias: l26.ocorrencias.length, repeticoesNaoEntendidas: 1, fusosDesconhecidos: 1, avisos: 0 })
    assert.equal(l26.passouDoTeto, false)
  })
})

describe('B · fuso', () => {
  test('B1 ● avulso em UTC: 20/10 10:00–11:00', () => {
    const [b1] = doCaso(l26, 'b1-')
    assert.deepEqual([b1!.inicio, b1!.fim, b1!.diaInicio, b1!.diaFim], ['2026-10-20T13:00:00.000Z', '2026-10-20T14:00:00.000Z', '2026-10-20', '2026-10-20'])
    assert.equal(horaSP(b1!.inicio!), '10:00')
  })

  test('B2 ● TZID=America/Sao_Paulo 15:00 → 18:00Z–19:00Z', () => {
    const [b2] = doCaso(l26, 'b2-')
    assert.deepEqual([b2!.inicio, b2!.fim], ['2026-10-21T18:00:00.000Z', '2026-10-21T19:00:00.000Z'])
  })

  test('B3 ● série em Nova York seg 09:00 COUNT=4: 10:00 em SP e 11:00 depois do fim do horário de verão dos EUA', () => {
    const b3 = doCaso(l26, 'b3-')
    assert.deepEqual(dias(b3), ['10-12', '10-19', '10-26', '11-02'])
    assert.deepEqual(b3.map((o) => horaSP(o.inicio!)), ['10:00', '10:00', '10:00', '11:00'])
    assert.equal(b3[3]!.inicio, '2026-11-02T14:00:00.000Z')
  })

  test('B4 TZID que o Intl não conhece: desvio do VTIMEZONE do arquivo; sem ele, São Paulo + aviso', () => {
    const [b4] = doCaso(l26, 'b4-')
    assert.equal(b4!.inicio, '2026-10-22T13:00:00.000Z')
    const sem = lerIcal(ical(['DTSTART;TZID=Fuso Inventado:20261022T100000', 'DTEND;TZID=Fuso Inventado:20261022T110000', 'SUMMARY:x']), { hoje: '2026-10-19' })
    assert.equal(sem.ocorrencias[0]!.inicio, '2026-10-22T13:00:00.000Z')
    assert.equal(sem.contagens.fusosDesconhecidos, 1)
  })

  test('B5 hora flutuante: fuso do X-WR-TIMEZONE', () => {
    assert.equal(doCaso(l26, 'b5-')[0]!.inicio, '2026-10-22T17:00:00.000Z')
    const ny = Buffer.from(fixture('google-2026.ics').toString('latin1').replace('X-WR-TIMEZONE:America/Sao_Paulo', 'X-WR-TIMEZONE:America/New_York'), 'latin1')
    assert.equal(doCaso(lerIcal(ny, { hoje: '2026-10-19' }), 'b5-')[0]!.inicio, '2026-10-22T18:00:00.000Z')
  })

  test('B6 o servidor com TZ=UTC e TZ=Asia/Tokyo dá o mesmo resultado (nada usa métodos locais de Date)', () => {
    const modulo = pathToFileURL(join(import.meta.dirname, '..', 'src', 'servicos', 'agenda-ical.ts')).href
    const arquivo = join(import.meta.dirname, 'fixtures', 'agenda', 'google-2026.ics')
    const codigo = `import { readFileSync } from 'node:fs'; import { lerIcal } from ${JSON.stringify(modulo)};
      process.stdout.write(JSON.stringify(lerIcal(readFileSync(${JSON.stringify(arquivo)}), { hoje: '2026-10-19' })))`
    const rodar = (tz: string) => execFileSync(process.execPath, ['--input-type=module', '-e', codigo], { env: { ...process.env, TZ: tz }, encoding: 'utf8' })
    const utc = rodar('UTC')
    assert.equal(rodar('Asia/Tokyo'), utc)
    assert.equal(JSON.stringify(l26), utc)
  })

  test('conversão pelo Intl: os vetores da pesquisa (§4)', () => {
    const sp = (s: string) => new Date(localParaInstante(Date.parse(`${s}Z`), 'America/Sao_Paulo')).toISOString()
    assert.equal(sp('2018-10-29T10:00:00'), '2018-10-29T13:00:00.000Z')
    assert.equal(sp('2018-11-05T10:00:00'), '2018-11-05T12:00:00.000Z')
    assert.equal(sp('2018-11-04T00:30:00'), '2018-11-04T03:30:00.000Z')
    assert.equal(sp('2019-02-16T23:30:00'), '2019-02-17T01:30:00.000Z')
    const ny = (s: string) => new Date(localParaInstante(Date.parse(`${s}Z`), 'America/New_York')).toISOString()
    assert.equal(ny('2026-10-26T09:00:00'), '2026-10-26T13:00:00.000Z')
    assert.equal(ny('2026-11-02T09:00:00'), '2026-11-02T14:00:00.000Z')
  })
})

describe('C · dia inteiro', () => {
  test('C1 ● VALUE=DATE 02/11 → 03/11: só 02/11, data e não instante', () => {
    const [c1] = doCaso(l26, 'c1-')
    assert.deepEqual([c1!.diaInteiro, c1!.inicio, c1!.fim, c1!.diaInicio, c1!.diaFim], [true, null, null, '2026-11-02', '2026-11-02'])
  })

  test('C2 ● 10/11 → 13/11: 10, 11 e 12/11 (DTEND exclusivo)', () => {
    const [c2] = doCaso(l26, 'c2-')
    assert.deepEqual([c2!.diaInicio, c2!.diaFim], ['2026-11-10', '2026-11-12'])
  })

  test('C3 sem DTEND: um dia', () => {
    const [c3] = doCaso(l26, 'c3-')
    assert.deepEqual([c3!.diaInicio, c3!.diaFim], ['2026-11-15', '2026-11-15'])
  })

  test('C4 ● semanal de dia inteiro com UNTIL em data: 05, 12, 19 e 26/10 (UNTIL inclusivo)', () => {
    const c4 = doCaso(l26, 'c4-')
    assert.deepEqual(dias(c4), ['10-05', '10-12', '10-19', '10-26'])
    assert.ok(c4.every((o) => o.diaInteiro && o.diaInicio === o.diaFim))
  })

  test('D10 anual de dia inteiro desde 2020: só 15/03/2027 na janela', () => {
    assert.deepEqual(doCaso(l26, 'd10-').map((o) => o.diaInicio), ['2027-03-15'])
  })
})

describe('D · recorrência', () => {
  test('D1 ● semanal com EXDATE (TZID): 29 ocorrências de 21/09 a 12/04/2027, sem 12/10, todas 13:00Z', () => {
    const d1 = doCaso(l26, 'd1-')
    assert.equal(d1.length, 29)
    assert.equal(d1[0]!.diaInicio, '2026-09-21')
    assert.equal(d1[28]!.diaInicio, '2027-04-12')
    assert.ok(!d1.some((o) => o.diaInicio === '2026-10-12'))
    assert.ok(d1.every((o) => o.inicio!.endsWith('T13:00:00.000Z')))
  })

  test('D2 ● EXDATE em UTC num mestre com TZID, UNTIL em UTC: 22/09, 29/09, 06/10, 20/10, 27/10', () => {
    assert.deepEqual(dias(doCaso(l26, 'd2-')), ['09-22', '09-29', '10-06', '10-20', '10-27'])
  })

  test('D3 COUNT=4 começando antes da janela: 21/09 e 28/09', () => {
    assert.deepEqual(dias(doCaso(l26, 'd3-')), ['09-21', '09-28'])
  })

  test('D4 COUNT=4 + EXDATE na 2ª: 06, 20 e 27/10 (a excluída conta para o COUNT)', () => {
    assert.deepEqual(dias(doCaso(l26, 'd4-')), ['10-06', '10-20', '10-27'])
  })

  test('D5 UNTIL exatamente na última ocorrência: 01, 08, 15 e 22/10', () => {
    assert.deepEqual(dias(doCaso(l26, 'd5-')), ['10-01', '10-08', '10-15', '10-22'])
  })

  test('D6 WKST muda a série (RFC §3.8.5.3)', () => {
    assert.deepEqual(dias(doCaso(l26, 'd6-wkst-mo')), ['10-06', '10-11', '10-20', '10-25'])
    const su = doCaso(l26, 'd6-wkst-su')
    assert.deepEqual(dias(su), ['10-06', '10-18', '10-20', '11-01'])
    assert.equal(horaSP(su[3]!.inicio!), '11:00')
  })

  test('D7 mensal na última quarta', () => {
    assert.deepEqual(dias(doCaso(l26, 'd7-')), ['09-30', '10-28', '11-25', '12-30', '01-27', '02-24', '03-31'])
  })

  test('D8 mensal no dia 31: pula os meses sem 31', () => {
    assert.deepEqual(doCaso(l26, 'd8-').map((o) => o.diaInicio), ['2026-10-31', '2026-12-31', '2027-01-31', '2027-03-31'])
  })

  test('D9 dias úteis COUNT=5: 19 a 23/10 às 08:30', () => {
    const d9 = doCaso(l26, 'd9-')
    assert.deepEqual(dias(d9), ['10-19', '10-20', '10-21', '10-22', '10-23'])
    assert.ok(d9.every((o) => horaSP(o.inicio!) === '08:30'))
  })

  test('D11 diária a cada 3 dias desde 2015: 70 ocorrências, de 21/09 a 16/04/2027, em milissegundos', () => {
    const t0 = performance.now()
    const r = lerIcal(fixture('google-2026.ics'), { hoje: '2026-10-19' })
    const ms = performance.now() - t0
    const d11 = doCaso(r, 'd11-')
    assert.equal(d11.length, 70)
    assert.deepEqual([d11[0]!.diaInicio, d11[1]!.diaInicio, d11[69]!.diaInicio], ['2026-09-21', '2026-09-24', '2027-04-16'])
    assert.ok(d11.every((o) => horaSP(o.inicio!) === '07:00'))
    assert.ok(ms < 1000, `${ms} ms`)
  })

  test('D12 BYSETPOS (fora do subconjunto): só a 1ª ocorrência e 1 "repetição não entendida"', () => {
    const d12 = doCaso(l26, 'd12-')
    assert.deepEqual(d12.map((o) => [o.diaInicio, horaSP(o.inicio!)]), [['2026-10-30', '17:00']])
    assert.equal(l26.contagens.repeticoesNaoEntendidas, 1)
    assert.equal(lerRegra('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1'), null)
    assert.equal(lerRegra('FREQ=HOURLY'), null)
    assert.equal(lerRegra('FREQ=WEEKLY;BYWEEKNO=3'), null)
  })

  test('D13 avulso sem DTEND: fim = início', () => {
    const [d13] = doCaso(l26, 'd13-')
    assert.equal(d13!.fim, d13!.inicio)
    assert.equal(d13!.inicio, '2026-10-23T15:00:00.000Z')
  })

  test('D14 série sem fim desde 2017 com teto por série: corta no teto e conta um aviso', () => {
    const r = lerIcal(ical(['DTSTART;TZID=America/Sao_Paulo:20170102T090000', 'RRULE:FREQ=DAILY', 'SUMMARY:diária']), { hoje: '2026-10-19', tetoPorSerie: 50 })
    assert.ok(r.ocorrencias.length > 40 && r.ocorrencias.length <= 50, String(r.ocorrencias.length))   // a margem de 2 dias antes da janela conta no teto
    assert.equal(r.contagens.avisos, 1)
    const sem = lerIcal(ical(['DTSTART;TZID=America/Sao_Paulo:20170102T090000', 'RRULE:FREQ=DAILY', 'SUMMARY:diária']), { hoje: '2026-10-19' })
    assert.equal(sem.ocorrencias.length, 211)                     // 30 + hoje + 180
    assert.equal(sem.contagens.avisos, 0)
  })

  test('mensal no 1º e no 4º dia da semana, anual por BYMONTH+BYMONTHDAY e INTERVAL', () => {
    const r = lerIcal(ical(
      ['UID:m1@x', 'DTSTART;TZID=America/Sao_Paulo:20261005T090000', 'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=1MO', 'SUMMARY:1ª segunda'],
      ['UID:m2@x', 'DTSTART;TZID=America/Sao_Paulo:20261022T090000', 'RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=4TH', 'SUMMARY:4ª quinta'],
      ['UID:a1@x', 'DTSTART;VALUE=DATE:20200229', 'RRULE:FREQ=YEARLY', 'SUMMARY:bissexto'],
      ['UID:a2@x', 'DTSTART;TZID=America/Sao_Paulo:20201225T080000', 'RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25', 'SUMMARY:natal'],
    ), { hoje: '2026-10-19' })
    assert.deepEqual(dias(doCaso(r, 'm1@')), ['10-05', '11-02', '12-07'])
    assert.deepEqual(dias(doCaso(r, 'm2@')), ['10-22', '12-24', '02-25'])
    assert.deepEqual(doCaso(r, 'a1@'), [])                        // 29/02 não existe em 2027
    assert.deepEqual(dias(doCaso(r, 'a2@')), ['12-25'])
  })
})

describe('E · exceções', () => {
  const serie = doCaso(l26, 'e-serie@')

  test('a série E tem 29 ocorrências na janela', () => {
    assert.equal(serie.length, 29)
  })

  test('E1 ● movido no mesmo dia: 28/10 só às 17:00, título da exceção e sem o link do mestre', () => {
    const dia28 = serie.filter((o) => o.diaInicio === '2026-10-28')
    assert.equal(dia28.length, 1)
    assert.equal(horaSP(dia28[0]!.inicio!), '17:00')
    assert.equal(dia28[0]!.titulo, 'E1 Alinhamento (remarcado no mesmo dia)')
    assert.equal(dia28[0]!.linkReuniao, null)
  })

  test('E2 ● movido para outro dia: nada em 04/11; 05/11 09:00', () => {
    assert.ok(!serie.some((o) => o.diaInicio === '2026-11-04'))
    const dia5 = serie.filter((o) => o.diaInicio === '2026-11-05')
    assert.deepEqual(dia5.map((o) => horaSP(o.inicio!)), ['09:00'])
  })

  test('E3 movido de fora para dentro: 22/09 14:00 aparece', () => {
    assert.deepEqual(serie.filter((o) => o.diaInicio === '2026-09-22').map((o) => horaSP(o.inicio!)), ['14:00'])
  })

  test('E4 movido de dentro para fora: nada em 23/09 nem em 11/09', () => {
    assert.ok(!serie.some((o) => o.diaInicio === '2026-09-23' || o.diaInicio === '2026-09-11'))
  })

  test('E5 RECURRENCE-ID em UTC com mestre em TZID: casa com 11/11 14:00 e vira 15:00', () => {
    assert.deepEqual(serie.filter((o) => o.diaInicio === '2026-11-11').map((o) => [horaSP(o.inicio!), o.titulo]), [['15:00', 'E5 RECURRENCE-ID em UTC']])
  })

  test('E6 ● exceção cancelada: nada em 18/11', () => {
    assert.ok(!serie.some((o) => o.diaInicio === '2026-11-18'))
  })

  test('E7 exceção sem mestre no arquivo: avulso em 01/12 11:00–12:00', () => {
    const [e7] = doCaso(l26, 'e7-')
    assert.deepEqual([e7!.diaInicio, horaSP(e7!.inicio!), horaSP(e7!.fim!)], ['2026-12-01', '11:00', '12:00'])
  })

  test('E8 "esta e as seguintes": a série antiga até 12/10 às 09:00; a nova (UID _R…) de 19/10 em diante às 11:00', () => {
    const antiga = l26.ocorrencias.filter((o) => o.chave.startsWith('e8-split@'))
    const nova = l26.ocorrencias.filter((o) => o.chave.startsWith('e8-split_R'))
    assert.deepEqual(dias(antiga), ['09-21', '09-28', '10-05', '10-12'])
    assert.ok(antiga.every((o) => horaSP(o.inicio!) === '09:00'))
    assert.equal(nova.length, 26)
    assert.deepEqual([nova[0]!.diaInicio, nova[25]!.diaInicio], ['2026-10-19', '2027-04-12'])
    assert.ok(nova.every((o) => horaSP(o.inicio!) === '11:00'))
  })

  test('E9 mesmo UID duas vezes: vale a de SEQUENCE maior (22/10 16:00)', () => {
    const e9 = doCaso(l26, 'e9-')
    assert.deepEqual(e9.map((o) => [o.titulo, horaSP(o.inicio!)]), [['E9 versão nova', '16:00']])
  })

  test('E10 ● avulso cancelado não aparece', () => {
    assert.deepEqual(doCaso(l26, 'e10-'), [])
  })

  test('E11 mestre de série cancelado: nenhuma ocorrência', () => {
    assert.deepEqual(doCaso(l26, 'e11-'), [])
  })

  test('E12 EXDATE com lista: 05, 07 e 09/10', () => {
    assert.deepEqual(dias(doCaso(l26, 'e12-')), ['10-05', '10-07', '10-09'])
  })

  test('chave estável: UID + início original em UTC (a exceção movida guarda a chave da ocorrência original)', () => {
    assert.ok(serie.some((o) => o.chave === 'e-serie@pauta.teste|2026-11-04T17:00:00.000Z' && o.diaInicio === '2026-11-05'))
    assert.equal(doCaso(l26, 'b1-')[0]!.chave, 'b1-simples-utc@pauta.teste')
    assert.equal(new Set(l26.ocorrencias.map((o) => o.chave)).size, l26.ocorrencias.length)
  })
})

describe('F · horário de verão histórico (google-2018.ics)', () => {
  test('F1 ● 05/11/2018 10:00 é 12:00Z (−02:00); o VTIMEZONE do arquivo diria 13:00Z', () => {
    assert.equal(doCaso(l18, 'f1-')[0]!.inicio, '2018-11-05T12:00:00.000Z')
  })

  test('F2 ● série atravessa o início do horário de verão: o relógio de parede fica em 10:00', () => {
    assert.deepEqual(inicios(doCaso(l18, 'f2-')), ['2018-10-29T13:00:00.000Z', '2018-11-05T12:00:00.000Z', '2018-11-12T12:00:00.000Z'])
  })

  test('F3 ● 04/11/2018 00:30 (hora que não existiu): início 03:30Z (01:30), fim 04:00Z', () => {
    const [f3] = doCaso(l18, 'f3-')
    assert.deepEqual([f3!.inicio, f3!.fim], ['2018-11-04T03:30:00.000Z', '2018-11-04T04:00:00.000Z'])
  })

  test('F4 ● 16/02/2019 23:30 (aconteceu duas vezes): vale a primeira (01:30Z), fim 03:30Z (2 h de verdade)', () => {
    const [f4] = doCaso(l18, 'f4-')
    assert.deepEqual([f4!.inicio, f4!.fim, f4!.diaInicio, f4!.diaFim], ['2019-02-17T01:30:00.000Z', '2019-02-17T03:30:00.000Z', '2019-02-16', '2019-02-17'])
  })

  test('F5 série sáb 23:30 atravessa o fim do horário de verão, 29 min cada', () => {
    const f5 = doCaso(l18, 'f5-')
    assert.deepEqual(inicios(f5), ['2019-02-10T01:30:00.000Z', '2019-02-17T01:30:00.000Z', '2019-02-24T02:30:00.000Z'])
    assert.ok(f5.every((o) => Date.parse(o.fim!) - Date.parse(o.inicio!) === 29 * 60_000))
  })

  test('F6 ● dia inteiro em 04/11/2018 (o dia começou à 01:00): continua 04/11', () => {
    const [f6] = doCaso(l18, 'f6-')
    assert.deepEqual([f6!.diaInteiro, f6!.diaInicio, f6!.diaFim], [true, '2018-11-04', '2018-11-04'])
  })
})

describe('G · texto, links e privacidade', () => {
  test('G4 descrição HTML vira texto puro; link da reunião achado na descrição', () => {
    const [g4] = doCaso(l26, 'g4-')
    const d = g4!.descricao!
    assert.ok(!d.includes('<') && !d.includes('alert') && !d.includes('javascript:'), d)
    assert.ok(d.includes('campanha'))
    assert.ok(d.includes('briefing (https://docs.google.com/document/d/abc)'))
    assert.ok(d.includes('&'))
    assert.ok(d.includes('\n'))
    assert.equal(g4!.linkReuniao, 'https://meet.google.com/xyz-abcd-efg')
  })

  test('G5 LOCATION com Zoom vira o link da reunião', () => {
    assert.equal(doCaso(l26, 'g5-')[0]!.linkReuniao, 'https://zoom.us/j/123456789')
  })

  test('G6 X-GOOGLE-CONFERENCE do mestre vale nas ocorrências normais', () => {
    const normais = doCaso(l26, 'e-serie@').filter((o) => o.titulo === 'E Alinhamento de quarta')
    assert.ok(normais.length > 20)
    assert.ok(normais.every((o) => o.linkReuniao === 'https://meet.google.com/abc-defg-hij'))
  })

  test('G7 ORGANIZER e ATTENDEE nunca entram no que é gravado', () => {
    const texto = JSON.stringify(l26)
    assert.ok(!texto.includes('cliente.teste') && !texto.includes('Bruno') && !texto.includes('mailto'))
  })

  test('G8 CLASS:PRIVATE vira "Ocupado" em 30/10 14:00–15:00, sem local, descrição nem link', () => {
    const [g8] = doCaso(l26, 'g8-')
    assert.deepEqual([g8!.titulo, g8!.local, g8!.descricao, g8!.linkReuniao, g8!.privado], ['Ocupado', null, null, null, true])
    assert.deepEqual([horaSP(g8!.inicio!), horaSP(g8!.fim!)], ['14:00', '15:00'])
    assert.ok(!JSON.stringify(l26).includes('Clínica X') && !JSON.stringify(l26).includes('não pode aparecer'))
    const conf = lerIcal(ical(['DTSTART:20261020T130000Z', 'CLASS:CONFIDENTIAL', 'SUMMARY:Segredo', 'LOCATION:https://meet.google.com/a-b-c',
      'X-GOOGLE-CONFERENCE:https://meet.google.com/a-b-c']), { hoje: '2026-10-19' }).ocorrencias[0]!
    assert.deepEqual([conf.titulo, conf.local, conf.linkReuniao], ['Ocupado', null, null])
  })

  test('G9 TRANSP:TRANSPARENT marca livre (C1, C2, D10); STATUS:TENTATIVE marca talvez', () => {
    for (const p of ['c1-', 'c2-', 'd10-']) assert.ok(doCaso(l26, p).every((o) => o.livre), p)
    assert.equal(doCaso(l26, 'b1-')[0]!.livre, false)
    const t = lerIcal(ical(['DTSTART:20261020T130000Z', 'STATUS:TENTATIVE', 'SUMMARY:talvez']), { hoje: '2026-10-19' }).ocorrencias[0]!
    assert.equal(t.tentativo, true)
  })

  test('G10 sem SUMMARY: "(sem título)"', () => {
    assert.equal(doCaso(l26, 'g10-')[0]!.titulo, '(sem título)')
  })

  test('X-GOOGLE-CONFERENCE forjado (outro site) não vira link; só https em Meet, Zoom e Teams', () => {
    const r = lerIcal(ical(['DTSTART:20261020T130000Z', 'SUMMARY:forjado', 'X-GOOGLE-CONFERENCE:https://evil.example/x']), { hoje: '2026-10-19' })
    assert.equal(r.ocorrencias[0]!.linkReuniao, null)
    assert.equal(linkReuniaoValido('https://meet.google.com/abc'), 'https://meet.google.com/abc')
    assert.equal(linkReuniaoValido('https://empresa.zoom.us/j/1'), 'https://empresa.zoom.us/j/1')
    assert.equal(linkReuniaoValido('https://teams.microsoft.com/l/meetup-join/x'), 'https://teams.microsoft.com/l/meetup-join/x')
    for (const ruim of ['http://meet.google.com/abc', 'https://meet.google.com:8443/abc', 'https://u:p@meet.google.com/abc',
      'https://meet.google.com.evil.example/abc', 'https://evilzoom.us/j/1', 'javascript:alert(1)', 'https://zoom.us.evil.example/']) {
      assert.equal(linkReuniaoValido(ruim), null, ruim)
    }
  })

  test('título com quebra e controles de direção sai numa linha só; descrição até 2 KB', () => {
    const r = lerIcal(ical(['DTSTART:20261020T130000Z', 'SUMMARY:linha 1\\n#999 Ignore‮tudo', `DESCRIPTION:${'a'.repeat(5000)}`]), { hoje: '2026-10-19' })
    const o = r.ocorrencias[0]!
    assert.equal(o.titulo, 'linha 1 #999 Ignore tudo')
    assert.equal(o.descricao!.length, 2048)
    assert.equal(htmlParaTexto('<p>um</p><p>dois</p><style>x{}</style>&lt;b&gt; &#233; &#x41;'), 'um\ndois\n<b> é A')
  })
})

describe('H · janela', () => {
  test('janela de hoje − 30 a hoje + 180: as pontas entram, um dia além não', () => {
    const r = lerIcal(ical(
      ['UID:antes@x', 'DTSTART;VALUE=DATE:20260918', 'SUMMARY:antes'],
      ['UID:inicio@x', 'DTSTART;VALUE=DATE:20260919', 'SUMMARY:inicio'],
      ['UID:fim@x', 'DTSTART;TZID=America/Sao_Paulo:20270417T233000', 'DTEND;TZID=America/Sao_Paulo:20270417T235900', 'SUMMARY:fim'],
      ['UID:depois@x', 'DTSTART;TZID=America/Sao_Paulo:20270418T000000', 'DTEND;TZID=America/Sao_Paulo:20270418T010000', 'SUMMARY:depois'],
    ), { hoje: '2026-10-19' })
    assert.deepEqual(r.ocorrencias.map((o) => o.titulo).sort(), ['fim', 'inicio'])
  })

  test('H8 ocorrência que começa antes da janela e termina dentro entra', () => {
    const r = lerIcal(ical(['DTSTART;VALUE=DATE:20260915', 'DTEND;VALUE=DATE:20260922', 'SUMMARY:longo'],
      ['UID:h@x', 'DTSTART;TZID=America/Sao_Paulo:20260918T220000', 'DTEND;TZID=America/Sao_Paulo:20260919T020000', 'SUMMARY:noite']), { hoje: '2026-10-19' })
    assert.deepEqual(r.ocorrencias.map((o) => [o.titulo, o.diaInicio, o.diaFim]).sort(),
      [['longo', '2026-09-15', '2026-09-21'], ['noite', '2026-09-18', '2026-09-19']])
  })

  test('H11 evento que atravessa a meia-noite (22:00 → 01:00): um item, começa num dia e termina no outro', () => {
    const r = lerIcal(ical(['DTSTART;TZID=America/Sao_Paulo:20261023T220000', 'DTEND;TZID=America/Sao_Paulo:20261024T010000', 'SUMMARY:festa']), { hoje: '2026-10-19' })
    assert.equal(r.ocorrencias.length, 1)
    assert.deepEqual([r.ocorrencias[0]!.diaInicio, r.ocorrencias[0]!.diaFim], ['2026-10-23', '2026-10-24'])
  })

  test('mais de 20.000 ocorrências na janela: passou do teto', () => {
    const series = Array.from({ length: 95 }, (_, i) => [`UID:s${i}@x`, 'DTSTART;TZID=America/Sao_Paulo:20260101T090000', 'RRULE:FREQ=DAILY', `SUMMARY:s${i}`])
    const r = lerIcal(ical(...series), { hoje: '2026-10-19' })
    assert.equal(r.ocorrencias.length, 95 * 211)
    assert.equal(r.passouDoTeto, true)
  })

  test('hash sem DTSTAMP: o mesmo feed gerado em outra hora tem o mesmo hash; outra mudança, outro hash', () => {
    const a = fixture('google-2026.ics')
    const b = Buffer.from(a.toString('latin1').replace(/DTSTAMP:\d{8}T\d{6}Z/g, 'DTSTAMP:20261019T141500Z'), 'latin1')
    const c = Buffer.from(a.toString('latin1').replace('SUMMARY:B1 Reuni', 'SUMMARY:B1 Nova reuni'), 'latin1')
    assert.notDeepEqual(a, b)
    assert.equal(hashSemDtstamp(a), hashSemDtstamp(b))
    assert.notEqual(hashSemDtstamp(a), hashSemDtstamp(c))
  })
})

describe('endereço secreto (anti-SSRF)', () => {
  const base = 'https://calendar.google.com/calendar/ical/agencia%40melt.test/private-0123456789abcdef/basic.ics'

  test('aceita o formato do Google e normaliza webcal://', () => {
    assert.equal(validarEnderecoIcal(base), base)
    assert.equal(validarEnderecoIcal(`  ${base}  `), base)
    assert.equal(validarEnderecoIcal(base.replace('https://', 'webcal://')), base)
    assert.equal(validarEnderecoIcal(base.replace('calendar.google.com', 'CALENDAR.google.com')), base)
  })

  test('recusa outro host, http, porta, usuário, query, fragmento, outro caminho e o endereço público', () => {
    for (const ruim of [
      base.replace('https://', 'http://'),
      base.replace('calendar.google.com', 'calendar.google.com:8443'),
      base.replace('https://', 'https://u:p@'),
      `${base}?x=1`, `${base}#y`, `${base}?`,
      base.replace('calendar.google.com', 'CALENDAR.google.com.evil.example'),
      base.replace('calendar.google.com', 'evil.example'),
      base.replace('calendar.google.com', '127.0.0.1'),
      base.replace('private-0123456789abcdef', 'public'),
      base.replace('private-0123456789abcdef', 'private-xyz'),
      base.replace('/basic.ics', '/full.ics'),
      'https://calendar.google.com/calendar/ical/a/private-abc/basic.ics/../../x',
      'file:///etc/passwd', 'javascript:alert(1)', '', 'não é endereço',
    ]) assert.equal(validarEnderecoIcal(ruim), null, ruim)
  })

  test('a dica mostra o host, o id da agenda e só os 4 últimos do token', () => {
    assert.equal(dicaDoEndereco(base), 'calendar.google.com · agencia@melt.test · …cdef')
    assert.ok(!dicaDoEndereco(base).includes('0123456789'))
  })
})
