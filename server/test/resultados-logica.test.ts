/**
 * Resultados da Windsor (F8), lógica pura: as datas de cada período, o cálculo com as fixtures da pesquisa (os valores
 * esperados do FASE2-PLANO §3 F8) e os alertas da faixa "Atenção".
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { LinhaWindsor } from '../../shared/tipos/ext/resultados.ts'
import { alertasResultados, type ConectorParaAlertas } from '../../shared/logica/resultados-alertas.ts'
import {
  calcularGa4, calcularGoogleAds, calcularMeta, principaisDeKpis, principaisDeSomas, razao, somarContas, somasPorConta,
} from '../../shared/logica/resultados-calculo.ts'
import { formatarKpi } from '../../shared/logica/resultados-formato.ts'
import { esteMesDisponivel, periodoDe, rotuloIntervalo, validadeCacheMs } from '../../shared/logica/resultados-periodo.ts'
import { lerFixture } from '../src/servicos/resultados-fixtures.ts'

const dados = (nome: string) => lerFixture<{ data: LinhaWindsor[] }>(nome).data
const perto = (real: number | null, esperado: number, casas = 4, msg?: string) => {
  assert.ok(real !== null, msg ?? `esperava ${esperado}, veio null`)
  assert.ok(Math.abs(real - esperado) < 10 ** -casas / 2, `${msg ?? ''} esperava ${esperado}, veio ${real}`)
}

describe('periodoDe (relógio em 19/10/2026)', () => {
  const hoje = '2026-10-19'
  test('30d, 7d, 90d: terminam ontem; a comparação são os N dias logo antes', () => {
    assert.deepEqual(periodoDe('30d', hoje), { periodo: '30d', de: '2026-09-19', ate: '2026-10-18', deAnterior: '2026-08-20', ateAnterior: '2026-09-18' })
    assert.deepEqual(periodoDe('7d', hoje), { periodo: '7d', de: '2026-10-12', ate: '2026-10-18', deAnterior: '2026-10-05', ateAnterior: '2026-10-11' })
    const n90 = periodoDe('90d', hoje)
    assert.equal(n90.ate, '2026-10-18')
    assert.equal(n90.de, '2026-07-21')
    assert.equal(n90.ateAnterior, '2026-07-20')
    assert.equal(n90.deAnterior, '2026-04-22')
  })
  test('este_mes: 01–18/10 contra 01–18/09; mes_passado: setembro contra agosto', () => {
    assert.deepEqual(periodoDe('este_mes', hoje), { periodo: 'este_mes', de: '2026-10-01', ate: '2026-10-18', deAnterior: '2026-09-01', ateAnterior: '2026-09-18' })
    assert.deepEqual(periodoDe('mes_passado', hoje), { periodo: 'mes_passado', de: '2026-09-01', ate: '2026-09-30', deAnterior: '2026-08-01', ateAnterior: '2026-08-31' })
  })
  test('em 31/03 o dia que não existe em fevereiro vira o último; em 01/11 este_mes vira mes_passado', () => {
    assert.deepEqual(periodoDe('este_mes', '2026-03-31'), { periodo: 'este_mes', de: '2026-03-01', ate: '2026-03-30', deAnterior: '2026-02-01', ateAnterior: '2026-02-28' })
    assert.deepEqual(periodoDe('este_mes', '2026-11-01'), { periodo: 'mes_passado', de: '2026-10-01', ate: '2026-10-31', deAnterior: '2026-09-01', ateAnterior: '2026-09-30' })
    assert.equal(esteMesDisponivel('2026-11-01'), false)
    assert.equal(esteMesDisponivel('2026-11-02'), true)
  })
  test('virada de ano: janeiro compara com dezembro; mes_passado em janeiro é dezembro × novembro', () => {
    assert.deepEqual(periodoDe('este_mes', '2027-01-10'), { periodo: 'este_mes', de: '2027-01-01', ate: '2027-01-09', deAnterior: '2026-12-01', ateAnterior: '2026-12-09' })
    assert.deepEqual(periodoDe('mes_passado', '2027-01-10'), { periodo: 'mes_passado', de: '2026-12-01', ate: '2026-12-31', deAnterior: '2026-11-01', ateAnterior: '2026-11-30' })
  })
  test('validade do cache: 3 h; período que terminou há mais de 3 dias, 24 h; rótulo do intervalo', () => {
    assert.equal(validadeCacheMs('2026-10-18', hoje), 3 * 3_600_000)
    assert.equal(validadeCacheMs('2026-10-16', hoje), 3 * 3_600_000)
    assert.equal(validadeCacheMs('2026-10-15', hoje), 24 * 3_600_000)
    assert.equal(validadeCacheMs('2026-09-30', hoje), 24 * 3_600_000)
    assert.equal(rotuloIntervalo('2026-08-20', '2026-09-18'), '20/08–18/09')
    assert.equal(rotuloIntervalo('2025-12-20', '2026-01-18', '2026'), '20/12/2025–18/01/2026')
  })
})

describe('cálculo com as fixtures da pesquisa (período atual = 12–18/10, anterior vazio)', () => {
  const datas = periodoDe('7d', '2026-10-19')

  test('Meta: somas dos dias, razões das somas, alcance do total do período', () => {
    const r = calcularMeta({ diario: dados('meta-diario-campanha.json'), totalAtual: dados('meta-total-periodo.json'), totalAnterior: [], datas })
    const a = r.kpis.atual
    perto(a.investimento, 246.83, 6, 'investimento')
    assert.equal(a.impressoes, 101245)
    assert.equal(a.cliques, 758)
    assert.equal(a.cliquesLink, 726)
    perto(a.ctr, 758 / 101245, 10, 'ctr')
    assert.equal(formatarKpi('facebook', 'ctr', a.ctr), '0,75%')
    perto(a.cpc, 0.3256, 4, 'cpc')
    assert.equal(a.alcance, 62268, 'alcance do total, não da soma dos dias (87.683)')
    assert.equal(a.leads, 0)
    assert.equal(a.conversas, 1)
    assert.equal(a.resultados, 1)
    perto(a.custoPorResultado, 246.83, 6, 'custo por resultado')
    assert.equal(a.roas, null)
    assert.equal(r.kpis.anterior.investimento, 0)
    assert.equal(r.kpis.anterior.ctr, null, 'divisão por zero vira null')
    assert.equal(r.serie.length, 14, 'um ponto por dia de 05/10 a 18/10')
    assert.deepEqual(r.serie[0], { data: '2026-10-05', investimento: 0, impressoes: 0, cliques: 0, resultados: 0 })
    assert.ok(r.campanhas.length <= 10 && r.campanhas.length === 4)
    assert.ok(r.campanhas.every((c, i) => i === 0 || r.campanhas[i - 1]!.investimento >= c.investimento), 'maior investimento primeiro')
    assert.equal(r.vazio, false)
  })

  test('Google Ads: conversões fracionárias, custo por conversão, ROAS nulo com valor 0', () => {
    const r = calcularGoogleAds({ diario: dados('google-ads-diario-campanha.json'), datas })
    const a = r.kpis.atual
    perto(a.investimento, 1663.8393, 6, 'investimento')
    assert.equal(a.impressoes, 62823)
    assert.equal(a.cliques, 4219)
    perto(a.ctr, 4219 / 62823, 10)
    assert.equal(formatarKpi('google_ads', 'ctr', a.ctr), '6,72%')
    perto(a.cpc, 0.3944, 4, 'cpc')
    perto(a.conversoes, 128.5283, 6, 'conversões')
    perto(a.custoPorConversao, 12.9453, 4, 'custo por conversão')
    assert.equal(a.roas, null)
    assert.equal(r.campanhas.length, 5)
    assert.equal(r.campanhas[0]!.tipo !== null, true)
  })

  test('GA4: sessões dos dias, usuários do total (1.124, não 1.253), eventos-chave por nome', () => {
    const r = calcularGa4({
      diario: dados('ga4-diario.json'), totalAtual: dados('ga4-total-periodo.json'), totalAnterior: [],
      eventos: dados('ga4-eventos-chave.json'), datas,
    })
    const a = r.kpis.atual
    assert.equal(a.sessoes, 1597)
    assert.equal(a.sessoesEngajadas, 973)
    perto(a.taxaEngajamento, 973 / 1597, 10)
    assert.equal(formatarKpi('googleanalytics4', 'taxaEngajamento', a.taxaEngajamento), '60,93%')
    assert.equal(a.visualizacoes, 2780)
    assert.equal(a.eventosChave, 153)
    assert.equal(a.usuarios, 1124)
    assert.deepEqual(r.eventosChave, [{ nome: 'click_wpp', quantidade: 134 }, { nome: 'Lead_chatbot', quantidade: 18 }])
    assert.ok(a.duracaoMediaSeg !== null && a.duracaoMediaSeg > 0)
  })

  test('null conta 0; data: [] nos dois períodos → vazio; linha fora do intervalo (outro fuso) fica de fora', () => {
    const vazio = calcularMeta({ diario: [], totalAtual: [], totalAnterior: [], datas })
    assert.equal(vazio.vazio, true)
    assert.equal(vazio.kpis.atual.investimento, 0)
    const fora: LinhaWindsor[] = [
      { date: '2026-10-19', account_id: '1', spend: 50, impressions: 10, clicks: 1, actions_lead: null },
      { date: '2026-10-18', account_id: 'act_1', spend: 10, impressions: null, clicks: null, actions_lead: 2 },
      { date: 'ontem', account_id: '1', spend: 999 },
    ]
    const r = calcularMeta({ diario: fora, totalAtual: [], totalAnterior: [], datas })
    assert.equal(r.kpis.atual.investimento, 10)
    assert.equal(r.kpis.atual.leads, 2)
    assert.equal(r.kpis.atual.impressoes, 0)
    assert.deepEqual(Object.keys(r.gastoRecente), ['1'], 'act_ some do id')
    assert.equal(r.serie.at(-1)!.data, '2026-10-18')
  })

  test('carteira: somas por conta e os KPIs principais saem iguais aos da aba', () => {
    const a = calcularMeta({ diario: dados('meta-diario-campanha.json'), totalAtual: [], totalAnterior: [], datas })
    const porConta = somasPorConta('facebook', dados('meta-diario-campanha.json'))
    const somas = somarContas<'facebook'>(porConta, ['1000000000000001', 'outra'])
    assert.deepEqual(principaisDeSomas('facebook', somas), principaisDeKpis('facebook', a.kpis.atual))
    assert.equal(somarContas(porConta, ['nenhuma']), null)
    assert.deepEqual(principaisDeSomas('google_ads', null), { investimento: null, conversoes: null, custoPorConversao: null, ctr: null })
    assert.equal(razao(1, 0), null)
  })
})

describe('alertas da faixa "Atenção"', () => {
  const hoje = '2026-10-19'
  const meta = (p: Partial<ConectorParaAlertas>): ConectorParaAlertas => ({
    conector: 'facebook', estado: 'ok', contas: [{ contaId: '1', nome: 'HE Leads' }], custo: null, gastoRecente: null, ate: '2026-10-18', ...p,
  })

  test('conta com gasto nos 7 dias e zero ontem → parou_de_gastar, com o texto pronto', () => {
    const gasto = { '1': { '2026-10-11': 100, '2026-10-15': 112.4, '2026-10-17': 100, '2026-10-18': 0 } }
    const [a, ...resto] = alertasResultados([meta({ gastoRecente: gasto })], hoje)
    assert.equal(resto.length, 0)
    assert.deepEqual(a, { tipo: 'parou_de_gastar', conector: 'facebook', contaId: '1',
      texto: 'Meta Ads: a conta HE Leads não gastou ontem (gastou R$ 312,40 nos 7 dias antes)' })
    assert.deepEqual(alertasResultados([meta({ gastoRecente: { '1': { '2026-10-18': 5, '2026-10-15': 10 } } })], hoje), [], 'gastou ontem')
    assert.deepEqual(alertasResultados([meta({ gastoRecente: { '1': {} } })], hoje), [], 'não gastou em nenhum dia: não é "parou"')
    assert.deepEqual(alertasResultados([meta({ gastoRecente: gasto, ate: '2026-09-30' })], hoje), [], 'mês passado não fala de ontem')
  })

  test('custo por resultado +30% → custo_subiu; +29% → nada; custo que desce → nada', () => {
    const [a] = alertasResultados([meta({ custo: { atual: 13, anterior: 10 } })], hoje)
    assert.equal(a!.tipo, 'custo_subiu')
    assert.equal(a!.texto, 'Meta Ads: o custo por resultado subiu +30% (R$ 13,00 contra R$ 10,00 no período anterior)')
    assert.deepEqual(alertasResultados([meta({ custo: { atual: 12.9, anterior: 10 } })], hoje), [])
    assert.deepEqual(alertasResultados([meta({ custo: { atual: 5, anterior: 10 } })], hoje), [])
    assert.deepEqual(alertasResultados([meta({ custo: { atual: 10, anterior: null } })], hoje), [])
    const [g] = alertasResultados([meta({ conector: 'google_ads', custo: { atual: 20, anterior: 10 } })], hoje)
    assert.equal(g!.texto, 'Google Ads: o custo por conversão subiu +100% (R$ 20,00 contra R$ 10,00 no período anterior)')
  })

  test('conta não conectada vem primeiro; GA4 nunca "parou de gastar"', () => {
    const lista = alertasResultados([
      meta({ custo: { atual: 20, anterior: 10 } }),
      meta({ conector: 'google_ads', estado: 'conta_nao_conectada', contas: [{ contaId: '000-1', nome: 'X' }, { contaId: '000-2', nome: 'Y' }] }),
      meta({ conector: 'googleanalytics4', gastoRecente: { '1': { '2026-10-15': 10 } } }),
    ], hoje)
    assert.deepEqual(lista.map((a) => a.tipo), ['conta_nao_conectada', 'custo_subiu'])
    assert.equal(lista[0]!.contaId, null)
    assert.equal(lista[0]!.texto, 'Google Ads: as contas ligadas não estão conectadas na Windsor. Avise o admin.')
  })
})
