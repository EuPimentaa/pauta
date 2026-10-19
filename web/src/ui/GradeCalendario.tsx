/**
 * GradeCalendario: mês ou semana (começa na segunda), feriados marcados, células como alvo de soltar (dnd-kit) e
 * itens desenhados por quem usa. Base do CalendarioDemandas do NÚCLEO-WEB (Agenda e Calendário do quadro).
 *
 *   <GradeCalendario rotulo="Agenda" modo="mes" data={inicio} feriados={feriados}
 *     itensDoDia={(d) => porDia.get(d)?.map((x) => ({ id: x.id, conteudo: <ChipAgenda d={x} />, arrastavel: true })) ?? []}
 *     aoSoltar={(id, dia) => mudarPrazo(id, dia)} aoMudarPeriodo={setPeriodo} />
 *
 * Arrastar por mouse, toque ou teclado (Espaço pega; setas andam de dia em dia; Espaço solta; Esc cancela).
 * Uma faixa de fora (ex.: "Sem prazo") que também arrasta para os dias: envolva os dois em <CalendarioArrastar> e use
 * <ItemCalendario> nela; a grade dentro do provedor não precisa de `aoSoltar`.
 *
 * Teclado: a grade é uma parada só do Tab (o dia em foco; as setas andam de dia em dia) e só os itens desse dia entram
 * no Tab (o mês de todos os quadros eram mais de 120 paradas; pedido 3 do F3, integração 3B).
 */
import '../estilos/calendario.css'
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter, type UniqueIdentifier,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DataLocal } from '@shared/tipos/index.ts'
import { raizCamadas } from '../lib/camadas.ts'
import { cx } from '../lib/classes.ts'
import {
  DIAS_CURTOS, DIAS_LONGOS, MESES, diaDaSemana, diasDaSemana, ehFimDeSemana, formatarDiaMes, formatarMesAno, gradeDoMes,
  hojeLocal, inicioDaSemana, mesmoMes, somarDias, somarMeses,
} from '../lib/datas.ts'
import { Abas } from './Abas.tsx'
import { Botao, BotaoIcone } from './Botao.tsx'
import type { FeriadoUi } from './SeletorData.tsx'

const PREFIXO_DIA = 'dia:'
const nomeDia = (d: DataLocal) => `${DIAS_LONGOS[diaDaSemana(d)]}, ${Number(d.slice(8))} de ${MESES[Number(d.slice(5, 7)) - 1]}`

// ─────────────────────────────── arrastar ───────────────────────────────

interface CtxArrastar { ativo: boolean; conteudos: Map<string, ReactNode> }
const ContextoArrastar = createContext<CtxArrastar | null>(null)

/** Teclado: as setas levam o item para o dia vizinho naquela direção. */
const coordenadasPorDia: KeyboardCoordinateGetter = (evento, { currentCoordinates, context }) => {
  const atual = context.collisionRect
  const direcao = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[evento.code] as [number, number] | undefined
  if (!atual || !direcao) return undefined
  evento.preventDefault()
  const cx0 = atual.left + atual.width / 2, cy0 = atual.top + atual.height / 2
  let melhor: { x: number; y: number; dist: number } | null = null
  for (const [id, r] of context.droppableRects) {
    if (!String(id).startsWith(PREFIXO_DIA)) continue
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const dx = x - cx0, dy = y - cy0
    const ao = dx * direcao[0] + dy * direcao[1]
    if (ao <= 4) continue
    const lateral = Math.abs(direcao[0] ? dy : dx)
    const dist = ao + lateral * 3
    if (!melhor || dist < melhor.dist) melhor = { x: dx, y: dy, dist }
  }
  if (!melhor) return undefined
  return { x: currentCoordinates.x + melhor.x, y: currentCoordinates.y + melhor.y }
}

const anuncios: Announcements = {
  onDragStart: () => 'Item pego. Use as setas para escolher o dia; Espaço solta, Esc cancela.',
  onDragOver: ({ over }) => (over && String(over.id).startsWith(PREFIXO_DIA) ? `Sobre ${nomeDia(String(over.id).slice(PREFIXO_DIA.length))}.` : undefined),
  onDragEnd: ({ over }) => (over && String(over.id).startsWith(PREFIXO_DIA) ? `Solto em ${nomeDia(String(over.id).slice(PREFIXO_DIA.length))}.` : 'Solto fora do calendário.'),
  onDragCancel: () => 'Cancelado. O item voltou ao lugar.',
}

export function CalendarioArrastar({ aoSoltar, children }: { aoSoltar(idItem: string, dia: DataLocal): void; children: ReactNode }) {
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: coordenadasPorDia }),
  )
  const conteudos = useRef(new Map<string, ReactNode>()).current
  const [ativo, setAtivo] = useState<UniqueIdentifier | null>(null)
  const fim = () => { setAtivo(null); document.documentElement.removeAttribute('data-arrastando') }
  return (
    <ContextoArrastar.Provider value={{ ativo: ativo !== null, conteudos }}>
      <DndContext
        sensors={sensores}
        accessibility={{ announcements: anuncios, screenReaderInstructions: { draggable: 'Para mover, aperte Espaço. Use as setas para escolher o dia e Espaço para soltar; Esc cancela.' } }}
        onDragStart={(e: DragStartEvent) => { setAtivo(e.active.id); document.documentElement.setAttribute('data-arrastando', '') }}
        onDragCancel={fim}
        onDragEnd={(e: DragEndEvent) => {
          fim()
          const alvo = e.over ? String(e.over.id) : ''
          if (alvo.startsWith(PREFIXO_DIA)) aoSoltar(String(e.active.id), alvo.slice(PREFIXO_DIA.length))
        }}
      >
        {children}
        {/* em portal: um ancestral com vidro (backdrop-filter) ou transform deslocaria o position:fixed */}
        {createPortal(
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
            {ativo !== null ? <div className="ui-cal-fantasma">{conteudos.get(String(ativo))}</div> : null}
          </DragOverlay>,
          raizCamadas(),
        )}
      </DndContext>
    </ContextoArrastar.Provider>
  )
}

const FOCAVEIS_DO_ITEM = 'a[href], button, input, select, textarea, [tabindex]'

/**
 * Item que pode ser arrastado para um dia (dentro de <CalendarioArrastar> ou de uma grade com aoSoltar). Com
 * `tabavel={false}` (itens de um dia que não é o dia em foco da grade) ele e o que tiver dentro saem do Tab, mas
 * continuam clicáveis.
 */
export function ItemCalendario({ id, arrastavel = true, rotulo, tabavel = true, children }: {
  id: string; arrastavel?: boolean; rotulo?: string; tabavel?: boolean; children: ReactNode
}) {
  const ctx = useContext(ContextoArrastar)
  ctx?.conteudos.set(id, children)
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, disabled: !arrastavel || !ctx })
  const raiz = useRef<HTMLDivElement | null>(null)
  // o conteúdo é de quem usa (ex.: o chip do CalendarioDemandas): tira e devolve o lugar no Tab de tudo o que for focável
  useLayoutEffect(() => {
    for (const el of raiz.current?.querySelectorAll<HTMLElement>(FOCAVEIS_DO_ITEM) ?? []) {
      if (!tabavel) {
        if (!el.hasAttribute('data-tab-antes')) el.setAttribute('data-tab-antes', el.getAttribute('tabindex') ?? '')
        el.tabIndex = -1
      } else if (el.hasAttribute('data-tab-antes')) {
        const antes = el.getAttribute('data-tab-antes')!
        if (antes === '') el.removeAttribute('tabindex'); else el.setAttribute('tabindex', antes)
        el.removeAttribute('data-tab-antes')
      }
    }
  })
  return (
    <div
      ref={(el) => { raiz.current = el; setNodeRef(el) }}
      className="ui-cal-item"
      data-arrastavel={(arrastavel && !!ctx) || undefined}
      data-arrastando={isDragging || undefined}
      {...(arrastavel && ctx ? { ...attributes, ...listeners, tabIndex: tabavel ? 0 : -1, 'aria-roledescription': 'item arrastável', 'aria-label': rotulo } : {})}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────── grade ───────────────────────────────

export interface ItemDia {
  id: string
  conteudo: ReactNode
  arrastavel?: boolean
  /** Nome acessível do item ao arrastar ("#12 Banner de verão"). */
  rotulo?: string
}

export interface PropsGradeCalendario {
  rotulo: string
  modo: 'mes' | 'semana'
  /** Qualquer dia do período mostrado. */
  data: DataLocal
  feriados?: readonly FeriadoUi[]
  itensDoDia?(dia: DataLocal): ItemDia[]
  /** Mês: quantos itens aparecem por dia antes do "+N". Padrão 3 (semana: todos). */
  maxPorDia?: number
  aoVerMais?(dia: DataLocal): void
  /** Soltar um item num dia. Sem isto (e fora de <CalendarioArrastar>), nada arrasta. */
  aoSoltar?(idItem: string, dia: DataLocal): void
  /** Enter ou duplo clique numa célula (ex.: criar com aquele prazo). */
  aoAtivarDia?(dia: DataLocal): void
  /** Cabeçalho embutido com ← → Hoje e Mês|Semana. */
  aoMudarPeriodo?(data: DataLocal, modo: 'mes' | 'semana'): void
  /** Conteúdo extra no cabeçalho embutido (ex.: "Só as minhas"). */
  extrasCabecalho?: ReactNode
  /**
   * Linha fixa no fim da célula, fora do limite do "+N" (Fase 2: os eventos das agendas externas no mês, "3 eventos").
   * `foco`: o dia é o da parada do Tab (o que for focável dentro dela entra no Tab só então).
   */
  rodapeDoDia?(dia: DataLocal, foco: boolean): ReactNode
  className?: string
}

export function GradeCalendario(p: PropsGradeCalendario) {
  const dentro = useContext(ContextoArrastar)
  if (p.aoSoltar && !dentro) {
    return <CalendarioArrastar aoSoltar={p.aoSoltar}><Grade {...p} /></CalendarioArrastar>
  }
  return <Grade {...p} />
}

function Grade({ rotulo, modo, data, feriados = [], itensDoDia, maxPorDia, aoVerMais, aoAtivarDia, aoMudarPeriodo, extrasCabecalho, rodapeDoDia, className }: PropsGradeCalendario) {
  const hoje = hojeLocal()
  const dias = useMemo(() => (modo === 'mes' ? gradeDoMes(data) : diasDaSemana(data)), [modo, data])
  const mapaFeriados = useMemo(() => new Map(feriados.map((f) => [f.data, f.nome])), [feriados])
  const [foco, setFoco] = useState<DataLocal>(() => (dias.includes(hoje) ? hoje : modo === 'mes' ? `${data.slice(0, 8)}01` : dias[0]))
  const focoValido = dias.includes(foco) ? foco : dias[0]
  const grade = useRef<HTMLDivElement>(null)
  const limite = maxPorDia ?? (modo === 'mes' ? 3 : Infinity)
  const titulo = modo === 'mes'
    ? formatarMesAno(data)
    : `${formatarDiaMes(dias[0])} – ${formatarDiaMes(dias[6])} de ${dias[6].slice(0, 4)}`

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('.ui-cal-item')) return
    const passos: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in passos) {
      e.preventDefault()
      const alvo = somarDias(focoValido, passos[e.key])
      if (dias.includes(alvo)) {
        setFoco(alvo)
        requestAnimationFrame(() => grade.current?.querySelector<HTMLElement>(`[data-dia="${alvo}"]`)?.focus())
      } else if (aoMudarPeriodo) {
        setFoco(alvo)
        aoMudarPeriodo(alvo, modo)
        requestAnimationFrame(() => grade.current?.querySelector<HTMLElement>(`[data-dia="${alvo}"]`)?.focus())
      }
    } else if (e.key === 'Enter' && aoAtivarDia && (e.target as HTMLElement).dataset.dia) {
      e.preventDefault()
      aoAtivarDia((e.target as HTMLElement).dataset.dia!)
    }
  }

  const andar = (n: number) => aoMudarPeriodo?.(modo === 'mes' ? somarMeses(data, n) : somarDias(inicioDaSemana(data), 7 * n), modo)

  return (
    <section className={cx('ui-cal', className)} data-modo={modo} aria-label={rotulo}>
      {aoMudarPeriodo && (
        <div className="ui-cal-topo">
          <h2 className="ui-cal-titulo" aria-live="polite">{titulo}</h2>
          {extrasCabecalho}
          <Abas rotulo="Período" abas={[{ id: 'mes', rotulo: 'Mês' }, { id: 'semana', rotulo: 'Semana' }]} ativa={modo}
            aoMudar={(m) => aoMudarPeriodo(data, m)} />
          <Botao variante="secundario" tamanho="p" onClick={() => aoMudarPeriodo(hoje, modo)}>Hoje</Botao>
          <BotaoIcone icone={ChevronLeft} rotulo={modo === 'mes' ? 'Mês anterior' : 'Semana anterior'} onClick={() => andar(-1)} />
          <BotaoIcone icone={ChevronRight} rotulo={modo === 'mes' ? 'Próximo mês' : 'Próxima semana'} onClick={() => andar(1)} />
        </div>
      )}
      <div className="ui-cal-semana" aria-hidden="true">
        {(modo === 'mes' ? DIAS_CURTOS.map((d) => ({ d, n: null as string | null })) : dias.map((d, i) => ({ d: DIAS_CURTOS[i], n: d })))
          .map(({ d, n }) => (
            <div key={d}>{d}{n && <span className="tabular" style={{ letterSpacing: 0 }}>{Number(n.slice(8))}</span>}</div>
          ))}
      </div>
      <div ref={grade} className="ui-cal-grade" role="grid" aria-label={titulo} onKeyDown={aoTeclar}>
        {Array.from({ length: dias.length / 7 }, (_, s) => (
          <div key={s} role="row" className="contents">
            {dias.slice(s * 7, s * 7 + 7).map((d) => (
              <Dia key={d} dia={d} hoje={hoje} foco={d === focoValido} fora={modo === 'mes' && !mesmoMes(d, data)}
                feriado={mapaFeriados.get(d)} itens={itensDoDia?.(d) ?? []} limite={limite} aoVerMais={aoVerMais}
                aoFocar={() => setFoco(d)} aoAtivar={aoAtivarDia} rodape={rodapeDoDia?.(d, d === focoValido)} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

interface PropsDia {
  dia: DataLocal; hoje: DataLocal; foco: boolean; fora: boolean; feriado?: string; itens: ItemDia[]; limite: number
  aoVerMais?(d: DataLocal): void; aoFocar(): void; aoAtivar?(d: DataLocal): void; rodape?: ReactNode
}

function Dia({ dia, hoje, foco, fora, feriado, itens, limite, aoVerMais, aoFocar, aoAtivar, rodape }: PropsDia) {
  const { setNodeRef, isOver } = useDroppable({ id: PREFIXO_DIA + dia })
  const [expandido, setExpandido] = useState(false)
  const visiveis = expandido ? itens : itens.slice(0, limite)
  const resto = itens.length - visiveis.length
  const quantos = itens.length ? `, ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}` : ''
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      tabIndex={foco ? 0 : -1}
      data-dia={dia}
      aria-label={`${nomeDia(dia)}${dia === hoje ? ', hoje' : ''}${feriado ? `, feriado: ${feriado}` : ''}${quantos}`}
      aria-current={dia === hoje ? 'date' : undefined}
      className="ui-cal-dia"
      data-hoje={dia === hoje || undefined}
      data-fora={fora || undefined}
      data-fim-de-semana={ehFimDeSemana(dia) || undefined}
      data-feriado={feriado ? true : undefined}
      data-sobre={isOver || undefined}
      title={feriado}
      onFocus={() => aoFocar()}
      onDoubleClick={(e) => { if (aoAtivar && !(e.target as HTMLElement).closest('.ui-cal-item')) aoAtivar(dia) }}
    >
      <div className="ui-cal-cabeca">
        <span className="ui-cal-num" aria-hidden="true">{Number(dia.slice(8))}</span>
        {feriado && <span className="ui-cal-feriado" title={feriado}>{feriado}</span>}
      </div>
      {visiveis.length > 0 && (
        <div className="ui-cal-itens">
          {visiveis.map((i) => <ItemCalendario key={i.id} id={i.id} arrastavel={i.arrastavel} rotulo={i.rotulo} tabavel={foco}>{i.conteudo}</ItemCalendario>)}
        </div>
      )}
      {resto > 0 && (
        <button type="button" className="ui-cal-mais" tabIndex={foco ? 0 : -1} aria-label={`+${resto} ${resto === 1 ? 'outro' : 'outros'}`}
          onClick={() => (aoVerMais ? aoVerMais(dia) : setExpandido(true))}>
          +{resto}<span className="ui-cal-mais-texto"> {resto === 1 ? 'outro' : 'outros'}</span>
        </button>
      )}
      {rodape}
    </div>
  )
}
