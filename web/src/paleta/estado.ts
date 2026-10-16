/**
 * Paleta Cmd+K aberta ou fechada (leve: o cmdk só baixa com a paleta, no global nucleo-paleta). Os atalhos (mod+k
 * e /), o botão de busca do topo e a aba Busca do celular abrem por aqui.
 */
import { useSyncExternalStore } from 'react'

let aberta = false
let termoInicial = ''
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function abrirPaleta(termo = ''): void {
  termoInicial = termo
  if (aberta) return
  aberta = true
  avisar()
}

export function fecharPaleta(): void {
  if (!aberta) return
  aberta = false
  avisar()
}

export function alternarPaleta(): void {
  if (aberta) fecharPaleta()
  else abrirPaleta()
}

export const paletaAberta = (): boolean => aberta
export const termoInicialPaleta = (): string => termoInicial

export function usePaletaAberta(): boolean {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => aberta, () => false)
}
