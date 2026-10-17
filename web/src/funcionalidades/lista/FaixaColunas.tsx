/**
 * Faixa de colunas do celular (extensoes/quadro-cabecalho/lista-colunas-celular.tsx; PLANO §3, F6; INTEGRACAO-2, achado
 * visual 11): abaixo de 768 px, a última linha do cabeçalho do quadro é uma faixa de chips com cada coluna (ponto na cor,
 * nome e quantas aparecem com os filtros). Tocar pula para a coluna (useRolarParaColuna do núcleo; as colunas têm
 * snap); o chip ativo acompanha a rolagem por um IntersectionObserver (60% visível) sobre os section[data-coluna-id].
 * Na Lista, os chips são os grupos dela (a Lista publica em estado.ts); no Calendário a faixa não aparece.
 */
import './lista.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FiltrosQuadro, Id, Quadro } from '@shared/tipos/index.ts'
import { useColunas } from '../../api/seletores.ts'
import type { PropsCabecalhoQuadro } from '../../extensoes/tipos.ts'
import { useCelular } from '../../lib/midia.ts'
import { useRolarParaColuna } from '../../quadro/index.ts'
import { useDemandasFiltradas } from './dados.ts'
import { useGruposPublicados, type GrupoNaFaixa } from './estado.ts'



function Faixa({ rotulo, chips, ativo, tocar }: { rotulo: string; chips: readonly GrupoNaFaixa[]; ativo: string | null; tocar(id: string): void }) {
  const faixa = useRef<HTMLElement>(null)
  // o chip ativo fica à vista dentro da faixa (sem rolar a página)
  useLayoutEffect(() => {
    const el = faixa.current
    const chip = ativo ? el?.querySelector<HTMLElement>(`[data-faixa-id="${CSS.escape(ativo)}"]`) : null
    if (!el || !chip) return
    const esq = chip.offsetLeft - 16
    const dir = chip.offsetLeft + chip.offsetWidth + 16 - el.clientWidth
    if (el.scrollLeft > esq) el.scrollTo({ left: esq })
    else if (el.scrollLeft < dir) el.scrollTo({ left: dir })
  }, [ativo])
  if (chips.length === 0) return null
  return (
    <nav ref={faixa} className="lista-faixa" aria-label={rotulo}>
      {chips.map((c) => (
        <button key={c.id} type="button" className="lista-faixa-chip" data-faixa-id={c.id} aria-current={c.id === ativo ? 'true' : undefined}
          onClick={() => tocar(c.id)}>
          {c.cor && <span className="lista-ponto" data-cor={c.cor} aria-hidden="true" />}
          <span className="lista-faixa-nome">{c.rotulo}</span>
          <span className="lista-faixa-n" aria-hidden="true">{c.quantidade}</span>
          <span className="sr-only">, {c.quantidade} {c.quantidade === 1 ? 'demanda' : 'demandas'}</span>
        </button>
      ))}
    </nav>
  )
}

/** Quadro: uma faixa com as colunas; o ativo pela coluna que está na tela. */
function FaixaDoQuadro({ quadro, filtros }: { quadro: Quadro; filtros: FiltrosQuadro }) {
  const colunas = useColunas(quadro.id)
  const visiveis = useDemandasFiltradas(quadro.id, filtros)
  const rolar = useRolarParaColuna()
  const [ativa, setAtiva] = useState<Id | null>(null)
  const ancora = useRef<HTMLSpanElement>(null)
  const chips = useMemo(() => {
    const n = new Map<Id, number>()
    for (const d of visiveis) n.set(d.colunaId, (n.get(d.colunaId) ?? 0) + 1)
    return colunas.map((c) => ({ id: c.id, rotulo: c.nome, cor: c.cor ?? 'nenhuma', quantidade: n.get(c.id) ?? 0 }))
  }, [colunas, visiveis])

  // observa as colunas do layout (que monta depois do cabeçalho, em Suspense, e troca quando as colunas mudam)
  useEffect(() => {
    const tela = ancora.current?.closest('.tela-quadro')
    if (!tela) return
    let io: IntersectionObserver | null = null
    let moQuadro: MutationObserver | null = null
    let raizAtual: Element | null = null
    const observarColunas = (raiz: Element) => {
      io?.disconnect()
      io = new IntersectionObserver((entradas) => {
        const vista = entradas.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = (vista?.target as HTMLElement | undefined)?.dataset.colunaId
        if (id) setAtiva(id)
      }, { root: raiz, threshold: 0.6 })
      raiz.querySelectorAll(':scope > [data-coluna-id]').forEach((el) => io!.observe(el))
    }
    const ligar = () => {
      const raiz = tela.querySelector(':scope > .ui-quadro')
      if (raiz === raizAtual) return
      raizAtual = raiz
      moQuadro?.disconnect()
      if (!raiz) { io?.disconnect(); return }
      observarColunas(raiz)
      moQuadro = new MutationObserver(() => observarColunas(raiz))
      moQuadro.observe(raiz, { childList: true })
    }
    ligar()
    const moTela = new MutationObserver(ligar)
    moTela.observe(tela, { childList: true })
    return () => { moTela.disconnect(); moQuadro?.disconnect(); io?.disconnect() }
  }, [colunas])

  return (
    <>
      <span ref={ancora} hidden />
      <Faixa rotulo="Colunas do quadro" chips={chips} ativo={ativa ?? chips[0]?.id ?? null}
        tocar={(id) => { setAtiva(id); rolar(id) }} />
    </>
  )
}

/** Lista: os grupos que ela publicou. */
function FaixaDaLista({ quadroId }: { quadroId: Id }) {
  const g = useGruposPublicados(quadroId)
  if (!g) return null
  return <Faixa rotulo="Grupos da lista" chips={g.grupos} ativo={g.ativo} tocar={g.rolar} />
}

export function FaixaColunas({ quadro, layout, filtros }: PropsCabecalhoQuadro) {
  const celular = useCelular()
  if (!celular || layout === 'calendario') return null
  return (
    <div className="lista-faixa-linha">
      {layout === 'lista' ? <FaixaDaLista quadroId={quadro.id} /> : <FaixaDoQuadro quadro={quadro} filtros={filtros} />}
    </div>
  )
}
