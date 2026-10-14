/** Menu do avatar: tema Sistema · Claro · Escuro (prefs.tema + localStorage). */
import { useRef, type KeyboardEvent } from 'react'
import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import type { ExtensaoAvatar } from '../tipos.ts'
import { useTema, type PreferenciaTema } from '../../lib/tema.ts'
import { useMudarTema } from '../../sessao/tema.ts'
import { Tooltip } from '../../ui/Tooltip.tsx'

const OPCOES: { valor: PreferenciaTema; rotulo: string; icone: typeof Sun }[] = [
  { valor: 'sistema', rotulo: 'Igual ao sistema', icone: Monitor },
  { valor: 'claro', rotulo: 'Claro', icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', icone: Moon },
]

function Tema() {
  const { preferencia } = useTema()
  const mudar = useMudarTema()
  const grupo = useRef<HTMLDivElement>(null)

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const i = OPCOES.findIndex((o) => o.valor === preferencia)
    mudar(OPCOES[(i + passo + OPCOES.length) % OPCOES.length].valor)
    requestAnimationFrame(() => grupo.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }

  return (
    <div className="casca-conta-linha">
      <Palette aria-hidden="true" />
      <span id="rotulo-tema">Tema</span>
      <div ref={grupo} role="radiogroup" aria-labelledby="rotulo-tema" className="casca-tema" onKeyDown={aoTeclar}>
        {OPCOES.map(({ valor, rotulo, icone: I }) => (
          <Tooltip key={valor} texto={rotulo}>
            <button type="button" role="radio" aria-checked={preferencia === valor} aria-label={rotulo}
              tabIndex={preferencia === valor ? 0 : -1} onClick={() => mudar(valor)}>
              <I aria-hidden="true" />
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

export const avatar: ExtensaoAvatar = { id: 'nucleo-tema', ordem: 200, Componente: Tema }
