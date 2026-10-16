/**
 * Popover ancorado (vidro). No celular vira Folha. Clique fora (fora do popover e da âncora) e Esc fecham; o foco
 * entra no popover e volta para a âncora ao fechar.
 *
 *   const [aberto, setAberto] = useState(false)
 *   const [ancora, setAncora] = useState<HTMLElement | null>(null)
 *   <Botao ref={setAncora} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>Filtros</Botao>
 *   <Popover aberto={aberto} aoFechar={() => setAberto(false)} ancora={ancora} titulo="Filtros">…</Popover>
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { raizCamadas, useCamada } from '../lib/camadas.ts'
import { cx } from '../lib/classes.ts'
import { useArmadilhaFoco } from '../lib/foco.ts'
import { useCelular } from '../lib/midia.ts'
import { usePosicao, type Alinhamento, type Ancora, type Lado } from '../lib/posicao.ts'
import { usePresenca } from '../lib/presenca.ts'
import { BotaoIcone } from './Botao.tsx'
import { Folha } from './Modal.tsx'

export interface PropsPopover {
  aberto: boolean
  aoFechar(): void
  ancora: Ancora
  lado?: Lado
  alinhar?: Alinhamento
  /** Título no topo (sempre na folha do celular; no desktop só com `mostrarTitulo`). Também é o nome acessível. */
  titulo?: string
  mostrarTitulo?: boolean
  /** Largura no desktop (px). */
  largura?: number
  /** Celular: 'folha' (padrão) ou mantém o popover. */
  noCelular?: 'folha' | 'popover'
  className?: string
  children?: ReactNode
}

export function Popover({
  aberto, aoFechar, ancora, lado = 'baixo', alinhar = 'inicio', titulo, mostrarTitulo, largura, noCelular = 'folha', className, children,
}: PropsPopover) {
  const celular = useCelular()
  if (celular && noCelular === 'folha') {
    return <Folha aberto={aberto} aoFechar={aoFechar} titulo={titulo} rotulo={titulo}>{children}</Folha>
  }
  return (
    <PopoverFlutuante aberto={aberto} aoFechar={aoFechar} ancora={ancora} lado={lado} alinhar={alinhar} titulo={titulo}
      mostrarTitulo={mostrarTitulo} largura={largura} className={className}>
      {children}
    </PopoverFlutuante>
  )
}

function PopoverFlutuante({ aberto, aoFechar, ancora, lado, alinhar, titulo, mostrarTitulo, largura, className, children }: PropsPopover) {
  const { montado, estado } = usePresenca(aberto, 120)
  const ref = useRef<HTMLDivElement>(null)
  useCamada(aberto, { aoEsc: aoFechar })
  useArmadilhaFoco(ref, aberto && montado)
  const { estilo, medindo } = usePosicao(ancora, ref, montado, { lado, alinhar })
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar

  useEffect(() => {
    if (!aberto) return
    const aoApertar = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (ref.current?.contains(alvo)) return
      if (ancora instanceof HTMLElement && ancora.contains(alvo)) return
      // clique numa camada aberta depois desta (popover dentro de popover, menu do combobox) não fecha esta
      const camada = alvo instanceof Element ? alvo.closest('.ui-popover, .ui-modal-posicao, .ui-folha') : null
      if (camada && ref.current && ref.current.compareDocumentPosition(camada) & Node.DOCUMENT_POSITION_FOLLOWING) return
      fechar.current()
    }
    document.addEventListener('pointerdown', aoApertar, true)
    return () => document.removeEventListener('pointerdown', aoApertar, true)
  }, [aberto, ancora])

  if (!montado) return null
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={titulo}
      tabIndex={-1}
      className={cx('ui-popover vidro', className)}
      style={{ ...estilo, width: largura }}
      data-estado={estado}
      data-medindo={medindo || undefined}
    >
      {mostrarTitulo && titulo && (
        <div className="ui-popover-titulo">
          <span>{titulo}</span>
          <BotaoIcone icone={X} rotulo="Fechar" tamanho="p" onClick={aoFechar} semDica data-foco-por-ultimo="" />
        </div>
      )}
      {children}
    </div>,
    raizCamadas(),
  )
}
