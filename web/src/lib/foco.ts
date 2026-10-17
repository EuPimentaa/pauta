/** Foco: elementos focáveis, armadilha de Tab nas camadas e devolução do foco a quem abriu. */
import { useEffect, type RefObject } from 'react'

const SELETOR = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'iframe', '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Foco automático ao carregar uma tela só com mouse ou trackpad: no telefone e no tablet ele abre o teclado na carga,
 * que cobre o cartão antes de a pessoa ler a tela.
 */
export function focoNaCarga(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
}

/**
 * Paradas do Tab dentro de `raiz`, na ordem do documento. Quem tem `tabindex="-1"` fica de fora mesmo sendo botão ou
 * campo (as abas inativas e os itens de foco itinerante): o foco inicial cai na aba escolhida, não na primeira, e a
 * armadilha do Tab vê o último elemento que o Tab alcança de verdade.
 */
export function focaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR)).filter(
    (el) => el.getAttribute('tabindex') !== '-1' && !el.closest('[inert]') && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden',
  )
}

/**
 * Onde o foco entra numa camada: [data-autofocus]; senão o primeiro focável que não seja o "Fechar" do cabeçalho
 * (marcado com data-foco-por-ultimo), ou seja, o primeiro campo de um formulário ou, num diálogo de confirmação, o
 * Cancelar (a ação menos destrutiva vem antes no rodapé); senão o próprio "Fechar"; senão o contêiner.
 */
export function alvoDoFocoInicial(raiz: HTMLElement): HTMLElement {
  const marcado = raiz.querySelector<HTMLElement>('[data-autofocus]')
  if (marcado) return marcado
  const lista = focaveis(raiz)
  return lista.find((el) => !el.hasAttribute('data-foco-por-ultimo')) ?? lista[0] ?? raiz
}

/**
 * Enquanto `ativa`: põe o foco dentro de `ref` (alvoDoFocoInicial), prende o Tab ali (se `prender`) e, ao desativar,
 * devolve o foco ao elemento que estava focado antes.
 */
export function useArmadilhaFoco(ref: RefObject<HTMLElement | null>, ativa: boolean, prender = true): void {
  useEffect(() => {
    if (!ativa) return
    const anterior = document.activeElement as HTMLElement | null
    const raiz = ref.current
    if (!raiz) return
    const quadro = requestAnimationFrame(() => {
      if (raiz.contains(document.activeElement)) return
      alvoDoFocoInicial(raiz).focus({ preventScroll: true })
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
