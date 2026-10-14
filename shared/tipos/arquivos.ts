/** Arquivos enviados (disco local) e itens de link/caminho/arquivo usados por anexos e versões. */
import type { Id, Instante, Provedor } from './nucleo.ts'

export const MIMES_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/zip',
] as const
export type MimePermitido = (typeof MIMES_PERMITIDOS)[number]

export const LIMITE_UPLOAD_BYTES = 10 * 1024 * 1024

/** Resposta de POST /api/arquivos e referência dentro de anexos e itens de versão. */
export interface ArquivoInfo {
  id: Id
  nome: string
  mime: MimePermitido
  bytes: number
  /** Caminho interno autenticado: /api/arquivos/:id (download) ou /api/arquivos/:id?inline=1 (imagem). */
  url: string
  imagem: boolean
  criadoEm: Instante
}

export const DRIVE_STATUS = ['publico', 'privado', 'pasta', 'erro'] as const
/** Resultado do teste de acesso público do Drive (fetch sem credenciais do thumbnail). */
export type DriveStatus = (typeof DRIVE_STATUS)[number]

export const TIPOS_ITEM = ['link', 'caminho', 'arquivo'] as const
export type TipoItem = (typeof TIPOS_ITEM)[number]

/** Entrada para anexar algo (anexo de referência ou item de versão). */
export type NovoItem =
  | { tipo: 'link'; url: string; nome?: string }
  | { tipo: 'caminho'; caminho: string; nome?: string }
  | { tipo: 'arquivo'; arquivoId: Id; nome?: string }

/** Campos comuns de anexo e item de versão. */
export interface ItemBase {
  id: Id
  demandaId: Id
  tipo: TipoItem
  nome: string
  /** Só https. */
  url: string | null
  /** Caminho de rede (M:\...). Exibido como texto com [Copiar], nunca como href. */
  caminho: string | null
  arquivo: ArquivoInfo | null
  provedor: Provedor | null
  driveStatus: DriveStatus | null
  driveTestadoEm: Instante | null
  pos: number
}

export interface TestarDriveEntrada {
  url: string
}

export interface TestarDriveSaida {
  /** 'nao_drive' = link de outro provedor (nada a testar). */
  status: DriveStatus | 'nao_drive'
  /** Miniatura pública (https://drive.google.com/thumbnail?id=...&sz=w400) quando status = 'publico'. */
  previaUrl: string | null
  mensagem: string
}
