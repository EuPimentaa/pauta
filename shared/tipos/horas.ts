/** Lançar tempo (MVP). Ninguém vê as horas individuais de outra pessoa, exceto o admin. */
import type { DataLocal, Id, Instante } from './nucleo.ts'

export interface Apontamento {
  id: Id
  usuarioId: Id
  demandaId: Id | null
  clienteId: Id | null
  data: DataLocal
  minutos: number
  nota: string | null
  origem: 'manual' | 'timer' | 'importado'
  criadoEm: Instante
}

export interface CriarApontamentoEntrada {
  /** Padrão: hoje. */
  data?: DataLocal
  minutos: number
  nota?: string | null
}

export interface EditarApontamentoEntrada {
  data?: DataLocal
  minutos?: number
  nota?: string | null
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
  /** Executor e atendimento recebem só os próprios. */
  itens: Apontamento[]
  totalMin: number
  /** Atendimento e admin: total por cliente no período. */
  porCliente?: { clienteId: Id; minutos: number }[]
  /** Só admin. */
  porPessoa?: { usuarioId: Id; minutos: number }[]
}
