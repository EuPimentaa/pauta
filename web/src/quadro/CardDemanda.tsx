/**
 * Card da demanda (PLANO §2, "Card"; marcação de estilos/quadro.css, catálogo /dev/ui). Usado no quadro (com arrastar),
 * e sem arrastar no Início, na Agenda, na página do cliente e na Lista (`CardDemanda`, PLANO §2.2).
 *
 * Mostra: capa (cor ou imagem), etiquetas (clicar recolhe todas em barras finas, como no Trello), título até 3 linhas,
 * número, chip do cliente; prazo com estado (estadoPrazo), UM sinal (shared/logica/sinal.ts), checklist "3/5", anexos,
 * comentários, check de concluída, prioridade (faixa à esquerda em alta e urgente), membros (até 3 + "+2") e os
 * selosCard() de cada funcionalidade. Clique abre o modal; o lápis no hover e o botão direito abrem o menu de
 * contexto (menuDemanda() com `onde` card). Foco e mouse marcam a "demanda em foco" dos atalhos.
 */
import { memo, Suspense, useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type Ref } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Calendar, Check, CheckSquare, Clock3, MessageSquare, Paperclip, Pencil, Repeat2, TriangleAlert,
} from 'lucide-react'
import type { Bootstrap, ClienteResumo, Coluna, Demanda, Etiqueta, EstadoPrazo, Quadro, UsuarioResumo } from '@shared/tipos/index.ts'
import { ROTULO_REPETICAO } from '@shared/tipos/index.ts'
import { estadoPrazo } from '@shared/logica/prazo.ts'
import { sinalDoCard, textoSinal, type SinalCard } from '@shared/logica/sinal.ts'
import { hojeSP } from '@shared/logica/datas.ts'
import { bootstrapDe } from '../api/cache.ts'
import { usePendente } from '../api/pendentes.ts'
import { conjuntoFeriados, useDoBootstrap } from '../api/seletores.ts'
import { itensDoMenuDemanda, montarContextoDemanda, montarUtilModal } from '../demanda/contexto.ts'
import type { ExtensaoSeloCard } from '../extensoes/tipos.ts'
import { cx } from '../lib/classes.ts'
import { formatarData, formatarDiaBarraMes, formatarHora } from '../lib/datas.ts'
import type { Ancora } from '../lib/posicao.ts'
import { useAbrirSobreposta } from '../sessao/sobreposta.tsx'
import { useRegistro } from '../sessao/registro.ts'
import { definirCardFocado, definirCardSobMouse, desfocarCard, lugarAtual, sairDoCard } from '../teclado/foco.ts'
import { useRecebido } from '../tempo-real/estado.ts'
import { PilhaAvatares } from '../ui/Avatar.tsx'
import { ChipCliente, ChipEtiqueta } from '../ui/Chips.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { MenuFlutuante, type ItemMenuUi } from '../ui/Menu.tsx'
import { Tooltip } from '../ui/Tooltip.tsx'
import { useAgora, useEtiquetasRecolhidas } from './estado.ts'
import { animarVoltaSeHouver } from './volta.ts'
import './quadro.css'

// ─────────────────────────────── dados do card ───────────────────────────────

export interface DadosCard {
  cliente: ClienteResumo | null
  membros: UsuarioResumo[]
  etiquetas: Etiqueta[]
  coluna: Coluna | null
  quadro: Quadro | null
  paradoLimiteDiasUteis: number
  feriados: ReadonlySet<string>
}

/** Os objetos que o card desenha, lidos do bootstrap (um observador por card; só redesenha quando eles mudam). */
export function useDadosCard(d: Demanda): DadosCard | undefined {
  const membros = d.membroIds.join(',')
  const etiquetas = d.etiquetaIds.join(',')
  const sel = useCallback((b: Bootstrap): DadosCard => ({
    cliente: d.clienteId ? b.clientes.find((c) => c.id === d.clienteId) ?? null : null,
    membros: d.membroIds.map((id) => b.usuarios.find((u) => u.id === id)).filter((u): u is UsuarioResumo => !!u),
    etiquetas: b.etiquetas.filter((e) => d.etiquetaIds.includes(e.id)).sort((a, z) => a.pos - z.pos),
    coluna: b.colunas.find((c) => c.id === d.colunaId) ?? null,
    quadro: b.quadros.find((q) => q.id === d.quadroId) ?? null,
    paradoLimiteDiasUteis: b.config.paradoLimiteDiasUteis,
    feriados: conjuntoFeriados(b.feriados),
  // membros e etiquetas entram nas dependências como texto: o select não muda a cada render
  }), [d.clienteId, membros, etiquetas, d.colunaId, d.quadroId])
  return useDoBootstrap(sel)
}

// ─────────────────────────────── textos ───────────────────────────────

// em 13 px o CalendarClock embolava (calendário e relógio juntos): o prazo em dia é só o calendário
const ICONE_PRAZO = { atrasada: TriangleAlert, hoje: Clock3, em_dia: Calendar, pausado: Clock3, concluida: Check } as const

/** "sex, 24/10" (+ ", 14h" com hora): o mesmo formato do modal e do resto do produto. */
function dataCurta(data: string, hora: string | null): string {
  return formatarData(data, hora)
}

/** O texto do chip de prazo para cada estado ("Hoje, 18h", "Entregue em 12 out", "Atrasada há 2 dias"). */
export function textoPrazo(d: Demanda, estado: EstadoPrazo, sinal: SinalCard | null): string | null {
  switch (estado) {
    case 'concluida': return d.concluidaEm ? `Entregue em ${formatarDiaBarraMes(hojeSP(new Date(d.concluidaEm)))}` : 'Entregue'
    case 'atrasada': return sinal?.tipo === 'atrasada' ? textoSinal(sinal) : 'Atrasada'
    case 'hoje': return `Hoje, ${formatarHora(d.prazoHora ?? '18:00')}`
    case 'em_dia': case 'pausado': return d.prazo ? dataCurta(d.prazo, d.prazoHora) : null
    case 'sem_prazo': return null
  }
}

const TOM_SINAL = { cliente: 'cliente', parado: 'parado', extra: 'extra' } as const

// ─────────────────────────────── corpo (memo) ───────────────────────────────

interface PropsCorpo {
  d: Demanda
  dados: DadosCard
  agora: Date
  compacto?: boolean
  mostrarQuadro?: boolean
  recolhidas: boolean
  alternarEtiquetas(): void
  selos: readonly ExtensaoSeloCard[]
}

function Selos({ selos, d, dados }: { selos: readonly ExtensaoSeloCard[]; d: Demanda; dados: DadosCard }) {
  if (!selos.length) return null
  return (
    <>
      {selos.map((s) => (
        <LimiteErro key={s.id} nome={`selo ${s.id}`} fallback={null}>
          <s.Componente demanda={d} coluna={dados.coluna} quadro={dados.quadro} />
        </LimiteErro>
      ))}
    </>
  )
}

export const CorpoCard = memo(function CorpoCard({ d, dados, agora, compacto, mostrarQuadro, recolhidas, alternarEtiquetas, selos }: PropsCorpo) {
  const papel = dados.coluna ?? { papel: 'normal' as const }
  const estado = estadoPrazo(d, papel, agora)
  const sinal = sinalDoCard(d, papel, agora, dados.feriados, { paradoLimiteDiasUteis: dados.paradoLimiteDiasUteis })
  const prazo = textoPrazo(d, estado, sinal)
  const IconePrazo = estado === 'sem_prazo' ? null : ICONE_PRAZO[estado]
  const outroSinal = sinal && sinal.tipo !== 'atrasada' ? sinal : null
  const topo = selos.filter((s) => s.lugar === 'topo')
  const rodape = selos.filter((s) => s.lugar === 'rodape')
  const temMetas = !!prazo || !!outroSinal || (!compacto && (d.repetir !== 'nenhuma' || d.nAnexos > 0 || d.nComentarios > 0))
    || d.nCheckTotal > 0
  // sem metas nem selos de rodapé, os avatares sobem para a linha do topo (o card fica com 3 faixas: topo, título)
  const pilhaNoTopo = !temMetas && rodape.length === 0 && dados.membros.length > 0
  // o rodapé existe quando pode ter algo; vazio (selo que não desenha nada) o CSS esconde
  const temRodape = temMetas || rodape.length > 0 || (dados.membros.length > 0 && !pilhaNoTopo)
  // na coluna `concluida` o "Entregue em…" já diz que está feita (sem o círculo verde repetindo)
  const marcaFeita = !!d.concluidaEm && dados.coluna?.papel !== 'concluida'
  const pilha = <PilhaAvatares pessoas={dados.membros} tamanho={20} />
  return (
    <>
      {!compacto && d.capaUrl && <div className="ui-cartao-capa" data-imagem=""><img src={d.capaUrl} alt="" loading="lazy" decoding="async" /></div>}
      {!compacto && !d.capaUrl && d.capaCor && <div className="ui-cartao-capa" data-cor={d.capaCor} aria-hidden="true" />}
      {!compacto && topo.length > 0 && <div className="cartao-selos-topo"><Selos selos={topo} d={d} dados={dados} /></div>}
      {/* etiquetas, cliente e número numa linha só (o card cabe em 88 px com prazo e título de uma linha) */}
      <div className="ui-cartao-topo">
        {marcaFeita && <span className="ui-cartao-feita" role="img" aria-label="Concluída"><Check aria-hidden="true" /></span>}
        {!compacto && dados.etiquetas.map((e) => <ChipEtiqueta key={e.id} etiqueta={e} recolhida={recolhidas} aoClicar={alternarEtiquetas} tabIndex={-1} />)}
        {dados.cliente && <ChipCliente cliente={dados.cliente} />}
        <span className="ui-cartao-numero">#{d.numero}</span>
        {mostrarQuadro && dados.quadro && (
          <span className="cartao-quadro" data-cor={dados.quadro.cor}><span className="cartao-quadro-ponto" aria-hidden="true" />{dados.quadro.nome}</span>
        )}
        {pilhaNoTopo && pilha}
      </div>
      <p className="ui-cartao-titulo">{d.titulo}</p>
      {temRodape && (
        <div className="ui-cartao-rodape">
          <div className="ui-cartao-metas">
            {prazo && IconePrazo && (
              <span className="ui-prazo" data-estado={estado}><IconePrazo aria-hidden="true" />{prazo}</span>
            )}
            {outroSinal && <span className="ui-sinal" data-tom={TOM_SINAL[outroSinal.tipo]}>{textoSinal(outroSinal)}</span>}
            {!compacto && d.repetir !== 'nenhuma' && (
              <Tooltip texto={ROTULO_REPETICAO[d.repetir]}>
                <span className="ui-cartao-meta" role="img" aria-label={ROTULO_REPETICAO[d.repetir]} tabIndex={-1}><Repeat2 aria-hidden="true" /></span>
              </Tooltip>
            )}
            {d.nCheckTotal > 0 && (
              <span className="ui-cartao-meta" data-completo={d.nCheckFeitos === d.nCheckTotal || undefined}
                aria-label={`Checklist: ${d.nCheckFeitos} de ${d.nCheckTotal}`}>
                <CheckSquare aria-hidden="true" /><span aria-hidden="true">{d.nCheckFeitos}/{d.nCheckTotal}</span>
              </span>
            )}
            {!compacto && d.nComentarios > 0 && (
              <span className="ui-cartao-meta" aria-label={`${d.nComentarios} ${d.nComentarios === 1 ? 'comentário' : 'comentários'}`}>
                <MessageSquare aria-hidden="true" /><span aria-hidden="true">{d.nComentarios}</span>
              </span>
            )}
            {!compacto && d.nAnexos > 0 && (
              <span className="ui-cartao-meta" aria-label={`${d.nAnexos} ${d.nAnexos === 1 ? 'anexo' : 'anexos'}`}>
                <Paperclip aria-hidden="true" /><span aria-hidden="true">{d.nAnexos}</span>
              </span>
            )}
            <Selos selos={rodape} d={d} dados={dados} />
          </div>
          {dados.membros.length > 0 && !pilhaNoTopo && pilha}
        </div>
      )}
    </>
  )
})

// ─────────────────────────────── menu de contexto ───────────────────────────────

/** Menu do card (botão direito ou o lápis): o mesmo menu ··· do modal, com `onde` card. */
export function MenuDoCard({ d, ancora, fechar }: { d: Demanda; ancora: Ancora; fechar(): void }) {
  const qc = useQueryClient()
  const reg = useRegistro()
  const [itens] = useState<ItemMenuUi[]>(() => {
    const b = bootstrapDe(qc)
    const ctx = b && montarContextoDemanda(b, d)
    if (!ctx) return []
    return itensDoMenuDemanda(reg.menuDemanda(), ctx, montarUtilModal(qc), 'card')
  })
  const vazio = itens.length === 0
  return (
    <MenuFlutuante aberto aoFechar={fechar} ancora={ancora} rotulo={`Demanda #${d.numero}`}
      itens={vazio ? [{ id: 'vazio', rotulo: 'Nenhuma ação disponível', desabilitado: true }] : itens} />
  )
}

// ─────────────────────────────── card interativo ───────────────────────────────

/**
 * O que o quadro passa para o card arrastável (useSortable). O nó do arraste (transform e transição) é o invólucro do
 * quadro (Coluna.tsx): assim o card só redesenha quando o que ele mostra muda, não a cada passo do arraste.
 */
export interface ArrastarCard {
  /** O ativador (setActivatorNodeRef): o próprio card, que recebe o foco e as teclas. */
  ref: Ref<HTMLElement>
  atributos: HTMLAttributes<HTMLElement>
  ouvintes?: HTMLAttributes<HTMLElement>
  /** O original fica como fantasma enquanto a cópia (DragOverlay) anda. */
  fantasma: boolean
  /** Índice de tabulação (o quadro usa foco itinerante: um card com 0, os outros -1). */
  tabIndex: number
}

let fimDoArraste = 0
/** O quadro avisa quando um arraste termina (o clique que vem logo depois não abre o modal). */
export function marcarFimDoArraste(): void {
  fimDoArraste = Date.now()
}

export interface PropsCartao {
  demanda: Demanda
  compacto?: boolean
  mostrarQuadro?: boolean
  arrastar?: ArrastarCard
}

export const CartaoDemanda = memo(function CartaoDemanda({ demanda: d, compacto, mostrarQuadro, arrastar }: PropsCartao) {
  const dados = useDadosCard(d)
  const agora = useAgora()
  const reg = useRegistro()
  const [recolhidas, alternarEtiquetas] = useEtiquetasRecolhidas()
  const recebido = useRecebido(d.id)
  const pendente = usePendente(d.id)
  const abrirSobreposta = useAbrirSobreposta()
  const [menu, setMenu] = useState<Ancora | null>(null)
  const el = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => { animarVoltaSeHouver(d.id, el.current) })
  // o card focado que mudou de coluna (vírgula, ponto, soltar pelo teclado) volta a ser outro nó: o foco caiu no
  // corpo e volta para ele, para o teclado seguir de onde estava
  useLayoutEffect(() => {
    const no = el.current
    const ativo = document.activeElement
    if (no && lugarAtual().focado === d.id && (!ativo || ativo === document.body) && !arrastar?.fantasma) no.focus({ preventScroll: true })
  }, [d.id]) // só ao montar (e se a demanda do nó mudar)

  const refRaiz = useCallback((no: HTMLElement | null) => {
    el.current = no
    const r = arrastar?.ref
    if (typeof r === 'function') r(no)
    else if (r) (r as { current: HTMLElement | null }).current = no
  }, [arrastar?.ref])

  if (!dados) return null
  const noBootstrap = !!dados.coluna && !!dados.quadro
  // durante um arraste (o do teclado deixa o mouse livre) e logo depois dele, o clique não abre o modal
  const abrir = () => {
    if (Date.now() - fimDoArraste > 250 && !document.documentElement.hasAttribute('data-arrastando')) abrirSobreposta(`/d/${d.numero}`)
  }

  return (
    <>
    <article
      {...arrastar?.atributos}
      {...arrastar?.ouvintes}
      ref={refRaiz}
      role={undefined}
      tabIndex={arrastar ? arrastar.tabIndex : 0}
      className={cx('ui-cartao', 'cartao')}
      aria-label={`#${d.numero} ${d.titulo}`}
      aria-roledescription={arrastar ? 'card arrastável' : undefined}
      data-demanda-id={d.id}
      data-prioridade={d.prioridade === 'alta' || d.prioridade === 'urgente' ? d.prioridade : undefined}
      data-concluida={d.concluidaEm ? 'true' : undefined}
      data-recebido={recebido ? 'true' : undefined}
      data-pendente={pendente || undefined}
      data-fantasma={arrastar?.fantasma || undefined}
      data-compacto={compacto || undefined}
      onClick={(e) => { if (!e.defaultPrevented) abrir() }}
      onKeyDown={(e) => {
        // sem o despachante (fora do quadro, num card solto): Enter abre
        if (e.key === 'Enter' && e.target === e.currentTarget && !e.defaultPrevented && !arrastar) { e.preventDefault(); abrir() }
        arrastar?.ouvintes?.onKeyDown?.(e)
      }}
      onContextMenu={(e) => {
        if (!noBootstrap) return
        e.preventDefault()
        // pela tecla de menu (Shift+F10) o evento não tem ponto: o menu abre junto do card
        setMenu(e.clientX === 0 && e.clientY === 0 ? e.currentTarget : { x: e.clientX, y: e.clientY })
      }}
      onFocus={(e) => { if (e.target === e.currentTarget) definirCardFocado(d.id) }}
      onBlur={(e) => { if (e.target === e.currentTarget) desfocarCard(d.id) }}
      onPointerEnter={() => definirCardSobMouse(d.id)}
      onPointerLeave={() => sairDoCard(d.id)}
    >
      <CorpoCard d={d} dados={dados} agora={agora} compacto={compacto} mostrarQuadro={mostrarQuadro} recolhidas={recolhidas}
        alternarEtiquetas={alternarEtiquetas} selos={reg.selosCard()} />
      {noBootstrap && (
        <button
          type="button"
          className="cartao-editar"
          aria-label={`Ações da demanda #${d.numero}`}
          aria-haspopup="menu"
          tabIndex={-1}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenu(e.currentTarget) }}
        >
          <Pencil aria-hidden="true" />
        </button>
      )}
    </article>
    {menu && (
      <Suspense fallback={null}>
        <MenuDoCard d={d} ancora={menu} fechar={() => setMenu(null)} />
      </Suspense>
    )}
    </>
  )
})

/** O card sem arrastar (Início, Agenda, cliente, Lista: PLANO §2.2). */
export function CardDemanda(p: { demanda: Demanda; compacto?: boolean; mostrarQuadro?: boolean }) {
  return <CartaoDemanda demanda={p.demanda} compacto={p.compacto} mostrarQuadro={p.mostrarQuadro} />
}
