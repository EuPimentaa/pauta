/**
 * Estado da conexão em tempo real. O NÚCLEO-WEB (cliente SSE) alimenta com definirConexao(); a casca mostra a faixa
 * "Sem conexão · tentando de novo" enquanto não estiver 'online'.
 *   online       SSE aberto (ou polling respondendo)
 *   reconectando caiu e está tentando de novo (a faixa aparece depois de um respiro, para quedas de 1 s não piscarem)
 *   offline      navegador sem rede (navigator.onLine = false)
 */
import { useSyncExternalStore } from 'react'

export type EstadoConexao = 'online' | 'reconectando' | 'offline'

let estado: EstadoConexao = 'online'
const ouvintes = new Set<() => void>()

export function definirConexao(novo: EstadoConexao): void {
  if (novo === estado) return
  estado = novo
  ouvintes.forEach((f) => f())
}

export function estadoConexao(): EstadoConexao {
  return estado
}

export function useConexao(): EstadoConexao {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => estado,
    () => 'online' as const,
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => definirConexao('offline'))
  window.addEventListener('online', () => { if (estado === 'offline') definirConexao('reconectando') })
}
