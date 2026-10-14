/**
 * Tempo real (SSE em GET /api/eventos), bootstrap e sync.
 *
 * Fio do SSE (um evento por mutação gravada na tabela `evento`, na mesma transação):
 *   id: <seq>\nevent: d\ndata: <JSON de EventoTempoReal>\n\n
 *   event: resync\ndata: {"motivo":"..."}\n\n      → recarregar /api/bootstrap
 *   event: ping\ndata: {"seq":<seq atual>}\n\n      → a cada 25 s (revalida a sessão)
 * Reconexão (API.md §3; igual em /api/sync): atual = seq em sqlite_sequence. desde > atual → resync
 * 'servidor_reiniciado'; desde < atual e (tabela vazia ou desde < menor seq − 1) → resync 'historico_podado'; senão
 * reenvia seq > desde. A poda nunca apaga o último evento.
 * O cliente ignora eventos cujo `t` (trace) seja de uma mutação que ele mesmo fez.
 */
import type { Anexo, Checklist, ChecklistItem, Comentario, Demanda } from './demandas.ts'
import type { Aprovacao, Envio, LinkPublicoResumo, Rodada, VersaoComItens } from './ciclo.ts'
import type { ClienteContato, ClienteLink, ClienteResumo } from './clientes.ts'
import type { ConfigApp, Feriado, InfoApp } from './config.ts'
import type { Apontamento } from './horas.ts'
import type { ModeloDemanda, ModeloQuadro } from './modelos.ts'
import type { Notificacao } from './notificacoes.ts'
import type { Id } from './nucleo.ts'
import type { AutomacaoQuadro, Coluna, Etiqueta, Quadro, QuadroUsuario } from './quadros.ts'
import type { Equipe, Eu, UsuarioResumo } from './pessoas.ts'

/**
 * Entidade do evento → objeto. Público de cada uma:
 * - interno (todos os usuários ativos): quadro, coluna, etiqueta, automacao, modelo_demanda, demanda, checklist,
 *   checklist_item, comentario, anexo, rodada, versao, envio, aprovacao, cliente, cliente_contato, cliente_link,
 *   usuario, equipe, feriado
 * - gestao (atendimento e admin; filtrado no servidor): link_publico
 * - usuario (só o dono): notificacao, quadro_usuario (estrela e seguir)
 * - usuario_admin (o dono + admins): apontamento. Os outros só veem demanda.minutosRegistrados, num evento com
 *   `a` e `t` nulos (não revela quem lançou)
 * Ids: automacao = `${quadroId}:${gatilho}`; quadro_usuario = quadroId; feriado = a data; notificacao = o número.
 */
export interface MapaEntidades {
  quadro: Quadro
  coluna: Coluna
  etiqueta: Etiqueta
  automacao: AutomacaoQuadro
  quadro_usuario: QuadroUsuario
  modelo_demanda: ModeloDemanda
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
  feriado: Feriado
  notificacao: Notificacao
  apontamento: Apontamento
}

export type Entidade = keyof MapaEntidades

export const ENTIDADES = [
  'quadro', 'coluna', 'etiqueta', 'automacao', 'quadro_usuario', 'modelo_demanda', 'demanda', 'checklist',
  'checklist_item', 'comentario', 'anexo', 'rodada', 'versao', 'envio', 'aprovacao', 'link_publico', 'cliente',
  'cliente_contato', 'cliente_link', 'usuario', 'equipe', 'feriado', 'notificacao', 'apontamento',
] as const satisfies readonly Entidade[]

/** interno = todos; gestao = atendimento + admin; usuario = só usuario_id; usuario_admin = usuario_id + admins; admin. */
export const PUBLICOS_EVENTO = ['interno', 'gestao', 'usuario', 'usuario_admin', 'admin'] as const
export type PublicoEvento = (typeof PUBLICOS_EVENTO)[number]

/** Campos comuns. Nomes curtos porque trafegam muito. */
interface EventoBase<E extends Entidade> {
  /** seq (= id do SSE). */
  s: number
  e: E
  /** Id da entidade (ver MapaEntidades). */
  id: string
  /** Demanda a que pertence (para atualizar o detalhe aberto). Nulo em cadastros. */
  d: Id | null
  /** trace_id da mutação (X-Trace-Id), para ignorar o próprio eco. */
  t: string | null
  /** Ator (usuário) ou nulo (cliente pelo link, sistema, automação). */
  a: Id | null
}

/**
 * `c` nulo = objeto inteiro: na criação e sempre que uma demanda ENTRA no conjunto do bootstrap (restaurar,
 * desmarcar concluída antiga), porque as outras janelas não a têm. Patch parcial de id desconhecido é ignorado.
 * Quadro restaurado (`quadro` com arquivadoEm nulo depois de não nulo): o tratador recarrega o bootstrap.
 */
export interface EventoUpsert<E extends Entidade> extends EventoBase<E> {
  op: 'upsert'
  /** Objeto inteiro quando `c` é nulo; senão só os campos de `c`. */
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

/** servidor_reiniciado: o `desde` do cliente é maior que o seq atual (backup restaurado, banco novo). */
export interface EventoResync {
  motivo: 'historico_podado' | 'papel_alterado' | 'servidor_reiniciado'
}

export interface EventoPing {
  seq: number
}

/** Nomes de evento no fio do SSE. */
export const EVENTOS_SSE = { dado: 'd', resync: 'resync', ping: 'ping' } as const

/**
 * GET /api/bootstrap: tudo o que a interface precisa para abrir sem esperar (todos os quadros saem daqui).
 * Quadros: os ativos (os arquivados vêm por GET /api/quadros?arquivados=1). Colunas, etiquetas e automações dos
 * quadros ativos (colunas só as não arquivadas). Demandas: dos quadros ativos, não arquivadas, não excluídas e
 * abertas ou concluídas há no máximo quadroConcluidasDias.
 * `seq` é o último seq gravado antes da leitura: abrir o SSE com Last-Event-ID = seq.
 */
export interface Bootstrap {
  seq: number
  app: InfoApp
  config: ConfigApp
  eu: Eu
  usuarios: UsuarioResumo[]
  equipes: Equipe[]
  clientes: ClienteResumo[]
  quadros: Quadro[]
  colunas: Coluna[]
  etiquetas: Etiqueta[]
  automacoes: AutomacaoQuadro[]
  modelosQuadro: ModeloQuadro[]
  /** Ativos (globais e de quadros ativos). */
  modelosDemanda: ModeloDemanda[]
  /** Ano corrente e o próximo. */
  feriados: Feriado[]
  demandas: Demanda[]
  naoLidas: number
}

/** GET /api/sync?desde=N: alternativa ao SSE (polling com backoff 5 s → 60 s), mesmo filtro de público. */
export type SyncSaida =
  | { resync: false; seq: number; eventos: EventoTempoReal[] }
  | { resync: true; seq: number }
