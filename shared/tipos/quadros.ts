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
  /**
   * Uma coluna por pessoa (modelo "Por pessoa"): quem entra na equipe do quadro ganha a própria coluna, com
   * `responsavelId` (API.md §4.3 e §4.4). Desligar não apaga as colunas que já existem.
   */
  colunaPorMembro: boolean
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
  /**
   * Coluna de uma pessoa ("Rafa" no quadro Por pessoa; só papel normal; uma por pessoa entre as ativas do quadro).
   * Soltar um card aqui põe a pessoa como membro e, se o card veio da coluna de outra pessoa, tira aquela
   * (arrastar entre pessoas reatribui, API.md §5.1). Nulo = coluna comum.
   */
  responsavelId: Id | null
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

export const MEMBROS_AO_MOVER = ['manter', 'responsavel_destino'] as const
/**
 * O que acontece com os membros quando a demanda muda de quadro (automação, "Mover para", "Enviar para"):
 * - manter (padrão): os mesmos membros;
 * - responsavel_destino: os membros passam a ser o responsável do cliente na equipe do quadro de destino
 *   (cliente_responsavel); sem cliente, sem equipe no destino ou sem responsável ativo cadastrado, mantém.
 * Uma coluna de destino com responsável ainda acrescenta a pessoa dela (API.md §5.1).
 */
export type MembrosAoMover = (typeof MEMBROS_AO_MOVER)[number]

export interface AutomacaoQuadro {
  /** `${quadroId}:${gatilho}` (o mesmo id do evento `automacao` em tempo-real.ts). */
  id: string
  quadroId: Id
  gatilho: GatilhoAutomacao
  destinoQuadroId: Id
  destinoColunaId: Id
  /** Ao levar a outro quadro: manter os membros ou trocar pelo responsável do cliente na equipe de destino. */
  membros: MembrosAoMover
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
  /** Coluna de uma pessoa ativa (só papel normal). Ela já tem coluna ativa no quadro: 409 conflito (API.md §4.6). */
  responsavelId?: Id | null
  /** No "Novo quadro": de qual coluna do modelo esta veio (as automações do modelo seguem a coluna; API.md §4.5). */
  modeloColunaId?: Id | null
}

/**
 * POST /api/quadros (admin). Colunas: `colunas` se vier (o "Novo quadro" deixa desmarcar e renomear as sugeridas e
 * manda as colunas das pessoas já expandidas, com `responsavelId`); senão as do modelo, com a coluna por_membro
 * expandida para os membros ativos da equipe. Sem nenhum dos dois: vazio. As automações do modelo nascem junto
 * quando a coluna de destino foi mantida (API.md §4.5).
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
  /** Padrão: true se o modelo tem coluna por_membro (sem `colunas`) ou se alguma coluna do corpo tem responsavelId. */
  colunaPorMembro?: boolean
  /** Padrão true com equipe: os membros da equipe passam a seguir o quadro. */
  membrosDaEquipeSeguem?: boolean
  posicao?: PosicaoRelativa
}

/**
 * POST /api/quadros/:id/copiar (admin), o "Copiar quadro" do Trello: copia colunas ativas (nome, cor, papel, limite e
 * responsável), `colunaPorMembro`, etiquetas, automações (as internas apontam para as colunas copiadas; as que levam
 * a outro quadro continuam apontando para lá) e modelos de demanda do quadro. Sem cards e sem estrelas.
 * Resposta: 201 QuadroCompleto.
 */
export type CopiarQuadroEntrada = Omit<CriarQuadroEntrada, 'colunas' | 'modeloQuadroId' | 'colunaPorMembro'>

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
  colunaPorMembro?: boolean
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
  /** Pessoa ativa da coluna (só papel normal) ou null. */
  responsavelId?: Id | null
  /** Arrastar coluna no quadro. */
  posicao?: PosicaoRelativa
}

export interface EditarColunaSaida {
  coluna: Coluna
  /** Demandas concluídas porque a coluna virou 'concluida'. */
  concluidas: Id[]
}

/**
 * POST /api/colunas/:id/arquivar: só sem cards (API.md §4.6, "cards da coluna"; senão 409 conflito). As concluídas
 * antigas, que já saíram do quadro mas ainda apontam para ela, são arquivadas antes, na mesma transação. Desliga as
 * automações que apontam para ela.
 */
export interface ArquivarColunaSaida {
  coluna: Coluna
  automacoesDesligadas: { quadroId: Id; gatilho: GatilhoAutomacao }[]
  /** Concluídas há mais de quadroConcluidasDias arquivadas junto. */
  concluidasArquivadas: Id[]
}

export const ETIQUETAS_SEM_PAR = ['deixar', 'criar'] as const
/**
 * Etiquetas da demanda sem par de mesmo nome no quadro de destino (API.md §5.6):
 * - deixar (padrão): ficam guardadas no quadro de origem e reaparecem se a demanda voltar para lá;
 * - criar: são criadas no destino com o mesmo nome e cor.
 */
export type EtiquetasSemPar = (typeof ETIQUETAS_SEM_PAR)[number]

/** POST /api/colunas/:id/mover-cards ("Mover todos os cards desta coluna"; só os cards da coluna, API.md §4.6). */
export interface MoverCardsEntrada {
  destinoColunaId: Id
  /** Só quando muda de quadro. Padrão 'deixar'. */
  etiquetasSemPar?: EtiquetasSemPar
  /** Só quando muda de quadro. Padrão 'manter'. */
  membros?: MembrosAoMover
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
  /** Padrão 'manter'. Só faz diferença quando o destino é outro quadro. */
  membros?: MembrosAoMover
  ativa?: boolean
}
