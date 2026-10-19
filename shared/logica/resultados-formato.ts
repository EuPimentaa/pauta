/**
 * Fase 2, CONTRATO (não é do F8 apesar do prefixo; muda só por pedido): o formato dos KPIs da Windsor, o MESMO na aba
 * Resultados e na carteira (F8) e no `resumo_cliente` do MCP (F7). Quais KPIs são os principais, o rótulo, o formato, o
 * sentido (qual direção é boa) e a variação entre os períodos. Puro; os números vêm de ResultadoConector
 * (shared/tipos/resultados.ts), já calculados pelo servidor.
 */
import type { ConectorWindsor, KpisGa4, KpisGoogleAds, KpisMeta } from '../tipos/resultados.ts'

export interface KpisPorConector {
  facebook: KpisMeta
  google_ads: KpisGoogleAds
  googleanalytics4: KpisGa4
}
export type ChaveKpi<C extends ConectorWindsor> = keyof KpisPorConector[C] & string

/**
 * subir_bom: verde ao subir (resultados, conversões, eventos, CTR, ROAS); descer_bom: custos (verde ao descer);
 * neutro: volume e investimento (subir o investimento não é bom nem ruim).
 */
export type SentidoKpi = 'subir_bom' | 'descer_bom' | 'neutro'
/** dinheiro "R$ 1.234,56"; inteiro "101.245"; decimal1 "128,5"; fracao "0,75%"; razao "3,25x"; segundos "1 min 23 s". */
export type FormatoKpi = 'dinheiro' | 'inteiro' | 'decimal1' | 'fracao' | 'razao' | 'segundos'
export interface DefinicaoKpi {
  rotulo: string
  formato: FormatoKpi
  sentido: SentidoKpi
}

const d = (rotulo: string, formato: FormatoKpi, sentido: SentidoKpi): DefinicaoKpi => ({ rotulo, formato, sentido })

export const DEFINICOES_KPI: { [C in ConectorWindsor]: Record<ChaveKpi<C>, DefinicaoKpi> } = {
  facebook: {
    investimento: d('Investimento', 'dinheiro', 'neutro'),
    impressoes: d('Impressões', 'inteiro', 'neutro'),
    alcance: d('Alcance', 'inteiro', 'neutro'),
    cliques: d('Cliques', 'inteiro', 'neutro'),
    cliquesLink: d('Cliques no link', 'inteiro', 'neutro'),
    ctr: d('CTR', 'fracao', 'subir_bom'),
    cpc: d('CPC', 'dinheiro', 'descer_bom'),
    cpm: d('CPM', 'dinheiro', 'descer_bom'),
    leads: d('Leads', 'inteiro', 'subir_bom'),
    conversas: d('Conversas', 'inteiro', 'subir_bom'),
    resultados: d('Resultados', 'inteiro', 'subir_bom'),
    custoPorResultado: d('Custo por resultado', 'dinheiro', 'descer_bom'),
    compras: d('Compras', 'inteiro', 'subir_bom'),
    valorCompras: d('Valor das compras', 'dinheiro', 'subir_bom'),
    roas: d('ROAS', 'razao', 'subir_bom'),
  },
  google_ads: {
    investimento: d('Investimento', 'dinheiro', 'neutro'),
    impressoes: d('Impressões', 'inteiro', 'neutro'),
    cliques: d('Cliques', 'inteiro', 'neutro'),
    ctr: d('CTR', 'fracao', 'subir_bom'),
    cpc: d('CPC', 'dinheiro', 'descer_bom'),
    conversoes: d('Conversões', 'decimal1', 'subir_bom'),
    valorConversoes: d('Valor das conversões', 'dinheiro', 'subir_bom'),
    custoPorConversao: d('Custo por conversão', 'dinheiro', 'descer_bom'),
    roas: d('ROAS', 'razao', 'subir_bom'),
  },
  googleanalytics4: {
    usuarios: d('Usuários', 'inteiro', 'neutro'),
    novosUsuarios: d('Novos usuários', 'inteiro', 'neutro'),
    sessoes: d('Sessões', 'inteiro', 'neutro'),
    sessoesEngajadas: d('Sessões engajadas', 'inteiro', 'neutro'),
    taxaEngajamento: d('Taxa de engajamento', 'fracao', 'subir_bom'),
    duracaoMediaSeg: d('Duração média', 'segundos', 'neutro'),
    visualizacoes: d('Visualizações', 'inteiro', 'neutro'),
    eventosChave: d('Eventos-chave', 'inteiro', 'subir_bom'),
  },
}

/**
 * Os 4 KPIs de cada conector que aparecem primeiro (a linha de cartões da aba, a carteira e o `resumo_cliente`); o resto
 * fica em "Mais métricas" na aba e fora do MCP.
 */
export const KPIS_PRINCIPAIS = {
  facebook: ['investimento', 'resultados', 'custoPorResultado', 'ctr'],
  google_ads: ['investimento', 'conversoes', 'custoPorConversao', 'ctr'],
  googleanalytics4: ['usuarios', 'sessoes', 'taxaEngajamento', 'eventosChave'],
} as const satisfies { [C in ConectorWindsor]: readonly ChaveKpi<C>[] }

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const DUAS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const UMA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Um valor no formato dado; null (divisão por zero, dado ausente) → "—". */
export function formatarValor(valor: number | null, formato: FormatoKpi): string {
  if (valor === null || !Number.isFinite(valor)) return '—'
  switch (formato) {
    case 'dinheiro': return `R$ ${DUAS.format(valor)}`
    case 'inteiro': return INTEIRO.format(Math.round(valor))
    case 'decimal1': return UMA.format(valor)
    case 'fracao': return `${DUAS.format(valor * 100)}%`
    case 'razao': return `${DUAS.format(valor)}x`
    case 'segundos': {
      const s = Math.round(valor)
      return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
    }
  }
}

export function definicaoKpi<C extends ConectorWindsor>(conector: C, chave: ChaveKpi<C>): DefinicaoKpi {
  return (DEFINICOES_KPI[conector] as Record<string, DefinicaoKpi>)[chave]!
}

/** O valor de um KPI como a tela e o MCP mostram ("R$ 246,83", "0,75%", "128,5"). */
export function formatarKpi<C extends ConectorWindsor>(conector: C, chave: ChaveKpi<C>, valor: number | null): string {
  return formatarValor(valor, definicaoKpi(conector, chave).formato)
}

/** pct: (A − B) / B em fração; novo: B = 0 e A > 0; nada: os dois 0, ou um dos dois ausente. */
export type Variacao = { tipo: 'pct'; fracao: number } | { tipo: 'novo' } | { tipo: 'nada' }

export function variacao(atual: number | null, anterior: number | null): Variacao {
  if (atual === null || anterior === null || !Number.isFinite(atual) || !Number.isFinite(anterior)) return { tipo: 'nada' }
  if (anterior === 0) return atual === 0 ? { tipo: 'nada' } : { tipo: 'novo' }
  return { tipo: 'pct', fracao: (atual - anterior) / anterior }
}

/** "+12%", "-3%", "0%", "novo", "—" (inteiro; ASCII, igual na tela e no MCP). */
export function formatarVariacao(v: Variacao): string {
  if (v.tipo === 'novo') return 'novo'
  if (v.tipo === 'nada') return '—'
  const pct = Math.round(v.fracao * 100)
  return pct > 0 ? `+${INTEIRO.format(pct)}%` : pct < 0 ? `-${INTEIRO.format(-pct)}%` : '0%'
}

/** A cor da variação: bom (verde), ruim (vermelho) ou neutro, pelo sentido do KPI. Arredondou para 0% → neutro. */
export function tomVariacao(sentido: SentidoKpi, v: Variacao): 'bom' | 'ruim' | 'neutro' {
  if (v.tipo !== 'pct' || sentido === 'neutro') return 'neutro'
  const pct = Math.round(v.fracao * 100)
  if (pct === 0) return 'neutro'
  return (pct > 0) === (sentido === 'subir_bom') ? 'bom' : 'ruim'
}

/** A linha do MCP e o texto do cartão para leitor de tela: "Investimento R$ 1.234,56 (+12%)". */
export function linhaKpi<C extends ConectorWindsor>(conector: C, chave: ChaveKpi<C>, atual: number | null,
  anterior: number | null): string {
  const def = definicaoKpi(conector, chave)
  return `${def.rotulo} ${formatarValor(atual, def.formato)} (${formatarVariacao(variacao(atual, anterior))})`
}
