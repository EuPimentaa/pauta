/** Pessoas, sessão, convites e equipes. */
import type { Apontamento } from './horas.ts'
import type { Cor, Id, Instante, Papel, PosicaoRelativa } from './nucleo.ts'

/** O que todo usuário interno vê de outra pessoa (bootstrap, @menções, avatares, membros). Sem e-mail. */
export interface UsuarioResumo {
  id: Id
  nome: string
  apelido: string | null
  papel: Papel
  cor: Cor
  ativo: boolean
  equipeIds: Id[]
}

/** Visão do admin (GET /api/pessoas) e do próprio usuário (Eu). */
export interface Usuario extends UsuarioResumo {
  email: string
  /** false até a pessoa aceitar o convite. */
  temSenha: boolean
  /** Convite pendente (só admin vê). */
  conviteExpiraEm: Instante | null
  ultimoAcessoEm: Instante | null
  criadoEm: Instante
}

/**
 * Preferências que viajam entre aparelhos. Recolher coluna, a visão escolhida de cada quadro e os quadros recentes
 * ficam no localStorage (preferência local, como no Trello).
 */
export interface Prefs {
  tema?: 'sistema' | 'claro' | 'escuro'
  /** Atalhos de uma tecla ligados (padrão true). */
  atalhos?: boolean
  menuRecolhido?: boolean
}

/** Sessão atual: GET /api/auth/eu e campo `eu` do bootstrap. */
export interface Eu {
  usuario: Usuario
  prefs: Prefs
  /** Quadros com estrela, na ordem do menu (quadro_usuario.favorito_pos). */
  favoritos: Id[]
  /** Quadros que sigo (recebo 'chegou' quando entra demanda). */
  seguindo: Id[]
  /** Meu cronômetro ligado, se houver (no máximo um por pessoa). */
  cronometro: Apontamento | null
  /** Sempre '/inicio' no MVP (todas as pessoas veem as próprias demandas de todos os quadros). */
  rotaInicial: '/inicio'
}

export interface EquipeMembro {
  usuarioId: Id
  funcao: string | null
  principal: boolean
}

export interface Equipe {
  id: Id
  nome: string
  slug: string
  cor: Cor
  /** Modelo de quadro sugerido nos Primeiros passos ("Criar o quadro da equipe"). */
  modeloQuadroId: Id | null
  ativa: boolean
  pos: number
  membros: EquipeMembro[]
}

/**
 * Link de uso único que o admin copia e manda (WhatsApp). O token vai no FRAGMENTO, que o navegador não envia ao
 * servidor nem grava em log: `${APP_URL}/convite#<token>` ou `${APP_URL}/redefinir#<token>`.
 * Token = randomBytes(32) em base64url; o banco guarda o sha256.
 */
export interface LinkAcesso {
  url: string
  expiraEm: Instante
}

// ─────────────────────────────── DTOs: auth ───────────────────────────────

export interface LoginEntrada {
  email: string
  senha: string
}

/** POST /api/auth/convite/consultar e /api/auth/redefinicao/consultar (o token lido do fragmento da URL). */
export interface TokenEntrada {
  token: string
}

/** Resposta de .../consultar. Não consome o token. */
export interface TokenAcessoInfo {
  nome: string
  email: string
  expiraEm: Instante
}

/** POST /api/auth/convite e /api/auth/redefinicao. */
export interface DefinirSenhaEntrada {
  token: string
  senha: string
}

export interface TrocarSenhaEntrada {
  senhaAtual: string
  senhaNova: string
}

export interface EditarEuEntrada {
  nome?: string
  apelido?: string | null
  cor?: Cor
  /** Mesclado com as prefs atuais. */
  prefs?: Prefs
}

// ─────────────────────────────── DTOs: pessoas e equipes ───────────────────────────────

export interface ParticipacaoEquipe {
  equipeId: Id
  funcao?: string | null
  principal?: boolean
}

export interface CriarPessoaEntrada {
  nome: string
  apelido?: string | null
  email: string
  papel: Papel
  /** Entrar numa equipe também faz a pessoa seguir os quadros dessa equipe (API.md §4.3). */
  equipes?: ParticipacaoEquipe[]
  cor?: Cor
}

export interface CriarPessoaSaida {
  usuario: Usuario
  convite: LinkAcesso
}

export interface EditarPessoaEntrada {
  nome?: string
  apelido?: string | null
  email?: string
  papel?: Papel
  cor?: Cor
  /** false revoga as sessões, os convites e redefinições pendentes e fecha o SSE da pessoa (trocar o e-mail também revoga os tokens). */
  ativo?: boolean
  /** Substitui as participações. */
  equipes?: ParticipacaoEquipe[]
}

export interface CriarEquipeEntrada {
  nome: string
  slug: string
  cor?: Cor
  modeloQuadroId?: Id | null
}

export interface EditarEquipeEntrada {
  nome?: string
  cor?: Cor
  modeloQuadroId?: Id | null
  ativa?: boolean
  posicao?: PosicaoRelativa
}

export interface DefinirMembrosEntrada {
  membros: EquipeMembro[]
}
