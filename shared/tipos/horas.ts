/**
 * Horas: "Lançar tempo" e cronômetro (no máximo um ligado por pessoa). Ninguém vê as horas individuais de outra
 * pessoa, exceto o admin; os outros veem só demanda.minutosRegistrados.
 */
import type { DataLocal, Id, Instante } from './nucleo.ts'

export const ORIGENS_APONTAMENTO = ['manual', 'cronometro', 'importado'] as const
export type OrigemApontamento = (typeof ORIGENS_APONTAMENTO)[number]

export interface Apontamento {
  id: Id
  usuarioId: Id
  demandaId: Id | null
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

export interface ListarApontamentosConsulta {
  demandaId?: Id
  /** Outro usuário: só admin. */
  usuarioId?: Id
  clienteId?: Id
  de?: DataLocal
  ate?: DataLocal
}

export interface ListarApontamentosSaida {
  /** Equipe e atendimento recebem só os próprios. */
  itens: Apontamento[]
  totalMin: number
  /** Atendimento e admin: total por cliente no período. */
  porCliente?: { clienteId: Id; minutos: number }[]
  /** Só admin. */
  porPessoa?: { usuarioId: Id; minutos: number }[]
}
