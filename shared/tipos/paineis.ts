/**
 * Telas pessoais: Início, Minha semana e Triagem.
 * As listas devolvem ids; os objetos vêm do cache do bootstrap. Demandas fora do cache (ex.: concluídas há mais de
 * 7 dias numa semana passada) vêm em `extras`. O front pode calcular as mesmas listas com shared/logica/paineis.ts.
 */
import type { Demanda } from './demandas.ts'
import type { PrimeirosPassos } from './config.ts'
import type { DataLocal, Id } from './nucleo.ts'

export interface ItemComVoce {
  demandaId: Id
  /** Preenchido quando a bola é de quem você cobre ("cobrindo Samara"). */
  cobrindoId: Id | null
}

/** GET /api/inicio */
export interface InicioSaida {
  /** Planejada para hoje, prazo hoje ou horário marcado hoje (horário primeiro). */
  hoje: Id[]
  /** Bola comigo ou com quem eu cubro: prioridade, prazo, hora do prazo, posição. */
  comVoce: ItemComVoce[]
  /** Na fila sem responsável das minhas equipes (botão Pegar). */
  filaEquipe: Id[]
  /** Só AM: com o cliente há mais de N dias úteis (N = clienteParadoDiasUteis). */
  comClienteParado: Id[]
  atrasadas: Id[]
  /** "3 demandas atrasadas · 2 na triagem". */
  resumo: { atrasadas: number; triagem: number; comVoce: number }
  /** Só admin, enquanto faltar algo. */
  primeirosPassos: PrimeirosPassos | null
}

export interface SemanaConsulta {
  /** Outra pessoa: atendimento e admin. Padrão: eu. */
  usuarioId?: Id
  /** Segunda-feira da semana. Padrão: a semana atual. */
  inicio?: DataLocal
}

/** Como o card foi posicionado: planejada (normal), prazo (borda tracejada) ou horário marcado (topo). */
export type PosicionadoPor = 'planejada' | 'prazo' | 'horario'

export interface DiaSemana {
  data: DataLocal
  feriado: string | null
  /** Horário marcado primeiro (ordenado por hora), depois as outras. */
  demandaIds: Id[]
}

/** GET /api/semana */
export interface SemanaSaida {
  usuarioId: Id
  inicio: DataLocal
  fim: DataLocal
  /** Seg a sex, mais sábado. */
  dias: DiaSemana[]
  /** Antes de hoje e não concluídas (só na semana atual). */
  atrasadas: Id[]
  /** Sem planejada_para nem prazo. */
  semDia: Id[]
  posicionadoPor: Record<Id, PosicionadoPor>
  /** Demandas que não estão no bootstrap. */
  extras: Demanda[]
}

export interface SugestaoTriagem {
  id: Id
  /** 0 a 1. */
  confianca: number
  /** Trecho do texto que casou ("hospital evangelico"). */
  casou: string
}

export interface ItemTriagem {
  demandaId: Id
  origem: Demanda['origem']
  /** Texto puro. */
  origemTexto: string | null
  criadoPor: Id
  sugestoes: {
    clientes: SugestaoTriagem[]
    tipos: SugestaoTriagem[]
    responsavelId: Id | null
    equipeId: Id | null
  }
  rascunhoAgente: boolean
}

/** GET /api/triagem (ordenado do mais antigo para o mais novo). */
export interface TriagemSaida {
  itens: ItemTriagem[]
}
