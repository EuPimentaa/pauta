/** Configuração: fluxo, etapas, transições, tipos de peça, feriados, visões e parâmetros da aplicação. */
import type {
  Bloqueio, Bola, Categoria, Cor, CorEtapa, DataLocal, HoraLocal, Id, Prioridade,
} from './nucleo.ts'

export interface Fluxo {
  id: Id
  nome: string
  padrao: boolean
}

export const APLICA_SE = ['sempre', 'aprovacao_cliente', 'publicacao'] as const
export type AplicaSe = (typeof APLICA_SE)[number]

export interface Etapa {
  id: Id
  fluxoId: Id
  nome: string
  categoria: Categoria
  bola: Bola
  pausaSla: boolean
  /** Esconde a etapa quando o tipo não tem aprovação do cliente / publicação. */
  aplicaSe: AplicaSe
  /** 'social_do_cliente': ao entrar, responsável = cliente.socialId (Agendar). */
  responsavelRegra: 'social_do_cliente' | null
  cor: CorEtapa
  pos: number
}

export const QUEM_TRANSICAO = ['admin', 'atendimento', 'responsavel', 'aprovador', 'cliente'] as const
/**
 * admin/atendimento = papel. responsavel/aprovador = relação com a demanda (inclui quem cobre a pessoa ausente).
 * cliente = decisão pelo link público.
 */
export type QuemTransicao = (typeof QUEM_TRANSICAO)[number]

export const REQUISITOS_TRANSICAO = [
  'cliente_e_tipo',        // demanda com cliente e tipo de peça
  'motivo',                // corpo traz motivo (cancelar, recusar)
  'versao_nova',           // só pelo "Entregar versão" (diálogo)            → dialogo 'entregar_versao'
  'envio',                 // só pelo "Enviar ao cliente" (diálogo)           → dialogo 'enviar_ao_cliente'
  'retorno',               // só pelo "Registrar retorno" ou pelo link         → dialogo 'registrar_retorno'
  'rodada',                // abre rodada interna (itens, motivo, prazo)       → dialogo 'devolver_ajuste'
  'confirmacao',           // corpo traz confirmar: true                       → dialogo 'confirmar'
  'anular_aprovacao',      // só pelo desfazer da aprovação                    → dialogo 'anular_aprovacao'
  'com_aprovacao_cliente', // tipo.aprovacaoCliente = true
  'sem_aprovacao_cliente', // tipo.aprovacaoCliente = false
  'com_publicacao',        // tipo.publicacao = true
  'sem_publicacao',        // tipo.publicacao = false
] as const
export type RequisitoTransicao = (typeof REQUISITOS_TRANSICAO)[number]

/** Linha da tabela `transicao`. `de: '*'` = qualquer; `para: 'anterior'` = etapa anterior no histórico. */
export interface Transicao {
  de: Categoria | '*'
  para: Categoria | 'anterior'
  quem: QuemTransicao[]
  requer: RequisitoTransicao[]
  /** Mensagem para quem não pode (tooltip do destino esmaecido e erro 403). */
  negado: string
}

export const TIPOS_CAMPO = ['texto', 'texto_longo', 'numero', 'data', 'selecao', 'multipla', 'url', 'sim_nao'] as const
export type TipoCampo = (typeof TIPOS_CAMPO)[number]

export interface TipoPecaCampo {
  id: Id
  tipoPecaId: Id
  /** snake_case; chave em demanda.briefingCampos. */
  chave: string
  rotulo: string
  tipo: TipoCampo
  /** Só para selecao e multipla. */
  opcoes: string[] | null
  obrigatorio: boolean
  ajuda: string | null
  pos: number
}

export interface TipoPeca {
  id: Id
  nome: string
  slug: string
  equipeId: Id | null
  aprovacaoCliente: boolean
  publicacao: boolean
  comHorario: boolean
  slaDiasUteis: number
  slaAjusteDiasUteis: number
  folgaAprovacaoDias: number
  estimativaMin: number | null
  /** Nulo = usa o do cliente. */
  rodadasInclusas: number | null
  checklistPadrao: string[]
  ativo: boolean
  pos: number
  campos: TipoPecaCampo[]
}

export const TIPOS_FERIADO = ['nacional', 'estadual', 'municipal', 'facultativo'] as const
export type TipoFeriado = (typeof TIPOS_FERIADO)[number]

/** Todo feriado cadastrado é dia não útil. */
export interface Feriado {
  data: DataLocal
  nome: string
  tipo: TipoFeriado
}

// ─────────────────────────────── visões ───────────────────────────────

export const LAYOUTS = ['quadro', 'lista', 'semana'] as const
export type Layout = (typeof LAYOUTS)[number]

export const AGRUPAMENTOS = ['etapa', 'responsavel', 'cliente', 'dia'] as const
export type AgruparPor = (typeof AGRUPAMENTOS)[number]

export const FILTROS_PRAZO = ['atrasado', 'hoje', '7dias', 'sem_prazo'] as const
export type FiltroPrazo = (typeof FILTROS_PRAZO)[number]

/**
 * Filtros de uma visão (JSON em visao.filtros) e da URL (`?f=` = base64url do JSON).
 * Todos os campos são E entre si; listas são OU dentro do campo. 'eu' resolve para mim + quem eu cubro.
 */
export interface FiltrosVisao {
  equipes?: Id[]
  categorias?: Categoria[]
  clientes?: Id[]
  /** 'nenhum' = sem responsável. */
  responsaveis?: (Id | 'eu' | 'nenhum')[]
  atendimento?: 'eu' | Id[]
  tipos?: Id[]
  prioridades?: Prioridade[]
  prazo?: FiltroPrazo
  /** 'comigo' = bola com eu (ou quem eu cubro). */
  bola?: Bola[] | 'comigo'
  bloqueio?: Bloqueio[]
  texto?: string
  /** "Só as minhas" (Q): responsável, atendimento ou bola = eu. */
  soMinhas?: boolean
}

export interface Visao {
  id: Id
  nome: string
  slug: string
  equipeId: Id | null
  donoId: Id | null
  layout: Layout
  agruparPor: AgruparPor
  filtros: FiltrosVisao
  /** Categorias recolhidas por padrão (pílulas de 44 px). */
  recolhidas: Categoria[]
  icone: string | null
  pos: number
}

// ─────────────────────────────── parâmetros da aplicação ───────────────────────────────

/** Tabela `configuracao` em camelCase. Nome do produto vem de APP_NOME (env), não daqui. */
export interface ConfigApp {
  demandaNumeroInicial: number
  prazoHoraPadrao: HoraLocal
  paradoLimiteDiasUteis: number
  clienteParadoDiasUteis: number
  linkPublicoValidadeDias: number
  linkPublicoArquivoMinutos: number
  conviteValidadeDias: number
  redefinicaoValidadeHoras: number
  sessaoValidadeDias: number
  eventoRetencaoDias: number
  uploadLimiteBytes: number
  arquivoLixoDias: number
  backupManter: number
  quadroEntregueDias: number
}

/** Mapa chave do banco → campo de ConfigApp (o servidor converte nos dois sentidos). */
export const CHAVES_CONFIG: Record<keyof ConfigApp, string> = {
  demandaNumeroInicial: 'demanda.numero_inicial',
  prazoHoraPadrao: 'prazo.hora_padrao',
  paradoLimiteDiasUteis: 'parado.limite_dias_uteis',
  clienteParadoDiasUteis: 'cliente.parado_dias_uteis',
  linkPublicoValidadeDias: 'link_publico.validade_dias',
  linkPublicoArquivoMinutos: 'link_publico.arquivo_minutos',
  conviteValidadeDias: 'convite.validade_dias',
  redefinicaoValidadeHoras: 'redefinicao.validade_horas',
  sessaoValidadeDias: 'sessao.validade_dias',
  eventoRetencaoDias: 'evento.retencao_dias',
  uploadLimiteBytes: 'upload.limite_bytes',
  arquivoLixoDias: 'arquivo.lixo_dias',
  backupManter: 'backup.manter',
  quadroEntregueDias: 'quadro.entregue_dias',
}

/** Nome e ambiente vindos do servidor (env). */
export interface InfoApp {
  nome: string
  url: string
  versao: string
}

// ─────────────────────────────── DTOs ───────────────────────────────

export interface CriarTipoPecaEntrada {
  nome: string
  slug: string
  equipeId?: Id | null
  aprovacaoCliente?: boolean
  publicacao?: boolean
  comHorario?: boolean
  slaDiasUteis?: number
  slaAjusteDiasUteis?: number
  folgaAprovacaoDias?: number
  estimativaMin?: number | null
  rodadasInclusas?: number | null
  checklistPadrao?: string[]
}

export type EditarTipoPecaEntrada = Partial<CriarTipoPecaEntrada> & {
  ativo?: boolean
  posicao?: { depoisDeId?: Id | null }
}

/** Substitui a lista de campos na ordem dada. Com `id` atualiza; sem `id` cria; ausentes são removidos. */
export interface DefinirCamposEntrada {
  campos: {
    id?: Id
    chave: string
    rotulo: string
    tipo: TipoCampo
    opcoes?: string[] | null
    obrigatorio?: boolean
    ajuda?: string | null
  }[]
}

export interface CriarFeriadoEntrada {
  data: DataLocal
  nome: string
  tipo?: TipoFeriado
}

export interface EditarVisaoEntrada {
  nome?: string
  layout?: Layout
  agruparPor?: AgruparPor
  filtros?: FiltrosVisao
  recolhidas?: Categoria[]
  icone?: string | null
  posicao?: { depoisDeId?: Id | null }
}

export type EditarConfigAppEntrada = Partial<ConfigApp>

/** GET/PATCH /api/config/app */
export interface ConfigAppSaida {
  info: InfoApp
  config: ConfigApp
}

export const PASSOS_INICIAIS = [
  'convidar_equipe', 'cadastrar_clientes', 'revisar_tipos', 'aprovadores_distribuidores',
] as const
export type PassoInicial = (typeof PASSOS_INICIAIS)[number]

/** "Primeiros passos do admin" no Início enquanto faltar algo (ADAPTACOES). */
export interface PrimeirosPassos {
  itens: { id: PassoInicial; rotulo: string; caminho: string; feito: boolean }[]
  concluido: boolean
}

/** Cor da etapa como token CSS (--label-grafite, --info, ...). Ajuda o front. */
export type CorToken = Cor | CorEtapa
