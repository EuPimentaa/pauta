/**
 * Área autenticada (rota de layout sem caminho): carrega o bootstrap e o registro de extensões, aplica o tema da pessoa,
 * monta os globais 'autenticada' e desenha a rota sobreposta (se houver) por cima do Outlet. Sem sessão → /entrar?volta=.
 */
import { Suspense, useContext } from 'react'
import { Navigate, Outlet } from 'react-router'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useBootstrap } from '../api/bootstrap.ts'
import { EsqueletoCasca } from '../casca/Esqueletos.tsx'
import { Botao } from '../ui/Botao.tsx'
import { EstadoVazio } from '../ui/Indicadores.tsx'
import { Globais } from './Globais.tsx'
import { useRegistro } from './registro.ts'
import { ContextoSobreposta } from './sobreposta.tsx'
import { useSincronizarTema } from './tema.ts'

function ComRegistro() {
  useRegistro()          // suspende até o registro carregar (uma vez por sessão)
  useSincronizarTema()
  const { sobreposta } = useContext(ContextoSobreposta)
  return (
    <>
      <Globais escopo="autenticada" />
      <Outlet />
      {sobreposta}
    </>
  )
}

export function AreaAutenticada() {
  const boot = useBootstrap()
  if (boot.error?.status === 401) {
    const { pathname, search, hash } = window.location
    return <Navigate to={`/entrar?volta=${encodeURIComponent(pathname + search + hash)}`} replace />
  }
  if (boot.isPending) return <EsqueletoCasca />
  if (boot.isError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6">
        <EstadoVazio
          icone={WifiOff}
          titulo="Não foi possível abrir o sistema."
          texto={boot.error.status === 0 ? 'O servidor não respondeu. Confira a conexão e tente de novo.' : boot.error.mensagem}
          acoes={<Botao variante="secundario" icone={RefreshCw} carregando={boot.isFetching} onClick={() => void boot.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    )
  }
  return (
    <Suspense fallback={<EsqueletoCasca />}>
      <ComRegistro />
    </Suspense>
  )
}
