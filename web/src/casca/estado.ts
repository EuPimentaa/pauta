/**
 * Estado da casca: menu lateral recolhido (prefs.menuRecolhido + localStorage para não piscar), quadros recentes e os
 * atalhos que a própria casca escuta.
 */
import { useCallback, useEffect } from 'react'
import type { Id } from '@shared/tipos/index.ts'
import { useEditarEu, useSessao } from '../api/auth.ts'
import { gravarLocal, lerLocal, useLocal } from '../lib/armazenamento.ts'
import { emCampoDeTexto } from '../lib/teclas.ts'

/** Atalhos tratados pela casca (para a lista do "?" do F4 mostrar). */
export const ATALHOS_CASCA = [
  { teclas: '[', descricao: 'Recolher ou abrir o menu lateral', grupo: 'navegacao' as const },
] as const

export function useMenuRecolhido(): [boolean, (v: boolean) => void] {
  const { eu } = useSessao({ buscar: false })
  const [local, setLocal] = useLocal<boolean>('menu-recolhido', false)
  const editar = useEditarEu()
  const doServidor = eu?.prefs.menuRecolhido
  useEffect(() => {
    if (doServidor !== undefined && doServidor !== lerLocal('menu-recolhido', false)) setLocal(doServidor)
  }, [doServidor, setLocal])
  const definir = useCallback((v: boolean) => {
    setLocal(v)
    if (eu) void editar({ prefs: { menuRecolhido: v } }, { silencioso: true })
  }, [eu, editar, setLocal])
  return [local, definir]
}

/** `[` recolhe/abre o menu (fora de campos de texto; desligável por prefs.atalhos). */
export function useTeclaMenu(alternar: () => void): void {
  const { eu } = useSessao({ buscar: false })
  const ligados = eu?.prefs.atalhos !== false
  useEffect(() => {
    if (!ligados) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || e.repeat) return
      if (emCampoDeTexto(e.target) || document.querySelector('#camadas [aria-modal="true"]')) return
      e.preventDefault()
      alternar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [ligados, alternar])
}

// ─────────────── quadros recentes (localStorage, como no Trello) ───────────────

const MAX_RECENTES = 6

export function registrarQuadroRecente(id: Id): void {
  const atuais = lerLocal<Id[]>('quadros-recentes', [])
  if (atuais[0] === id) return
  gravarLocal('quadros-recentes', [id, ...atuais.filter((x) => x !== id)].slice(0, MAX_RECENTES))
}

export function useQuadrosRecentes(): Id[] {
  return useLocal<Id[]>('quadros-recentes', [])[0]
}
