/**
 * Upload (API §4.14): POST /api/arquivos com o campo `arquivo` (FormData, sem Content-Type: o navegador põe o
 * boundary). Rejeita com ErroDaApi: 413 arquivo_grande, 415 tipo_arquivo. Ctrl+V do print (F1, F2) e logo (F5).
 *
 *   const enviar = useEnviarArquivo(); const info = await enviar(arquivo, controle.signal)
 */
import { useCallback } from 'react'
import type { ArquivoInfo } from '@shared/tipos/index.ts'
import { api } from './cliente.ts'

export async function enviarArquivo(f: File, sinal?: AbortSignal): Promise<ArquivoInfo> {
  const corpo = new FormData()
  corpo.append('arquivo', f, f.name || 'arquivo')
  return api<ArquivoInfo>('POST', '/api/arquivos', { corpo, sinal })
}

export function useEnviarArquivo(): (f: File, sinal?: AbortSignal) => Promise<ArquivoInfo> {
  return useCallback((f: File, sinal?: AbortSignal) => enviarArquivo(f, sinal), [])
}
