/** Demanda, briefing, checklists, comentários, anexos, histórico e os DTOs do núcleo da demanda. */
import type { ItemBase, NovoItem } from './arquivos.ts'
import type { Aprovacao, Envio, LinkPublicoResumo, Rodada, VersaoComItens } from './ciclo.ts'
import type {
  Bloqueio, Bola, Categoria, DataLocal, HoraLocal, Id, Instante, Papel, PosicaoRelativa, Prioridade,
} from './nucleo.ts'
import type { RequisitoTransicao } from './config.ts'

export const ORIGENS_DEMANDA = ['manual', 'rapida', 'whatsapp', 'repeticao', 'agente', 'importacao', 'cliente'] as const
export type OrigemDemanda = (typeof ORIGENS_DEMANDA)[number]

/**
 * A demanda como aparece no quadro (bootstrap, eventos, listas). Sem o briefing, que vem no detalhe.
 * Prazo sem hora = 18:00. `comQuemId` não resolve ausência: quem cobre vem de Eu.cobrindo / ausências.
 */
export interface Demanda {
  id: Id
  numero: number
  titulo: string
  clienteId: Id | null
  tipoPecaId: Id | null
  equipeId: Id | null
  fluxoId: Id
  etapaId: Id
  /** = categoria da etapa. */
  status: Categoria
  /** Última troca de etapa: base do "parado há X dias úteis". */
  statusDesde: Instante
  bola: Bola
  comQuemId: Id | null
  bloqueio: Bloqueio | null
  bloqueioMotivo: string | null
  bloqueioDesde: Instante | null
  responsavelId: Id | null
  responsavelSugeridoId: Id | null
  atendimentoId: Id | null
  aprovadorId: Id | null
  solicitanteId: Id
  criadoPor: Id
  briefingCompleto: boolean
  prioridade: Prioridade
  prioridadeMotivo: string | null
  prazo: DataLocal | null
  prazoHora: HoraLocal | null
  /** false = calculado (publicação − folga, ou criação + SLA). */
  prazoManual: boolean
  publicacaoData: DataLocal | null
  publicacaoHora: HoraLocal | null
  planejadaPara: DataLocal | null
  agendadaInicio: Instante | null
  agendadaFim: Instante | null
  local: string | null
  estimativaMin: number | null
  minutosRegistrados: number
  rodadaAtual: number
  rodadasInclusas: number
  aprovadaEm: Instante | null
  aprovadaVersaoId: Id | null
  versaoAtualId: Id | null
  versaoEnviadaId: Id | null
  nVersoes: number
  posicao: number
  origem: OrigemDemanda
  repetidaDeId: Id | null
  nAnexos: number
  nCheckTotal: number
  nCheckFeitos: number
  concluidaEm: Instante | null
  canceladaMotivo: string | null
  arquivadoEm: Instante | null
  rev: number
  criadoEm: Instante
  atualizadoEm: Instante
}

/**
 * Relações do usuário com uma demanda, já contando quem ele cobre hoje (ausência).
 * Calculada por shared/logica/permissoes.ts (relacaoCom) no servidor e no front; base das regras de §7.1.
 */
export interface RelacaoDemanda {
  papel: Papel
  responsavel: boolean
  aprovador: boolean
  /** É o AM (atendimentoId) da demanda. Não confundir com o papel 'atendimento'. */
  atendimento: boolean
  comABola: boolean
  solicitante: boolean
  /** Id de quem eu cubro quando a relação vem da ausência ("cobrindo Samara"). */
  cobrindoId: Id | null
}

/** Valor de um campo do briefing (por tipo de campo: texto/url/data → string; numero; sim_nao; multipla → string[]). */
export type ValorCampo = string | number | boolean | string[] | null

export interface Checklist {
  id: Id
  demandaId: Id
  titulo: string
  /** Não nulo = "Ajustes R{N}". */
  rodadaId: Id | null
  pos: number
  criadoEm: Instante
}

export interface ChecklistItem {
  id: Id
  checklistId: Id
  demandaId: Id
  texto: string
  feitoEm: Instante | null
  feitoPor: Id | null
  pos: number
}

export interface ChecklistComItens extends Checklist {
  itens: ChecklistItem[]
}

export const FINALIDADES_ANEXO = ['referencia', 'evidencia'] as const
export type FinalidadeAnexo = (typeof FINALIDADES_ANEXO)[number]

export interface Anexo extends ItemBase {
  comentarioId: Id | null
  /** evidencia = print do retorno do cliente. */
  finalidade: FinalidadeAnexo
  enviadoPor: Id | null
  criadoEm: Instante
}

export interface Comentario {
  id: Id
  demandaId: Id
  /** Nulo = cliente pelo link. */
  autorId: Id | null
  autorExterno: string | null
  linkId: Id | null
  versaoId: Id | null
  /** Markdown; menção = @[Rafa](mencao:<id>). Comentário excluído chega com corpoMd ''. */
  corpoMd: string
  visivelCliente: boolean
  mencoes: Id[]
  anexos: Anexo[]
  editadoEm: Instante | null
  excluidoEm: Instante | null
  criadoEm: Instante
}

/** GET /api/demandas/:numero: tudo o que o modal mostra, numa ida. */
export interface DemandaDetalhe {
  demanda: Demanda
  briefingMd: string
  briefingCampos: Record<string, ValorCampo>
  /** Chaves dos campos obrigatórios do tipo que faltam ("Briefing incompleto: falta Formato"). */
  briefingFaltando: string[]
  /** Texto colado do WhatsApp; exibir só como texto puro. */
  origemTexto: string | null
  mencoes: Id[]
  checklists: ChecklistComItens[]
  anexos: Anexo[]
  rodadas: Rodada[]
  versoes: VersaoComItens[]
  envios: Envio[]
  aprovacoes: Aprovacao[]
  /** Só para atendimento e admin (os outros recebem []). */
  linksPublicos: LinkPublicoResumo[]
  nComentarios: number
  tempo: { totalMin: number; meusMin: number }
  /** Aviso "prazo curto": prazo a menos de sla_dias_uteis da criação. */
  prazoCurto: boolean
}

// ─────────────────────────────── histórico ───────────────────────────────

export const TIPOS_ATIVIDADE = [
  'demanda.criada', 'demanda.editada', 'demanda.etapa_alterada', 'demanda.responsavel_alterado',
  'demanda.prazo_alterado', 'demanda.prioridade_alterada', 'demanda.bloqueio_alterado', 'demanda.equipe_alterada',
  'demanda.arquivada', 'demanda.restaurada', 'demanda.excluida', 'demanda.repetida', 'demanda.pegada',
  'triagem.aceita', 'triagem.recusada',
  'rodada.aberta', 'rodada.extra_marcada', 'rodada.extra_desmarcada',
  'versao.entregue', 'versao.enviada', 'link.gerado', 'link.revogado', 'link.visto',
  'retorno.registrado', 'aprovacao.anulada',
  'comentario.criado', 'comentario.editado', 'comentario.excluido',
  'anexo.adicionado', 'anexo.removido',
  'checklist.criado', 'checklist.removido', 'checklist.item_feito', 'checklist.item_desfeito',
  'tempo.lancado',
  'cliente.criado', 'cliente.editado',
] as const
export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number]

/** Formato de `dados` por tipo (o que o histórico precisa para escrever a frase). `antes` guarda os valores anteriores. */
export interface MapaDadosAtividade {
  'demanda.criada': { origem: OrigemDemanda; etapaId: Id }
  'demanda.editada': { campos: string[] }
  'demanda.etapa_alterada': { de: Id; para: Id; deCategoria: Categoria; paraCategoria: Categoria; motivo?: string }
  'demanda.responsavel_alterado': { de: Id | null; para: Id | null }
  'demanda.prazo_alterado': { prazo: DataLocal | null; prazoHora: HoraLocal | null; manual: boolean }
  'demanda.prioridade_alterada': { prioridade: Prioridade; motivo: string | null }
  'demanda.bloqueio_alterado': { bloqueio: Bloqueio | null; motivo: string | null }
  'demanda.equipe_alterada': { de: Id | null; para: Id | null }
  'demanda.arquivada': Record<string, never>
  'demanda.restaurada': { etapaId: Id }
  'demanda.excluida': Record<string, never>
  'demanda.repetida': { novaId: Id; novaNumero: number } | { origemId: Id; origemNumero: number }
  'demanda.pegada': Record<string, never>
  'triagem.aceita': { equipeId: Id | null }
  'triagem.recusada': { motivo: string }
  'rodada.aberta': { rodadaId: Id; numero: number; origem: 'cliente' | 'interna'; motivo: string; prazo: DataLocal; itens: number; extra: boolean }
  'rodada.extra_marcada': { rodadaId: Id; numero: number }
  'rodada.extra_desmarcada': { rodadaId: Id; numero: number }
  'versao.entregue': { versaoId: Id; numero: number; itens: number }
  'versao.enviada': { versaoId: Id; numero: number; via: 'link' | 'fora'; canal: string | null; contatoId: Id | null }
  'link.gerado': { linkId: Id }
  'link.revogado': { linkId: Id }
  'link.visto': { linkId: Id }
  'retorno.registrado': { aprovacaoId: Id; versaoNumero: number; decisao: 'aprovado' | 'ajuste'; via: 'link' | 'manual'; quem: string }
  'aprovacao.anulada': { aprovacaoId: Id; versaoNumero: number }
  'comentario.criado': { comentarioId: Id; visivelCliente: boolean }
  'comentario.editado': { comentarioId: Id }
  'comentario.excluido': { comentarioId: Id }
  'anexo.adicionado': { anexoId: Id; nome: string; tipo: string }
  'anexo.removido': { anexoId: Id; nome: string }
  'checklist.criado': { checklistId: Id; titulo: string }
  'checklist.removido': { checklistId: Id; titulo: string }
  'checklist.item_feito': { itemId: Id; texto: string }
  'checklist.item_desfeito': { itemId: Id; texto: string }
  'tempo.lancado': { apontamentoId: Id; minutos: number }
  'cliente.criado': { clienteId: Id; sigla: string }
  'cliente.editado': { clienteId: Id; campos: string[] }
}

export const ATORES_ATIVIDADE = ['usuario', 'cliente', 'sistema', 'agente', 'importacao'] as const
export type AtorAtividade = (typeof ATORES_ATIVIDADE)[number]

export interface Atividade<T extends TipoAtividade = TipoAtividade> {
  id: number
  demandaId: Id | null
  clienteId: Id | null
  atorId: Id | null
  atorTipo: AtorAtividade
  tipo: T
  dados: MapaDadosAtividade[T]
  antes: Record<string, unknown> | null
  criadoEm: Instante
}

// ─────────────────────────────── DTOs: criar e editar ───────────────────────────────

export interface CriarDemandaEntrada {
  titulo: string
  clienteId?: Id | null
  tipoPecaId?: Id | null
  /** Padrão: equipe do tipo. */
  equipeId?: Id | null
  briefingMd?: string
  briefingCampos?: Record<string, ValorCampo>
  /** Texto colado do WhatsApp (guardado como veio). */
  origemTexto?: string | null
  origem?: 'manual' | 'whatsapp'
  publicacaoData?: DataLocal | null
  publicacaoHora?: HoraLocal | null
  /** Informar prazo torna prazoManual = true. */
  prazo?: DataLocal | null
  prazoHora?: HoraLocal | null
  agendadaInicio?: Instante | null
  agendadaFim?: Instante | null
  local?: string | null
  /** Padrões: SPEC §5.8 (AM do cliente; criativo/social do cliente como sugerido). */
  responsavelId?: Id | null
  atendimentoId?: Id | null
  aprovadorId?: Id | null
  prioridade?: Prioridade
  prioridadeMotivo?: string | null
  estimativaMin?: number | null
  planejadaPara?: DataLocal | null
  links?: NovoItem[]
  /** 'auto' (padrão): Na fila se tiver cliente e tipo e o papel permitir; senão Triagem. */
  destino?: 'auto' | 'triagem'
  posicao?: PosicaoRelativa
}

export const AVISOS_CRIACAO = ['prazo_curto', 'briefing_incompleto', 'senha_detectada', 'sem_responsavel'] as const
export type AvisoCriacao = (typeof AVISOS_CRIACAO)[number]

export interface CriarDemandaSaida {
  demanda: Demanda
  destino: 'fila' | 'triagem'
  avisos: AvisoCriacao[]
}

/**
 * PATCH /api/demandas/:id com If-Match: <rev>. Executor (sendo responsável) só pode CAMPOS_EDITAVEIS_EXECUTOR.
 * Etapa não muda por aqui (use /mover). Mudar briefing recalcula briefingCompleto; mudar publicação/tipo recalcula
 * o prazo se prazoManual = false; mandar `prazo` torna prazoManual = true (e `prazoManual: false` volta ao cálculo).
 */
export interface EditarDemandaEntrada {
  titulo?: string
  clienteId?: Id | null
  tipoPecaId?: Id | null
  equipeId?: Id | null
  responsavelId?: Id | null
  responsavelSugeridoId?: Id | null
  atendimentoId?: Id | null
  aprovadorId?: Id | null
  briefingMd?: string
  briefingCampos?: Record<string, ValorCampo>
  prioridade?: Prioridade
  prioridadeMotivo?: string | null
  prazo?: DataLocal | null
  prazoHora?: HoraLocal | null
  prazoManual?: boolean
  publicacaoData?: DataLocal | null
  publicacaoHora?: HoraLocal | null
  planejadaPara?: DataLocal | null
  agendadaInicio?: Instante | null
  agendadaFim?: Instante | null
  local?: string | null
  estimativaMin?: number | null
  bloqueio?: Bloqueio | null
  bloqueioMotivo?: string | null
  rodadasInclusas?: number
}

/** SPEC §7.1: o que o executor edita quando é o responsável. Fora disso: 403 campo_nao_permitido. */
export const CAMPOS_EDITAVEIS_EXECUTOR = [
  'briefingMd', 'briefingCampos', 'estimativaMin', 'planejadaPara', 'bloqueio', 'bloqueioMotivo',
] as const satisfies readonly (keyof EditarDemandaEntrada)[]

export interface EditarDemandaSaida {
  demanda: Demanda
  avisos: AvisoCriacao[]
}

/**
 * POST /api/demandas/:id/mover: troca de etapa, reatribuição e ordem numa transação só (arrastar no quadro).
 * Informe etapaId OU direcao (ou nenhum dos dois, para só reordenar/reatribuir/planejar).
 */
export interface MoverEntrada {
  etapaId?: Id
  direcao?: 'proxima' | 'anterior'
  /** Agrupado por responsável: soltar na coluna de outra pessoa (executor só pode a si mesmo). */
  responsavelId?: Id | null
  /** Minha semana / agrupado por dia: grava planejada_para (o prazo não muda). */
  planejadaPara?: DataLocal | null
  posicao?: PosicaoRelativa
  /** Para transições que requerem motivo (cancelar). */
  motivo?: string
  /** Para transições que requerem confirmação (Com o cliente → Entregue). */
  confirmar?: boolean
  /** Rev que o cliente tinha; se vier e não bater, 409 conflito_rev. */
  rev?: number
}

export interface MoverSaida {
  demanda: Demanda
}

export const DIALOGOS_TRANSICAO = [
  'entregar_versao', 'enviar_ao_cliente', 'registrar_retorno', 'devolver_ajuste', 'confirmar', 'motivo', 'anular_aprovacao',
] as const
export type DialogoTransicao = (typeof DIALOGOS_TRANSICAO)[number]

/** `detalhes` do 409 requer_dialogo. */
export interface DetalhesRequerDialogo {
  requer: RequisitoTransicao[]
  dialogo: DialogoTransicao
  paraEtapaId: Id
}

export interface ArquivarEntreguesEntrada {
  /** Arquivar estas (todas precisam estar em concluido/cancelado). */
  demandaIds?: Id[]
  /** Ou todas as entregues da equipe (nulo = todas). */
  equipeId?: Id | null
}

export interface ArquivarEntreguesSaida {
  arquivadas: Id[]
}

export interface RepetirEntrada {
  publicacaoData?: DataLocal | null
  publicacaoHora?: HoraLocal | null
  prazo?: DataLocal | null
  prazoHora?: HoraLocal | null
  titulo?: string
}

export interface AceitarTriagemEntrada {
  clienteId: Id
  tipoPecaId: Id
  equipeId?: Id | null
  responsavelId?: Id | null
  titulo?: string
}

export interface RecusarTriagemEntrada {
  motivo: string
}

export interface ExcluirDemandaEntrada {
  /** Digitar o número confirma a anonimização. */
  confirmarNumero: number
}

// ─────────────────────────────── DTOs: criação rápida e colar do WhatsApp ───────────────────────────────

/** Contexto da coluna onde a pessoa digitou (N). */
export interface ContextoRapida {
  etapaId?: Id
  responsavelId?: Id | null
  clienteId?: Id
  tipoPecaId?: Id
  equipeId?: Id
  planejadaPara?: DataLocal
}

export interface CriarRapidaEntrada {
  texto: string
  contexto?: ContextoRapida
  posicao?: PosicaoRelativa
}

/** Marcador reconhecido no texto (só casamento exato no MVP: `HE:`, `[HE]`, `HE -`, `@rafa`). */
export interface MarcadorRapida {
  tipo: 'cliente' | 'pessoa'
  texto: string
  inicio: number
  fim: number
  id: Id
}

export interface AnaliseRapida {
  titulo: string
  clienteId: Id | null
  responsavelId: Id | null
  tipoPecaId: Id | null
  marcadores: MarcadorRapida[]
  /** Linha de prévia: "HE · Carrossel · Rafa · sex, 17/10, 18h". */
  previa: string
  /** Para onde vai se criar agora. */
  destino: 'fila' | 'triagem'
  falta: ('cliente' | 'tipo')[]
}

export interface CriarRapidaSaida extends CriarDemandaSaida {
  analise: AnaliseRapida
}

export interface AnalisarTextoEntrada {
  texto: string
}

/** "Colar do WhatsApp": reconhece "[14/10 15:32] Fulana:" e sugere cliente e tipo. */
export interface AnaliseTexto {
  tituloSugerido: string
  autor: string | null
  recebidoEm: Instante | null
  clientes: { id: Id; confianca: number; casou: string }[]
  tipos: { id: Id; confianca: number; casou: string }[]
  responsavelSugeridoId: Id | null
  /** true quando cliente e tipo foram reconhecidos com confiança ≥ 0,9: cria direto em Na fila. */
  reconhecido: boolean
  senhaDetectada: boolean
}

// ─────────────────────────────── DTOs: checklists, comentários, anexos ───────────────────────────────

export interface CriarChecklistEntrada {
  titulo: string
  itens?: string[]
}

export interface EditarChecklistEntrada {
  titulo?: string
  posicao?: PosicaoRelativa
}

export interface CriarItensEntrada {
  /** Uma linha = um item. */
  textos: string[]
  posicao?: PosicaoRelativa
}

export interface EditarItemEntrada {
  texto?: string
  feito?: boolean
  posicao?: PosicaoRelativa
}

export interface CriarComentarioEntrada {
  corpoMd: string
  visivelCliente?: boolean
  versaoId?: Id | null
  /** Anexos já criados com POST /api/demandas/:id/anexos (ficam presos ao comentário). */
  anexoIds?: Id[]
}

export interface EditarComentarioEntrada {
  corpoMd?: string
  visivelCliente?: boolean
}

export interface ComentarioSaida {
  comentario: Comentario
  avisos: ('senha_detectada')[]
}

export type CriarAnexoEntrada = NovoItem & { finalidade?: FinalidadeAnexo }

export interface EditarAnexoEntrada {
  nome?: string
  posicao?: PosicaoRelativa
}

// ─────────────────────────────── busca e arquivo ───────────────────────────────

export interface BuscaConsulta {
  /** "#4521", "4521", "he outubro" (apelido do cliente + texto), texto livre (FTS por prefixo, sem acento). */
  q: string
  limite?: number
  incluirArquivadas?: boolean
}

export interface ResultadoBuscaDemanda {
  id: Id
  numero: number
  titulo: string
  clienteId: Id | null
  status: Categoria
  arquivado: boolean
  /** Trecho com o termo (texto puro; o front destaca). */
  trecho: string | null
}

export interface BuscaSaida {
  demandas: ResultadoBuscaDemanda[]
}

export interface ListarArquivoConsulta {
  clienteId?: Id
  /** Mês de arquivamento "YYYY-MM". */
  mes?: string
  tipoPecaId?: Id
  q?: string
  cursor?: string
  limite?: number
}

export interface ListarHistoricoConsulta {
  cursor?: string
  limite?: number
}
