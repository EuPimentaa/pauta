/**
 * Cards pendentes: soltos num lugar enquanto um interceptador decide (extensoes/soltar), desenhados com opacidade
 * 0,6 e borda tracejada (data-pendente). Por id, para só o card certo redesenhar.
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { Id } from '../../../shared/tipos/index.ts'

const pendentes = new Set<Id>()
const ouvintes = new Map<Id, Set<() => void>>()

export function marcarPendente(id: Id, pendente: boolean): void {
  if (pendente === pendentes.has(id)) return
  if (pendente) pendentes.add(id)
  else pendentes.delete(id)
  ouvintes.get(id)?.forEach((f) => f())
}

export function usePendente(id: Id): boolean {
  const assinar = useCallback((f: () => void) => {
    let s = ouvintes.get(id)
    if (!s) { s = new Set(); ouvintes.set(id, s) }
    s.add(f)
    return () => {
      s.delete(f)
      if (s.size === 0) ouvintes.delete(id)
    }
  }, [id])
  return useSyncExternalStore(assinar, () => pendentes.has(id), () => false)
}
