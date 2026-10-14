/** Consultas de mídia como hooks. Celular = abaixo de 768 px (ARQUITETURA, convenções do front). */
import { useCallback, useSyncExternalStore } from 'react'

export const CONSULTA_CELULAR = '(max-width: 767.98px)'

export function useMidia(consulta: string): boolean {
  const assinar = useCallback((f: () => void) => {
    const m = window.matchMedia(consulta)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [consulta])
  return useSyncExternalStore(assinar, () => window.matchMedia(consulta).matches, () => false)
}

export function useCelular(): boolean {
  return useMidia(CONSULTA_CELULAR)
}

export function ehCelular(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(CONSULTA_CELULAR).matches
}

export function useMenosMovimento(): boolean {
  return useMidia('(prefers-reduced-motion: reduce)')
}

/** Aparelho de toque sem mouse (tooltips não aparecem). */
export function usePonteiroGrosso(): boolean {
  return useMidia('(hover: none)')
}
