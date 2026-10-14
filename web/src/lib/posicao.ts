/**
 * Posicionamento de popover, menu e tooltip junto de uma âncora (elemento ou ponto), sem dependências: escolhe o lado
 * com espaço (vira para o oposto se não couber), desliza para ficar na tela e limita a altura ao espaço disponível.
 */
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

export type Lado = 'baixo' | 'cima' | 'direita' | 'esquerda'
export type Alinhamento = 'inicio' | 'centro' | 'fim'
export interface Retangulo { x: number; y: number; largura: number; altura: number }
export type Ancora = HTMLElement | { x: number; y: number } | null

export function retanguloDe(a: Ancora): Retangulo | null {
  if (!a) return null
  if (a instanceof HTMLElement) {
    if (!a.isConnected) return null
    const r = a.getBoundingClientRect()
    return { x: r.left, y: r.top, largura: r.width, altura: r.height }
  }
  return { x: a.x, y: a.y, largura: 0, altura: 0 }
}

const OPOSTO: Record<Lado, Lado> = { baixo: 'cima', cima: 'baixo', direita: 'esquerda', esquerda: 'direita' }

export function calcularPosicao(
  ancora: Retangulo, flutuante: { largura: number; altura: number },
  opcoes: { lado?: Lado; alinhar?: Alinhamento; distancia?: number; margem?: number; tela?: { largura: number; altura: number } } = {},
): { x: number; y: number; lado: Lado; alturaMax: number; origem: string } {
  const { distancia = 6, margem = 8 } = opcoes
  const tela = opcoes.tela ?? { largura: window.innerWidth, altura: window.innerHeight }
  let lado = opcoes.lado ?? 'baixo'
  const alinhar = opcoes.alinhar ?? 'inicio'
  const espaco: Record<Lado, number> = {
    baixo: tela.altura - (ancora.y + ancora.altura) - distancia - margem,
    cima: ancora.y - distancia - margem,
    direita: tela.largura - (ancora.x + ancora.largura) - distancia - margem,
    esquerda: ancora.x - distancia - margem,
  }
  const precisa = lado === 'baixo' || lado === 'cima' ? flutuante.altura : flutuante.largura
  if (espaco[lado] < precisa && espaco[OPOSTO[lado]] > espaco[lado]) lado = OPOSTO[lado]

  let x: number, y: number
  if (lado === 'baixo' || lado === 'cima') {
    y = lado === 'baixo' ? ancora.y + ancora.altura + distancia : ancora.y - distancia - flutuante.altura
    x = alinhar === 'inicio' ? ancora.x : alinhar === 'fim' ? ancora.x + ancora.largura - flutuante.largura
      : ancora.x + ancora.largura / 2 - flutuante.largura / 2
  } else {
    x = lado === 'direita' ? ancora.x + ancora.largura + distancia : ancora.x - distancia - flutuante.largura
    y = alinhar === 'inicio' ? ancora.y : alinhar === 'fim' ? ancora.y + ancora.altura - flutuante.altura
      : ancora.y + ancora.altura / 2 - flutuante.altura / 2
  }
  x = Math.min(Math.max(margem, x), Math.max(margem, tela.largura - flutuante.largura - margem))
  const alturaMax = lado === 'baixo' || lado === 'cima' ? Math.max(120, espaco[lado]) : tela.altura - 2 * margem
  if (lado === 'cima') y = Math.max(margem, y)
  else y = Math.min(Math.max(margem, y), Math.max(margem, tela.altura - Math.min(flutuante.altura, alturaMax) - margem))
  const horizontal = alinhar === 'fim' ? 'right' : alinhar === 'centro' ? 'center' : 'left'
  const origem = lado === 'baixo' ? `top ${horizontal}` : lado === 'cima' ? `bottom ${horizontal}` : lado === 'direita' ? 'left top' : 'right top'
  return { x: Math.round(x), y: Math.round(y), lado, alturaMax: Math.floor(alturaMax), origem }
}

/**
 * Mantém `flutuante` posicionado junto da `ancora` enquanto `ativo` (rolagem, redimensionamento e mudança de tamanho).
 * `medindo` é true até o primeiro cálculo (o componente fica invisível nesse quadro).
 */
export function usePosicao(
  ancora: Ancora, flutuante: RefObject<HTMLElement | null>, ativo: boolean,
  opcoes: { lado?: Lado; alinhar?: Alinhamento; distancia?: number } = {},
): { estilo: CSSProperties; medindo: boolean; lado: Lado } {
  const [pos, setPos] = useState<{ x: number; y: number; lado: Lado; alturaMax: number; origem: string } | null>(null)
  const { lado, alinhar, distancia } = opcoes
  useLayoutEffect(() => {
    if (!ativo) { setPos(null); return }
    const el = flutuante.current
    if (!el) return
    let quadro = 0
    const medir = () => {
      const r = retanguloDe(ancora)
      if (!r) return
      const novo = calcularPosicao(r, { largura: el.offsetWidth, altura: el.scrollHeight }, { lado, alinhar, distancia })
      setPos((a) => (a && a.x === novo.x && a.y === novo.y && a.lado === novo.lado && a.alturaMax === novo.alturaMax ? a : novo))
    }
    const agendar = () => { cancelAnimationFrame(quadro); quadro = requestAnimationFrame(medir) }
    medir()
    const obs = new ResizeObserver(agendar)
    obs.observe(el)
    if (ancora instanceof HTMLElement) obs.observe(ancora)
    window.addEventListener('scroll', agendar, true)
    window.addEventListener('resize', agendar)
    return () => {
      cancelAnimationFrame(quadro)
      obs.disconnect()
      window.removeEventListener('scroll', agendar, true)
      window.removeEventListener('resize', agendar)
    }
  }, [ancora, flutuante, ativo, lado, alinhar, distancia])
  const estilo: CSSProperties = pos
    ? { left: pos.x, top: pos.y, ['--altura-max' as string]: `${pos.alturaMax}px`, ['--origem' as string]: pos.origem }
    : { left: 0, top: 0 }
  return { estilo, medindo: pos === null, lado: pos?.lado ?? lado ?? 'baixo' }
}
