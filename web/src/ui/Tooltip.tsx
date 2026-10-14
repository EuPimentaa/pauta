/**
 * Dica no hover (meio segundo) e no foco do teclado (na hora), com a tecla quando houver:
 *   <Tooltip texto="Recolher menu" atalho="[">{botao}</Tooltip>
 * O filho é o gatilho (um elemento focável); ganha aria-describedby enquanto a dica está aberta. Esc fecha.
 * Em telas de toque não aparece.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { raizCamadas } from '../lib/camadas.ts'
import { usePosicao, type Lado } from '../lib/posicao.ts'
import { Kbd } from './Kbd.tsx'

export interface PropsTooltip {
  texto: ReactNode
  atalho?: string
  lado?: Lado
  /** ms até aparecer no hover. */
  atraso?: number
  desabilitado?: boolean
  children: ReactNode
}

export function Tooltip({ texto, atalho, lado = 'baixo', atraso = 450, desabilitado, children }: PropsTooltip) {
  const id = useId()
  const envoltorio = useRef<HTMLSpanElement>(null)
  const dica = useRef<HTMLDivElement>(null)
  const [gatilho, setGatilho] = useState<HTMLElement | null>(null)
  const [aberta, setAberta] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    const el = envoltorio.current?.firstElementChild
    setGatilho(el instanceof HTMLElement ? el : null)
  }, [children])

  useEffect(() => {
    if (!gatilho || desabilitado) return
    const toque = window.matchMedia('(hover: none)').matches
    const abrir = (imediato: boolean) => {
      window.clearTimeout(timer.current)
      if (imediato) setAberta(true)
      else timer.current = window.setTimeout(() => setAberta(true), atraso)
    }
    const fechar = () => { window.clearTimeout(timer.current); setAberta(false) }
    const entrar = () => { if (!toque) abrir(false) }
    const focar = () => { if (gatilho.matches(':focus-visible')) abrir(true) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    gatilho.addEventListener('pointerenter', entrar)
    gatilho.addEventListener('pointerleave', fechar)
    gatilho.addEventListener('pointerdown', fechar)
    gatilho.addEventListener('focus', focar)
    gatilho.addEventListener('blur', fechar)
    gatilho.addEventListener('keydown', tecla)
    return () => {
      window.clearTimeout(timer.current)
      gatilho.removeEventListener('pointerenter', entrar)
      gatilho.removeEventListener('pointerleave', fechar)
      gatilho.removeEventListener('pointerdown', fechar)
      gatilho.removeEventListener('focus', focar)
      gatilho.removeEventListener('blur', fechar)
      gatilho.removeEventListener('keydown', tecla)
    }
  }, [gatilho, atraso, desabilitado])

  useEffect(() => {
    if (!gatilho) return
    if (aberta) gatilho.setAttribute('aria-describedby', id)
    else if (gatilho.getAttribute('aria-describedby') === id) gatilho.removeAttribute('aria-describedby')
  }, [aberta, gatilho, id])

  const { estilo, medindo } = usePosicao(gatilho, dica, aberta && !desabilitado, { lado, alinhar: 'centro', distancia: 8 })

  return (
    <>
      <span ref={envoltorio} className="contents">{children}</span>
      {aberta && !desabilitado && createPortal(
        <div ref={dica} id={id} role="tooltip" className="ui-tooltip" style={estilo} data-medindo={medindo || undefined}>
          <span>{texto}</span>
          {atalho && <Kbd teclas={atalho} />}
        </div>,
        raizCamadas(),
      )}
    </>
  )
}
