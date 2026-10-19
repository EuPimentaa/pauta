/**
 * Fase 2 (F8): somas e razões dos resultados a partir das linhas da Windsor (API.md §F.8, "Cálculos"; pesquisa-windsor
 * §9.3). Puro. Regras:
 * - razões calculadas das somas, nunca a soma ou a média das razões da Windsor; divisão por zero → null;
 * - `null` da Windsor (ação que não aconteceu) conta como 0 nas somas;
 * - alcance (Meta) e usuários (GA4) do total do período (chamada sem `date`), somados entre as contas do cliente;
 * - linha com data fora do intervalo pedido (conta noutro fuso) ou sem data válida fica de fora;
 * - Meta: resultados = leads + conversas; ROAS só com valor > 0;
 * - campanhas: as 10 de maior investimento no período atual.
 */
import type { DataLocal } from '../tipos/nucleo.ts'
import type {
  CampanhaResultado, ConectorWindsor, KpisGa4, KpisGoogleAds, KpisMeta, PontoGa4, PontoGoogleAds, PontoMeta,
} from '../tipos/resultados.ts'
import type {
  DadosGa4, DadosGoogleAds, DadosMeta, GastoRecente, LinhaWindsor, SomasGa4, SomasGoogleAds, SomasMeta,
  SomasPorConector,
} from '../tipos/ext/resultados.ts'
import { KPIS_PRINCIPAIS } from './resultados-formato.ts'
import { diasDe, type DatasPeriodo } from './resultados-periodo.ts'
import { somarDias } from './datas.ts'

/** Quantas campanhas a aba mostra. */
export const CAMPANHAS_MAX = 10
/** Quantos eventos-chave por nome guardar. */
export const EVENTOS_CHAVE_MAX = 20

// ─────────────────────────────── utilidades ───────────────────────────────

/** Número da Windsor: null, ausente, texto ou não finito → 0. */
export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Tira o ruído de ponto flutuante das somas (246.82999999 → 246.83), sem arredondar para a tela. */
export function limpar(x: number): number {
  return Math.round(x * 1e6) / 1e6
}

/** a / b; b = 0 → null. */
export function razao(a: number, b: number): number | null {
  return b === 0 ? null : a / b
}

/** O id da conta como o Pauta guarda (Meta sem "act_"). */
export function idConta(v: unknown): string {
  return String(v ?? '').trim().replace(/^act_/i, '')
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

const dentro = (d: unknown, de: DataLocal, ate: DataLocal): d is DataLocal =>
  typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= de && d <= ate

/** Linhas com data entre `de` e `ate` (inclusive); as outras e as sem data válida ficam de fora. */
export function linhasEntre(linhas: readonly LinhaWindsor[], de: DataLocal, ate: DataLocal): LinhaWindsor[] {
  return linhas.filter((l) => dentro(l.date, de, ate))
}

function somar(linhas: readonly LinhaWindsor[], campo: string): number {
  let s = 0
  for (const l of linhas) s += num(l[campo])
  return limpar(s)
}

// ─────────────────────────────── KPIs a partir das somas ───────────────────────────────

interface SomasMetaCompletas extends SomasMeta { cliquesLink: number; compras: number; valorCompras: number }

export function kpisMeta(s: SomasMetaCompletas, alcance: number | null): KpisMeta {
  const resultados = limpar(s.leads + s.conversas)
  return {
    investimento: s.investimento, impressoes: s.impressoes, alcance, cliques: s.cliques, cliquesLink: s.cliquesLink,
    ctr: razao(s.cliques, s.impressoes), cpc: razao(s.investimento, s.cliques), cpm: razao(s.investimento * 1000, s.impressoes),
    leads: s.leads, conversas: s.conversas, resultados, custoPorResultado: razao(s.investimento, resultados),
    compras: s.compras, valorCompras: s.valorCompras, roas: s.valorCompras > 0 ? razao(s.valorCompras, s.investimento) : null,
  }
}

export function kpisGoogleAds(s: SomasGoogleAds): KpisGoogleAds {
  return {
    investimento: s.investimento, impressoes: s.impressoes, cliques: s.cliques,
    ctr: razao(s.cliques, s.impressoes), cpc: razao(s.investimento, s.cliques),
    conversoes: s.conversoes, valorConversoes: s.valorConversoes, custoPorConversao: razao(s.investimento, s.conversoes),
    roas: s.valorConversoes > 0 ? razao(s.valorConversoes, s.investimento) : null,
  }
}

interface SomasGa4Completas {
  usuarios: number | null
  novosUsuarios: number | null
  sessoes: number
  sessoesEngajadas: number
  duracaoPonderada: number
  visualizacoes: number
  eventosChave: number
}

export function kpisGa4(s: SomasGa4Completas): KpisGa4 {
  return {
    usuarios: s.usuarios, novosUsuarios: s.novosUsuarios, sessoes: s.sessoes, sessoesEngajadas: s.sessoesEngajadas,
    taxaEngajamento: razao(s.sessoesEngajadas, s.sessoes), duracaoMediaSeg: razao(s.duracaoPonderada, s.sessoes),
    visualizacoes: s.visualizacoes, eventosChave: s.eventosChave,
  }
}

// ─────────────────────────────── gasto recente (parou_de_gastar) ───────────────────────────────

/** Gasto por conta e dia nos 8 dias que terminam em `ate` (o dia e os 7 antes). */
export function gastoRecente(linhas: readonly LinhaWindsor[], ate: DataLocal): GastoRecente {
  const de = somarDias(ate, -7)
  const g: GastoRecente = {}
  for (const l of linhasEntre(linhas, de, ate)) {
    const conta = idConta(l.account_id)
    if (!conta) continue
    const dia = l.date as DataLocal
    const porDia = (g[conta] ??= {})
    porDia[dia] = limpar((porDia[dia] ?? 0) + num(l.spend))
  }
  return g
}

// ─────────────────────────────── campanhas ───────────────────────────────

function campanhas(linhas: readonly LinhaWindsor[], campoTipo: string, resultadosDe: (l: LinhaWindsor) => number): CampanhaResultado[] {
  const mapa = new Map<string, CampanhaResultado>()
  for (const l of linhas) {
    const nome = texto(l.campaign) ?? '(sem nome)'
    const id = texto(l.campaign_id) ?? nome
    const c = mapa.get(id) ?? { id, nome, tipo: texto(l[campoTipo]), investimento: 0, impressoes: 0, cliques: 0, resultados: 0, custoPorResultado: null }
    c.nome = nome
    c.tipo = texto(l[campoTipo]) ?? c.tipo
    c.investimento = limpar(c.investimento + num(l.spend))
    c.impressoes = limpar(c.impressoes + num(l.impressions))
    c.cliques = limpar(c.cliques + num(l.clicks))
    c.resultados = limpar(c.resultados + resultadosDe(l))
    mapa.set(id, c)
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, custoPorResultado: razao(c.investimento, c.resultados) }))
    .sort((a, b) => b.investimento - a.investimento || b.resultados - a.resultados || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, CAMPANHAS_MAX)
}

// ─────────────────────────────── Meta ───────────────────────────────

const LEADS = 'actions_lead'
const CONVERSAS = 'actions_onsite_conversion_messaging_conversation_started_7d'
const resultadosMeta = (l: LinhaWindsor) => num(l[LEADS]) + num(l[CONVERSAS])

function somasMetaCompletas(linhas: readonly LinhaWindsor[]): SomasMetaCompletas {
  return {
    investimento: somar(linhas, 'spend'), impressoes: somar(linhas, 'impressions'), cliques: somar(linhas, 'clicks'),
    cliquesLink: somar(linhas, 'link_clicks'), leads: somar(linhas, LEADS), conversas: somar(linhas, CONVERSAS),
    compras: somar(linhas, 'actions_omni_purchase'), valorCompras: somar(linhas, 'action_values_omni_purchase'),
  }
}

export interface EntradaMeta {
  /** Chamada 1: date × campanha, do início de B ao fim de A. */
  diario: readonly LinhaWindsor[]
  /** Chamadas 2–3: sem `date`, uma linha por conta (alcance deduplicado). */
  totalAtual: readonly LinhaWindsor[]
  totalAnterior: readonly LinhaWindsor[]
  datas: DatasPeriodo
}

export function calcularMeta(e: EntradaMeta): DadosMeta {
  const { de, ate, deAnterior, ateAnterior } = e.datas
  const diario = linhasEntre(e.diario, deAnterior, ate)
  const a = linhasEntre(diario, de, ate)
  const b = linhasEntre(diario, deAnterior, ateAnterior)
  const serie: PontoMeta[] = diasDe(deAnterior, ate).map((data) => {
    const doDia = diario.filter((l) => l.date === data)
    return {
      data, investimento: somar(doDia, 'spend'), impressoes: somar(doDia, 'impressions'), cliques: somar(doDia, 'clicks'),
      resultados: limpar(doDia.reduce((s, l) => s + resultadosMeta(l), 0)),
    }
  })
  return {
    kpis: { atual: kpisMeta(somasMetaCompletas(a), somar(e.totalAtual, 'reach')), anterior: kpisMeta(somasMetaCompletas(b), somar(e.totalAnterior, 'reach')) },
    serie, campanhas: campanhas(a, 'objective', resultadosMeta), vazio: diario.length === 0,
    gastoRecente: gastoRecente(diario, ate),
  }
}

// ─────────────────────────────── Google Ads ───────────────────────────────

function somasGoogle(linhas: readonly LinhaWindsor[]): SomasGoogleAds {
  return {
    investimento: somar(linhas, 'spend'), impressoes: somar(linhas, 'impressions'), cliques: somar(linhas, 'clicks'),
    conversoes: somar(linhas, 'conversions'), valorConversoes: somar(linhas, 'conversions_value'),
  }
}

export interface EntradaGoogleAds {
  /** Chamada 4: date × campanha, do início de B ao fim de A. */
  diario: readonly LinhaWindsor[]
  datas: DatasPeriodo
}

export function calcularGoogleAds(e: EntradaGoogleAds): DadosGoogleAds {
  const { de, ate, deAnterior, ateAnterior } = e.datas
  const diario = linhasEntre(e.diario, deAnterior, ate)
  const serie: PontoGoogleAds[] = diasDe(deAnterior, ate).map((data) => {
    const doDia = diario.filter((l) => l.date === data)
    return {
      data, investimento: somar(doDia, 'spend'), impressoes: somar(doDia, 'impressions'), cliques: somar(doDia, 'clicks'),
      conversoes: somar(doDia, 'conversions'),
    }
  })
  return {
    kpis: { atual: kpisGoogleAds(somasGoogle(linhasEntre(diario, de, ate))), anterior: kpisGoogleAds(somasGoogle(linhasEntre(diario, deAnterior, ateAnterior))) },
    serie, campanhas: campanhas(linhasEntre(diario, de, ate), 'advertising_channel_type', (l) => num(l.conversions)),
    vazio: diario.length === 0, gastoRecente: gastoRecente(diario, ate),
  }
}

// ─────────────────────────────── GA4 ───────────────────────────────

export interface EntradaGa4 {
  /** Chamada 5: por dia (com active_users do dia, só para a série). */
  diario: readonly LinhaWindsor[]
  /** Chamadas 6–7: sem `date`, uma linha por propriedade (usuários deduplicados). */
  totalAtual: readonly LinhaWindsor[]
  totalAnterior: readonly LinhaWindsor[]
  /** Chamada 8: event_name + conversions (conversions > 0), período atual. */
  eventos: readonly LinhaWindsor[]
  datas: DatasPeriodo
}

function somasGa4Completas(linhas: readonly LinhaWindsor[], total: readonly LinhaWindsor[]): SomasGa4Completas {
  let ponderada = 0
  for (const l of linhas) ponderada += num(l.average_session_duration) * num(l.sessions)
  return {
    usuarios: somar(total, 'active_users'), novosUsuarios: somar(total, 'newusers'), sessoes: somar(linhas, 'sessions'),
    sessoesEngajadas: somar(linhas, 'engaged_sessions'), duracaoPonderada: ponderada, visualizacoes: somar(linhas, 'screen_page_views'),
    eventosChave: somar(linhas, 'conversions'),
  }
}

export function calcularGa4(e: EntradaGa4): DadosGa4 {
  const { de, ate, deAnterior, ateAnterior } = e.datas
  const diario = linhasEntre(e.diario, deAnterior, ate)
  const serie: PontoGa4[] = diasDe(deAnterior, ate).map((data) => {
    const doDia = diario.filter((l) => l.date === data)
    return {
      data, usuarios: somar(doDia, 'active_users'), sessoes: somar(doDia, 'sessions'),
      sessoesEngajadas: somar(doDia, 'engaged_sessions'), eventosChave: somar(doDia, 'conversions'),
    }
  })
  const porNome = new Map<string, number>()
  for (const l of e.eventos) {
    const nome = texto(l.event_name)
    if (!nome) continue
    porNome.set(nome, limpar((porNome.get(nome) ?? 0) + num(l.conversions)))
  }
  const eventosChave = [...porNome].filter(([, q]) => q > 0)
    .sort(([na, a], [nb, b]) => b - a || na.localeCompare(nb, 'pt-BR'))
    .slice(0, EVENTOS_CHAVE_MAX)
    .map(([nome, quantidade]) => ({ nome, quantidade }))
  return {
    kpis: {
      atual: kpisGa4(somasGa4Completas(linhasEntre(diario, de, ate), e.totalAtual)),
      anterior: kpisGa4(somasGa4Completas(linhasEntre(diario, deAnterior, ateAnterior), e.totalAnterior)),
    },
    serie, eventosChave, vazio: diario.length === 0 && e.totalAtual.length === 0 && e.totalAnterior.length === 0,
  }
}

// ─────────────────────────────── carteira (panorama) ───────────────────────────────

/** Somas por conta de linhas com `account_id` (com ou sem `date`), para a carteira. */
export function somasPorConta<C extends ConectorWindsor>(conector: C, linhas: readonly LinhaWindsor[]): Record<string, SomasPorConector[C]> {
  const grupos = new Map<string, LinhaWindsor[]>()
  for (const l of linhas) {
    const conta = idConta(l.account_id)
    if (!conta) continue
    grupos.set(conta, [...(grupos.get(conta) ?? []), l])
  }
  const saida: Record<string, SomasPorConector[ConectorWindsor]> = {}
  for (const [conta, ls] of grupos) {
    if (conector === 'facebook') {
      saida[conta] = { investimento: somar(ls, 'spend'), impressoes: somar(ls, 'impressions'), cliques: somar(ls, 'clicks'), leads: somar(ls, LEADS), conversas: somar(ls, CONVERSAS) }
    } else if (conector === 'google_ads') {
      saida[conta] = somasGoogle(ls)
    } else {
      saida[conta] = { usuarios: somar(ls, 'active_users'), sessoes: somar(ls, 'sessions'), sessoesEngajadas: somar(ls, 'engaged_sessions'), eventosChave: somar(ls, 'conversions') }
    }
  }
  return saida as Record<string, SomasPorConector[C]>
}

/** Soma as somas de várias contas (as do cliente). Nenhuma com dados → null. */
export function somarContas<C extends ConectorWindsor>(porConta: Record<string, SomasPorConector[C]>, contas: readonly string[]): SomasPorConector[C] | null {
  let total: Record<string, number> | null = null
  for (const c of contas) {
    const s = porConta[c] as unknown as Record<string, number> | undefined
    if (!s) continue
    total ??= {}
    for (const [k, v] of Object.entries(s)) total[k] = limpar((total[k] ?? 0) + v)
  }
  return total as SomasPorConector[C] | null
}

/** Os valores dos KPIS_PRINCIPAIS do conector a partir das somas (os mesmos cálculos da aba). */
export function principaisDeSomas<C extends ConectorWindsor>(conector: C, somas: SomasPorConector[C] | null): Record<string, number | null> {
  const chaves = KPIS_PRINCIPAIS[conector] as readonly string[]
  if (!somas) return Object.fromEntries(chaves.map((k) => [k, null]))
  let kpis: Record<string, number | null>
  if (conector === 'facebook') {
    const s = somas as SomasMeta
    kpis = kpisMeta({ ...s, cliquesLink: 0, compras: 0, valorCompras: 0 }, null) as unknown as Record<string, number | null>
  } else if (conector === 'google_ads') {
    kpis = kpisGoogleAds(somas as SomasGoogleAds) as unknown as Record<string, number | null>
  } else {
    const s = somas as SomasGa4
    kpis = kpisGa4({ usuarios: s.usuarios, novosUsuarios: null, sessoes: s.sessoes, sessoesEngajadas: s.sessoesEngajadas, duracaoPonderada: 0, visualizacoes: 0, eventosChave: s.eventosChave }) as unknown as Record<string, number | null>
  }
  return Object.fromEntries(chaves.map((k) => [k, kpis[k] ?? null]))
}

/** Os KPIS_PRINCIPAIS de KPIs completos (a aba), para comparar com a carteira e o MCP. */
export function principaisDeKpis(conector: ConectorWindsor, kpis: KpisMeta | KpisGoogleAds | KpisGa4): Record<string, number | null> {
  const k = kpis as unknown as Record<string, number | null>
  return Object.fromEntries((KPIS_PRINCIPAIS[conector] as readonly string[]).map((c) => [c, k[c] ?? null]))
}
