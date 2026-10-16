/**
 * Estado compartilhado do tempo real com a tela:
 * - pausa: enquanto um card ou uma coluna está sendo arrastado, os eventos esperam o fim do arraste (PLANO §2) para
 *   o quadro não mudar debaixo do mouse;
 * - recebidos: o card que chega de outra pessoa pisca --accent-soft por 1,2 s (data-recebido).
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { Id } from '../../../shared/tipos/index.ts'

// ─────────────────────────────── pausa durante o arraste ───────────────────────────────

let pausas = 0
const aoRetomar = new Set<() => void>()

/** Segura a entrega dos eventos; devolve a função que solta (idempotente). */
export function pausarEntrega(): () => void {
  pausas++
  let solta = false
  return () => {
    if (solta) return
    solta = true
    pausas = Math.max(0, pausas - 1)
    if (pausas === 0) aoRetomar.forEach((f) => f())
  }
}

export function entregaPausada(): boolean {
  return pausas > 0
}

/** O cliente SSE escuta para esvaziar a fila quando o arraste termina. */
export function ouvirRetomada(f: () => void): () => void {
  aoRetomar.add(f)
  return () => { aoRetomar.delete(f) }
}

// ─────────────────────────────── cards recebidos ───────────────────────────────

export const DURACAO_RECEBIDO_MS = 1200

const recebidos = new Map<Id, number>()
const ouvintesRecebido = new Map<Id, Set<() => void>>()

function avisarRecebido(id: Id) {
  ouvintesRecebido.get(id)?.forEach((f) => f())
}

/** Marca o card como recém-chegado (outra pessoa moveu ou criou). Repetir reinicia o destaque. */
export function marcarRecebido(id: Id): void {
  const marca = Date.now()
  recebidos.set(id, marca)
  avisarRecebido(id)
  setTimeout(() => {
    if (recebidos.get(id) !== marca) return
    recebidos.delete(id)
    avisarRecebido(id)
  }, DURACAO_RECEBIDO_MS)
}

/** Fora do React (testes, depuração): o instante da marca ou 0. */
export function recebidoEm(id: Id): number {
  return recebidos.get(id) ?? 0
}

/** Instante da marca (muda a cada chegada: a tela usa como chave para reiniciar a animação) ou 0. */
export function useRecebido(id: Id): number {
  const assinar = useCallback((f: () => void) => {
    let s = ouvintesRecebido.get(id)
    if (!s) { s = new Set(); ouvintesRecebido.set(id, s) }
    s.add(f)
    return () => {
      s.delete(f)
      if (s.size === 0) ouvintesRecebido.delete(id)
    }
  }, [id])
  return useSyncExternalStore(assinar, () => recebidos.get(id) ?? 0, () => 0)
}
