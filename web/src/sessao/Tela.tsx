/**
 * Uma tela de telas/**\/rota.tsx: React.lazy uma vez por caminho, Suspense com esqueleto, título da aba e o acesso
 * 'admin'. Usada pelo App.tsx para cada rota.
 */
import { lazy, Suspense, useLayoutEffect, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useSessao } from '../api/auth.ts'
import type { ExtensaoRota } from '../extensoes/tipos.ts'
import { nomeApp } from '../lib/app.ts'
import { EstadoVazio } from '../ui/Indicadores.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { EsqueletoTela } from './EsqueletoTela.tsx'

const telas = new Map<string, LazyExoticComponent<ComponentType>>()

function componenteDaRota(r: ExtensaoRota): LazyExoticComponent<ComponentType> {
  let c = telas.get(r.caminho)
  if (!c) { c = lazy(r.carregar); telas.set(r.caminho, c) }
  return c
}

/** Título estático da rota; telas com título dinâmico chamam useTituloAba() (efeito passivo, vence este). */
function useTituloRota(titulo: string | undefined) {
  useLayoutEffect(() => {
    const antes = document.title
    document.title = titulo ? `${titulo} · ${nomeApp()}` : nomeApp()
    return () => { document.title = antes }
  }, [titulo])
}

export function Tela({ rota, esqueleto }: { rota: ExtensaoRota; esqueleto?: ReactNode }) {
  useTituloRota(rota.titulo)
  const { eu } = useSessao({ buscar: false })
  if (rota.acesso === 'admin' && eu?.usuario.papel !== 'admin') {
    return (
      <EstadoVazio icone={ShieldAlert} titulo="Você não tem acesso a esta página."
        texto="Ela é só para quem administra o sistema. Peça ao admin, se precisar." />
    )
  }
  const C = componenteDaRota(rota)
  return (
    <LimiteErro nome={`tela ${rota.caminho}`}>
      <Suspense fallback={esqueleto ?? <EsqueletoTela />}>
        <C />
      </Suspense>
    </LimiteErro>
  )
}
