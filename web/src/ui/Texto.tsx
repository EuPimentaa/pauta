/**
 * Texto vindo de fora (WhatsApp, cliente, nome informado): sempre texto puro, quebras preservadas, nada vira link
 * (API §5.8). CopiarTexto mostra um caminho de rede (M:\…) com botão de copiar; caminho nunca vira href.
 *   <TextoPuro texto={origemTexto} linhas={4} />
 *   <CopiarTexto texto="M:\Clientes\HE\2026\Outubro" rotulo="Copiar caminho" />
 */
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cx } from '../lib/classes.ts'
import { avisar } from './avisos.tsx'
import { BotaoIcone } from './Botao.tsx'

export function TextoPuro({ texto, linhas, className }: { texto: string; linhas?: number; className?: string }) {
  return (
    <p className={cx('ui-texto-puro', className)} data-linhas={linhas || undefined} style={linhas ? { ['--linhas' as string]: linhas } : undefined}>
      {texto}
    </p>
  )
}

export async function copiarParaAreaDeTransferencia(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // fora de contexto seguro: cai para a seleção + execCommand
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    area.remove()
    return ok
  }
}

export interface PropsCopiarTexto {
  texto: string
  rotulo?: string
  /** Mensagem do aviso depois de copiar. */
  avisoCopiado?: string
  className?: string
}

export function CopiarTexto({ texto, rotulo = 'Copiar', avisoCopiado = 'Copiado para a área de transferência.', className }: PropsCopiarTexto) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    const ok = await copiarParaAreaDeTransferencia(texto)
    if (ok) {
      setCopiado(true)
      avisar(avisoCopiado, { tipo: 'sucesso', duracao: 2500 })
      window.setTimeout(() => setCopiado(false), 1600)
    } else {
      avisar('Não foi possível copiar. Selecione o texto e copie com Ctrl+C.', { tipo: 'erro' })
    }
  }
  return (
    <div className={cx('ui-copiar', className)}>
      <code title={texto}>{texto}</code>
      <BotaoIcone icone={copiado ? Check : Copy} rotulo={copiado ? 'Copiado' : rotulo} tamanho="p" onClick={copiar} />
    </div>
  )
}
