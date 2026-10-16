/**
 * Roteador do app (PLANO §1.2). As telas vêm de telas/**\/rota.tsx (extensoes/registro-rotas.ts), cada uma em chunk
 * próprio. Rotas públicas (/entrar, /convite, /redefinir, /a/:token) não chamam o bootstrap, não abrem o SSE, não
 * baixam o registro de extensões e nunca redirecionam. As sobrepostas desenham por cima da tela de antes
 * ("background location": navegue com { state: { fundo: location } }, ver sessao/sobreposta.tsx).
 */
import { lazy, Suspense, useMemo } from 'react'
import { BrowserRouter, Navigate, Route, Routes, matchRoutes, useLocation, type Location } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { definirRotaPublica, ErroDaApi } from './api/cliente.ts'
import { useEu } from './api/auth.ts'
import { rotas } from './extensoes/registro-rotas.ts'
import type { ExtensaoRota } from './extensoes/tipos.ts'
import type { Eu } from '@shared/tipos/index.ts'
import { Globais } from './sessao/Globais.tsx'
import { ContextoSobreposta, useAreaPronta, type EstadoFundo } from './sessao/sobreposta.tsx'
import { Tela } from './sessao/Tela.tsx'
import { Avisos } from './ui/avisos.tsx'

// A área autenticada (casca, menu, dnd-kit...) fica fora do chunk de entrada: a página pública não a baixa.
const AreaAutenticada = lazy(() => import('./sessao/AreaAutenticada.tsx').then((m) => ({ default: m.AreaAutenticada })))
const Casca = lazy(() => import('./casca/Casca.tsx').then((m) => ({ default: m.Casca })))
/** Enquanto o chunk da área autenticada chega (uma vez): só o canvas, o esqueleto da casca vem com ele. */
const Canvas = () => <div className="min-h-dvh bg-canvas" aria-busy="true" />

const NaoEncontrada = lazy(() => import('./casca/NaoEncontrada.tsx').then((m) => ({ default: m.NaoEncontrada })))

export const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (falhas, e) => !(e instanceof ErroDaApi && e.status >= 400 && e.status < 500) && falhas < 2,
    },
    mutations: { retry: false },
  },
})

function IrParaInicial() {
  const eu = useEu()
  return <Navigate to={eu.rotaInicial} replace />
}

/** Tela de baixo de uma sobreposta aberta direto pela URL sem `fundo` próprio (Eu.rotaInicial é sempre '/inicio' no MVP). */
const ROTA_INICIAL: Eu['rotaInicial'] = '/inicio'

const casar = (lista: ExtensaoRota[], location: Location) => !!matchRoutes(lista.map((r) => ({ path: r.caminho })), location)

/** A tela de baixo de uma sobreposta aberta direto: a que a rota pede (ExtensaoRota.fundo), senão a inicial. */
function fundoDireto(sobrepostas: ExtensaoRota[], location: Location): Location {
  const achada = matchRoutes(sobrepostas.map((r) => ({ path: r.caminho, rota: r })), location)?.[0]
  let caminho: string | null = null
  try {
    caminho = achada ? (achada.route as { rota: ExtensaoRota }).rota.fundo?.(achada.params, qc) ?? null : null
  } catch {
    caminho = null
  }
  const destino = caminho ?? ROTA_INICIAL
  const interrogacao = destino.indexOf('?')
  const pathname = interrogacao < 0 ? destino : destino.slice(0, interrogacao)
  const search = interrogacao < 0 ? '' : destino.slice(interrogacao)
  return { pathname, search, hash: '', state: null, key: 'fundo' }
}

function Raiz() {
  const location = useLocation()
  const todas = rotas()
  const grupos = useMemo(() => ({
    publicas: todas.filter((r) => r.acesso === 'publica'),
    sobrepostas: todas.filter((r) => r.acesso !== 'publica' && r.layout === 'sobreposta'),
    casca: todas.filter((r) => r.acesso !== 'publica' && r.layout === 'casca'),
    vazias: todas.filter((r) => r.acesso !== 'publica' && r.layout === 'vazio'),
  }), [todas])

  const publica = casar(grupos.publicas, location)
  definirRotaPublica(publica)

  const emSobreposta = !publica && casar(grupos.sobrepostas, location)
  const fundoDoEstado = (location.state as EstadoFundo | null)?.fundo ?? null
  // a sobreposta fica fora da árvore de rotas (um <Routes> dentro da rota de layout gera aviso do react-router) e só
  // aparece com a área autenticada pronta (sessão, bootstrap e registro), por cima da tela de baixo. Aberta direto,
  // o fundo vem da própria rota (o quadro da demanda) e é recalculado quando a área fica pronta (o bootstrap chegou)
  const areaPronta = useAreaPronta()
  // calculado uma vez por entrada do histórico (e de novo quando a área fica pronta): arquivar a demanda aberta a tira
  // do bootstrap, e o fechar ainda precisa levar ao quadro dela
  const direto = useMemo(
    () => (emSobreposta && !fundoDoEstado ? fundoDireto(grupos.sobrepostas, location) : null),
    [emSobreposta, !fundoDoEstado, location.key, location.pathname, areaPronta, grupos.sobrepostas],
  )
  const fundo: Location | null = emSobreposta ? fundoDoEstado ?? direto : null

  return (
    <ContextoSobreposta.Provider value={{ fundo, fundoDoHistorico: !!fundoDoEstado }}>
      <Routes location={fundo ?? location}>
        {grupos.publicas.map((r) => <Route key={r.caminho} path={r.caminho} element={<Tela rota={r} esqueleto={null} />} />)}
        <Route element={<Suspense fallback={<Canvas />}><AreaAutenticada /></Suspense>}>
          <Route path="/" element={<IrParaInicial />} />
          {grupos.vazias.map((r) => <Route key={r.caminho} path={r.caminho} element={<Tela rota={r} />} />)}
          <Route element={<Suspense fallback={<Canvas />}><Casca /></Suspense>}>
            {grupos.casca.map((r) => <Route key={r.caminho} path={r.caminho} element={<Tela rota={r} />} />)}
            <Route path="*" element={<NaoEncontrada />} />
          </Route>
        </Route>
      </Routes>
      {emSobreposta && areaPronta && (
        <Routes location={location}>
          {grupos.sobrepostas.map((r) => <Route key={r.caminho} path={r.caminho} element={<Tela rota={r} esqueleto={null} />} />)}
        </Routes>
      )}
      <Globais escopo="raiz" />
    </ContextoSobreposta.Provider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Raiz />
      </BrowserRouter>
      <Avisos />
    </QueryClientProvider>
  )
}
