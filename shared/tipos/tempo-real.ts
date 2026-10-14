/**
 * Tempo real (SSE em GET /api/eventos), bootstrap e sync.
 *
 * Fio do SSE (um evento por mutação gravada na tabela `evento`, na mesma transação):
 *   id: <seq>\nevent: d\ndata: <JSON de EventoTempoReal>\n\n
 *   event: resync\ndata: {"motivo":"..."}\n\n      → recarregar /api/bootstrap
 *   event: ping\ndata: {"seq":<seq atual>}\n\n      → a cada 25 s (revalida a sessão)
 * Reconexão: o navegador manda Last-Event-ID; se for menor que o menor seq guardado (7 dias), vem resync.
 * O cliente ignora eventos cujo `t` (trace) seja de uma mutação que ele mesmo fez.
 */
import type { Anexo, Checklist, ChecklistItem, Comentario, Demanda } from './demandas.ts'
import type { Aprovacao, Envio, LinkPublicoResumo, Rodada, VersaoComItens } from './ciclo.ts'
import type { ClienteContato, ClienteLink, ClienteResumo } from './clientes.ts'
import type { ConfigApp, Etapa, Feriado, Fluxo, InfoApp, TipoPeca, Transicao, Visao } from './config.ts'
import type { Apontamento } from './horas.ts'
import type { Aviso } from './mural.ts'
import type { Notificacao } from './notificacoes.ts'
import type { Id } from './nucleo.ts'
import type { Ausencia, Equipe, Eu, UsuarioResumo } from './pessoas.ts'

/**
 * Entidade do evento → objeto. Público de cada uma (SPEC §7.3):
 * - interno (todos os usuários ativos): demanda, checklist, checklist_item, comentario, anexo, rodada, versao, envio,
 *   aprovacao, cliente, cliente_contato, cliente_link, usuario, equipe, ausencia, tipo_peca, etapa, visao, feriado, aviso
 * - interno, mas só atendimento e admin aplicam: link_publico (os outros recebem e descartam)
 * - usuario (só o destinatário): notificacao
 * - usuario_admin (o dono + admins): apontamento (os outros só veem demanda.minutosRegistrados)
 */
export interface MapaEntidades {
  demanda: Demanda
  checklist: Checklist
  checklist_item: ChecklistItem
  comentario: Comentario
  anexo: Anexo
  rodada: Rodada
  versao: VersaoComItens
  envio: Envio
  aprovacao: Aprovacao
  link_publico: LinkPublicoResumo
  cliente: ClienteResumo
  cliente_contato: ClienteContato
  cliente_link: ClienteLink
  usuario: UsuarioResumo
  equipe: Equipe
  ausencia: Ausencia
  tipo_peca: TipoPeca
  etapa: Etapa
  visao: Visao
  feriado: Feriado
  aviso: Aviso
  notificacao: Notificacao
  apontamento: Apontamento
}

export type Entidade = keyof MapaEntidades

export const ENTIDADES = [
  'demanda', 'checklist', 'checklist_item', 'comentario', 'anexo', 'rodada', 'versao', 'envio', 'aprovacao',
  'link_publico', 'cliente', 'cliente_contato', 'cliente_link', 'usuario', 'equipe', 'ausencia', 'tipo_peca',
  'etapa', 'visao', 'feriado', 'aviso', 'notificacao', 'apontamento',
] as const satisfies readonly Entidade[]

export const PUBLICOS_EVENTO = ['interno', 'usuario', 'usuario_admin', 'admin'] as const
export type PublicoEvento = (typeof PUBLICOS_EVENTO)[number]

/** Campos comuns. Nomes curtos porque trafegam muito. */
interface EventoBase<E extends Entidade> {
  /** seq (= id do SSE). */
  s: number
  e: E
  /** Id da entidade (feriado: a data; notificacao: o número em texto). */
  id: string
  /** Demanda a que pertence (para atualizar o detalhe aberto). Nulo em cadastros. */
  d: Id | null
  /** trace_id da mutação (X-Trace-Id), para ignorar o próprio eco. */
  t: string | null
  /** Ator (usuário) ou nulo (cliente pelo link, sistema). */
  a: Id | null
}

export interface EventoUpsert<E extends Entidade> extends EventoBase<E> {
  op: 'upsert'
  /** Objeto inteiro quando `c` é nulo (criação); senão só os campos de `c`. */
  p: Partial<MapaEntidades[E]>
  c: (keyof MapaEntidades[E])[] | null
}

export interface EventoDelete<E extends Entidade> extends EventoBase<E> {
  op: 'delete'
  p: null
  c: null
}

export type EventoDe<E extends Entidade> = EventoUpsert<E> | EventoDelete<E>

/** União discriminada por `e` (e depois por `op`). */
export type EventoTempoReal = { [E in Entidade]: EventoDe<E> }[Entidade]

export interface EventoResync {
  motivo: 'historico_podado' | 'papel_alterado' | 'servidor_reiniciado' | 'importacao'
}

export interface EventoPing {
  seq: number
}

/** Nomes de evento no fio do SSE. */
export const EVENTOS_SSE = { dado: 'd', resync: 'resync', ping: 'ping' } as const

/**
 * GET /api/bootstrap: tudo o que a interface precisa para abrir sem esperar (o quadro inteiro sai daqui).
 * Demandas: não arquivadas e não excluídas, abertas ou concluídas/canceladas nos últimos N dias (quadroEntregueDias).
 * `seq` é o último seq gravado antes da leitura: abrir o SSE com Last-Event-ID = seq.
 */
export interface Bootstrap {
  seq: number
  app: InfoApp
  config: ConfigApp
  eu: Eu
  usuarios: UsuarioResumo[]
  equipes: Equipe[]
  /** Vigentes e futuras. */
  ausencias: Ausencia[]
  clientes: ClienteResumo[]
  tipos: TipoPeca[]
  fluxos: Fluxo[]
  etapas: Etapa[]
  transicoes: Transicao[]
  visoes: Visao[]
  /** Ano corrente e o próximo. */
  feriados: Feriado[]
  demandas: Demanda[]
  /** Itens na triagem (para o contador do menu). */
  triagem: number
  naoLidas: number
}

/** GET /api/sync?desde=N: alternativa ao SSE (polling com backoff 5 s → 60 s), mesmo filtro de público. */
export type SyncSaida =
  | { resync: false; seq: number; eventos: EventoTempoReal[] }
  | { resync: true; seq: number }
