/**
 * Tabela da Lista no desktop: virtualizada (só as linhas perto da tela existem no DOM; alturas fixas por tipo), com o
 * cabeçalho preso no topo, ordenação pelo cabeçalho (aria-sort), grupos recolhíveis e o foco itinerante (uma parada
 * no Tab; setas, J/K, Home, End e PageUp/PageDown andam; Enter abre, Espaço entra na demanda, `,` e `.` mudam de coluna:
 * os atalhos de card do núcleo valem porque a linha marca a demanda em foco).
 *
 * Agrupada por coluna, arrastar uma linha para outro grupo move o card (useMover do núcleo, com "Movida para X ·
 * Desfazer"); na ordem do quadro ela cai exatamente onde a linha indica, com outra ordem vai para o topo da coluna.
 * As linhas ficam no lugar por `top` (não por transform): o dnd-kit mede os alvos de soltar ignorando o transform.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, MeasuringStrategy, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react'
import type { Coluna, Demanda, Etiqueta, Id, Quadro, UsuarioResumo } from '@shared/tipos/index.ts'
import { useMover } from '../../api/demandas.ts'
import { useClientes, useUsuarios } from '../../api/seletores.ts'
import { raizCamadas } from '../../lib/camadas.ts'
import type { Ancora } from '../../lib/posicao.ts'
import { MenuDoCard } from '../../quadro/CardDemanda.tsx'
import { useFocoDemanda } from '../../teclado/index.ts'
import { definirCardSobMouse, sairDoCard } from '../../teclado/foco.ts'
import { PilhaAvatares } from '../../ui/Avatar.tsx'
import { ChipCliente } from '../../ui/Chips.tsx'
import { Contador } from '../../ui/Indicadores.tsx'
import { BandeiraPrioridade, ColunaCelula, ConcluidaCelula, DataCelula, EtiquetasCelula, PrazoCelula } from './celulas.tsx'
import {
  deslocamentos, destinoAoSoltar, janelaVisivel, linhasDaLista, proximaOrdem, type Agrupamento, type AlvoSoltar, type CampoOrdem,
  type GrupoLista, type LinhaLista, type OrdemLista,
} from './logica.ts'

const ALTURAS = { grupo: 44, demanda: 44, vazio: 40 } as const
const ALTURA_CABECA = 40

interface ColunaTabela { campo: Exclude<CampoOrdem, 'posicao'>; rotulo: string; largura: number | 'titulo' }

const COLUNAS_TABELA: ColunaTabela[] = [
  { campo: 'numero', rotulo: '#', largura: 60 },
  { campo: 'titulo', rotulo: 'Título', largura: 'titulo' },
  { campo: 'cliente', rotulo: 'Cliente', largura: 88 },
  { campo: 'coluna', rotulo: 'Coluna', largura: 128 },
  { campo: 'membros', rotulo: 'Membros', largura: 88 },
  { campo: 'etiquetas', rotulo: 'Etiquetas', largura: 120 },
  { campo: 'prioridade', rotulo: 'Prioridade', largura: 108 },
  { campo: 'inicio', rotulo: 'Início', largura: 84 },
  { campo: 'prazo', rotulo: 'Prazo', largura: 136 },
  { campo: 'concluida', rotulo: 'Concluída', largura: 96 },
]
const TITULO_MIN = 190

/** A coluna do agrupamento escolhido repete o grupo em cada linha: some. */
const ESCONDE: Partial<Record<Agrupamento, CampoOrdem>> = { coluna: 'coluna', cliente: 'cliente', prioridade: 'prioridade' }

export interface PropsTabela {
  quadro: Quadro
  colunas: readonly Coluna[]
  etiquetas: readonly Etiqueta[]
  grupos: readonly GrupoLista[]
  agrupar: Agrupamento
  ordem: OrdemLista
  mudarOrdem(o: OrdemLista): void
  recolhidos: ReadonlySet<string>
  alternarGrupo(id: string): void
  /** As do quadro sem filtro (posição real na coluna de destino ao soltar). */
  todas: readonly Demanda[]
  agora: Date
  abrir(numero: number): void
}

// ─────────────────────────────── arrastar ───────────────────────────────

type DadoAlvo =
  | { tipo: 'linha'; colunaId: Id; demandaId: Id }
  | { tipo: 'grupo' | 'vazio'; colunaId: Id }

interface AlvoTela extends AlvoSoltar { id: string }

function ySoltar(e: DragMoveEvent | DragOverEvent): number | null {
  const a = e.activatorEvent as (MouseEvent & TouchEvent) | null
  const y0 = a?.touches?.[0]?.clientY ?? a?.clientY
  return typeof y0 === 'number' ? y0 + e.delta.y : null
}

// ─────────────────────────────── linhas ───────────────────────────────

interface PropsLinhaDemanda {
  linha: Extract<LinhaLista, { tipo: 'demanda' }>
  topo: number
  indiceLinha: number
  visiveis: readonly ColunaTabela[]
  foco: boolean
  arrastavel: boolean
  fantasma: boolean
  marca: 'antes' | 'depois' | null
  coluna: Coluna | undefined
  agora: Date
  etiquetasPorId: ReadonlyMap<Id, Etiqueta>
  clientes: ReturnType<typeof useClientes>
  usuarios: ReturnType<typeof useUsuarios>
  aoFocar(chave: string, d: Demanda): void
  aoDesfocar(): void
  abrir(numero: number): void
  menu(d: Demanda, a: Ancora): void
}

const LinhaDemanda = memo(function LinhaDemanda(p: PropsLinhaDemanda) {
  const d = p.linha.demanda
  const arr = useDraggable({ id: p.linha.chave, data: { demanda: d }, disabled: !p.arrastavel })
  const solta = useDroppable({ id: `l:${p.linha.chave}`, data: { tipo: 'linha', colunaId: d.colunaId, demandaId: d.id } satisfies DadoAlvo, disabled: !p.arrastavel })
  const ref = useCallback((no: HTMLElement | null) => { arr.setNodeRef(no); solta.setNodeRef(no) }, [arr.setNodeRef, solta.setNodeRef])
  const cliente = d.clienteId ? p.clientes.find((c) => c.id === d.clienteId) : undefined
  const membros = d.membroIds.map((id) => p.usuarios.find((u) => u.id === id)).filter((u): u is UsuarioResumo => !!u)
  const etiquetas = d.etiquetaIds.map((id) => p.etiquetasPorId.get(id)).filter((e): e is Etiqueta => !!e).sort((a, b) => a.pos - b.pos)
  const celula = (c: ColunaTabela) => {
    switch (c.campo) {
      case 'numero': return <span className="lista-numero">#{d.numero}</span>
      case 'titulo': return <span className="lista-titulo" title={d.titulo}>{d.titulo}</span>
      case 'cliente': return cliente ? <ChipCliente cliente={cliente} /> : null
      case 'coluna': return <ColunaCelula coluna={p.coluna} />
      case 'membros': return membros.length ? <PilhaAvatares pessoas={membros} tamanho={22} /> : null
      case 'etiquetas': return <EtiquetasCelula etiquetas={etiquetas} />
      case 'prioridade': return <BandeiraPrioridade p={d.prioridade} />
      case 'inicio': return <DataCelula data={d.inicio} hora={d.inicioHora} />
      case 'prazo': return <PrazoCelula d={d} coluna={p.coluna ?? { papel: 'normal' }} agora={p.agora} />
      case 'concluida': return <ConcluidaCelula d={d} />
    }
  }
  return (
    <div
      ref={ref}
      {...(p.arrastavel ? arr.listeners : {})}
      role="row"
      aria-rowindex={p.indiceLinha + 2}
      aria-label={`#${d.numero} ${d.titulo}`}
      tabIndex={p.foco ? 0 : -1}
      className="lista-linha lista-linha-demanda"
      style={{ top: p.topo }}
      data-chave={p.linha.chave}
      data-demanda-id={d.id}
      data-concluida={d.concluidaEm ? 'true' : undefined}
      data-prioridade={d.prioridade === 'alta' || d.prioridade === 'urgente' ? d.prioridade : undefined}
      data-fantasma={p.fantasma || undefined}
      data-marca={p.marca ?? undefined}
      data-arrastavel={p.arrastavel || undefined}
      onClick={(e) => { if (!e.defaultPrevented && Date.now() - fimDoArraste > 250) p.abrir(d.numero) }}
      onFocus={(e) => { if (e.target === e.currentTarget) p.aoFocar(p.linha.chave, d) }}
      onBlur={(e) => { if (e.target === e.currentTarget) p.aoDesfocar() }}
      onPointerEnter={() => definirCardSobMouse(d.id)}
      onPointerLeave={() => sairDoCard(d.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        p.menu(d, e.clientX === 0 && e.clientY === 0 ? e.currentTarget : { x: e.clientX, y: e.clientY })
      }}
    >
      {p.visiveis.map((c) => (
        <div key={c.campo} role="cell" className="lista-celula" data-campo={c.campo}>{celula(c)}</div>
      ))}
    </div>
  )
})

let fimDoArraste = 0

interface PropsLinhaGrupo {
  linha: Extract<LinhaLista, { tipo: 'grupo' }>
  topo: number
  indiceLinha: number
  foco: boolean
  alvo: boolean
  podeSoltar: boolean
  colunas: number
  aoFocar(chave: string): void
  alternar(id: string): void
}

const LinhaGrupo = memo(function LinhaGrupo(p: PropsLinhaGrupo) {
  const g = p.linha.grupo
  const solta = useDroppable({ id: `g:${g.id}`, data: g.colunaId ? ({ tipo: 'grupo', colunaId: g.colunaId } satisfies DadoAlvo) : undefined, disabled: !p.podeSoltar || !g.colunaId })
  const filtrado = g.demandas.length !== g.total
  const Seta = p.linha.recolhido ? ChevronRight : ChevronDown
  return (
    <div ref={solta.setNodeRef} role="row" aria-rowindex={p.indiceLinha + 2} className="lista-linha lista-linha-grupo"
      style={{ top: p.topo }} data-alvo={p.alvo || undefined}>
      <div role="cell" aria-colspan={p.colunas} className="lista-grupo-celula">
        <button type="button" className="lista-grupo-botao" data-chave={p.linha.chave} tabIndex={p.foco ? 0 : -1}
          aria-expanded={!p.linha.recolhido} onFocus={() => p.aoFocar(p.linha.chave)} onClick={() => p.alternar(g.id)}>
          <Seta aria-hidden="true" className="lista-grupo-seta" />
          {g.prioridade ? <BandeiraPrioridade p={g.prioridade} compacta /> : g.cor && <span className="lista-ponto" data-cor={g.cor} aria-hidden="true" />}
          <span className="lista-grupo-nome">{g.rotulo}</span>
          <Contador valor={g.total} visiveis={filtrado ? g.demandas.length : undefined} rotulo={g.total === 1 ? 'demanda' : 'demandas'} />
        </button>
      </div>
    </div>
  )
})

const LinhaVazia = memo(function LinhaVazia({ linha, topo, indiceLinha, colunas, alvo, podeSoltar }: {
  linha: Extract<LinhaLista, { tipo: 'vazio' }>; topo: number; indiceLinha: number; colunas: number; alvo: boolean; podeSoltar: boolean
}) {
  const g = linha.grupo
  const solta = useDroppable({ id: `v:${g.id}`, data: { tipo: 'vazio', colunaId: g.colunaId! } satisfies DadoAlvo, disabled: !podeSoltar })
  return (
    <div ref={solta.setNodeRef} role="row" aria-rowindex={indiceLinha + 2} className="lista-linha lista-linha-vazia"
      style={{ top: topo }} data-alvo={alvo || undefined}>
      <div role="cell" aria-colspan={colunas} className="lista-vazia-celula">
        {g.total > 0 ? 'Nenhuma demanda desta coluna com estes filtros.' : podeSoltar ? 'Nenhuma demanda nesta coluna. Arraste uma para cá.' : 'Nenhuma demanda nesta coluna.'}
      </div>
    </div>
  )
})

// ─────────────────────────────── tabela ───────────────────────────────

const focavel = (l: LinhaLista | undefined) => !!l && l.tipo !== 'vazio'

export function TabelaLista(p: PropsTabela) {
  const mover = useMover()
  const [, focar] = useFocoDemanda()
  const clientes = useClientes()
  const usuarios = useUsuarios()
  const etiquetasPorId = useMemo(() => new Map(p.etiquetas.map((e) => [e.id, e])), [p.etiquetas])
  const colunaPorId = useMemo(() => new Map(p.colunas.map((c) => [c.id, c])), [p.colunas])
  const linhas = useMemo(() => linhasDaLista(p.grupos, p.recolhidos, p.agrupar), [p.grupos, p.recolhidos, p.agrupar])
  const { topos, total } = useMemo(() => deslocamentos(linhas, ALTURAS), [linhas])
  const indicePorChave = useMemo(() => new Map(linhas.map((l, i) => [l.chave, i])), [linhas])

  const visiveis = useMemo(() => COLUNAS_TABELA.filter((c) => c.campo !== ESCONDE[p.agrupar]), [p.agrupar])
  const fixas = visiveis.reduce((s, c) => s + (c.largura === 'titulo' ? 0 : c.largura), 0)
  const estiloTabela = {
    ['--lista-colunas' as string]: visiveis.map((c) => (c.largura === 'titulo' ? `minmax(${TITULO_MIN}px, 1fr)` : `${c.largura}px`)).join(' '),
    ['--lista-min' as string]: `${fixas + TITULO_MIN + 12}px`,
  } as CSSProperties

  // ─────────── rolagem e janela ───────────
  const rolagem = useRef<HTMLDivElement>(null)
  const [vista, setVista] = useState({ topo: 0, altura: 800 })
  const quadroAnimacao = useRef(0)
  useLayoutEffect(() => {
    const el = rolagem.current
    if (!el) return
    const medir = () => setVista({ topo: el.scrollTop, altura: el.clientHeight })
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const aoRolar = () => {
    cancelAnimationFrame(quadroAnimacao.current)
    quadroAnimacao.current = requestAnimationFrame(() => {
      const el = rolagem.current
      if (el) setVista((v) => (v.topo === el.scrollTop ? v : { ...v, topo: el.scrollTop }))
    })
  }
  useEffect(() => () => cancelAnimationFrame(quadroAnimacao.current), [])
  const [ini, fim] = janelaVisivel(topos, total, Math.max(0, vista.topo - ALTURA_CABECA), vista.altura)

  // ─────────── foco itinerante ───────────
  const [foco, setFoco] = useState<string | null>(null)
  const pendente = useRef<string | null>(null)
  const chaveFoco = foco && indicePorChave.has(foco) ? foco : linhas.find(focavel)?.chave ?? null
  const indiceFoco = chaveFoco ? indicePorChave.get(chaveFoco) ?? -1 : -1

  const aoFocarDemanda = useCallback((chave: string, d: Demanda) => { setFoco(chave); focar(d) }, [focar])
  const aoFocarGrupo = useCallback((chave: string) => { setFoco(chave); focar(null) }, [focar])
  const aoDesfocar = useCallback(() => focar(null), [focar])
  useEffect(() => () => focar(null), [focar])

  const irPara = (i: number) => {
    const l = linhas[i]
    const el = rolagem.current
    if (!l || !el) return
    const top = topos[i]
    const h = ALTURAS[l.tipo]
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + h > el.scrollTop + el.clientHeight - ALTURA_CABECA) el.scrollTop = top + h - el.clientHeight + ALTURA_CABECA
    pendente.current = l.chave
    setFoco(l.chave)
    setVista((v) => ({ ...v, topo: el.scrollTop }))
  }
  useLayoutEffect(() => {
    const chave = pendente.current
    if (!chave) return
    const el = rolagem.current?.querySelector<HTMLElement>(`[data-chave="${CSS.escape(chave)}"]`)
    if (el) { pendente.current = null; el.focus({ preventScroll: true }) }
  })

  const passo = (de: number, dir: 1 | -1) => {
    for (let i = de + dir; i >= 0 && i < linhas.length; i += dir) if (focavel(linhas[i])) return i
    return de
  }
  function teclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const alvo = (e.target as HTMLElement).closest<HTMLElement>('[data-chave]')
    const i = alvo?.dataset.chave ? indicePorChave.get(alvo.dataset.chave) ?? -1 : -1
    if (i < 0) return
    const l = linhas[i]
    const porTela = Math.max(1, Math.floor((vista.altura - ALTURA_CABECA) / ALTURAS.demanda) - 1)
    let prox = -1
    switch (e.key) {
      case 'ArrowDown': prox = passo(i, 1); break
      case 'ArrowUp': prox = passo(i, -1); break
      case 'j': case 'J': if (!e.shiftKey) prox = passo(i, 1); break
      case 'k': case 'K': if (!e.shiftKey) prox = passo(i, -1); break
      case 'Home': prox = linhas.findIndex(focavel); break
      case 'End': for (let j = linhas.length - 1; j >= 0; j--) if (focavel(linhas[j])) { prox = j; break } break
      case 'PageDown': { let j = i; for (let n = 0; n < porTela; n++) j = passo(j, 1); prox = j; break }
      case 'PageUp': { let j = i; for (let n = 0; n < porTela; n++) j = passo(j, -1); prox = j; break }
      case 'ArrowLeft': if (l.tipo === 'grupo' && !l.recolhido) { e.preventDefault(); p.alternarGrupo(l.grupo.id) } return
      case 'ArrowRight': if (l.tipo === 'grupo' && l.recolhido) { e.preventDefault(); p.alternarGrupo(l.grupo.id) } return
      default: return
    }
    if (prox < 0) return
    e.preventDefault()
    irPara(prox)
  }

  // ─────────── menu de contexto ───────────
  const [menu, setMenu] = useState<{ d: Demanda; ancora: Ancora } | null>(null)
  const abrirMenu = useCallback((d: Demanda, ancora: Ancora) => setMenu({ d, ancora }), [])

  // ─────────── arrastar entre os grupos de coluna ───────────
  const podeArrastar = p.agrupar === 'coluna'
  const porPosicao = p.ordem.campo === 'posicao' && p.ordem.direcao === 'asc'
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  )
  const [ativo, setAtivo] = useState<{ chave: string; demanda: Demanda; largura: number } | null>(null)
  const [alvo, setAlvo] = useState<AlvoTela | null>(null)
  const alvoRef = useRef<AlvoTela | null>(null)
  const definirAlvo = (a: AlvoTela | null) => {
    const v = alvoRef.current
    if (v === a || (v && a && v.id === a.id && v.lado === a.lado && v.referenciaId === a.referenciaId)) return
    alvoRef.current = a
    setAlvo(a)
  }
  const terminar = () => {
    setAtivo(null)
    definirAlvo(null)
    fimDoArraste = Date.now()
    document.documentElement.removeAttribute('data-arrastando')
  }
  useEffect(() => () => document.documentElement.removeAttribute('data-arrastando'), [])

  function aoComecar(e: DragStartEvent) {
    const d = (e.active.data.current as { demanda?: Demanda } | undefined)?.demanda
    if (!d) return
    document.documentElement.setAttribute('data-arrastando', '')
    setAtivo({ chave: String(e.active.id), demanda: d, largura: Math.min(480, e.active.rect.current.initial?.width ?? 360) })
  }
  // onDragMove chega com o alvo da posição anterior; onDragOver, quando o alvo muda: os dois atualizam a marca
  function aoMover(e: DragMoveEvent | DragOverEvent) {
    const over = e.over
    const dado = over?.data.current as DadoAlvo | undefined
    if (!over || !dado) { definirAlvo(null); return }
    if (dado.tipo !== 'linha' || !porPosicao) { definirAlvo({ id: String(over.id), colunaId: dado.colunaId, referenciaId: null, lado: 'antes' }); return }
    const y = ySoltar(e)
    const lado = y !== null && y > over.rect.top + over.rect.height / 2 ? 'depois' : 'antes'
    definirAlvo({ id: String(over.id), colunaId: dado.colunaId, referenciaId: dado.demandaId, lado })
  }
  function aoSoltar(_e: DragEndEvent) {
    const a = alvoRef.current
    const d = ativo?.demanda
    terminar()
    if (!a || !d) return
    const naColuna = p.todas.filter((x) => x.colunaId === a.colunaId).sort((x, y) => x.posicao - y.posicao || x.numero - y.numero)
    const destino = destinoAoSoltar(d, a, porPosicao, naColuna)
    if (destino) void mover(d, destino, 'arrastar')
  }

  // ─────────── o que desenhar ───────────
  const indices = new Set<number>()
  for (let i = ini; i < fim; i++) indices.add(i)
  if (indiceFoco >= 0) indices.add(indiceFoco)
  if (ativo) { const i = indicePorChave.get(ativo.chave); if (i !== undefined) indices.add(i) }
  const ordenados = [...indices].sort((a, b) => a - b)
  const grupoAlvo = alvo && (alvo.referenciaId === null) ? alvo.colunaId : null

  const corpo = ordenados.map((i) => {
    const l = linhas[i]
    if (l.tipo === 'grupo') {
      return <LinhaGrupo key={l.chave} linha={l} topo={topos[i]} indiceLinha={i} foco={l.chave === chaveFoco} colunas={visiveis.length}
        alvo={!!grupoAlvo && l.grupo.colunaId === grupoAlvo} podeSoltar={podeArrastar} aoFocar={aoFocarGrupo} alternar={p.alternarGrupo} />
    }
    if (l.tipo === 'vazio') {
      return <LinhaVazia key={l.chave} linha={l} topo={topos[i]} indiceLinha={i} colunas={visiveis.length}
        alvo={!!grupoAlvo && l.grupo.colunaId === grupoAlvo} podeSoltar={podeArrastar} />
    }
    const marca = alvo && alvo.referenciaId === l.demanda.id && alvo.id === `l:${l.chave}` ? alvo.lado : null
    return (
      <LinhaDemanda key={l.chave} linha={l} topo={topos[i]} indiceLinha={i} visiveis={visiveis} foco={l.chave === chaveFoco}
        arrastavel={podeArrastar} fantasma={ativo?.chave === l.chave} marca={marca} coluna={colunaPorId.get(l.demanda.colunaId)}
        agora={p.agora} etiquetasPorId={etiquetasPorId} clientes={clientes} usuarios={usuarios}
        aoFocar={aoFocarDemanda} aoDesfocar={aoDesfocar} abrir={p.abrir} menu={abrirMenu} />
    )
  })

  return (
    <DndContext sensors={sensores} collisionDetection={pointerWithin} onDragStart={aoComecar} onDragMove={aoMover} onDragOver={aoMover}
      onDragEnd={aoSoltar} onDragCancel={terminar} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        screenReaderInstructions: { draggable: 'Arraste a linha para o grupo de outra coluna para mover a demanda. Pelo teclado, use vírgula e ponto, ou Shift+M.' },
        announcements: {
          onDragStart: ({ active }) => `Demanda ${(active.data.current as { demanda?: Demanda } | undefined)?.demanda?.numero ?? ''} pega.`,
          onDragOver: () => undefined,
          onDragEnd: () => 'Solta.',
          onDragCancel: () => 'Cancelado. A demanda voltou ao lugar.',
        },
      }}>
      <div ref={rolagem} className="lista-tabela" role="table" aria-label={`Demandas do quadro ${p.quadro.nome}`}
        aria-rowcount={linhas.length + 1} style={estiloTabela} onScroll={aoRolar} data-arrastando={ativo ? 'true' : undefined}>
        <div role="rowgroup" className="lista-cabeca">
          <div role="row" aria-rowindex={1} className="lista-linha lista-linha-cabeca">
            {visiveis.map((c) => {
              const ativa = p.ordem.campo === c.campo
              const Icone = ativa ? (p.ordem.direcao === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
              return (
                <div key={c.campo} role="columnheader" className="lista-celula" data-campo={c.campo}
                  aria-sort={ativa ? (p.ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="lista-ordenar" data-ativa={ativa || undefined}
                    title={ativa && p.ordem.direcao === 'desc' ? 'Clique para voltar à ordem do quadro' : `Ordenar por ${c.rotulo === '#' ? 'número' : c.rotulo.toLowerCase()}`}
                    onClick={() => p.mudarOrdem(proximaOrdem(p.ordem, c.campo))}>
                    <span>{c.rotulo === '#' ? <><span aria-hidden="true">#</span><span className="sr-only">Número</span></> : c.rotulo}</span>
                    <Icone aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        <div role="rowgroup" className="lista-corpo" style={{ height: total }} onKeyDown={teclar}>
          {corpo}
        </div>
      </div>
      {createPortal(
        <DragOverlay zIndex={55} dropAnimation={null}>
          {ativo ? (
            <div className="lista-sobreposta" style={{ width: ativo.largura }} inert>
              <span className="lista-numero">#{ativo.demanda.numero}</span>
              <span className="lista-titulo">{ativo.demanda.titulo}</span>
              {alvo && <span className="lista-sobreposta-destino">→ {colunaPorId.get(alvo.colunaId)?.nome}</span>}
            </div>
          ) : null}
        </DragOverlay>,
        raizCamadas(),
      )}
      {menu && <MenuDoCard d={menu.d} ancora={menu.ancora} fechar={() => setMenu(null)} />}
    </DndContext>
  )
}
