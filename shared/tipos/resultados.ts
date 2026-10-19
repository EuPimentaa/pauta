/**
 * Fase 2: resultados dos clientes pela Windsor.ai (aba "Resultados" do cliente, "Contas de resultados" e o resumo do
 * MCP). Contrato: docs/API.md §F.8; banco: server/migracoes/102_resultados_windsor.sql; pesquisa:
 * docs/fase2/pesquisa-windsor.md. A chave da Windsor nunca chega ao navegador.
 *
 * Números: dinheiro em reais (sem arredondar; a tela arredonda), razões em FRAÇÃO (0,0075 = 0,75%), calculadas pelo
 * Pauta a partir das somas (nunca a soma ou a média das razões da Windsor). Divisão por zero → null ("—" na tela).
 * Alcance (Meta) e usuários (GA4) vêm do total do período (chamada sem `date`), nunca da soma dos dias.
 */
import type { DataLocal, Id, Instante } from './nucleo.ts'

export const CONECTORES_WINDSOR = ['facebook', 'google_ads', 'googleanalytics4'] as const
/** O caminho da API REST da Windsor (`https://connectors.windsor.ai/{conector}`). */
export type ConectorWindsor = (typeof CONECTORES_WINDSOR)[number]
export const ROTULO_CONECTOR: Record<ConectorWindsor, string> = {
  facebook: 'Meta Ads', google_ads: 'Google Ads', googleanalytics4: 'GA4',
}

export const PERIODOS_RESULTADOS = ['este_mes', 'mes_passado', '7d', '30d', '90d'] as const
/**
 * Datas calculadas em São Paulo (`periodoDe(periodo, hoje)`, shared/logica/resultados-periodo.ts):
 * - este_mes: do dia 1 até hoje; comparação = os mesmos dias do mês anterior (dia que não existe vira o último do mês);
 * - mes_passado: o mês anterior inteiro; comparação = o mês retrasado inteiro;
 * - 7d/30d/90d: os N dias que terminam ONTEM (dias fechados); comparação = os N dias logo antes.
 */
export type PeriodoResultados = (typeof PERIODOS_RESULTADOS)[number]
export const ROTULO_PERIODO: Record<PeriodoResultados, string> = {
  este_mes: 'Este mês', mes_passado: 'Mês passado', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias',
}

export const ERROS_WINDSOR = ['chave_invalida', 'fora_do_ar', 'limite', 'conta_nao_conectada', 'resposta_invalida'] as const
/**
 * Erro da última busca (resultado_cache.erro, windsor_uso.ultimo_erro):
 * - chave_invalida: 400 user_error ou unauthorized (avisar o admin);
 * - fora_do_ar: 5xx, rede, tempo esgotado (60 s por chamada);
 * - limite: 429 da Windsor ou o teto diário do Pauta (8.000 chamadas);
 * - conta_nao_conectada: nenhuma das contas pedidas está conectada na Windsor;
 * - resposta_invalida: o corpo não passou na validação (zod).
 */
export type ErroWindsor = (typeof ERROS_WINDSOR)[number]

/** Estado geral da integração (sem_chave = WINDSOR_API_KEY vazia no servidor). */
export type EstadoWindsor = 'ok' | 'sem_chave' | ErroWindsor

// ─────────────────────────────── contas ───────────────────────────────

/** Uma conta da lista da Windsor (GET /api/resultados/contas). */
export interface ContaWindsor {
  conector: ConectorWindsor
  /** Só dígitos e hífen (Meta sem "act_"). */
  contaId: string
  nome: string
  status: string | null
  /** Clientes a que ela já está ligada (uma conta pode servir a mais de um, como uma propriedade GA4 de grupo). */
  clientes: { clienteId: Id; sigla: string }[]
}

/** GET /api/resultados/contas (admin e atendimento). */
export interface ListarContasWindsorSaida {
  estado: EstadoWindsor
  /** Quando a lista foi buscada na Windsor (cache de 24 h); null = nunca. */
  atualizadaEm: Instante | null
  /** Chamadas à Windsor hoje (São Paulo) e o teto do Pauta. */
  uso: { hoje: number; tetoDia: number }
  contas: ContaWindsor[]
}

/** Uma ligação cliente ↔ conta (cliente_conta_resultados). */
export interface ContaLigada {
  id: Id
  conector: ConectorWindsor
  contaId: string
  /** O nome quando foi ligada. */
  nome: string
  ligadaPor: Id | null
  ligadaEm: Instante
}

/** POST /api/clientes/:id/resultados/contas. `nome` só é obrigatório para conta fora da lista (digitada). */
export interface LigarContaEntrada {
  conector: ConectorWindsor
  contaId: string
  nome?: string
}

// ─────────────────────────────── KPIs ───────────────────────────────

/** Meta Ads. Resultados = leads + conversas (o "Resultado" do Gerenciador não vem pela Windsor; pesquisa §6). */
export interface KpisMeta {
  investimento: number
  impressoes: number
  /** Total do período, deduplicado pela Meta; com várias contas, a soma entre contas (a dica avisa a sobreposição). */
  alcance: number | null
  cliques: number
  cliquesLink: number
  ctr: number | null
  cpc: number | null
  cpm: number | null
  leads: number
  conversas: number
  resultados: number
  custoPorResultado: number | null
  compras: number
  valorCompras: number
  /** Só com valorCompras > 0. */
  roas: number | null
}

export interface KpisGoogleAds {
  investimento: number
  impressoes: number
  cliques: number
  ctr: number | null
  cpc: number | null
  /** Fracionárias (atribuição baseada em dados); a tela mostra com 1 casa. */
  conversoes: number
  valorConversoes: number
  custoPorConversao: number | null
  /** Só com valorConversoes > 0. */
  roas: number | null
}

export interface KpisGa4 {
  /** active_users do total do período (o "Usuários" do GA4), nunca a soma dos dias. */
  usuarios: number | null
  novosUsuarios: number | null
  sessoes: number
  sessoesEngajadas: number
  taxaEngajamento: number | null
  /** Segundos; média ponderada pelas sessões. */
  duracaoMediaSeg: number | null
  visualizacoes: number
  eventosChave: number
}

export interface PontoMeta { data: DataLocal; investimento: number; impressoes: number; cliques: number; resultados: number }
export interface PontoGoogleAds { data: DataLocal; investimento: number; impressoes: number; cliques: number; conversoes: number }
export interface PontoGa4 { data: DataLocal; usuarios: number; sessoes: number; sessoesEngajadas: number; eventosChave: number }

/** Campanha do período atual (as 10 de maior investimento). */
export interface CampanhaResultado {
  id: string
  nome: string
  /** Meta: objective (OUTCOME_LEADS...); Google Ads: advertising_channel_type (SEARCH, PERFORMANCE_MAX...). */
  tipo: string | null
  investimento: number
  impressoes: number
  cliques: number
  /** Meta: resultados (leads + conversas); Google Ads: conversões. */
  resultados: number
  custoPorResultado: number | null
}

interface ResultadoConectorBase<C extends ConectorWindsor, K, P> {
  conector: C
  /** Ids das contas consultadas (as ligadas ao cliente neste conector), em ordem. */
  contas: string[]
  /** ok; sem_dados = a Windsor devolveu `data: []` nos dois períodos (conta parada); ou o erro da última busca. */
  estado: 'ok' | 'sem_dados' | ErroWindsor
  /** Hora da busca dos dados mostrados (com erro, os de antes continuam valendo); null = nunca buscou. */
  buscadoEm: Instante | null
  kpis: { atual: K; anterior: K } | null
  /** Um ponto por dia, do início do período anterior ao fim do atual (dias sem linha vêm com zeros). */
  serie: P[]
}

export type ResultadoMeta = ResultadoConectorBase<'facebook', KpisMeta, PontoMeta> & { campanhas: CampanhaResultado[] }
export type ResultadoGoogleAds = ResultadoConectorBase<'google_ads', KpisGoogleAds, PontoGoogleAds> & {
  campanhas: CampanhaResultado[]
}
export type ResultadoGa4 = ResultadoConectorBase<'googleanalytics4', KpisGa4, PontoGa4> & {
  /** Eventos-chave por nome no período atual (event_name com conversions > 0), maiores primeiro. */
  eventosChave: { nome: string; quantidade: number }[]
}
export type ResultadoConector = ResultadoMeta | ResultadoGoogleAds | ResultadoGa4

/** GET /api/clientes/:id/resultados?periodo=30d */
export interface ResultadosCliente {
  clienteId: Id
  periodo: PeriodoResultados
  de: DataLocal
  ate: DataLocal
  deAnterior: DataLocal
  ateAnterior: DataLocal
  /** sem_chave: WINDSOR_API_KEY vazia; sem_contas: o cliente não tem conta ligada. Com eles, os três vêm nulos. */
  estado: 'ok' | 'sem_chave' | 'sem_contas'
  /** Uma busca em segundo plano está rodando (o SSE resultado_cliente avisa quando termina). */
  atualizando: boolean
  contas: ContaLigada[]
  /** Null = nenhuma conta ligada neste conector. */
  meta: ResultadoMeta | null
  googleAds: ResultadoGoogleAds | null
  ga4: ResultadoGa4 | null
}

/** POST /api/clientes/:id/resultados/atualizar */
export interface AtualizarResultadosEntrada {
  periodo: PeriodoResultados
}

/**
 * Evento de tempo real `resultado_cliente` (id = clienteId, público interno): contas ligadas ou desligadas, busca
 * começou ou terminou. O tratador invalida ['resultados', clienteId] (os números não viajam no evento).
 */
export interface EstadoResultadosCliente {
  clienteId: Id
  contas: ContaLigada[]
  atualizando: boolean
  /** Última busca terminada (boa ou não) de qualquer período. */
  atualizadoEm: Instante | null
}
