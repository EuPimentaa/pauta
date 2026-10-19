/**
 * F8: lógica pura do front dos resultados (web/src/funcionalidades/resultados/logica.ts): as marcas e os números do
 * eixo do gráfico, a hora dos dados, os pontos alinhados por dia, o resumo em texto e a sugestão do "Ligar a…".
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClienteResumo, ResultadosCliente } from '../../shared/tipos/index.ts'
import {
  buscadoMaisAntigo, formatarCompacto, marcasEixo, METRICAS_GRAFICO, pontosDa, resumoGrafico, rotuloTipo, sugerirCliente,
  textoDados,
} from '../../web/src/funcionalidades/resultados/logica.ts'

const cliente = (sigla: string, nome: string, apelidos: string[] = []): ClienteResumo =>
  ({ id: sigla.toLowerCase(), sigla, nome, apelidos: [sigla.toLowerCase(), ...apelidos] }) as unknown as ClienteResumo

describe('lógica do front dos resultados', () => {
  test('eixo: 3 ou 4 marcas redondas a partir de zero; números curtos', () => {
    assert.deepEqual(marcasEixo(246.83), [0, 100, 200, 300])
    assert.deepEqual(marcasEixo(42), [0, 20, 40, 60])
    assert.deepEqual(marcasEixo(1), [0, 0.5, 1])
    assert.deepEqual(marcasEixo(0), [0, 1])
    for (const max of [3, 17, 99, 1234, 98765]) {
      const m = marcasEixo(max)
      assert.ok(m.length >= 3 && m.length <= 5 && m.at(-1)! >= max, `${max}: ${m}`)
    }
    assert.equal(formatarCompacto(1200, 'dinheiro'), 'R$ 1,2 mil')
    assert.equal(formatarCompacto(250, 'dinheiro'), 'R$ 250')
    assert.equal(formatarCompacto(12500, 'inteiro'), '12,5 mil')
    assert.equal(formatarCompacto(3_500_000, 'inteiro'), '3,5 mi')
    assert.equal(formatarCompacto(12.5, 'decimal1'), '12,5')
  })

  test('hora dos dados, tipo de campanha e a busca mais antiga', () => {
    assert.equal(textoDados('2026-10-19T17:05:00.000Z', '2026-10-19'), 'Dados de 14:05')
    assert.equal(textoDados('2026-10-18T17:05:00.000Z', '2026-10-19'), 'Dados de 18/10, 14:05')
    assert.equal(textoDados(null, '2026-10-19'), null)
    assert.equal(rotuloTipo('OUTCOME_LEADS'), 'Leads')
    assert.equal(rotuloTipo('PERFORMANCE_MAX'), 'Performance Max')
    assert.equal(rotuloTipo('OUTCOME_ALGO_NOVO'), 'Algo novo')
    assert.equal(rotuloTipo(null), null)
    assert.equal(buscadoMaisAntigo({ meta: { buscadoEm: 'b' }, googleAds: null, ga4: { buscadoEm: 'a' } } as never), 'a')
  })

  test('pontos alinhados por dia (o 1º do atual com o 1º do anterior) e o resumo em texto', () => {
    const serie = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-10-01', '2026-10-02'].map((data, i) => ({
      data, investimento: i * 10, impressoes: 0, cliques: 0, resultados: 0,
    }))
    const r = { de: '2026-10-01', ate: '2026-10-02', deAnterior: '2026-09-01', ateAnterior: '2026-09-02', meta: { serie }, googleAds: null, ga4: null } as unknown as ResultadosCliente
    const m = METRICAS_GRAFICO.facebook[0]!
    const { atual, anterior } = pontosDa(r, m)
    assert.deepEqual(atual, [{ data: '2026-10-01', valor: 30 }, { data: '2026-10-02', valor: 40 }])
    assert.deepEqual(anterior, [{ data: '2026-09-01', valor: 0 }, { data: '2026-09-02', valor: 10 }])
    assert.equal(resumoGrafico(m, atual, anterior, { atual: '01/10–02/10', anterior: '01/09–02/09' }),
      'Investimento por dia. Período atual (01/10–02/10): total R$ 70,00; maior em 02/10 (R$ 40,00). Período anterior (01/09–02/09): total R$ 10,00.')
  })

  test('"Ligar a…": sigla como palavra, nome ou apelido; o mais longo vence; empate não sugere', () => {
    const clientes = [cliente('HE', 'Hospital Evangélico', ['hospital evangelico']), cliente('CLA', 'Clínica Aurora', ['aurora']),
      cliente('ICC', 'Instituto de Cardiologia'), cliente('AB', 'Academia Bela')]
    assert.equal(sugerirCliente('HE Leads - Meta', clientes)?.sigla, 'HE')
    assert.equal(sugerirCliente('Cheque especial', clientes), null, 'HE dentro de outra palavra não conta')
    assert.equal(sugerirCliente('clinica aurora – GA4', clientes)?.sigla, 'CLA')
    assert.equal(sugerirCliente('Aurora Google Ads', clientes)?.sigla, 'CLA')
    assert.equal(sugerirCliente('Instituto de Cardiologia - Google', clientes)?.sigla, 'ICC')
    assert.equal(sugerirCliente('Conta sem nome conhecido', clientes), null)
    assert.equal(sugerirCliente('HE e AB juntos', clientes), null, 'empate')
    assert.equal(sugerirCliente('HE e ICC juntos', clientes)?.sigla, 'ICC', 'o mais longo vence')
  })
})
