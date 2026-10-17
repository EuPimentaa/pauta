/**
 * Telas que juntam todos os quadros: Início (/inicio) e Agenda (/agenda).
 * As listas devolvem ids; os objetos vêm do cache do bootstrap. Demandas fora do cache (concluídas há mais de
 * quadroConcluidasDias, de quadro arquivado) vêm em `extras`. O front pode calcular as mesmas listas com
 * shared/logica/paineis.ts. "Minhas" = sou membro ou o AM da demanda (ehMinha(), shared/logica/quadro.ts).
 */
import type { Feriado, PrimeirosPassos } from './config.ts'
import type { Demanda } from './demandas.ts'
import type { Notificacao } from './notificacoes.ts'
import type { DataLocal, HoraLocal, Id } from './nucleo.ts'

/** Minhas demandas abertas por prazo (estadoPrazo; a semana começa na segunda). Ordem: prazo, hora, prioridade. */
export interface MinhasPorPrazo {
  atrasadas: Id[]
  hoje: Id[]
  /** Do dia seguinte até domingo desta semana. */
  semana: Id[]
  /** Com o cliente (estado `pausado`), tenham prazo ou não: as enviadas há mais tempo primeiro (integração 3B). */
  comCliente: Id[]
  depois: Id[]
  semPrazo: Id[]
}

/** GET /api/inicio */
export interface InicioSaida {
  minhas: MinhasPorPrazo
  /** Só quem tem papel atendimento: as do meu atendimento com o cliente há mais de clienteParadoDiasUteis. */
  comClienteParado: Id[]
  /** Minhas menções recentes (últimas 10 notificações 'mencao', lidas ou não). */
  mencoes: Notificacao[]
  /** "3 atrasadas · 2 para hoje · 4 com o cliente". */
  resumo: { atrasadas: number; hoje: number; comCliente: number }
  /** Só admin, enquanto faltar algo. */
  primeirosPassos: PrimeirosPassos | null
  extras: Demanda[]
}

export const CAMPOS_AGENDA = ['prazo', 'inicio', 'publicacao'] as const
/** Qual data posicionou o item na Agenda. Arrastar só muda o `prazo` (os outros campos são só exibidos). */
export type CampoAgenda = (typeof CAMPOS_AGENDA)[number]

export interface AgendaConsulta {
  /** Inclusive. No máximo 62 dias entre `de` e `ate` (400 validacao). */
  de: DataLocal
  ate: DataLocal
  /** "Só as minhas". */
  soMinhas?: boolean
  /** Padrão: todos os quadros ativos. */
  quadroIds?: Id[]
  /** Padrão ['prazo']. */
  campos?: CampoAgenda[]
  /** Padrão true (concluídas aparecem riscadas). */
  incluirConcluidas?: boolean
}

export interface ItemAgenda {
  demandaId: Id
  campo: CampoAgenda
  data: DataLocal
  hora: HoraLocal | null
}

/** GET /api/agenda: calendário de todos os quadros (mês e semana; a semana começa na segunda). */
export interface AgendaSaida {
  de: DataLocal
  ate: DataLocal
  /** Ordenados por data, hora (sem hora por último no dia) e número. */
  itens: ItemAgenda[]
  feriados: Feriado[]
  /** Demandas que não estão no bootstrap. */
  extras: Demanda[]
}
