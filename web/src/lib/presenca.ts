/**
 * Mantém um componente montado durante a animação de saída. Com reduced-motion, desmonta na hora.
 *   const { montado, estado } = usePresenca(aberto)   // estado: 'aberto' | 'saindo' → data-estado
 */
import { useEffect, useState } from 'react'

export function usePresenca(aberto: boolean, saidaMs = 140): { montado: boolean; estado: 'aberto' | 'saindo' } {
  const [montado, setMontado] = useState(aberto)
  useEffect(() => {
    if (aberto) { setMontado(true); return }
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduzido || saidaMs <= 0) { setMontado(false); return }
    const t = window.setTimeout(() => setMontado(false), saidaMs)
    return () => window.clearTimeout(t)
  }, [aberto, saidaMs])
  return { montado: aberto || montado, estado: aberto ? 'aberto' : 'saindo' }
}
