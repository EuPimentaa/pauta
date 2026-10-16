/** Botão de busca da barra superior (NÚCLEO-WEB; ordem 100 à esquerda): abre a paleta (Ctrl/Cmd+K ou /). */
import '../../paleta/botao.css'
import { Search } from 'lucide-react'
import type { ExtensaoTopo } from '../tipos.ts'
import { abrirPaleta } from '../../paleta/estado.ts'
import { Kbd } from '../../ui/Kbd.tsx'

function BotaoBusca() {
  return (
    <button type="button" className="topo-busca" onClick={() => abrirPaleta()} aria-keyshortcuts="Control+K /" aria-haspopup="dialog">
      <Search aria-hidden="true" />
      <span className="topo-busca-texto">Buscar ou ir para…</span>
      <Kbd teclas="mod+k" />
    </button>
  )
}

export const topo: ExtensaoTopo = { id: 'nucleo-busca', ordem: 100, lado: 'esquerda', Componente: BotaoBusca }
