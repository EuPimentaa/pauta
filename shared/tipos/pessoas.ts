/** Pessoas, sessão, convites, equipes e ausências. */
import type { Cor, DataLocal, Id, Instante, Papel } from './nucleo.ts'

/** O que todo usuário interno vê de outra pessoa (bootstrap, @menções, avatares). Sem e-mail. */
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
  horasSemana: number
  /** false até a pessoa aceitar o convite. */
  temSenha: boolean
  /** Convite pendente (só admin vê). */
  conviteExpiraEm: Instante | null
  ultimoAcessoEm: Instante | null
  criadoEm: Instante
}

export interface Prefs {
  tema?: 'sistema' | 'claro' | 'escuro'
  /** Atalhos de uma tecla ligados (padrão true). */
  atalhos?: boolean
  menuRecolhido?: boolean
  /** Colunas recolhidas pelo usuário por visão: chave `${slug}:${agruparPor}`, valor = ids das colunas. */
  colunasRecolhidas?: Record<string, string[]>
  /** Minha semana mostra a coluna de sábado. */
  mostrarSabado?: boolean
}

/** Sessão atual: GET /api/auth/eu e campo `eu` do bootstrap. */
export interface Eu {
  usuario: Usuario
  prefs: Prefs
  /** Ids de quem eu cubro hoje (ausências em que sou substituto). */
  cobrindo: Id[]
  /** Minha ausência vigente hoje, se houver. */
  ausenciaAtual: Ausencia | null
  /** executor → /semana; atendimento e admin → /inicio. */
  rotaInicial: '/inicio' | '/semana'
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
  fluxoId: Id
  /** Recebe demandas (tem fila e visão). Atendimento e Gestão: false. */
  executora: boolean
  aprovadorPadraoId: Id | null
  distribuidorId: Id | null
  ativa: boolean
  pos: number
  membros: EquipeMembro[]
}

export interface Ausencia {
  id: Id
  usuarioId: Id
  de: DataLocal
  ate: DataLocal
  substitutoId: Id
  motivo: string | null
  criadoPor: Id
  criadoEm: Instante
}

/** Link de uso único que o admin copia e manda (WhatsApp). */
export interface LinkAcesso {
  url: string
  expiraEm: Instante
}

// ─────────────────────────────── DTOs: auth ───────────────────────────────

export interface LoginEntrada {
  email: string
  senha: string
}

/** GET /api/auth/convite/:token e /api/auth/redefinicao/:token. */
export interface TokenAcessoInfo {
  nome: string
  email: string
  expiraEm: Instante
}

export interface DefinirSenhaEntrada {
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
  prefs?: Prefs
}

// ─────────────────────────────── DTOs: pessoas e equipes ───────────────────────────────

export interface CriarPessoaEntrada {
  nome: string
  apelido?: string | null
  email: string
  papel: Exclude<Papel, 'agente'>
  equipes?: { equipeId: Id; funcao?: string | null; principal?: boolean }[]
  horasSemana?: number
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
  papel?: Exclude<Papel, 'agente'>
  cor?: Cor
  horasSemana?: number
  /** false revoga as sessões e fecha o SSE da pessoa. */
  ativo?: boolean
  equipes?: { equipeId: Id; funcao?: string | null; principal?: boolean }[]
}

export interface CriarEquipeEntrada {
  nome: string
  slug: string
  cor?: Cor
  executora?: boolean
}

export interface EditarEquipeEntrada {
  nome?: string
  cor?: Cor
  executora?: boolean
  aprovadorPadraoId?: Id | null
  distribuidorId?: Id | null
  ativa?: boolean
}

export interface DefinirMembrosEntrada {
  membros: EquipeMembro[]
}

// ─────────────────────────────── DTOs: ausências ───────────────────────────────

export interface CriarAusenciaEntrada {
  /** Omitido = eu. Outra pessoa: só admin. */
  usuarioId?: Id
  de: DataLocal
  ate: DataLocal
  substitutoId: Id
  motivo?: string | null
}

export interface EditarAusenciaEntrada {
  de?: DataLocal
  ate?: DataLocal
  substitutoId?: Id
  motivo?: string | null
}

export interface ListarAusenciasConsulta {
  /** Padrão: vigentes e futuras. */
  desde?: DataLocal
  usuarioId?: Id
}
