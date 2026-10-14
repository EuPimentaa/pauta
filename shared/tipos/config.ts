/** Configuração: fluxo, etapas, transições, tipos de peça, feriados, visões e parâmetros da aplicação. */
import type {
  Bloqueio, Bola, Categoria, Cor, CorEtapa, DataLocal, HoraLocal, Id, Instante, Prioridade,
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

/**
 * Linha da tabela `transicao`. `de: '*'` = qualquer; `para: 'anterior'` = Demanda.etapaAnteriorId.
 * A linha com `de` exato tem precedência sobre a de `*` (ex.: triagem → cancelado); as duas nunca se combinam.
 */
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
 * `ou`: a demanda também passa se casar com algum dos filtros da lista (um nível só; `ou` dentro de `ou` é ignorado).
 *   Ex.: Social = equipe Social nas etapas da equipe, OU qualquer demanda em Agendar.
 * Visão na tela = escopo(visao.filtros, com `ou`) E chips da URL (`?f=`, sem `ou`).
 * aplicarFiltros (shared/logica/filtros.ts) exclui SEMPRE o status triagem: a Triagem tem tela própria (SPEC §5.1).
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
  /** Pelo estadoPrazo() (API.md §5.2): 'atrasado' = estado 'atrasada'; peça com o cliente nunca é atrasada. */
  prazo?: FiltroPrazo
  /** 'comigo' = bola com eu (ou quem eu cubro). */
  bola?: Bola[] | 'comigo'
  bloqueio?: Bloqueio[]
  texto?: string
  /** "Só as minhas" (Q): responsável, atendimento ou bola = eu. */
  soMinhas?: boolean
  /** Alternativas em OU com o resto do filtro (só em visao.filtros; a URL não usa). */
  ou?: FiltrosVisao[]
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
  /** Primeiros passos: quando o admin apertou "Revisei os tipos" (nulo = ainda não). */
  tiposRevisadosEm: Instante | null
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
  tiposRevisadosEm: 'passos.tipos_revisados_em',
}

/** Parâmetros numéricos de ConfigApp. */
export type ParametroNumerico = Exclude<keyof ConfigApp, 'prazoHoraPadrao' | 'tiposRevisadosEm'>

/**
 * Faixas aceitas no PATCH /api/config/app (zod; fora delas, 400 validacao). Os de segurança têm teto curto.
 * `demandaNumeroInicial` também precisa ser maior que o maior número existente.
 */
export const FAIXAS_CONFIG: Record<ParametroNumerico, readonly [min: number, max: number]> = {
  demandaNumeroInicial: [1, 1_000_000_000],
  paradoLimiteDiasUteis: [1, 30],
  clienteParadoDiasUteis: [1, 30],
  linkPublicoValidadeDias: [1, 90],
  linkPublicoArquivoMinutos: [1, 15],
  conviteValidadeDias: [1, 14],
  redefinicaoValidadeHoras: [1, 24],
  sessaoValidadeDias: [1, 30],
  eventoRetencaoDias: [7, 90],
  uploadLimiteBytes: [1, 10_485_760],
  arquivoLixoDias: [1, 365],
  backupManter: [1, 60],
  quadroEntregueDias: [1, 60],
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

/**
 * PATCH /api/config/app (admin). Números dentro de FAIXAS_CONFIG; `prazoHoraPadrao` em HH:MM.
 * `tiposRevisados: true` grava tiposRevisadosEm = agora (botão "Revisei os tipos" dos Primeiros passos).
 */
export type EditarConfigAppEntrada = Partial<Pick<ConfigApp, ParametroNumerico | 'prazoHoraPadrao'>> & {
  tiposRevisados?: true
}

/** GET/PATCH /api/config/app */
export interface ConfigAppSaida {
  info: InfoApp
  config: ConfigApp
}

export const PASSOS_INICIAIS = [
  'convidar_equipe', 'cadastrar_clientes', 'revisar_tipos', 'aprovadores_distribuidores',
] as const
export type PassoInicial = (typeof PASSOS_INICIAIS)[number]

/**
 * "Primeiros passos do admin" no Início enquanto faltar algo (ADAPTACOES). Critério de `feito` (API.md §4.13):
 * - convidar_equipe: pelo menos 2 usuários ativos (o admin e mais alguém);
 * - cadastrar_clientes: pelo menos 1 cliente fora de 'ex' e nenhum deles com a pendência sem_am;
 * - revisar_tipos: ConfigApp.tiposRevisadosEm preenchido (botão "Revisei os tipos");
 * - aprovadores_distribuidores: toda equipe ativa e executora com distribuidor. O aprovador é opcional
 *   (sem aprovador, o AM da demanda aprova; com aprovador, ele usa "Liberar para envio").
 * `concluido` = todos feitos; aí o Início devolve primeirosPassos = null.
 */
export interface PrimeirosPassos {
  itens: { id: PassoInicial; rotulo: string; caminho: string; feito: boolean }[]
  concluido: boolean
}

/** Cor da etapa como token CSS (--label-grafite, --info, ...). Ajuda o front. */
export type CorToken = Cor | CorEtapa
