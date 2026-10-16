/**
 * "Devolve em 200 ms" (PLANO §2): quando um movimento é cancelado ou falha, o card volta deslizando do lugar onde
 * estava para o lugar de antes (FLIP). Quem reverte chama prepararVolta(id) ANTES de mudar o cache; o card, ao
 * redesenhar no lugar antigo, chama animarVoltaSeHouver(id, elemento).
 */
import type { Id } from '../../../shared/tipos/index.ts'

export const VOLTA_MS = 200
const voltas = new Map<Id, DOMRect>()

/** Guarda onde o card está agora (antes de o cache voltar). */
export function prepararVolta(id: Id): void {
  if (typeof document === 'undefined') return
  const el = document.querySelector<HTMLElement>(`[data-demanda-id="${CSS.escape(id)}"]`)
  if (el) voltas.set(id, el.getBoundingClientRect())
  // se o card não redesenhar logo (não está na tela), esquece
  setTimeout(() => voltas.delete(id), 1000)
}

export function animarVoltaSeHouver(id: Id, el: HTMLElement | null): void {
  const de = voltas.get(id)
  if (!de || !el) return
  voltas.delete(id)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const para = el.getBoundingClientRect()
  const dx = de.left - para.left, dy = de.top - para.top
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
  el.animate(
    [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.6 }, { transform: 'translate(0, 0)', opacity: 1 }],
    { duration: VOLTA_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
  )
}
