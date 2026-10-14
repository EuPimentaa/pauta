/**
 * Pilha das camadas sobrepostas (modal, folha, popover, menu). Só a camada do topo recebe o Esc, que para aí (o
 * despachante de atalhos do NÚCLEO-WEB não vê esse Esc). Modal e folha travam a rolagem da página e deixam o #root
 * `inert` (leitor de tela e Tab ficam na camada). As camadas renderizam em #camadas (portal irmão do #root).
 */
import { useEffect, useId, useRef } from 'react'

interface Camada { id: string; modal: boolean; aoEsc?: () => void }

const pilha: Camada[] = []

function atualizarFundo() {
  const raiz = document.getElementById('root')
  const temModal = pilha.some((c) => c.modal)
  if (raiz) raiz.inert = temModal
  document.documentElement.style.overflow = temModal ? 'hidden' : ''
}

function aoTeclar(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  const topo = pilha[pilha.length - 1]
  if (!topo?.aoEsc) return
  e.preventDefault()
  e.stopPropagation()
  topo.aoEsc()
}

if (typeof window !== 'undefined') window.addEventListener('keydown', aoTeclar, true)

/** Há modal, folha, popover ou menu aberto (o despachante de atalhos pode ignorar teclas do quadro). */
export function haCamadaAberta(): boolean {
  return pilha.length > 0
}

/** Contêiner dos portais das camadas (criado sob demanda, irmão do #root). */
export function raizCamadas(): HTMLElement {
  let el = document.getElementById('camadas')
  if (!el) {
    el = document.createElement('div')
    el.id = 'camadas'
    document.body.appendChild(el)
  }
  return el
}

/**
 * Registra a camada enquanto `ativa`. `modal`: trava a rolagem e deixa o fundo inert.
 * Devolve `ehTopo()` para quem precisa saber se é a camada de cima (cliques fora, foco).
 */
export function useCamada(ativa: boolean, opcoes: { modal?: boolean; aoEsc?: () => void }): { ehTopo(): boolean } {
  const id = useId()
  const aoEsc = useRef(opcoes.aoEsc)
  aoEsc.current = opcoes.aoEsc
  const modal = !!opcoes.modal
  useEffect(() => {
    if (!ativa) return
    const camada: Camada = { id, modal, aoEsc: () => aoEsc.current?.() }
    pilha.push(camada)
    atualizarFundo()
    return () => {
      const i = pilha.indexOf(camada)
      if (i >= 0) pilha.splice(i, 1)
      atualizarFundo()
    }
  }, [ativa, id, modal])
  return { ehTopo: () => pilha[pilha.length - 1]?.id === id }
}
