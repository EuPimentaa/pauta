/** Foco: elementos focáveis, armadilha de Tab nas camadas e devolução do foco a quem abriu. */
import { useEffect, type RefObject } from 'react'

const SELETOR = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'iframe', '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR)).filter(
    (el) => !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  )
}

/**
 * Enquanto `ativa`: põe o foco dentro de `ref` ([data-autofocus], senão o primeiro focável, senão o próprio contêiner),
 * prende o Tab ali (se `prender`) e, ao desativar, devolve o foco ao elemento que estava focado antes.
 */
export function useArmadilhaFoco(ref: RefObject<HTMLElement | null>, ativa: boolean, prender = true): void {
  useEffect(() => {
    if (!ativa) return
    const anterior = document.activeElement as HTMLElement | null
    const raiz = ref.current
    if (!raiz) return
    const quadro = requestAnimationFrame(() => {
      if (raiz.contains(document.activeElement)) return
      const alvo = raiz.querySelector<HTMLElement>('[data-autofocus]') ?? focaveis(raiz)[0] ?? raiz
      alvo.focus({ preventScroll: true })
    })
    function aoTeclar(e: KeyboardEvent) {
      if (!prender || e.key !== 'Tab' || !raiz) return
      const lista = focaveis(raiz)
      if (lista.length === 0) { e.preventDefault(); raiz.focus(); return }
      const primeiro = lista[0], ultimo = lista[lista.length - 1]
      const atual = document.activeElement
      if (e.shiftKey && (atual === primeiro || !raiz.contains(atual))) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && (atual === ultimo || !raiz.contains(atual))) { e.preventDefault(); primeiro.focus() }
    }
    raiz.addEventListener('keydown', aoTeclar)
    return () => {
      cancelAnimationFrame(quadro)
      raiz.removeEventListener('keydown', aoTeclar)
      // devolve o foco só se ele ainda está dentro da camada que fecha (ou se perdeu no body)
      const ativo = document.activeElement
      if (anterior && anterior.isConnected && (!ativo || ativo === document.body || raiz.contains(ativo))) {
        anterior.focus({ preventScroll: true })
      }
    }
  }, [ref, ativa, prender])
}
