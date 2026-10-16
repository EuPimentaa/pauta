/**
 * Configurações › Aparência (todos; PLANO §3 F5): tema (Igual ao sistema, Claro, Escuro; prefs.tema, vale nos outros
 * aparelhos) e atalhos de uma tecla (prefs.atalhos). Nome, apelido, cor e senha ficam em Sua conta (ConfigConta.tsx).
 */
import { Link } from 'react-router'
import { Keyboard, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useEditarEu, useEu } from '../../api/auth.ts'
import { useTema, type PreferenciaTema } from '../../lib/tema.ts'
import { useMudarTema } from '../../sessao/tema.ts'
import { Interruptor } from '../../ui/Checkbox.tsx'
import { Painel } from './comum.tsx'

const TEMAS: { valor: PreferenciaTema; rotulo: string; texto: string; icone: typeof Sun }[] = [
  { valor: 'sistema', rotulo: 'Igual ao sistema', texto: 'Acompanha o claro e o escuro do aparelho.', icone: Monitor },
  { valor: 'claro', rotulo: 'Claro', texto: 'Fundo claro o tempo todo.', icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', texto: 'Fundo escuro o tempo todo.', icone: Moon },
]

function Tema() {
  const { preferencia } = useTema()
  const mudar = useMudarTema()
  return (
    <div role="radiogroup" aria-label="Tema" className="cad-opcoes"
      onKeyDown={(e) => {
        const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
        if (!passo) return
        e.preventDefault()
        const grupo = e.currentTarget
        const i = TEMAS.findIndex((t) => t.valor === preferencia)
        mudar(TEMAS[(i + passo + TEMAS.length) % TEMAS.length]!.valor)
        requestAnimationFrame(() => grupo.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
      }}>
      {TEMAS.map(({ valor, rotulo, texto, icone: I }) => (
        <button key={valor} type="button" role="radio" aria-checked={preferencia === valor} tabIndex={preferencia === valor ? 0 : -1}
          className="cad-opcao" onClick={() => mudar(valor)}>
          <span className="cad-opcao-nome"><I aria-hidden="true" />{rotulo}</span>
          <span className="cad-opcao-texto">{texto}</span>
        </button>
      ))}
    </div>
  )
}

export default function ConfigAparencia() {
  const eu = useEu()
  const editar = useEditarEu()
  const atalhos = eu.prefs.atalhos !== false
  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h2 className="cad-titulo">Aparência</h2>
          <p className="cad-subtitulo">Vale para você, em todos os aparelhos em que entrar. Nome, apelido, cor e senha ficam em <Link to="/config/conta" className="underline">Sua conta</Link>.</p>
        </div>
      </header>
      <Painel titulo="Tema" icone={Palette} id="cad-tema">
        <div className="cad-painel-corpo"><Tema /></div>
      </Painel>
      <Painel titulo="Atalhos de teclado" icone={Keyboard} id="cad-atalhos">
        <div className="cad-painel-corpo">
          <Interruptor ligado={atalhos} aoMudar={(v) => void editar({ prefs: { atalhos: v } })}>
            Atalhos de uma tecla (N, Q, Espaço, J e K…)
          </Interruptor>
          <p className="cad-nota">Desligados, sobram só os com Ctrl ou Cmd, como Ctrl+K. A lista completa abre com ?.</p>
        </div>
      </Painel>
    </div>
  )
}
