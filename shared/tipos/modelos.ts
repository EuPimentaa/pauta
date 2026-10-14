/**
 * Modelos de quadro (colunas e automações sugeridas do "Novo quadro"; seed, só leitura no MVP: para repetir um quadro
 * montado, use "Copiar quadro") e modelos de demanda (no lugar dos tipos de peça com campos): briefing-modelo em
 * Markdown, checklist padrão, etiquetas padrão e prazo em dias úteis.
 */
import type { Cor, Id, Instante, PapelColuna, PosicaoRelativa, Prioridade } from './nucleo.ts'
import type { GatilhoAutomacao } from './quadros.ts'

export interface ModeloQuadroColuna {
  id: Id
  nome: string
  cor: Cor | null
  papel: PapelColuna
  /** true = vira uma coluna por membro ativo da equipe (nome = apelido ou nome; cor = cor da pessoa). */
  porMembro: boolean
  pos: number
}

/** Automação sugerida pelo modelo, para uma coluna do próprio modelo (nunca a por_membro). */
export interface ModeloQuadroAutomacao {
  gatilho: GatilhoAutomacao
  /** Id de ModeloQuadroColuna. Se a coluna for desmarcada no "Novo quadro", a automação não nasce. */
  destinoColunaId: Id
}

export interface ModeloQuadro {
  id: Id
  nome: string
  descricao: string
  pos: number
  colunas: ModeloQuadroColuna[]
  /** Kanban simples: enviado ao cliente → Com o cliente; ajuste pedido → Fazendo. */
  automacoes: ModeloQuadroAutomacao[]
}

export interface ModeloDemandaItem {
  id: Id
  /** Nome do checklist em que o item entra ('Checklist' por padrão). */
  checklist: string
  texto: string
  pos: number
}

/** Etiqueta padrão por NOME: ao aplicar, casa com a etiqueta do quadro de mesmo nome ou é criada com esta cor. */
export interface ModeloDemandaEtiqueta {
  nome: string
  cor: Cor
}

export interface ModeloDemanda {
  id: Id
  /** Nulo = global (todos os quadros). */
  quadroId: Id | null
  nome: string
  /** Linha de ajuda na grade da Nova demanda. */
  descricao: string
  /** Nome do ícone lucide ('image', 'clapperboard'). */
  icone: string | null
  /** Vira a descrição da demanda (títulos ## guiam quem pede). */
  briefingMd: string
  /** Prazo padrão = hoje + N dias úteis (nulo = sem prazo padrão). */
  prazoDiasUteis: number | null
  prioridade: Prioridade | null
  estimativaMin: number | null
  /** Nulo = as do cliente. */
  rodadasInclusas: number | null
  ativo: boolean
  pos: number
  itens: ModeloDemandaItem[]
  etiquetas: ModeloDemandaEtiqueta[]
  atualizadoEm: Instante
}

// ─────────────────────────────── DTOs ───────────────────────────────

/** POST /api/modelos-demanda. Global: admin. De um quadro: qualquer interno. */
export interface CriarModeloDemandaEntrada {
  quadroId?: Id | null
  nome: string
  descricao?: string
  icone?: string | null
  briefingMd?: string
  prazoDiasUteis?: number | null
  prioridade?: Prioridade | null
  estimativaMin?: number | null
  rodadasInclusas?: number | null
  itens?: { checklist?: string; texto: string }[]
  etiquetas?: ModeloDemandaEtiqueta[]
}

/** PATCH /api/modelos-demanda/:id. `itens` e `etiquetas` substituem a lista inteira. "Excluir" = ativo false. */
export type EditarModeloDemandaEntrada = Partial<Omit<CriarModeloDemandaEntrada, 'quadroId'>> & {
  ativo?: boolean
  posicao?: PosicaoRelativa
}

/** POST /api/modelos-demanda/revisados (admin; "Revisei os modelos" dos Primeiros passos). */
export interface ModelosRevisadosSaida {
  modelosRevisadosEm: Instante
}
