/**
 * Fase 2: agendas externas (Google Agenda pelo endereço secreto iCal) na Agenda, no Início e no MCP.
 * Contrato: docs/API.md §F.9; banco: server/migracoes/103_agenda_externa.sql; pesquisa: docs/fase2/pesquisa-ical.md.
 * O endereço nunca chega ao navegador: a API só devolve `urlDica`. Texto de fora (título, local, descrição) só como
 * texto puro (PLANO §0, regra 9).
 */
import type { Cor, DataLocal, Id, Instante, PosicaoRelativa } from './nucleo.ts'

/** Janela guardada em agenda_ocorrencia, em dias a partir de hoje (São Paulo), inclusive. */
export const JANELA_AGENDA_EXTERNA = { diasAntes: 30, diasDepois: 180 } as const
/** Intervalo da busca automática de cada agenda ativa. */
export const INTERVALO_AGENDA_EXTERNA_MIN = 15
/**
 * De quanto em quanto a tarefa `agenda-busca` confere quais agendas estão devidas (passaram de
 * INTERVALO_AGENDA_EXTERNA_MIN). Com a tarefa a cada 15 min, uma agenda buscada fora dela (cadastro, "Atualizar agora",
 * trocar o endereço, retomar) pulava a rodada seguinte e ficava até 30 min sem busca; conferindo a cada minuto, nenhuma
 * passa de 16 min (revisão funcional da Fase 2, achado 8). A conferência é uma consulta pequena e não gera log.
 */
export const RODADA_AGENDA_EXTERNA_MIN = 1
/** Tetos de uma busca (passou: falha, mantém as ocorrências anteriores e mostra o erro). */
export const TETOS_AGENDA_EXTERNA = {
  bytes: 32 * 1024 * 1024, segundos: 60, ocorrenciasPorSerie: 1000, ocorrenciasPorAgenda: 20000,
} as const

export const ERROS_AGENDA_EXTERNA = [
  'endereco_invalido', 'endereco_ilegivel', 'nao_e_ical', 'grande_demais', 'tempo_esgotado', 'fora_do_ar',
  'teto_ocorrencias',
] as const
/**
 * Erro da última busca (as ocorrências da última busca boa continuam valendo):
 * - endereco_invalido: 404 (endereço errado ou redefinido no Google: "cole o novo");
 * - endereco_ilegivel: não deu para decifrar (o SEGREDO mudou: cole o endereço de novo);
 * - nao_e_ical: 200 sem BEGIN:VCALENDAR (página de login, HTML);
 * - grande_demais: passou de 32 MB; tempo_esgotado: passou de 60 s;
 * - fora_do_ar: 429, 5xx ou rede (tenta de novo na próxima rodada);
 * - teto_ocorrencias: mais de 20.000 ocorrências na janela.
 */
export type ErroAgendaExterna = (typeof ERROS_AGENDA_EXTERNA)[number]

/** Contagens da última busca (agenda_externa.contagens). Nunca conteúdo. */
export interface ContagensAgenda {
  eventos: number
  ocorrencias: number
  /** Séries com RRULE fora do subconjunto (BYSETPOS, BYWEEKNO...): só a 1ª ocorrência aparece. */
  repeticoesNaoEntendidas: number
  /** TZID que o Intl não conhece (usou o VTIMEZONE do arquivo ou São Paulo). */
  fusosDesconhecidos: number
  /** Linhas e componentes ignorados. */
  avisos: number
  bytes: number
  duracaoMs: number
}

/** Uma agenda externa (sem o endereço). Também é o evento de tempo real `agenda_externa` (público interno). */
export interface AgendaExterna {
  id: Id
  nome: string
  cor: Cor
  /** "calendar.google.com · agencia@meltcomunicacao.com.br · …a1b2": o bastante para reconhecer, nunca o token. */
  urlDica: string
  ativa: boolean
  buscadaEm: Instante | null
  okEm: Instante | null
  erro: ErroAgendaExterna | null
  contagens: ContagensAgenda | null
  /** Muda quando as ocorrências mudam: o tratador do SSE invalida ['agenda-externa', 'eventos', …]. */
  ocorrenciasEm: Instante | null
  criadaEm: Instante
}

/** POST /api/agendas-externas (admin). `url`: o "Endereço secreto no formato iCal" (aceita webcal://). */
export interface CriarAgendaExternaEntrada {
  nome: string
  cor?: Cor
  url: string
}

/** PATCH /api/agendas-externas/:id (admin). `url` = colar o endereço novo (o antigo nunca volta para editar). */
export interface EditarAgendaExternaEntrada {
  nome?: string
  cor?: Cor
  ativa?: boolean
  url?: string
  posicao?: PosicaoRelativa
}

/** Uma ocorrência na janela (agenda_ocorrencia). Privado: titulo "Ocupado" e local/descricao/linkReuniao nulos. */
export interface EventoAgendaExterna {
  /** `${agendaId}:${chave}`: estável entre buscas. */
  id: string
  agendaId: Id
  titulo: string
  diaInteiro: boolean
  /** Instantes UTC (nulos no dia inteiro); `fim` exclusivo. */
  inicio: Instante | null
  fim: Instante | null
  /** Datas de São Paulo, inclusive (dia inteiro de 10 a 12/11: diaInicio 10/11, diaFim 12/11). */
  diaInicio: DataLocal
  diaFim: DataLocal
  local: string | null
  /** Só https: (Meet, Zoom, Teams). */
  linkReuniao: string | null
  /** Texto puro, até 2 KB. */
  descricao: string | null
  tentativo: boolean
  livre: boolean
  privado: boolean
}

/** GET /api/agendas-externas/eventos?de=&ate=&agendaIds= (até 62 dias, como a Agenda). */
export interface EventosAgendaConsulta {
  de: DataLocal
  ate: DataLocal
  /** Padrão: todas as ativas. */
  agendaIds?: Id[]
}

export interface EventosAgendaSaida {
  de: DataLocal
  ate: DataLocal
  /** As agendas ativas (para cor, nome e o filtro), com o estado. */
  agendas: AgendaExterna[]
  /** Por diaInicio, dia inteiro primeiro, depois por início e título. */
  eventos: EventoAgendaExterna[]
}
