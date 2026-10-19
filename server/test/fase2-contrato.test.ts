/**
 * Fase 2, contrato: as duas peças de código que as três funcionalidades usam (API.md §F.1 e §F.8):
 * mascararSegredos (server/src/servicos/segredos.ts) e o formato dos KPIs (shared/logica/resultados-formato.ts).
 * Os valores do formato são os da fixture da pesquisa da Windsor (FASE2-PLANO §3 F8).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { configurar, config } from '../src/config.ts'
import { descreverErro, mascararSegredos, registrarFalhaMascarada } from '../src/servicos/segredos.ts'
import {
  DEFINICOES_KPI, KPIS_PRINCIPAIS, formatarKpi, formatarValor, formatarVariacao, linhaKpi, tomVariacao, variacao,
} from '../../shared/logica/resultados-formato.ts'
import { CONECTORES_WINDSOR } from '../../shared/tipos/index.ts'

describe('mascararSegredos', () => {
  test('a chave da Windsor em claro, codificada e em outra caixa; api_key=; private-; tokens OAuth; Bearer; code=', () => {
    const antes = config.windsorApiKey
    configurar({ windsorApiKey: 'Ab12+cd/34ef=GH' })
    try {
      const texto = [
        'erro: chave Ab12+cd/34ef=GH inválida', 'url ...&api_key=Ab12%2Bcd%2F34ef%3DGH&date_from=2026-10-01',
        'AB12+CD/34EF=GH', 'https://calendar.google.com/calendar/ical/x%40y/private-0123abcd/basic.ics',
        'token pauta_at_abc-DEF_123 e pauta_rt_zzz', 'Authorization: Bearer abc.def-ghi', '/cb?code=XYZ&state=QWE',
      ].join('\n')
      const m = mascararSegredos(texto)
      for (const vazado of ['Ab12+cd/34ef=GH', 'AB12+CD/34EF=GH', 'Ab12%2Bcd', '0123abcd', 'abc-DEF_123', 'pauta_rt_zzz',
        'abc.def-ghi', 'XYZ', 'QWE']) {
        assert.ok(!m.includes(vazado), `vazou ${vazado}: ${m}`)
      }
      assert.match(m, /api_key=\*\*\*/)
      assert.match(m, /private-\*\*\*/)
      assert.match(m, /pauta_at_\*\*\*/)
      assert.match(m, /date_from=2026-10-01/, 'o resto da URL continua legível')
    } finally {
      configurar({ windsorApiKey: antes })
    }
  })

  test('segredo extra (o endereço iCal decifrado) e segredos curtos ignorados', () => {
    const url = 'https://calendar.google.com/calendar/ical/agencia%40melt.test/semtoken/basic.ics'
    assert.equal(mascararSegredos(`Failed to parse URL from ${url}`, [url, 'ab']), 'Failed to parse URL from ***')
    assert.equal(mascararSegredos('a b c', ['a']), 'a b c')
  })

  test('descreverErro: nome + mensagem mascarada, sem stack nem cause; registrarFalhaMascarada loga uma linha', () => {
    const e = new TypeError('Failed to parse URL from https://connectors.windsor.ai/facebook?api_key=K123456789&x=1',
      { cause: new Error('pauta_at_segredo') })
    const linha = descreverErro(e)
    assert.equal(linha, 'TypeError: Failed to parse URL from https://connectors.windsor.ai/facebook?api_key=***&x=1')
    const logs: string[] = []
    const original = console.error
    console.error = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
    try {
      registrarFalhaMascarada('windsor busca')(new Error('private-abcdef pauta_rt_x'))
    } finally {
      console.error = original
    }
    assert.deepEqual(logs, ['windsor busca: Error: private-*** pauta_rt_***'])
  })
})

describe('formato dos KPIs (o mesmo na aba e no MCP)', () => {
  test('valores da fixture da pesquisa', () => {
    assert.equal(formatarKpi('facebook', 'investimento', 246.83), 'R$ 246,83')
    assert.equal(formatarKpi('facebook', 'impressoes', 101245), '101.245')
    assert.equal(formatarKpi('facebook', 'ctr', 758 / 101245), '0,75%')
    assert.equal(formatarKpi('facebook', 'cpc', 246.83 / 758), 'R$ 0,33')
    assert.equal(formatarKpi('facebook', 'roas', null), '—')
    assert.equal(formatarKpi('google_ads', 'investimento', 1663.8393), 'R$ 1.663,84')
    assert.equal(formatarKpi('google_ads', 'conversoes', 128.5283), '128,5')
    assert.equal(formatarKpi('google_ads', 'ctr', 4219 / 62823), '6,72%')
    assert.equal(formatarKpi('googleanalytics4', 'taxaEngajamento', 973 / 1597), '60,93%')
    assert.equal(formatarKpi('googleanalytics4', 'usuarios', 1124), '1.124')
    assert.equal(formatarValor(83, 'segundos'), '1 min 23 s')
    assert.equal(formatarValor(45.4, 'segundos'), '45 s')
    assert.equal(formatarValor(3.254, 'razao'), '3,25x')
    assert.equal(formatarValor(Number.NaN, 'inteiro'), '—')
  })

  test('variação: (A − B) / B, "novo" com B = 0, "—" com os dois 0 ou dado ausente', () => {
    assert.deepEqual(variacao(112, 100), { tipo: 'pct', fracao: 0.12 })
    assert.equal(formatarVariacao(variacao(112, 100)), '+12%')
    assert.equal(formatarVariacao(variacao(97, 100)), '-3%')
    assert.equal(formatarVariacao(variacao(100.2, 100)), '0%')
    assert.equal(formatarVariacao(variacao(5, 0)), 'novo')
    assert.equal(formatarVariacao(variacao(0, 0)), '—')
    assert.equal(formatarVariacao(variacao(null, 10)), '—')
    assert.equal(formatarVariacao(variacao(2500, 100)), '+2.400%')
  })

  test('tom pelo sentido: custo que sobe é ruim, resultado que sobe é bom, investimento é neutro', () => {
    const sobe = variacao(130, 100)
    const desce = variacao(70, 100)
    assert.equal(tomVariacao(DEFINICOES_KPI.facebook.custoPorResultado.sentido, sobe), 'ruim')
    assert.equal(tomVariacao(DEFINICOES_KPI.facebook.custoPorResultado.sentido, desce), 'bom')
    assert.equal(tomVariacao(DEFINICOES_KPI.facebook.resultados.sentido, sobe), 'bom')
    assert.equal(tomVariacao(DEFINICOES_KPI.google_ads.conversoes.sentido, desce), 'ruim')
    assert.equal(tomVariacao(DEFINICOES_KPI.facebook.investimento.sentido, sobe), 'neutro')
    assert.equal(tomVariacao(DEFINICOES_KPI.facebook.ctr.sentido, variacao(100.1, 100)), 'neutro', 'arredondou para 0%')
    assert.equal(tomVariacao(DEFINICOES_KPI.facebook.resultados.sentido, variacao(3, 0)), 'neutro', '"novo" não tem cor')
  })

  test('4 KPIs principais por conector, todos definidos; a linha do MCP', () => {
    for (const c of CONECTORES_WINDSOR) {
      assert.equal(KPIS_PRINCIPAIS[c].length, 4, c)
      for (const k of KPIS_PRINCIPAIS[c]) assert.ok(k in DEFINICOES_KPI[c], `${c}.${k}`)
    }
    assert.equal(linhaKpi('facebook', 'investimento', 1234.56, 1102.29), 'Investimento R$ 1.234,56 (+12%)')
    assert.equal(linhaKpi('google_ads', 'custoPorConversao', null, 12), 'Custo por conversão — (—)')
  })
})
