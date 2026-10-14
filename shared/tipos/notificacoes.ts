/** Sino: notificações no app (só para o destinatário; nunca para o próprio ator). */
import type { Id, Instante } from './nucleo.ts'

export const TIPOS_NOTIFICACAO = [
  'membro',          // você entrou como membro de uma demanda (por outra pessoa)
  'mencao',          // @ em comentário ou na descrição (só menções novas)
  'comentario',      // comentário novo numa demanda em que você é membro ou AM (sem repetir quem foi mencionado)
  'versao_entregue', // versão entregue numa demanda do seu atendimento (AM)
  'aprovada',        // o cliente aprovou (membros e AM)
  'ajuste_pedido',   // o cliente pediu ajuste, ou o atendimento pediu ajuste interno (membros e AM)
  'prazo',           // vence hoje (job diário, 8h; membros, ou o AM se não houver membros)
  'chegou',          // entrou uma demanda num quadro que você segue (criada ou movida de outro quadro)
] as const
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number]

export interface Notificacao {
  id: number
  usuarioId: Id
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
