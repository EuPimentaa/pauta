/**
 * Peças do arrastar do quadro (dnd-kit): ids e dados dos alvos, sensores (mouse, toque com espera e teclado), a
 * detecção de colisão entre colunas e as setas do teclado de lugar em lugar.
 *
 * Teclado: no card, Shift+Espaço pega (Espaço sozinho é "entrar na demanda" e Enter abre); na coluna, Espaço no
 * cabeçalho. Com o item pego: setas andam, Espaço solta, Esc cancela (volta em 200 ms).
 */
import type { KeyboardEvent as EventoReact } from 'react'
import {
  KeyboardSensor, closestCenter, getFirstCollision, pointerWithin, rectIntersection,
  type Activator, type Collision, type CollisionDetection, type DraggableNode, type DroppableContainer, type KeyboardCoordinateGetter,
  type KeyboardSensorOptions, type UniqueIdentifier,
} from '@dnd-kit/core'
import type { Id } from '@shared/tipos/index.ts'

export type DadoArraste =
  | { tipo: 'card'; colunaId: Id }
  | { tipo: 'coluna'; colunaId: Id }
  /** A lista de cards de uma coluna (alvo da coluna vazia) ou a coluna recolhida inteira. */
  | { tipo: 'area'; colunaId: Id }

export const idColuna = (id: Id) => `coluna:${id}`
export const idArea = (id: Id) => `area:${id}`
export const colunaDoId = (id: UniqueIdentifier) => String(id).replace(/^(coluna|area):/, '')
export const ehIdColuna = (id: UniqueIdentifier) => String(id).startsWith('coluna:')
export const ehIdArea = (id: UniqueIdentifier) => String(id).startsWith('area:')

const dadoDe = (c: { data: { current?: unknown } }) => c.data.current as DadoArraste | undefined

// ─────────────────────────────── teclado ───────────────────────────────

const ativar: Activator<KeyboardSensorOptions>['handler'] = (event: EventoReact, { onActivation }: KeyboardSensorOptions, { active }: { active: DraggableNode }) => {
  const code = event.nativeEvent.code
  const tipo = (active.data.current as DadoArraste | undefined)?.tipo
  const comeca = tipo === 'card' ? code === 'Space' && event.shiftKey : code === 'Space' && !event.shiftKey
  if (!comeca) return false
  const alca = active.activatorNode.current
  if (alca && event.target !== alca) return false
  event.preventDefault()
  onActivation?.({ event: event.nativeEvent })
  return true
}

/** O KeyboardSensor do dnd-kit com as teclas do quadro (ver o cabeçalho). */
export class SensorTecladoQuadro extends KeyboardSensor {
  static activators = [{ eventName: 'onKeyDown' as const, handler: ativar }]
}

const DIRECOES: Record<string, [number, number]> = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

/** Setas: o lugar mais perto naquela direção, entre cards e colunas vazias (card) ou entre colunas (coluna). */
export const coordenadasTeclado: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const dir = DIRECOES[event.code]
  const { active, collisionRect, droppableRects, droppableContainers } = context
  if (!dir || !active || !collisionRect) return undefined
  event.preventDefault()
  const tipo = dadoDe(active)?.tipo
  const cx0 = collisionRect.left + collisionRect.width / 2
  const cy0 = collisionRect.top + collisionRect.height / 2
  let melhor: { x: number; y: number; nota: number } | null = null
  for (const c of droppableContainers.getEnabled()) {
    if (c.id === active.id) continue
    const t = dadoDe(c)?.tipo
    if (tipo === 'coluna' ? t !== 'coluna' : t === 'coluna') continue
    const r = droppableRects.get(c.id)
    if (!r) continue
    // a lista de uma coluna só serve de alvo quando a coluna está vazia (os cards dela são alvos melhores)
    const x = r.left + r.width / 2
    const y = t === 'area' ? r.top + Math.min(r.height, 48) / 2 : r.top + r.height / 2
    const dx = x - cx0, dy = y - cy0
    const ao = dx * dir[0] + dy * dir[1]
    if (ao <= 4) continue
    const lateral = Math.abs(dir[0] ? dy : dx)
    const nota = ao + lateral * (dir[0] ? 0.5 : 4)
    if (!melhor || nota < melhor.nota) melhor = { x: x - collisionRect.width / 2, y: y - collisionRect.height / 2, nota }
  }
  if (!melhor) return undefined
  return { x: currentCoordinates.x + (melhor.x - collisionRect.left), y: currentCoordinates.y + (melhor.y - collisionRect.top) }
}

// ─────────────────────────────── colisão ───────────────────────────────

/**
 * Coluna arrastada: a coluna de centro mais perto. Card: o card sob o ponteiro; sobre o cabeçalho ou a lista de uma
 * coluna, o card mais perto dela (ou a própria lista, vazia). Sem nada debaixo, o último alvo (sem piscar).
 */
export function deteccaoDoQuadro(cardsDaColuna: (colunaId: Id) => readonly UniqueIdentifier[], ultimo: { current: UniqueIdentifier | null }): CollisionDetection {
  return (args) => {
    const tipo = dadoDe(args.active)?.tipo
    if (tipo === 'coluna') {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => dadoDe(c)?.tipo === 'coluna') })
    }
    const sob = pointerWithin(args)
    const colisoes: Collision[] = sob.length ? sob : rectIntersection(args)
    const daColuna = (colunaId: Id): Collision[] => {
      const ids = new Set(cardsDaColuna(colunaId).filter((id) => id !== args.active.id))
      if (ids.size === 0) return [{ id: idArea(colunaId) }]
      const conteiners: DroppableContainer[] = args.droppableContainers.filter((c) => ids.has(c.id))
      return closestCenter({ ...args, droppableContainers: conteiners })
    }
    const card = colisoes.find((c) => dadoDe(args.droppableContainers.find((x) => x.id === c.id) ?? { data: {} })?.tipo === 'card')
    let alvo: Collision[] | null = card ? [card] : null
    if (!alvo) {
      const area = colisoes.find((c) => ehIdArea(c.id))
      const coluna = colisoes.find((c) => ehIdColuna(c.id))
      const qual = area ?? coluna
      if (qual) alvo = daColuna(colunaDoId(qual.id))
    }
    const primeiro = alvo ? getFirstCollision(alvo, 'id') : null
    if (primeiro != null) {
      ultimo.current = primeiro
      return [{ id: primeiro }]
    }
    return ultimo.current != null ? [{ id: ultimo.current }] : []
  }
}
