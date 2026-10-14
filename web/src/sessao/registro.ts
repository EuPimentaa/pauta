/**
 * Carrega extensoes/registro.ts sob demanda (só a área autenticada chama): a página pública nunca baixa as extensões.
 *   const reg = useRegistro()        // suspende até carregar (use dentro de <Suspense>)
 *   const reg = useRegistroSeCarregado()   // null enquanto não carregou (não suspende)
 */
import { use, useSyncExternalStore } from 'react'

export type ModuloRegistro = typeof import('../extensoes/registro.ts')

let promessa: Promise<ModuloRegistro> | null = null
let carregado: ModuloRegistro | null = null
const ouvintes = new Set<() => void>()

export function carregarRegistro(): Promise<ModuloRegistro> {
  promessa ??= import('../extensoes/registro.ts').then((m) => {
    carregado = m
    ouvintes.forEach((f) => f())
    return m
  })
  return promessa
}

export function useRegistro(): ModuloRegistro {
  return carregado ?? use(carregarRegistro())
}

export function useRegistroSeCarregado(): ModuloRegistro | null {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => carregado,
    () => null,
  )
}
