/**
 * Abas (tablist com foco itinerante: setas, Home e End). Duas aparências:
 *   segmento: controle segmentado (Quadro | Lista | Calendário)
 *   linha:    sublinhado laranja (páginas com seções)
 *
 *   <Abas rotulo="Visão" abas={[{ id: 'quadro', rotulo: 'Quadro', icone: Columns3 }]} ativa={v} aoMudar={setV} />
 *   <div {...painelAba('quadro', v)}>…</div>
 */
import { useId, useRef, type KeyboardEvent } from 'react'
import type { Icone } from '../extensoes/tipos.ts'
import { cx } from '../lib/classes.ts'
import { Contador } from './Indicadores.tsx'

export interface Aba<T extends string = string> {
  id: T
  rotulo: string
  icone?: Icone
  contador?: number
  desabilitada?: boolean
}

export interface PropsAbas<T extends string> {
  abas: readonly Aba<T>[]
  ativa: T
  aoMudar(id: NoInfer<T>): void
  rotulo: string
  variante?: 'segmento' | 'linha'
  /** Prefixo dos ids (para ligar com painelAba). Padrão: gerado. */
  idBase?: string
  className?: string
  /** Só os ícones à vista (o rótulo continua como nome acessível e dica): o seletor de visão do quadro no celular. */
  soIcones?: boolean
}

export function Abas<const T extends string>({ abas, ativa, aoMudar, rotulo, variante = 'segmento', idBase, className, soIcones }: PropsAbas<T>) {
  const gerado = useId()
  const base = idBase ?? gerado
  const lista = useRef<HTMLDivElement>(null)

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const ativas = abas.filter((a) => !a.desabilitada)
    const i = ativas.findIndex((a) => a.id === ativa)
    let prox = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') prox = (i + 1) % ativas.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prox = (i - 1 + ativas.length) % ativas.length
    else if (e.key === 'Home') prox = 0
    else if (e.key === 'End') prox = ativas.length - 1
    if (prox < 0) return
    e.preventDefault()
    aoMudar(ativas[prox].id)
    requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }

  return (
    <div ref={lista} role="tablist" aria-label={rotulo} className={cx('ui-abas', className)} data-variante={variante}
      data-so-icones={soIcones || undefined} onKeyDown={aoTeclar}>
      {abas.map((a) => {
        const I = a.icone
        const sel = a.id === ativa
        return (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`${base}-aba-${a.id}`}
            aria-selected={sel}
            aria-controls={`${base}-painel-${a.id}`}
            tabIndex={sel ? 0 : -1}
            disabled={a.desabilitada}
            className="ui-aba"
            title={soIcones && I ? a.rotulo : undefined}
            onClick={() => aoMudar(a.id)}
          >
            {I && <I aria-hidden="true" />}
            <span className="ui-aba-rotulo">{a.rotulo}</span>
            {a.contador ? <Contador valor={a.contador} tom="suave" /> : null}
          </button>
        )
      })}
    </div>
  )
}

/** Props do painel ligado à aba (role, id, aria-labelledby, hidden). */
export function painelAba(idBase: string, id: string, ativa: string) {
  return {
    role: 'tabpanel' as const,
    id: `${idBase}-painel-${id}`,
    'aria-labelledby': `${idBase}-aba-${id}`,
    hidden: id !== ativa,
    tabIndex: 0,
  }
}
