/** Mural por equipe (e o da agência). Avisos em Markdown; senhas são proibidas (o detector avisa). */
import type { Id, Instante, PosicaoRelativa } from './nucleo.ts'
import type { Equipe } from './pessoas.ts'

export interface Aviso {
  id: Id
  /** Nulo = mural da agência. */
  equipeId: Id | null
  titulo: string
  corpoMd: string
  fixado: boolean
  pos: number
  criadoPor: Id
  criadoEm: Instante
  atualizadoPor: Id | null
  atualizadoEm: Instante
}

/** GET /api/mural/:slug (slug da equipe ou 'agencia'). */
export interface MuralSaida {
  equipe: Equipe | null
  avisos: Aviso[]
  /** AM e admin editam qualquer mural; o executor, o da própria equipe. */
  podeEditar: boolean
}

export interface CriarAvisoEntrada {
  titulo: string
  corpoMd?: string
  fixado?: boolean
  posicao?: PosicaoRelativa
}

export interface EditarAvisoEntrada {
  titulo?: string
  corpoMd?: string
  fixado?: boolean
  posicao?: PosicaoRelativa
}

export interface AvisoSaida {
  aviso: Aviso
  /** 'senha_detectada': salvo mesmo assim, mas a tela aponta para o cofre. */
  avisos: ('senha_detectada')[]
}
