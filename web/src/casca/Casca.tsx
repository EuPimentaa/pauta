/**
 * Casca autenticada (layout 'casca'): barra superior, menu lateral recolhível com [, conteúdo, faixa de conexão e,
 * no celular, o menu numa folha pelo topo e a barra de abas.
 */
import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useBootstrap } from '../api/bootstrap.ts'
import { useCelular } from '../lib/midia.ts'
import { Folha } from '../ui/Modal.tsx'
import { AbasCelular } from './AbasCelular.tsx'
import { BarraSuperior } from './BarraSuperior.tsx'
import { EsqueletoTela } from './Esqueletos.tsx'
import { FaixaConexao } from './FaixaConexao.tsx'
import { ConteudoMenu, MenuLateral } from './MenuLateral.tsx'
import { registrarQuadroRecente, useMenuRecolhido, useTeclaMenu } from './estado.ts'

/** Guarda o quadro aberto em /q/:slug nos recentes (localStorage). */
function useRegistrarRecentes() {
  const { pathname } = useLocation()
  const { data } = useBootstrap()
  useEffect(() => {
    const m = pathname.match(/^\/q\/([^/]+)/)
    if (!m || !data) return
    const slug = decodeURIComponent(m[1])
    const q = data.quadros.find((x) => x.slug === slug)
    if (q) registrarQuadroRecente(q.id)
  }, [pathname, data])
}

export function Casca() {
  const celular = useCelular()
  const [recolhido, setRecolhido] = useMenuRecolhido()
  const [menuCelular, setMenuCelular] = useState(false)
  const { pathname } = useLocation()
  const alternar = useCallback(() => setRecolhido(!recolhido), [recolhido, setRecolhido])
  useTeclaMenu(alternar)
  useRegistrarRecentes()
  useEffect(() => { setMenuCelular(false) }, [pathname])

  const recolhidoNoDesktop = recolhido && !celular
  return (
    <div className="casca" data-menu={recolhidoNoDesktop ? 'recolhido' : 'aberto'}>
      <a href="#conteudo" className="pular-conteudo">Pular para o conteúdo</a>
      <BarraSuperior recolhido={recolhidoNoDesktop} abrirMenuCelular={() => setMenuCelular(true)} menuCelularAberto={menuCelular} />
      <FaixaConexao />
      {!celular && <MenuLateral recolhido={recolhido} alternar={alternar} />}
      <main id="conteudo" className="casca-conteudo" tabIndex={-1}>
        <Suspense fallback={<EsqueletoTela />}>
          <Outlet />
        </Suspense>
      </main>
      {celular && (
        <>
          <Folha aberto={menuCelular} aoFechar={() => setMenuCelular(false)} titulo="Menu" lado="topo" className="casca-menu-celular">
            <ConteudoMenu arrastar={false} />
          </Folha>
          <AbasCelular />
        </>
      )}
    </div>
  )
}
