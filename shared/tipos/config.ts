/** Configuração: feriados, parâmetros da aplicação e Primeiros passos do admin. */
import type { DataLocal, HoraLocal, Instante } from './nucleo.ts'

export const TIPOS_FERIADO = ['nacional', 'estadual', 'municipal', 'facultativo'] as const
export type TipoFeriado = (typeof TIPOS_FERIADO)[number]

/** Todo feriado cadastrado é dia não útil (prazo do modelo, repetição, rodadas, "parado há"). */
export interface Feriado {
  data: DataLocal
  nome: string
  tipo: TipoFeriado
}

// ─────────────────────────────── parâmetros da aplicação ───────────────────────────────

/** Tabela `configuracao` em camelCase. O nome do produto vem de APP_NOME (env), não daqui. */
export interface ConfigApp {
  demandaNumeroInicial: number
  prazoHoraPadrao: HoraLocal
  paradoLimiteDiasUteis: number
  clienteParadoDiasUteis: number
  /** Prazo de retorno padrão no "Enviar ao cliente" (hoje + N dias úteis). */
  retornoPrazoDiasUteis: number
  /** Prazo padrão da rodada de ajuste (hoje + N dias úteis). */
  ajustePrazoDiasUteis: number
  linkPublicoValidadeDias: number
  linkPublicoArquivoMinutos: number
  conviteValidadeDias: number
  redefinicaoValidadeHoras: number
  sessaoValidadeDias: number
  eventoRetencaoDias: number
  uploadLimiteBytes: number
  arquivoLixoDias: number
  backupManter: number
  /** Concluídas saem do quadro (e do bootstrap) depois de N dias; ficam no Arquivo. */
  quadroConcluidasDias: number
  /** Cronômetro parado depois disso conta só o limite e avisa para conferir. */
  cronometroLimiteHoras: number
  /** Primeiros passos: quando o admin apertou "Revisei os modelos" (nulo = ainda não). */
  modelosRevisadosEm: Instante | null
}

/** Mapa chave do banco → campo de ConfigApp (o servidor converte nos dois sentidos). */
export const CHAVES_CONFIG: Record<keyof ConfigApp, string> = {
  demandaNumeroInicial: 'demanda.numero_inicial',
  prazoHoraPadrao: 'prazo.hora_padrao',
  paradoLimiteDiasUteis: 'parado.limite_dias_uteis',
  clienteParadoDiasUteis: 'cliente.parado_dias_uteis',
  retornoPrazoDiasUteis: 'retorno.prazo_dias_uteis',
  ajustePrazoDiasUteis: 'ajuste.prazo_dias_uteis',
  linkPublicoValidadeDias: 'link_publico.validade_dias',
  linkPublicoArquivoMinutos: 'link_publico.arquivo_minutos',
  conviteValidadeDias: 'convite.validade_dias',
  redefinicaoValidadeHoras: 'redefinicao.validade_horas',
  sessaoValidadeDias: 'sessao.validade_dias',
  eventoRetencaoDias: 'evento.retencao_dias',
  uploadLimiteBytes: 'upload.limite_bytes',
  arquivoLixoDias: 'arquivo.lixo_dias',
  backupManter: 'backup.manter',
  quadroConcluidasDias: 'quadro.concluidas_dias',
  cronometroLimiteHoras: 'cronometro.limite_horas',
  modelosRevisadosEm: 'passos.modelos_revisados_em',
}

/** Parâmetros numéricos de ConfigApp. */
export type ParametroNumerico = Exclude<keyof ConfigApp, 'prazoHoraPadrao' | 'modelosRevisadosEm'>

/**
 * Faixas aceitas no PATCH /api/config/app (zod; fora delas, 400 validacao). Os de segurança têm teto curto.
 * `demandaNumeroInicial` também precisa ser maior que o maior número existente.
 */
export const FAIXAS_CONFIG: Record<ParametroNumerico, readonly [min: number, max: number]> = {
  demandaNumeroInicial: [1, 1_000_000_000],
  paradoLimiteDiasUteis: [1, 30],
  clienteParadoDiasUteis: [1, 30],
  retornoPrazoDiasUteis: [1, 30],
  ajustePrazoDiasUteis: [0, 30],
  linkPublicoValidadeDias: [1, 90],
  linkPublicoArquivoMinutos: [1, 15],
  conviteValidadeDias: [1, 14],
  redefinicaoValidadeHoras: [1, 24],
  sessaoValidadeDias: [1, 30],
  eventoRetencaoDias: [7, 90],
  uploadLimiteBytes: [1, 10_485_760],
  arquivoLixoDias: [1, 365],
  backupManter: [1, 60],
  quadroConcluidasDias: [1, 60],
  cronometroLimiteHoras: [1, 24],
}

/** Nome e ambiente vindos do servidor (env). */
export interface InfoApp {
  nome: string
  url: string
  versao: string
}

// ─────────────────────────────── DTOs ───────────────────────────────

export interface CriarFeriadoEntrada {
  data: DataLocal
  nome: string
  tipo?: TipoFeriado
}

/**
 * PATCH /api/config/app (admin). Números dentro de FAIXAS_CONFIG; `prazoHoraPadrao` em HH:MM.
 * `modelosRevisados: true` grava modelosRevisadosEm = agora (botão "Revisei os modelos" dos Primeiros passos).
 */
export type EditarConfigAppEntrada = Partial<Pick<ConfigApp, ParametroNumerico | 'prazoHoraPadrao'>> & {
  modelosRevisados?: true
}

/** GET/PATCH /api/config/app */
export interface ConfigAppSaida {
  info: InfoApp
  config: ConfigApp
}

// ─────────────────────────────── Primeiros passos ───────────────────────────────

export const PASSOS_INICIAIS = ['criar_quadros', 'convidar_equipe', 'cadastrar_clientes', 'revisar_modelos'] as const
export type PassoInicial = (typeof PASSOS_INICIAIS)[number]

/**
 * "Primeiros passos do admin" no Início enquanto faltar algo (ADAPTACOES). Critério de `feito` (API.md §4.17):
 * - criar_quadros: pelo menos 1 quadro ativo (o atalho cria os das equipes de uma vez a partir do modelo sugerido);
 * - convidar_equipe: pelo menos 2 usuários ativos (o admin e mais alguém);
 * - cadastrar_clientes: pelo menos 1 cliente fora de 'ex' e nenhum deles com a pendência sem_am;
 * - revisar_modelos: ConfigApp.modelosRevisadosEm preenchido (botão "Revisei os modelos").
 * `concluido` = todos feitos; aí o Início devolve primeirosPassos = null.
 */
export interface PrimeirosPassos {
  itens: { id: PassoInicial; rotulo: string; caminho: string; feito: boolean }[]
  concluido: boolean
}
