/**
 * Barra superior escura com vidro (.chrome-dark nos dois temas): marca (logo da Melt + nome do produto; o "e" com o
 * menu recolhido), slots de extensoes/topo (esquerda e direita) e o avatar. No celular: botão do menu, "e", avatar
 * (as ações do topo vão para a barra de abas de extensoes/celular).
 */
import { Link } from 'react-router'
import { Menu as IconeMenu } from 'lucide-react'
import { useNomeApp } from '../lib/app.ts'
import { useCelular } from '../lib/midia.ts'
import { useRegistro } from '../sessao/registro.ts'
import { BotaoIcone } from '../ui/Botao.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { MarcaProduto } from '../ui/Marca.tsx'
import { MenuAvatar } from './MenuAvatar.tsx'

function Slots({ lado }: { lado: 'esquerda' | 'direita' }) {
  const reg = useRegistro()
  const itens = reg.topo().filter((t) => t.lado === lado)
  if (itens.length === 0) return null
  return (
    <div className="casca-topo-slots">
      {itens.map((t) => (
        <LimiteErro key={t.id} nome={`topo ${t.id}`} fallback={null}><t.Componente /></LimiteErro>
      ))}
    </div>
  )
}

export function BarraSuperior({ recolhido, abrirMenuCelular, menuCelularAberto }: { recolhido: boolean; abrirMenuCelular(): void; menuCelularAberto: boolean }) {
  const celular = useCelular()
  const nome = useNomeApp()
  return (
    <header className="casca-topo chrome-dark vidro-plano">
      {celular && (
        <BotaoIcone icone={IconeMenu} rotulo="Menu" semDica onClick={abrirMenuCelular} aria-expanded={menuCelularAberto} aria-haspopup="dialog" />
      )}
      <Link to="/" className="casca-marca" aria-label={`${nome}: ir para o Início`}>
        <MarcaProduto compacta={recolhido && !celular} />
      </Link>
      {!celular && <Slots lado="esquerda" />}
      <span className="casca-topo-espaco" />
      {!celular && <Slots lado="direita" />}
      <MenuAvatar />
    </header>
  )
}
