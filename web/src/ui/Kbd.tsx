/**
 * Tecla de atalho: <Kbd teclas="mod+k" /> → Ctrl K (⌘K no Mac); 'g a' mostra o acorde. As setas saem como ícones (o glifo
 * da Syne a 11 px parecia um traço).
 */
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { partesTecla, rotuloTecla } from '../lib/teclas.ts'
import { cx } from '../lib/classes.ts'

const SETAS: Record<string, typeof ArrowLeft> = { '←': ArrowLeft, '→': ArrowRight, '↑': ArrowUp, '↓': ArrowDown }

export function Kbd({ teclas, className }: { teclas: string; className?: string }) {
  const acordes = partesTecla(teclas)
  return (
    <span className={cx('ui-kbd', className)} aria-label={rotuloTecla(teclas)} role="img">
      {acordes.map((acorde, i) => (
        <span key={i} className="ui-kbd" aria-hidden="true">
          {i > 0 && <span className="text-meta text-fg-3">depois</span>}
          {acorde.map((t, j) => {
            const Seta = SETAS[t]
            return <kbd key={j}>{Seta ? <Seta className="ui-kbd-seta" aria-hidden="true" /> : t}</kbd>
          })}
        </span>
      ))}
    </span>
  )
}
