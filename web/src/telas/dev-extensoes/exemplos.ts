/**
 * Apoio das contribuições de exemplo (extensoes/*\/nucleo-exemplo*, só DEV) da tela /dev/extensoes: o registro do que
 * cada host chamou (para a tela mostrar a ordem) e os diálogos de exemplo no MapaDialogos (só tipos).
 */
import { useSyncExternalStore } from 'react'
import type { Id } from '@shared/tipos/index.ts'

declare module '../../extensoes/tipos.ts' {
  interface MapaDialogos {
    'nucleo-exemplo-modal': { mensagem: string }
    'nucleo-exemplo-popover': { mensagem: string }
    'nucleo-exemplo-soltar': { demandaId: Id; colunaNome: string }
  }
  interface MapaResultadosDialogos {
    'nucleo-exemplo-modal': { ok: true }
    'nucleo-exemplo-popover': { ok: true }
    'nucleo-exemplo-soltar': { escolha: 'seguir' | 'feito' | 'cancelado' }
  }
}

export interface LinhaRegistro { quando: number; texto: string }

let linhas: readonly LinhaRegistro[] = []
const ouvintes = new Set<() => void>()

/** Anota o que um host chamou ("tratador a: demanda #12"). Guarda as 40 últimas. */
export function anotar(texto: string): void {
  linhas = [{ quando: Date.now(), texto }, ...linhas].slice(0, 40)
  ouvintes.forEach((f) => f())
}

export function limparRegistro(): void {
  linhas = []
  ouvintes.forEach((f) => f())
}

export function useRegistroExemplos(): readonly LinhaRegistro[] {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => linhas, () => linhas)
}

// contador da aba de exemplo do celular (useContador)
let contador = 3
const ouvintesContador = new Set<() => void>()
export function mudarContador(n: number): void {
  contador = n
  ouvintesContador.forEach((f) => f())
}
export function useContadorExemplo(): number {
  return useSyncExternalStore((f) => { ouvintesContador.add(f); return () => { ouvintesContador.delete(f) } }, () => contador, () => contador)
}
