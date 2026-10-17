/** Clientes, apelidos, responsáveis por equipe, contatos que aprovam e links. */
import type { Canal, Cor, Id, Instante, PosicaoRelativa } from './nucleo.ts'

export const STATUS_CLIENTE = ['recorrente', 'pontual', 'negociacao', 'ex'] as const
export type StatusCliente = (typeof STATUS_CLIENTE)[number]

export const TIPOS_LINK_CLIENTE = ['drive', 'marca', 'acessos', 'site', 'redes', 'outro'] as const
/** `acessos` aponta para o cofre de senhas. Nunca a senha. */
export type TipoLinkCliente = (typeof TIPOS_LINK_CLIENTE)[number]

export const PENDENCIAS_CLIENTE = ['sem_am', 'sem_contato_padrao'] as const
/**
 * Cadastro incompleto ("Criar cliente HE" na hora e completar depois). Calculado na leitura; a lista de clientes e o
 * cabeçalho do cliente mostram "Completar cadastro". Os Primeiros passos do admin pedem só 1 cliente com AM.
 */
export type PendenciaCliente = (typeof PENDENCIAS_CLIENTE)[number]

/** "Na Criação, o HE é do Rafa": sugerido como membro ao criar a demanda num quadro da equipe ou ao mover para ele. */
export interface ResponsavelCliente {
  equipeId: Id
  usuarioId: Id
}

/** Bootstrap e listas. `apelidos` são normalizados (minúsculo, sem acento) e incluem a sigla. */
export interface ClienteResumo {
  id: Id
  nome: string
  sigla: string
  paiId: Id | null
  status: StatusCliente
  nivel: 1 | 2 | 3 | null
  cor: Cor
  /** Logo só por upload: /api/arquivos/:id?inline=1 (na página pública vem como URL assinada). Nulo = sem logo. */
  logoUrl: string | null
  atendimentoId: Id | null
  rodadasInclusas: number
  pastaSaida: string | null
  apelidos: string[]
  responsaveis: ResponsavelCliente[]
  pendencias: PendenciaCliente[]
}

export interface ClienteContato {
  id: Id
  clienteId: Id
  nome: string
  cargo: string | null
  whatsapp: string | null
  email: string | null
  aprova: boolean
  padrao: boolean
  ativo: boolean
}

export interface ClienteLink {
  id: Id
  clienteId: Id
  tipo: TipoLinkCliente
  rotulo: string
  url: string
  pos: number
}

export interface ContadoresCliente {
  /** Não concluídas e não arquivadas, de quadros ativos. */
  abertas: number
  /** Com o cliente (coluna aguardando_cliente ou envio pendente). */
  comCliente: number
  /** estadoPrazo = 'atrasada' (API.md §5.2). */
  atrasadas: number
}

/** GET /api/clientes/:sigla */
export interface Cliente extends ClienteResumo {
  observacoes: string | null
  logoArquivoId: Id | null
  contatos: ClienteContato[]
  links: ClienteLink[]
  contadores: ContadoresCliente
  criadoEm: Instante
  atualizadoEm: Instante
}

/** GET /api/clientes */
export interface ClienteNaLista extends ClienteResumo {
  contadores: ContadoresCliente
}

// ─────────────────────────────── DTOs ───────────────────────────────

/**
 * POST /api/clientes. Também usado pelo diálogo "Criar cliente HE" (F5) aberto da Nova demanda, da criação rápida e
 * do modal: só sigla + nome. O papel equipe só manda CAMPOS_CLIENTE_EQUIPE (o resto: 403 campo_nao_permitido); o
 * cliente nasce com a pendência sem_am e o atendimento completa depois.
 */
export interface CriarClienteEntrada {
  sigla: string
  nome: string
  paiId?: Id | null
  status?: StatusCliente
  nivel?: 1 | 2 | 3 | null
  cor?: Cor
  /** Imagem já enviada por POST /api/arquivos (jpg, png, webp). Não há logo por URL externa. */
  logoArquivoId?: Id | null
  /** Padrão: o ator, se o papel dele for atendimento (o cliente criado na hora já nasce com AM). */
  atendimentoId?: Id | null
  rodadasInclusas?: number
  pastaSaida?: string | null
  observacoes?: string | null
  /** Além da sigla, que entra sozinha. */
  apelidos?: string[]
}

/** O que o papel equipe pode mandar ao criar cliente (API.md §2). Editar continua só com atendimento e admin. */
export const CAMPOS_CLIENTE_EQUIPE = ['sigla', 'nome'] as const satisfies readonly (keyof CriarClienteEntrada)[]

export type EditarClienteEntrada = Partial<Omit<CriarClienteEntrada, 'apelidos'>>

/** Substitui a lista inteira (a sigla é mantida automaticamente). */
export interface DefinirApelidosEntrada {
  apelidos: string[]
}

/** PUT /api/clientes/:id/responsaveis: substitui a lista (uma pessoa por equipe). */
export interface DefinirResponsaveisEntrada {
  responsaveis: ResponsavelCliente[]
}

export interface CriarContatoEntrada {
  nome: string
  cargo?: string | null
  whatsapp?: string | null
  email?: string | null
  aprova?: boolean
  /** true desmarca o padrão anterior. */
  padrao?: boolean
}

export type EditarContatoEntrada = Partial<CriarContatoEntrada> & { ativo?: boolean }

export interface CriarLinkClienteEntrada {
  tipo: TipoLinkCliente
  rotulo: string
  url: string
}

export type EditarLinkClienteEntrada = Partial<CriarLinkClienteEntrada> & { posicao?: PosicaoRelativa }

/** GET /api/clientes/:id/aprovacoes: a trilha completa (aba Aprovações). */
export interface ItemTrilhaCliente {
  aprovacaoId: Id
  demanda: { id: Id; numero: number; titulo: string }
  versaoNumero: number
  decisao: 'aprovado' | 'ajuste'
  via: 'link' | 'manual'
  canal: Canal | null
  /** Contato, nome informado ou "registrado por Pri". */
  quem: string
  registradoPor: Id | null
  comentario: string | null
  criadoEm: Instante
  anuladaEm: Instante | null
  /** Pelo link, da mesma rede de uma sessão interna das últimas 24 h: as pessoas (`Aprovacao.redeInterna`, API.md §4.17). */
  redeInterna: Id[]
  /**
   * Só para o admin, nas decisões pelo link: o aparelho e o navegador, do user-agent gravado ("iPhone · Safari",
   * "curl/8.4.0"); null para os outros, no manual e depois dos 12 meses (o job apaga o user-agent).
   */
  dispositivo: string | null
}
