/**
 * Paleta CORES (+ "Sem cor" opcional) como radiogroup: setas movem e escolhem, Tab sai.
 *   <SeletorCor valor={cor} aoMudar={setCor} permitirSemCor rotulo="Cor da coluna" />
 */
import { useRef, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { CORES, type Cor } from '@shared/tipos/index.ts'
import { ROTULO_COR } from '../lib/cores.ts'
import { Tooltip } from './Tooltip.tsx'

export interface PropsSeletorCor {
  valor: Cor | null
  aoMudar(cor: Cor | null): void
  permitirSemCor?: boolean
  rotulo: string
  className?: string
}

export function SeletorCor({ valor, aoMudar, permitirSemCor, rotulo, className }: PropsSeletorCor) {
  const opcoes: (Cor | null)[] = permitirSemCor ? [...CORES, null] : [...CORES]
  const grupo = useRef<HTMLDivElement>(null)
  const selecionada = opcoes.includes(valor) ? valor : opcoes[0]

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const i = opcoes.indexOf(valor === undefined ? null : valor)
    const prox = opcoes[(Math.max(0, i) + passo + opcoes.length) % opcoes.length]
    aoMudar(prox)
    requestAnimationFrame(() => grupo.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }

  return (
    <div ref={grupo} role="radiogroup" aria-label={rotulo} className={`ui-cores ${className ?? ''}`} onKeyDown={aoTeclar}>
      {opcoes.map((cor) => {
        const marcada = cor === valor
        const nome = cor ? ROTULO_COR[cor] : 'Sem cor'
        return (
          <Tooltip key={cor ?? 'nenhuma'} texto={nome}>
            <button
              type="button"
              role="radio"
              aria-checked={marcada}
              aria-label={nome}
              tabIndex={cor === selecionada ? 0 : -1}
              className="ui-cor"
              data-cor={cor ?? 'nenhuma'}
              onClick={() => aoMudar(cor)}
            >
              {marcada && <Check aria-hidden="true" />}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
