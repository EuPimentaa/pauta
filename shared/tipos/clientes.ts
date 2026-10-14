/** Clientes, apelidos, contatos que aprovam e links. */
import type { Canal, Cor, Id, Instante } from './nucleo.ts'

export const STATUS_CLIENTE = ['recorrente', 'pontual', 'negociacao', 'ex'] as const
export type StatusCliente = (typeof STATUS_CLIENTE)[number]

export const TIPOS_LINK_CLIENTE = ['drive', 'marca', 'acessos', 'site', 'redes', 'outro'] as const
/** `acessos` aponta para o cofre de senhas. Nunca a senha. */
export type TipoLinkCliente = (typeof TIPOS_LINK_CLIENTE)[number]

/** Bootstrap e listas. `apelidos` são normalizados (minúsculo, sem acento) e incluem a sigla. */
export interface ClienteResumo {
  id: Id
  nome: string
  sigla: string
  paiId: Id | null
  status: StatusCliente
  nivel: 1 | 2 | 3 | null
  cor: Cor
  /** https externo ou /api/arquivos/:id do logo enviado. */
  logoUrl: string | null
  atendimentoId: Id | null
  criativoId: Id | null
  socialId: Id | null
  rodadasInclusas: number
  pastaSaida: string | null
  apelidos: string[]
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

export interface ContadoresCliente {
  abertas: number
  comCliente: number
  atrasadas: number
}

/** GET /api/clientes */
export interface ClienteNaLista extends ClienteResumo {
  contadores: ContadoresCliente
}

// ─────────────────────────────── DTOs ───────────────────────────────

/** Também usado pelo "Criar cliente HE" dentro da Nova demanda (só sigla + nome). */
export interface CriarClienteEntrada {
  sigla: string
  nome: string
  paiId?: Id | null
  status?: StatusCliente
  nivel?: 1 | 2 | 3 | null
  cor?: Cor
  logoUrl?: string | null
  logoArquivoId?: Id | null
  atendimentoId?: Id | null
  criativoId?: Id | null
  socialId?: Id | null
  rodadasInclusas?: number
  pastaSaida?: string | null
  observacoes?: string | null
  /** Além da sigla, que entra sozinha. */
  apelidos?: string[]
}

export type EditarClienteEntrada = Partial<Omit<CriarClienteEntrada, 'apelidos'>>

/** Substitui a lista inteira (a sigla é mantida automaticamente). */
export interface DefinirApelidosEntrada {
  apelidos: string[]
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

export type EditarLinkClienteEntrada = Partial<CriarLinkClienteEntrada> & { posicao?: { depoisDeId?: Id | null } }

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
}
