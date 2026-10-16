/**
 * Upload (API §4.14): POST /api/arquivos com o campo `arquivo` (FormData, sem Content-Type: o navegador põe o
 * boundary). Rejeita com ErroDaApi: 413 arquivo_grande, 415 tipo_arquivo. Ctrl+V do print (F1, F2) e logo (F5).
 *
 *   const enviar = useEnviarArquivo(); const info = await enviar(arquivo, controle.signal)
 *
 * O tamanho é conferido antes de enviar (config.uploadLimiteBytes do bootstrap, no máximo 10 MB): o servidor recusa
 * pelo Content-Length sem ler o corpo, e o navegador às vezes vê só a conexão caindo ("Sem conexão") em vez do 413.
 */
import { useCallback } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ArquivoInfo, Bootstrap } from '@shared/tipos/index.ts'
import { chaves } from './chaves.ts'
import { ErroDaApi, api } from './cliente.ts'

/** Teto do servidor (API §4.14); o configurado em Prazos e limites pode ser menor. */
export const LIMITE_UPLOAD_MAX = 10 * 1024 * 1024

/** O limite em vigor: o da configuração (bootstrap), nunca acima do teto. */
export function limiteUpload(qc?: QueryClient): number {
  const configurado = qc?.getQueryData<Bootstrap>(chaves.bootstrap)?.config.uploadLimiteBytes
  return Math.min(LIMITE_UPLOAD_MAX, configurado ?? LIMITE_UPLOAD_MAX)
}

/** "10 MB", "2,5 MB", "300 KB" (o mesmo formato da mensagem do servidor). */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = Math.round((bytes / 1_048_576) * 10) / 10
  return `${String(mb).replace('.', ',')} MB`
}

export async function enviarArquivo(f: File, sinal?: AbortSignal, limiteBytes = LIMITE_UPLOAD_MAX): Promise<ArquivoInfo> {
  if (f.size > limiteBytes) {
    throw new ErroDaApi(413, 'arquivo_grande', `O arquivo passa de ${tamanhoLegivel(limiteBytes)}.`, { limiteBytes })
  }
  const corpo = new FormData()
  corpo.append('arquivo', f, f.name || 'arquivo')
  return api<ArquivoInfo>('POST', '/api/arquivos', { corpo, sinal })
}

export function useEnviarArquivo(): (f: File, sinal?: AbortSignal) => Promise<ArquivoInfo> {
  const qc = useQueryClient()
  return useCallback((f: File, sinal?: AbortSignal) => enviarArquivo(f, sinal, limiteUpload(qc)), [qc])
}
