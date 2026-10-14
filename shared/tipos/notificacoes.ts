/** Sino: notificações no app (só para o destinatário, já resolvido para o substituto). */
import type { Id, Instante } from './nucleo.ts'

export const TIPOS_NOTIFICACAO = [
  'atribuida',            // virou responsável
  'voltou',               // a bola voltou para você (ex.: Revisão → Ajustes, aprovador recebe Revisão)
  'mencao',               // @ em comentário ou briefing (só menções novas)
  'aprovada',             // cliente aprovou (AM e responsável)
  'ajuste_pedido',        // cliente pediu ajuste (AM e responsável)
  'triagem',              // chegou item na triagem (atendimento; aprovador da equipe para rascunho de agente)
  'fila_sem_responsavel', // distribuidor da equipe: chegou demanda em Na fila sem responsável
  'prazo',                // vence hoje (job diário, 8h)
  'cobertura',            // você começou a cobrir alguém hoje
] as const
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number]

export interface Notificacao {
  id: number
  usuarioId: Id
  /** Preenchido quando a notificação era de quem você cobre ("cobrindo Samara"). */
  cobrindoId: Id | null
  tipo: TipoNotificacao
  demandaId: Id | null
  /** Número da demanda para montar o link /d/:numero sem consultar o cache. */
  demandaNumero: number | null
  atorId: Id | null
  resumo: string
  lidaEm: Instante | null
  criadoEm: Instante
}

export interface ListarNotificacoesConsulta {
  /** Cursor: id da última notificação já recebida (pagina para trás). */
  antesDe?: number
  limite?: number
  soNaoLidas?: boolean
}

export interface ListarNotificacoesSaida {
  itens: Notificacao[]
  naoLidas: number
  proximo: number | null
}

/** POST /api/notificacoes/lidas: sem `ids` marca todas até `ate` (inclusive), ou todas. */
export interface MarcarLidasEntrada {
  ids?: number[]
  ate?: number
}
