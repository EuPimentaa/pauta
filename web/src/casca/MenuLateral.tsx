/**
 * Menu lateral (vidro): grupo `trabalho` (extensoes/menu), seção Quadros (da casca) e grupo `agencia`; recolhido vira
 * um trilho de ícones com os favoritos em quadradinhos. No celular, o mesmo conteúdo abre numa folha pelo topo.
 */
import { NavLink } from 'react-router'
import { LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ExtensaoMenu, ItemMenu } from '../extensoes/tipos.ts'
import { useRegistro } from '../sessao/registro.ts'
import { Contador } from '../ui/Indicadores.tsx'
import { Kbd } from '../ui/Kbd.tsx'
import { Tooltip } from '../ui/Tooltip.tsx'
import { caminhoQuadro, SecaoQuadros, useQuadrosDoMenu } from './SecaoQuadros.tsx'

/** Chama o useItens() de cada extensão do grupo (ordem fixa; a chave do componente muda se a lista mudar). */
function useItensDoGrupo(exts: ExtensaoMenu[]): ItemMenu[] {
  const itens: ItemMenu[] = []
  for (const e of exts) itens.push(...e.useItens())
  return itens.sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id))
}

function ItensGrupo({ exts, rotulo, recolhido }: { exts: ExtensaoMenu[]; rotulo: string; recolhido?: boolean }) {
  const itens = useItensDoGrupo(exts)
  if (itens.length === 0) return null
  if (recolhido) {
    return (
      <>
        {itens.map((i) => {
          const I = i.icone
          return (
            <Tooltip key={i.id} texto={i.contador ? `${i.rotulo} (${i.contador})` : i.rotulo} lado="direita">
              <NavLink to={i.caminho} className="casca-item" aria-label={i.contador ? `${i.rotulo}, ${i.contador}` : i.rotulo}>
                <I aria-hidden="true" />
              </NavLink>
            </Tooltip>
          )
        })}
      </>
    )
  }
  return (
    <nav className="casca-grupo" aria-label={rotulo}>
      <ul className="casca-lista">
        {itens.map((i) => {
          const I = i.icone
          return (
            <li key={i.id}>
              <NavLink to={i.caminho} className="casca-item">
                <I aria-hidden="true" />
                <span className="casca-item-rotulo">{i.rotulo}</span>
                {i.contador ? <Contador valor={i.contador} tom="suave" /> : null}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function GrupoMenu({ grupo, recolhido }: { grupo: ExtensaoMenu['grupo']; recolhido?: boolean }) {
  const reg = useRegistro()
  const exts = reg.menus().filter((m) => m.grupo === grupo)
  return <ItensGrupo key={exts.map((e) => e.id).join('|')} exts={exts} rotulo={grupo === 'trabalho' ? 'Trabalho' : 'Agência'} recolhido={recolhido} />
}

/** Conteúdo do menu (desktop aberto e folha do celular). */
export function ConteudoMenu({ arrastar = true }: { arrastar?: boolean }) {
  return (
    <>
      <GrupoMenu grupo="trabalho" />
      <SecaoQuadros arrastar={arrastar} />
      <GrupoMenu grupo="agencia" />
    </>
  )
}

function Trilho({ abrir }: { abrir(): void }) {
  const { favoritos } = useQuadrosDoMenu()
  return (
    <div className="casca-trilho">
      <GrupoMenu grupo="trabalho" recolhido />
      <div className="casca-trilho-sep" aria-hidden="true" />
      <Tooltip texto="Quadros" atalho="[" lado="direita">
        <button type="button" className="casca-item" aria-label="Abrir o menu com os quadros" onClick={abrir}>
          <LayoutGrid aria-hidden="true" />
        </button>
      </Tooltip>
      {favoritos.slice(0, 8).map((q) => (
        <Tooltip key={q.id} texto={q.nome} lado="direita">
          <NavLink to={caminhoQuadro(q)} className="casca-quadro-mini" data-cor={q.cor} aria-label={q.nome}>
            <span aria-hidden="true">{q.nome.trim().charAt(0).toUpperCase()}</span>
          </NavLink>
        </Tooltip>
      ))}
      <div className="casca-trilho-sep" aria-hidden="true" />
      <GrupoMenu grupo="agencia" recolhido />
    </div>
  )
}

export function MenuLateral({ recolhido, alternar }: { recolhido: boolean; alternar(): void }) {
  return (
    <aside className="casca-menu vidro-plano" aria-label="Menu">
      <div className="casca-menu-rolagem">
        {recolhido ? <Trilho abrir={alternar} /> : <ConteudoMenu />}
      </div>
      <div className="casca-menu-rodape">
        <Tooltip texto={recolhido ? 'Abrir o menu' : 'Recolher o menu'} atalho="[" lado="direita" desabilitado={!recolhido}>
          <button type="button" className="casca-recolher" onClick={alternar} aria-expanded={!recolhido} aria-keyshortcuts="[">
            {recolhido ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            {recolhido ? <span className="sr-only">Abrir o menu</span> : <><span>Recolher o menu</span><Kbd teclas="[" /></>}
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
