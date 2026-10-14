/**
 * Rotas sobrepostas (layout 'sobreposta': /d/:numero, /quadros/novo) desenham por cima da tela de antes, no padrão
 * "background location" do react-router: navegue com o estado { fundo: location }.
 *
 *   const abrir = useAbrirSobreposta(); abrir(`/d/${numero}`)
 *   const fechar = useFecharSobreposta(); <Modal aoFechar={fechar}>…
 * Aberta direto pela URL (sem fundo), a tela de baixo é a rota inicial (eu.rotaInicial) e fechar leva para lá.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router'

export interface EstadoFundo { fundo?: Location }

interface CtxSobreposta {
  /** Tela de baixo quando há uma sobreposta aberta; null quando não há. */
  fundo: Location | null
  /** A rota sobreposta casada (desenhada pela área autenticada por cima do Outlet). */
  sobreposta: ReactNode
  /** O fundo veio do estado da navegação (fechar = voltar no histórico). */
  fundoDoHistorico: boolean
}

export const ContextoSobreposta = createContext<CtxSobreposta>({ fundo: null, sobreposta: null, fundoDoHistorico: false })

export function useFundo(): Location | null {
  return useContext(ContextoSobreposta).fundo
}

export function useAbrirSobreposta(): (caminho: string, opcoes?: { substituir?: boolean }) => void {
  const navegar = useNavigate()
  const location = useLocation()
  const { fundo } = useContext(ContextoSobreposta)
  return (caminho, opcoes) => {
    // de dentro de uma sobreposta (← → entre demandas) mantém o mesmo fundo e troca a entrada do histórico, para o
    // "fechar" (voltar) cair direto na tela de baixo
    navegar(caminho, { state: { fundo: fundo ?? location } satisfies EstadoFundo, replace: opcoes?.substituir ?? !!fundo })
  }
}

export function useFecharSobreposta(): () => void {
  const navegar = useNavigate()
  const { fundo, fundoDoHistorico } = useContext(ContextoSobreposta)
  return () => {
    if (!fundo) return
    if (fundoDoHistorico && window.history.length > 1) navegar(-1)
    else navegar(fundo.pathname + fundo.search + fundo.hash, { replace: true })
  }
}
