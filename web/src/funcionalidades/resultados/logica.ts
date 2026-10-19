/**
 * Lógica de tela dos resultados (F8), sem React: rótulos dos tipos de campanha, números compactos do eixo do gráfico,
 * as marcas do eixo, a hora dos dados, as métricas do gráfico por conector e a sugestão do "Ligar a…".
 * Formato dos KPIs, variação e cor: só pelo shared/logica/resultados-formato.ts (o mesmo do MCP). Imports relativos:
 * roda também no Node (server/test/resultados-web.test.ts).
 */
import type { ClienteResumo, ConectorWindsor, DataLocal, Instante, ResultadosCliente } from '../../../../shared/tipos/index.ts'
import { dataLocalDe, horaLocalDe } from '../../../../shared/logica/datas.ts'
import { formatarValor, type FormatoKpi } from '../../../../shared/logica/resultados-formato.ts'
import { normalizarAlias } from '../../../../shared/logica/texto.ts'

const OBJETIVOS: Record<string, string> = {
  OUTCOME_LEADS: 'Leads', LEAD_GENERATION: 'Leads', OUTCOME_ENGAGEMENT: 'Engajamento', POST_ENGAGEMENT: 'Engajamento',
  OUTCOME_TRAFFIC: 'Tráfego', LINK_CLICKS: 'Tráfego', OUTCOME_AWARENESS: 'Reconhecimento', REACH: 'Alcance',
  BRAND_AWARENESS: 'Reconhecimento', OUTCOME_SALES: 'Vendas', CONVERSIONS: 'Conversões', MESSAGES: 'Mensagens',
  OUTCOME_APP_PROMOTION: 'App', VIDEO_VIEWS: 'Vídeo',
  SEARCH: 'Pesquisa', PERFORMANCE_MAX: 'Performance Max', DEMAND_GEN: 'Demand Gen', DISPLAY: 'Display', VIDEO: 'Vídeo',
  SHOPPING: 'Shopping', MULTI_CHANNEL: 'Vários canais', SMART: 'Inteligente', LOCAL: 'Local',
}

/** O tipo da campanha em português ("OUTCOME_LEADS" → "Leads"); desconhecido: o próprio texto, mais legível. */
export function rotuloTipo(tipo: string | null): string | null {
  if (!tipo) return null
  return OBJETIVOS[tipo] ?? tipo.replace(/^OUTCOME_/, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Número curto para o eixo: "R$ 1,2 mil", "12 mil", "3,5 mi", "45". */
export function formatarCompacto(v: number, formato: FormatoKpi): string {
  const dinheiro = formato === 'dinheiro'
  const a = Math.abs(v)
  let corpo: string
  if (a >= 1_000_000) corpo = `${UMA_CASA.format(v / 1_000_000)} mi`
  else if (a >= 1000) corpo = `${UMA_CASA.format(v / 1000)} mil`
  else if (formato === 'decimal1' || (dinheiro && a < 10 && a !== 0 && !Number.isInteger(v))) corpo = UMA_CASA.format(v)
  else corpo = UMA_CASA.format(Math.round(v))
  return dinheiro ? `R$ ${corpo}` : corpo
}

/** 3 ou 4 marcas "redondas" de 0 até cobrir `max` (1, 2, 2,5 ou 5 × 10^n). */
export function marcasEixo(max: number): number[] {
  if (!(max > 0)) return [0, 1]
  const bruto = max / 3
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p * 3 >= max) ?? 10 * potencia
  const marcas = [0]
  while (marcas[marcas.length - 1]! < max - 1e-9) marcas.push(Math.round((marcas[marcas.length - 1]! + passo) * 1e6) / 1e6)
  return marcas
}

/** "14:05" (hoje) ou "18/10, 14:05". */
export function textoHora(instante: Instante, hoje: DataLocal): string {
  const dia = dataLocalDe(instante)
  const hora = horaLocalDe(instante)
  return dia === hoje ? hora : `${dia.slice(8, 10)}/${dia.slice(5, 7)}, ${hora}`
}

/** "Dados de 14:05" (hoje) ou "Dados de 18/10, 14:05". */
export function textoDados(buscadoEm: Instante | null, hoje: DataLocal): string | null {
  return buscadoEm ? `Dados de ${textoHora(buscadoEm, hoje)}` : null
}

/** A busca mais antiga entre os conectores (a que a tela mostra). */
export function buscadoMaisAntigo(r: Pick<ResultadosCliente, 'meta' | 'googleAds' | 'ga4'>): Instante | null {
  const lista = [r.meta?.buscadoEm, r.googleAds?.buscadoEm, r.ga4?.buscadoEm].filter((x): x is string => !!x).sort()
  return lista[0] ?? null
}

/** "12/10" */
export const diaMes = (d: DataLocal) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

// ─────────────────────────────── gráfico ───────────────────────────────

export interface MetricaGrafico {
  id: string
  conector: ConectorWindsor
  chave: string
  rotulo: string
  formato: FormatoKpi
}

const m = (conector: ConectorWindsor, chave: string, rotulo: string, formato: FormatoKpi): MetricaGrafico =>
  ({ id: `${conector}:${chave}`, conector, chave, rotulo, formato })

/** As métricas que a série diária de cada conector tem. */
export const METRICAS_GRAFICO: Record<ConectorWindsor, MetricaGrafico[]> = {
  facebook: [m('facebook', 'investimento', 'Investimento', 'dinheiro'), m('facebook', 'resultados', 'Resultados', 'inteiro'),
    m('facebook', 'cliques', 'Cliques', 'inteiro'), m('facebook', 'impressoes', 'Impressões', 'inteiro')],
  google_ads: [m('google_ads', 'investimento', 'Investimento', 'dinheiro'), m('google_ads', 'conversoes', 'Conversões', 'decimal1'),
    m('google_ads', 'cliques', 'Cliques', 'inteiro'), m('google_ads', 'impressoes', 'Impressões', 'inteiro')],
  googleanalytics4: [m('googleanalytics4', 'sessoes', 'Sessões', 'inteiro'), m('googleanalytics4', 'usuarios', 'Usuários', 'inteiro'),
    m('googleanalytics4', 'sessoesEngajadas', 'Sessões engajadas', 'inteiro'), m('googleanalytics4', 'eventosChave', 'Eventos-chave', 'inteiro')],
}

export interface PontoGrafico { data: DataLocal; valor: number }

/** Os pontos do período atual e do anterior de uma métrica (o gráfico alinha por dia: o 1º com o 1º). */
export function pontosDa(r: ResultadosCliente, metrica: MetricaGrafico): { atual: PontoGrafico[]; anterior: PontoGrafico[] } {
  const bloco = metrica.conector === 'facebook' ? r.meta : metrica.conector === 'google_ads' ? r.googleAds : r.ga4
  const serie = (bloco?.serie ?? []) as unknown as Record<string, number | string>[]
  const pega = (de: DataLocal, ate: DataLocal) => serie
    .filter((p) => String(p.data) >= de && String(p.data) <= ate)
    .map((p) => ({ data: String(p.data) as DataLocal, valor: typeof p[metrica.chave] === 'number' ? p[metrica.chave] as number : 0 }))
  return { atual: pega(r.de, r.ate), anterior: pega(r.deAnterior, r.ateAnterior) }
}

/** Resumo do gráfico em texto (o `aria-label` e a primeira linha da tabela). */
export function resumoGrafico(metrica: MetricaGrafico, atual: PontoGrafico[], anterior: PontoGrafico[], periodos: { atual: string; anterior: string }): string {
  const total = (ps: PontoGrafico[]) => ps.reduce((s, p) => s + p.valor, 0)
  const maior = atual.reduce<PontoGrafico | null>((a, p) => (!a || p.valor > a.valor ? p : a), null)
  const fmt = (v: number) => formatarValor(v, metrica.formato)
  const partes = [`${metrica.rotulo} por dia. `, `Período atual (${periodos.atual}): total ${fmt(total(atual))}`]
  if (maior && maior.valor > 0) partes.push(`; maior em ${diaMes(maior.data)} (${fmt(maior.valor)})`)
  partes.push(`. Período anterior (${periodos.anterior}): total ${fmt(total(anterior))}.`)
  return partes.join('')
}

// ─────────────────────────────── "Ligar a…" ───────────────────────────────

const palavras = (s: string) => ` ${normalizarAlias(s).replace(/[^a-z0-9]+/g, ' ').trim()} `

/**
 * O cliente sugerido para uma conta: o nome da conta contém a sigla (como palavra), o nome ou um apelido do cliente.
 * Vale o casamento mais longo; empate ou nenhum → null.
 */
export function sugerirCliente(nomeConta: string, clientes: readonly ClienteResumo[]): ClienteResumo | null {
  const alvo = palavras(nomeConta)
  let melhor: { c: ClienteResumo; tamanho: number } | null = null
  let empate = false
  for (const c of clientes) {
    const termos = [c.sigla, c.nome, ...c.apelidos].map((t) => palavras(t)).filter((t) => t.trim().length >= 2)
    const tamanho = Math.max(0, ...termos.filter((t) => alvo.includes(t)).map((t) => t.trim().length))
    if (tamanho === 0) continue
    if (!melhor || tamanho > melhor.tamanho) { melhor = { c, tamanho }; empate = false } else if (tamanho === melhor.tamanho && melhor.c.id !== c.id) empate = true
  }
  return melhor && !empate ? melhor.c : null
}
