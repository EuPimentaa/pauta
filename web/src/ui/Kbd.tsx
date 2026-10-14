/** Tecla de atalho: <Kbd teclas="mod+k" /> → Ctrl K (⌘K no Mac); 'g a' mostra o acorde. */
import { partesTecla, rotuloTecla } from '../lib/teclas.ts'
import { cx } from '../lib/classes.ts'

export function Kbd({ teclas, className }: { teclas: string; className?: string }) {
  const acordes = partesTecla(teclas)
  return (
    <span className={cx('ui-kbd', className)} aria-label={rotuloTecla(teclas)} role="img">
      {acordes.map((acorde, i) => (
        <span key={i} className="ui-kbd" aria-hidden="true">
          {i > 0 && <span className="text-meta text-fg-3">depois</span>}
          {acorde.map((t, j) => <kbd key={j}>{t}</kbd>)}
        </span>
      ))}
    </span>
  )
}
