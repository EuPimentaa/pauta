/**
 * Layout "Quadro" (extensoes/layouts/nucleo-quadro.tsx; PLANO §2): colunas de 280 px (largura de tela com snap no
 * celular), arrastar cards dentro e entre colunas e arrastar colunas (dnd-kit: mouse, toque com espera e teclado),
 * rolagem automática nas bordas, Esc devolve em 200 ms, eventos remotos esperam o fim do arraste, "+ Adicionar
 * coluna" no fim. Os cards escondidos por filtro mantêm o lugar (a posição vai relativa aos vizinhos visíveis).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Columns3, Filter, Inbox, Plus } from 'lucide-react'
import type { Coluna, Demanda, Id } from '@shared/tipos/index.ts'
import { ehCardDaColuna } from '@shared/logica/quadro.ts'
import { temFiltros } from '@shared/logica/filtros.ts'
import { useEu } from '../api/auth.ts'
import { useMover } from '../api/demandas.ts'
import { posicaoNoIndice } from '../api/previsao.ts'
import { useColunasMutacoes } from '../api/quadros.ts'
import { useConfig, useDemandasDoQuadro } from '../api/seletores.ts'
import type { PropsLayout } from '../extensoes/tipos.ts'
import { raizCamadas } from '../lib/camadas.ts'
import { useRegistro } from '../sessao/registro.ts'
import { definirControleLayout, type Direcao } from '../teclado/controles.ts'
import { lugarAtual, useCardFocadoId } from '../teclado/foco.ts'
import { pausarEntrega } from '../tempo-real/estado.ts'
import { Botao } from '../ui/Botao.tsx'
import { Campo } from '../ui/Campo.tsx'
import { EstadoVazio } from '../ui/Indicadores.tsx'
import {
  SensorTecladoQuadro, colunaDoId, coordenadasTeclado, deteccaoDoQuadro, ehIdArea, idColuna, type DadoArraste,
} from './arrastar.ts'
import { CartaoDemanda, marcarFimDoArraste } from './CardDemanda.tsx'
import { ColunaQuadro, ColunaRecolhida, entradaDaColuna } from './Coluna.tsx'
import { useAgora, useColunasRecolhidas } from './estado.ts'

type Ordem = Record<Id, Id[]>

const porPosicao = (a: Demanda, b: Demanda) => a.posicao - b.posicao || a.numero - b.numero

function agrupar(colunas: readonly Coluna[], demandas: readonly Demanda[]): Ordem {
  const ordem: Ordem = Object.fromEntries(colunas.map((c) => [c.id, [] as Id[]]))
  for (const d of [...demandas].sort(porPosicao)) ordem[d.colunaId]?.push(d.id)
  return ordem
}

const colunaDoCard = (ordem: Ordem, id: Id): Id | null => {
  for (const [c, ids] of Object.entries(ordem)) if (ids.includes(id)) return c
  return null
}

// ─────────────────────────────── "+ Adicionar coluna" ───────────────────────────────

function NovaColuna({ quadroId, abertaDeInicio }: { quadroId: Id; abertaDeInicio?: boolean }) {
  const [aberta, setAberta] = useState(!!abertaDeInicio)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const colunas = useColunasMutacoes()
  async function criar() {
    const n = nome.trim()
    if (!n) return
    setSalvando(true)
    const c = await colunas.criar(quadroId, { nome: n })
    setSalvando(false)
    if (c) setNome('')
  }
  if (!aberta) {
    return (
      <div className="coluna-nova">
        <button type="button" className="coluna-nova-botao" onClick={() => setAberta(true)}><Plus aria-hidden="true" /> Adicionar coluna</button>
      </div>
    )
  }
  return (
    <div className="coluna-nova">
      <form className="coluna-nova-form" onSubmit={(e) => { e.preventDefault(); void criar() }}>
        <Campo rotulo="Nome da coluna" rotuloOculto placeholder="Nome da coluna" value={nome} maxLength={80} autoFocus
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAberta(false) } }} />
        <div className="coluna-nova-acoes">
          <Botao type="submit" variante="primario" tamanho="p" carregando={salvando} disabled={!nome.trim()}>Adicionar</Botao>
          <Botao variante="ghost" tamanho="p" onClick={() => setAberta(false)}>Cancelar</Botao>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────── layout ───────────────────────────────

const anuncios = (nome: (id: UniqueIdentifier) => string, ondeEsta: (id: UniqueIdentifier) => string): Announcements => ({
  onDragStart: ({ active }) => `${nome(active.id)} pego. Use as setas para escolher o lugar; Espaço solta, Esc cancela.`,
  onDragOver: ({ active, over }) => (over ? `${nome(active.id)} ${ondeEsta(over.id)}.` : undefined),
  onDragEnd: ({ active, over }) => (over ? `${nome(active.id)} solto ${ondeEsta(over.id)}.` : `${nome(active.id)} voltou ao lugar.`),
  onDragCancel: ({ active }) => `Cancelado. ${nome(active.id)} voltou ao lugar.`,
})

export default function LayoutQuadro({ quadro, colunas, demandas, filtros, definirFiltros }: PropsLayout) {
  const reg = useRegistro()
  const eu = useEu()
  const config = useConfig()
  const agora = useAgora()
  const mover = useMover()
  const mutColunas = useColunasMutacoes()
  const todas = useDemandasDoQuadro(quadro.id)
  const [recolhidas, alternarRecolhida, recolherVarias] = useColunasRecolhidas()
  const [entrada, setEntrada] = useState<Id | null>(null)
  const raiz = useRef<HTMLDivElement>(null)

  const totais = useMemo(() => {
    const t = new Map<Id, number>()
    for (const d of todas) if (ehCardDaColuna(d, agora, config.quadroConcluidasDias)) t.set(d.colunaId, (t.get(d.colunaId) ?? 0) + 1)
    return t
  }, [todas, agora, config.quadroConcluidasDias])
  const porId = useMemo(() => new Map(demandas.map((d) => [d.id, d])), [demandas])
  const base = useMemo(() => agrupar(colunas, demandas), [colunas, demandas])

  // ─────────── arraste ───────────
  const [ordem, setOrdem] = useState<Ordem | null>(null)
  const ordemRef = useRef<Ordem | null>(null)
  ordemRef.current = ordem
  const itens = ordem ?? base
  const [ativo, setAtivo] = useState<{ tipo: 'card' | 'coluna'; id: Id; largura: number } | null>(null)
  const inicio = useRef<{ coluna: Id; indice: number } | null>(null)
  const soltarPausa = useRef<(() => void) | null>(null)
  const ultimoAlvo = useRef<UniqueIdentifier | null>(null)
  const recemMovido = useRef(false)
  // depois de soltar, a ordem local fica até o cache refletir o movimento (sem o card piscar no lugar antigo)
  const esperando = useRef(false)
  useLayoutEffect(() => {
    if (esperando.current) { esperando.current = false; setOrdem(null) }
  }, [base])

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(SensorTecladoQuadro, { coordinateGetter: coordenadasTeclado }),
  )

  const cardsRenderizados = useCallback((colunaId: Id) => (recolhidas.has(colunaId) ? [] : (ordemRef.current ?? base)[colunaId] ?? []), [recolhidas, base])
  const deteccao = useMemo(() => deteccaoDoQuadro(cardsRenderizados, ultimoAlvo, recemMovido), [cardsRenderizados])
  // a troca de coluna durante o arraste segura a colisão por um quadro (ver deteccaoDoQuadro)
  useEffect(() => {
    if (!recemMovido.current) return
    const q = requestAnimationFrame(() => { recemMovido.current = false })
    return () => cancelAnimationFrame(q)
  }, [ordem])

  const terminar = useCallback(() => {
    setAtivo(null)
    inicio.current = null
    ultimoAlvo.current = null
    document.documentElement.removeAttribute('data-arrastando')
    marcarFimDoArraste()
    soltarPausa.current?.()
    soltarPausa.current = null
  }, [])

  useEffect(() => () => { soltarPausa.current?.(); document.documentElement.removeAttribute('data-arrastando') }, [])

  function aoComecar({ active }: DragStartEvent) {
    const dado = active.data.current as DadoArraste | undefined
    if (!dado) return
    soltarPausa.current = pausarEntrega()
    document.documentElement.setAttribute('data-arrastando', '')
    const largura = active.rect.current.initial?.width ?? 264
    if (dado.tipo === 'card') {
      const lista = base[dado.colunaId] ?? []
      inicio.current = { coluna: dado.colunaId, indice: lista.indexOf(String(active.id)) }
      setOrdem(base)
      setAtivo({ tipo: 'card', id: String(active.id), largura })
    } else {
      setAtivo({ tipo: 'coluna', id: dado.colunaId, largura })
    }
  }

  function aoPassar({ active, over }: DragOverEvent) {
    if (!over || (active.data.current as DadoArraste | undefined)?.tipo !== 'card') return
    const idA = String(active.id), idO = String(over.id)
    const atual = ordemRef.current ?? base
    const de = colunaDoCard(atual, idA)
    const para = ehIdArea(idO) ? colunaDoId(idO) : colunaDoCard(atual, idO)
    if (!de || !para || de === para) return
    const destino = [...(atual[para] ?? [])]
    let i = ehIdArea(idO) ? destino.length : destino.indexOf(idO)
    if (i < 0) i = destino.length
    else if (!ehIdArea(idO)) {
      const r = active.rect.current.translated
      if (r && r.top > over.rect.top + over.rect.height / 2) i++
    }
    destino.splice(i, 0, idA)
    const nova = { ...atual, [de]: atual[de].filter((x) => x !== idA), [para]: destino }
    recemMovido.current = true
    ordemRef.current = nova
    setOrdem(nova)
  }

  function aoSoltar({ active, over }: DragEndEvent) {
    const dado = active.data.current as DadoArraste | undefined
    if (!dado || !over) { cancelar(); return }
    if (dado.tipo === 'coluna') {
      const ids = colunas.map((c) => idColuna(c.id))
      const de = ids.indexOf(String(active.id)), para = ids.indexOf(String(over.id))
      if (de >= 0 && para >= 0 && de !== para) {
        const nova = arrayMove([...colunas], de, para)
        const i = nova.findIndex((c) => c.id === dado.colunaId)
        void mutColunas.editar(colunas[de], { posicao: { depoisDeId: nova[i - 1]?.id ?? null } })
      }
      terminar()
      return
    }
    const idA = String(active.id), idO = String(over.id)
    const atual = ordemRef.current ?? base
    const coluna = colunaDoCard(atual, idA)
    const d = porId.get(idA)
    if (!coluna || !d) { cancelar(); return }
    const lista = atual[coluna]
    const velho = lista.indexOf(idA)
    const novo = !ehIdArea(idO) && lista.includes(idO) ? lista.indexOf(idO) : velho
    const final = arrayMove(lista, velho, novo)
    const indice = final.indexOf(idA)
    const igual = inicio.current && inicio.current.coluna === coluna && inicio.current.indice === indice
    if (igual) {
      setOrdem(null)
    } else {
      esperando.current = true
      ordemRef.current = { ...atual, [coluna]: final }
      setOrdem(ordemRef.current)
      const semAtivo = final.filter((x) => x !== idA).map((id) => ({ id }))
      void mover(d, { colunaId: coluna, posicao: posicaoNoIndice(semAtivo, indice) }, 'arrastar')
      // se o cache não mudar (movimento recusado na hora), solta a ordem local mesmo assim
      setTimeout(() => { if (esperando.current) { esperando.current = false; setOrdem(null) } }, 400)
    }
    terminar()
  }

  function cancelar() {
    setOrdem(null)
    terminar()
  }

  // ─────────── foco itinerante e o que os atalhos pedem ───────────
  const focado = useCardFocadoId()
  const alvoTab = useMemo(() => {
    if (focado && porId.has(focado)) return focado
    for (const c of colunas) {
      if (recolhidas.has(c.id)) continue
      const primeiro = base[c.id]?.[0]
      if (primeiro) return primeiro
    }
    return null
  }, [focado, porId, colunas, recolhidas, base])

  const moverFoco = useCallback((dir: Direcao) => {
    const el = raiz.current
    if (!el) return
    const id = lugarAtual().focado ?? lugarAtual().sobMouse
    const atual = id ? el.querySelector<HTMLElement>(`[data-demanda-id="${CSS.escape(id)}"]`) : null
    const colunasEl = [...el.querySelectorAll<HTMLElement>('section[data-coluna-id]')]
    const cardsDe = (col: HTMLElement) => [...col.querySelectorAll<HTMLElement>('[data-demanda-id]')]
    let alvo: HTMLElement | undefined
    if (!atual) {
      alvo = colunasEl.map(cardsDe).find((l) => l.length)?.[0]
    } else {
      const col = atual.closest<HTMLElement>('section[data-coluna-id]')
      if (!col) return
      const cards = cardsDe(col)
      const i = cards.indexOf(atual)
      if (dir === 'baixo') alvo = cards[i + 1]
      else if (dir === 'cima') alvo = cards[i - 1]
      else {
        const passo = dir === 'direita' ? 1 : -1
        for (let j = colunasEl.indexOf(col) + passo; j >= 0 && j < colunasEl.length; j += passo) {
          const outros = cardsDe(colunasEl[j])
          if (outros.length) { alvo = outros[Math.min(i, outros.length - 1)]; break }
        }
      }
    }
    if (alvo) {
      alvo.focus({ preventScroll: true })
      alvo.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [])

  useEffect(() => definirControleLayout({
    abrirEntrada: (colunaId) => {
      const candidatas = colunaId ? colunas.filter((c) => c.id === colunaId) : colunas.filter((c) => !recolhidas.has(c.id))
      const c = candidatas[0]
      if (!c) return false
      const ctx = { quadro, coluna: c, filtros, demandas: (base[c.id] ?? []).map((id) => porId.get(id)!).filter(Boolean) }
      if (!entradaDaColuna(reg, ctx, eu)) return false
      if (recolhidas.has(c.id)) alternarRecolhida(c.id, false)
      setEntrada(c.id)
      return true
    },
    recolher: (colunaId) => {
      const c = colunaId ?? colunas.find((x) => !recolhidas.has(x.id))?.id
      if (c) alternarRecolhida(c)
    },
    recolherTodas: () => {
      const ids = colunas.map((c) => c.id)
      recolherVarias(ids, !ids.every((id) => recolhidas.has(id)))
    },
    moverFoco,
  }), [colunas, recolhidas, quadro, filtros, base, porId, reg, eu, alternarRecolhida, recolherVarias, moverFoco])

  // ─────────── textos para o leitor de tela ───────────
  const nomeDe = useCallback((id: UniqueIdentifier) => {
    const s = String(id)
    if (s.startsWith('coluna:')) return `Coluna ${colunas.find((c) => c.id === colunaDoId(s))?.nome ?? ''}`
    const d = porId.get(s)
    return d ? `Card #${d.numero}` : 'Card'
  }, [colunas, porId])
  const ondeEsta = useCallback((id: UniqueIdentifier) => {
    const s = String(id)
    const col = s.startsWith('coluna:') || s.startsWith('area:') ? colunaDoId(s) : colunaDoCard(ordemRef.current ?? base, s)
    const c = colunas.find((x) => x.id === col)
    return c ? `na coluna ${c.nome}` : ''
  }, [colunas, base])

  const semDemandas = todas.length === 0
  const filtroSemResultado = !semDemandas && demandas.length === 0 && temFiltros(filtros)
  const ativoCard = ativo?.tipo === 'card' ? porId.get(ativo.id) : undefined
  const ativoColuna = ativo?.tipo === 'coluna' ? colunas.find((c) => c.id === ativo.id) : undefined

  if (colunas.length === 0) {
    return (
      <div className="quadro-ausente">
        <EstadoVazio icone={Columns3} titulo="Este quadro ainda não tem colunas." texto="Crie a primeira: os cards vivem nelas."
          acoes={<NovaColuna quadroId={quadro.id} />} />
      </div>
    )
  }

  return (
    <>
      {semDemandas && (
        <p className="quadro-aviso"><Inbox aria-hidden="true" /> Nenhuma demanda ainda. Crie a primeira no rodapé de uma coluna ou com Shift+N.</p>
      )}
      {filtroSemResultado && (
        <div className="quadro-aviso" role="status">
          <Filter aria-hidden="true" /> Nenhuma demanda com estes filtros.
          <Botao variante="ghost" tamanho="p" onClick={() => definirFiltros({})}>Limpar filtros</Botao>
        </div>
      )}
      <DndContext
        sensors={sensores}
        collisionDetection={deteccao}
        onDragStart={aoComecar}
        onDragOver={aoPassar}
        onDragEnd={aoSoltar}
        onDragCancel={cancelar}
        accessibility={{
          announcements: anuncios(nomeDe, ondeEsta),
          screenReaderInstructions: {
            draggable: 'Para mover um card com o teclado, aperte Shift+Espaço; numa coluna, Espaço no cabeçalho. As setas escolhem o lugar, Espaço solta e Esc cancela.',
          },
        }}
      >
        <div ref={raiz} className="ui-quadro" data-arrastando={ativo ? ativo.tipo : undefined}>
          <SortableContext items={colunas.map((c) => idColuna(c.id))} strategy={horizontalListSortingStrategy}>
            {colunas.map((c) => (recolhidas.has(c.id)
              ? <ColunaRecolhida key={c.id} coluna={c} total={totais.get(c.id) ?? 0} abrir={(id) => alternarRecolhida(id, false)} />
              : (
                <ColunaQuadro
                  key={c.id}
                  coluna={c}
                  quadro={quadro}
                  ids={itens[c.id] ?? []}
                  demandas={porId}
                  total={totais.get(c.id) ?? 0}
                  filtros={filtros}
                  eu={eu}
                  alvoTab={alvoTab}
                  arrastandoCard={ativo?.tipo === 'card'}
                  entradaAberta={entrada === c.id}
                  definirEntrada={setEntrada}
                  alternarRecolhida={alternarRecolhida}
                  concluidasDias={config.quadroConcluidasDias}
                  reg={reg}
                />
              )))}
          </SortableContext>
          <NovaColuna quadroId={quadro.id} />
        </div>
        {createPortal(
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
            {ativoCard ? (
              <div className="cartao-sobreposto" style={{ ['--largura-arraste' as string]: `${ativo!.largura}px` }}>
                <CartaoDemanda demanda={ativoCard} />
              </div>
            ) : ativoColuna ? (
              <div className="ui-coluna coluna-sobreposta" data-cor={ativoColuna.cor ?? undefined}>
                <div className="ui-coluna-cabeca">
                  <span className="ui-coluna-ponto" aria-hidden="true" />
                  <span className="ui-coluna-titulo">{ativoColuna.nome}</span>
                </div>
                <p className="coluna-mais-lista">{totais.get(ativoColuna.id) ?? 0} {(totais.get(ativoColuna.id) ?? 0) === 1 ? 'demanda' : 'demandas'}</p>
              </div>
            ) : null}
          </DragOverlay>,
          raizCamadas(),
        )}
      </DndContext>
    </>
  )
}
