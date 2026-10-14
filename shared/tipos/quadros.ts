/**
 * Quadros separados por equipe (docs/ADAPTACOES.md, "Modelo de quadros"): quadro, coluna, etiqueta, estrela/seguir
 * e as 4 automações simples. Todos os internos veem e editam todos os quadros; só admin cria, renomeia, arquiva e
 * exclui quadro; qualquer interno mexe em colunas e etiquetas.
 */
import type { Demanda } from './demandas.ts'
import type { Cor, FundoQuadro, Id, Instante, PapelColuna, PosicaoRelativa, Prioridade } from './nucleo.ts'

// ─────────────────────────────── filtros e visões do quadro (URL) ───────────────────────────────

export const VISOES_QUADRO = ['quadro', 'lista', 'calendario'] as const
/** Alternância Quadro | Lista | Calendário em /q/:slug?v=. A escolhida por quadro fica no localStorage. */
export type VisaoQuadro = (typeof VISOES_QUADRO)[number]

export const FILTROS_PRAZO = ['atrasado', 'hoje', 'semana', 'sem_prazo'] as const
/** Pelo estadoPrazo() (API.md §5.2): 'atrasado' = estado 'atrasada' (com o cliente nunca é atrasada). */
export type FiltroPrazo = (typeof FILTROS_PRAZO)[number]

/**
 * Filtros do quadro (e da Lista e do Calendário dele), na URL `?f=` (base64url do JSON). Todos os campos são E entre
 * si; listas são OU dentro do campo. aplicarFiltros() em shared/logica/filtros.ts.
 */
export interface FiltrosQuadro {
  /** "Só as minhas" (Q): sou membro ou o AM (ehMinha). */
  soMinhas?: boolean
  clientes?: Id[]
  /** 'nenhum' = sem membros. */
  membros?: (Id | 'nenhum')[]
  /** 'nenhuma' = sem etiquetas. */
  etiquetas?: (Id | 'nenhuma')[]
  prazo?: FiltroPrazo
  prioridades?: Prioridade[]
  /** Só as com o cliente (comQuemEsta = 'cliente'). */
  comCliente?: boolean
  /** Padrão 'mostrar'. */
  concluidas?: 'mostrar' | 'esconder' | 'so'
  /** Título, número e cliente (sem acento, sem caixa). */
  texto?: string
}

export interface Quadro {
  id: Id
  nome: string
  /** /q/:slug. Não muda ao renomear (só por PATCH explícito do slug). */
  slug: string
  descricao: string
  cor: Cor
  fundo: FundoQuadro
  equipeId: Id | null
  modeloQuadroId: Id | null
  /** Ordem no menu lateral (dentro do grupo da equipe). */
  pos: number
  arquivadoEm: Instante | null
  criadoPor: Id | null
  criadoEm: Instante
}

export interface Coluna {
  id: Id
  quadroId: Id
  nome: string
  /** Nula = sem cor. Com cor, o fundo da coluna é levemente tingido (tom pastel AA nos dois temas) + ponto no título. */
  cor: Cor | null
  papel: PapelColuna
  /** Só aviso: o contador fica "6/5" em destaque; nada é bloqueado. */
  limiteWip: number | null
  pos: number
  arquivadaEm: Instante | null
}

export interface Etiqueta {
  id: Id
  quadroId: Id
  /** '' = etiqueta só de cor. */
  nome: string
  cor: Cor
  pos: number
}

export const GATILHOS_AUTOMACAO = ['enviado_ao_cliente', 'ajuste_pedido', 'aprovado', 'concluida'] as const
/**
 * Quando o gatilho acontece com a demanda NESTE quadro, ela vai para a coluna de destino (pode ser de outro quadro):
 * - enviado_ao_cliente: "Enviar ao cliente" (link ou por fora);
 * - ajuste_pedido: o cliente pediu ajuste (link, "Registrar retorno");
 * - aprovado: o cliente aprovou (link, "Registrar retorno", "Aprovado pelo WhatsApp");
 * - concluida: alguém marcou a demanda como concluída (checkbox/ação), não ao soltar numa coluna 'concluida'.
 */
export type GatilhoAutomacao = (typeof GATILHOS_AUTOMACAO)[number]
export const ROTULO_GATILHO: Record<GatilhoAutomacao, string> = {
  enviado_ao_cliente: 'Ao enviar ao cliente, mover para',
  ajuste_pedido: 'Quando o cliente pedir ajuste, mover para',
  aprovado: 'Quando o cliente aprovar, mover para',
  concluida: 'Ao marcar concluída, mover para',
}

export interface AutomacaoQuadro {
  quadroId: Id
  gatilho: GatilhoAutomacao
  destinoQuadroId: Id
  destinoColunaId: Id
  /** Arquivar a coluna de destino desliga a automação (o serviço avisa). */
  ativa: boolean
  atualizadoPor: Id | null
  atualizadoEm: Instante
}

/** Estrela e "Seguir" de uma pessoa num quadro (evento `quadro_usuario`, público usuario). */
export interface QuadroUsuario {
  quadroId: Id
  /** Não nulo = estrela (ordem entre os favoritos). */
  favoritoPos: number | null
  seguindo: boolean
}

// ─────────────────────────────── DTOs: quadros ───────────────────────────────

export interface NovaColuna {
  nome: string
  cor?: Cor | null
  papel?: PapelColuna
  limiteWip?: number | null
}

/**
 * POST /api/quadros (admin). Colunas: `colunas` se vier (o "Novo quadro" deixa desmarcar e renomear as sugeridas);
 * senão as do modelo, com a coluna por_membro expandida para os membros ativos da equipe. Sem nenhum dos dois: vazio.
 */
export interface CriarQuadroEntrada {
  nome: string
  /** Padrão: gerado do nome (minúsculo, sem acento, hífens), com sufixo -2, -3 se repetir. */
  slug?: string
  descricao?: string
  cor?: Cor
  fundo?: FundoQuadro
  equipeId?: Id | null
  modeloQuadroId?: Id | null
  colunas?: NovaColuna[]
  /** Padrão true com equipe: os membros da equipe passam a seguir o quadro. */
  membrosDaEquipeSeguem?: boolean
  posicao?: PosicaoRelativa
}

export interface QuadroCompleto {
  quadro: Quadro
  colunas: Coluna[]
  etiquetas: Etiqueta[]
  automacoes: AutomacaoQuadro[]
}

export interface EditarQuadroEntrada {
  nome?: string
  slug?: string
  descricao?: string
  cor?: Cor
  fundo?: FundoQuadro
  equipeId?: Id | null
  posicao?: PosicaoRelativa
}

export interface ListarQuadrosConsulta {
  /** true = só os arquivados (para "Quadros arquivados" em Configurações). */
  arquivados?: boolean
}

/** PUT /api/quadros/:id/favorito */
export interface FavoritoEntrada {
  favorito: boolean
  /** Ordem entre os meus favoritos (arrastar no menu). Padrão: no fim. */
  posicao?: { depoisDeQuadroId?: Id | null }
}

/** PUT /api/quadros/:id/seguir */
export interface SeguirEntrada {
  seguindo: boolean
}

// ─────────────────────────────── DTOs: colunas ───────────────────────────────

export type CriarColunaEntrada = NovaColuna & { posicao?: PosicaoRelativa }

export interface EditarColunaEntrada {
  nome?: string
  cor?: Cor | null
  /** Virar 'concluida' conclui as demandas abertas da coluna, sem criar repetições (resposta: `concluidas`). */
  papel?: PapelColuna
  limiteWip?: number | null
  /** Arrastar coluna no quadro. */
  posicao?: PosicaoRelativa
}

export interface EditarColunaSaida {
  coluna: Coluna
  /** Demandas concluídas porque a coluna virou 'concluida'. */
  concluidas: Id[]
}

/** POST /api/colunas/:id/arquivar: só vazia (409 conflito com cards ativos). Desliga automações que apontam para ela. */
export interface ArquivarColunaSaida {
  coluna: Coluna
  automacoesDesligadas: { quadroId: Id; gatilho: GatilhoAutomacao }[]
}

/** POST /api/colunas/:id/mover-cards ("Mover todos os cards desta coluna"). */
export interface MoverCardsEntrada {
  destinoColunaId: Id
  /** Etiquetas sem par no quadro de destino (só quando muda de quadro). Padrão 'remover' (API.md §5.6). */
  etiquetasSemPar?: 'remover' | 'criar'
}

export interface MoverCardsSaida {
  movidas: Id[]
  /** Repetições criadas por cards que entraram numa coluna 'concluida'. */
  proximas: Demanda[]
}

/** POST /api/colunas/:id/arquivar-cards ("Arquivar todos os cards desta coluna"). */
export interface ArquivarCardsSaida {
  arquivadas: Id[]
}

export const ORDENS_COLUNA = ['prazo', 'prioridade', 'criacao', 'titulo', 'cliente'] as const
/** "Ordenar por…" do menu da coluna: reordena uma vez (grava as posições), como no Trello. */
export type OrdemColuna = (typeof ORDENS_COLUNA)[number]

export interface OrdenarColunaEntrada {
  por: OrdemColuna
}

export interface OrdenarColunaSaida {
  /** Ids na ordem nova (as posições vão por evento `demanda`). */
  ordem: Id[]
}

// ─────────────────────────────── DTOs: etiquetas e automações ───────────────────────────────

export interface CriarEtiquetaEntrada {
  nome?: string
  cor: Cor
  posicao?: PosicaoRelativa
}

export interface EditarEtiquetaEntrada {
  nome?: string
  cor?: Cor
  posicao?: PosicaoRelativa
}

/** PUT /api/quadros/:id/automacoes/:gatilho. O quadro de destino é o da coluna. */
export interface DefinirAutomacaoEntrada {
  destinoColunaId: Id
  ativa?: boolean
}
