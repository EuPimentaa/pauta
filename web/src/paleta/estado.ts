/**
 * Paleta Cmd+K aberta ou fechada (leve: o cmdk só baixa com a paleta, no global nucleo-paleta). Os atalhos (mod+k
 * e /), o botão de busca do topo e a aba Busca do celular abrem por aqui.
 */
import { useSyncExternalStore } from 'react'
import type { Id } from '@shared/tipos/index.ts'
import { demandaEmFocoId } from '../teclado/foco.ts'

let aberta = false
let termoInicial = ''
/**
 * A demanda em foco quando a paleta abriu: abrir tira o foco do card (vai para o campo) e a paleta cobre o mouse, e
 * os comandos sobre "o card em foco" precisam continuar valendo para ele.
 */
let focoNaAbertura: Id | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function abrirPaleta(termo = ''): void {
  termoInicial = termo
  if (aberta) return
  focoNaAbertura = demandaEmFocoId()
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
export const demandaNaAberturaPaleta = (): Id | null => focoNaAbertura

export function usePaletaAberta(): boolean {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => aberta, () => false)
}
