/**
 * Horas: "Lançar tempo" e cronômetro (no máximo um ligado por pessoa), sempre numa demanda. Ninguém vê as horas
 * individuais de outra pessoa, exceto o admin; atendimento vê o total por cliente; os outros veem só
 * demanda.minutosRegistrados. Tela /horas (F3) e aba Horas do cliente (F5), ambas sobre GET /api/apontamentos (núcleo).
 */
import type { Demanda } from './demandas.ts'
import type { DataLocal, Id, Instante } from './nucleo.ts'

export const ORIGENS_APONTAMENTO = ['manual', 'cronometro', 'importado'] as const
export type OrigemApontamento = (typeof ORIGENS_APONTAMENTO)[number]

export interface Apontamento {
  id: Id
  usuarioId: Id
  /** Sempre numa demanda (horas sem demanda ficam para a v1). */
  demandaId: Id
  /** Copiado da demanda (e acompanha a troca de cliente dela). Nulo = demanda sem cliente. */
  clienteId: Id | null
  /** Dia local do início. */
  data: DataLocal
  /** Nulo = cronômetro ligado (conta a partir de iniciadoEm). */
  minutos: number | null
  iniciadoEm: Instante | null
  paradoEm: Instante | null
  origem: OrigemApontamento
  nota: string | null
  criadoEm: Instante
}

export interface CriarApontamentoEntrada {
  /** Padrão: hoje. */
  data?: DataLocal
  minutos: number
  nota?: string | null
}

/** Editar também vale para conferir um cronômetro parado (minutos). Cronômetro ligado não se edita: pare antes. */
export interface EditarApontamentoEntrada {
  data?: DataLocal
  minutos?: number
  nota?: string | null
}

/** POST /api/demandas/:id/cronometro (iniciar; para o anterior) e POST /api/cronometro/parar. */
export interface CronometroSaida {
  /** O cronômetro ligado agora (nulo depois de parar). */
  ativo: Apontamento | null
  /** O que foi parado nesta chamada (o anterior, ao iniciar outro), já com minutos. */
  parado: Apontamento | null
  /** 'cronometro_longo': passou de cronometroLimiteHoras; gravou o limite e a tela pede para conferir. */
  avisos: ('cronometro_longo')[]
}

/** GET /api/apontamentos. Sem `de`/`ate`: a semana atual (segunda a domingo). No máximo 92 dias (400 validacao). */
export interface ListarApontamentosConsulta {
  demandaId?: Id
  /** Outro usuário: só admin (403). */
  usuarioId?: Id
  clienteId?: Id
  de?: DataLocal
  ate?: DataLocal
}

export interface ListarApontamentosSaida {
  /** Equipe e atendimento recebem só os próprios; admin, os do filtro (todos sem usuarioId). */
  itens: Apontamento[]
  /** Soma de `itens`. */
  totalMin: number
  /** Atendimento e admin: total por cliente no período, de todas as pessoas (sem cliente: clienteId null). */
  porCliente?: { clienteId: Id | null; minutos: number }[]
  /** Só admin: total por pessoa no período. */
  porPessoa?: { usuarioId: Id; minutos: number }[]
  /** Demandas dos itens que não estão no bootstrap (arquivadas, concluídas antigas, de quadro arquivado). */
  extras: Demanda[]
}
