/**
 * Fase 2 (F8), tipos só dos resultados da Windsor que não são contrato: o que fica guardado no cache (as colunas `dados`
 * de resultado_cache e de resultado_panorama_cache) e as linhas cruas da Windsor. A API devolve só os tipos do contrato
 * (shared/tipos/resultados.ts); estes campos a mais ficam no servidor.
 */
import type { DataLocal } from '../nucleo.ts'
import type {
  CampanhaResultado, ConectorWindsor, KpisGa4, KpisGoogleAds, KpisMeta, PontoGa4, PontoGoogleAds, PontoMeta,
} from '../resultados.ts'

/** Uma linha de `{"data":[...]}` da Windsor, já validada: números ou null; textos como texto. */
export type LinhaWindsor = Record<string, string | number | null | undefined>

/** Gasto por conta e por dia nos 8 dias que terminam no fim do período (para o alerta `parou_de_gastar`). */
export type GastoRecente = Record<string, Record<DataLocal, number>>

interface DadosBase<K, P> {
  kpis: { atual: K; anterior: K }
  serie: P[]
  /** A Windsor devolveu `data: []` nos dois períodos (conta parada): estado `sem_dados`. */
  vazio: boolean
}

export interface DadosMeta extends DadosBase<KpisMeta, PontoMeta> {
  campanhas: CampanhaResultado[]
  gastoRecente: GastoRecente
}
export interface DadosGoogleAds extends DadosBase<KpisGoogleAds, PontoGoogleAds> {
  campanhas: CampanhaResultado[]
  gastoRecente: GastoRecente
}
export interface DadosGa4 extends DadosBase<KpisGa4, PontoGa4> {
  eventosChave: { nome: string; quantidade: number }[]
}

/** O `dados` de resultado_cache, por conector. */
export interface DadosPorConector {
  facebook: DadosMeta
  google_ads: DadosGoogleAds
  googleanalytics4: DadosGa4
}
export type DadosConector = DadosPorConector[ConectorWindsor]

// ─────────────────────────────── carteira (panorama) ───────────────────────────────

/** Somas de uma conta num período, o bastante para os KPIS_PRINCIPAIS. */
export interface SomasMeta { investimento: number; impressoes: number; cliques: number; leads: number; conversas: number }
export interface SomasGoogleAds { investimento: number; impressoes: number; cliques: number; conversoes: number; valorConversoes: number }
export interface SomasGa4 { usuarios: number; sessoes: number; sessoesEngajadas: number; eventosChave: number }

export interface SomasPorConector {
  facebook: SomasMeta
  google_ads: SomasGoogleAds
  googleanalytics4: SomasGa4
}

/** O `dados` de resultado_panorama_cache: as somas de cada conta nos dois períodos. */
export interface DadosPanorama<C extends ConectorWindsor = ConectorWindsor> {
  atual: Record<string, SomasPorConector[C]>
  anterior: Record<string, SomasPorConector[C]>
  /** Só Meta e Google Ads. */
  gastoRecente: GastoRecente
}
