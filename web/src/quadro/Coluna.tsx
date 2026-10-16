/**
 * Coluna do quadro (PLANO §2, "Layout quadro"): fundo tingido na cor (data-cor), ponto no título, ícone do papel,
 * contador "12" ou "6/5" (WIP), menu ··· (núcleo + menuColuna()), cards arrastáveis, "Solte aqui" só durante o
 * arraste, a criação rápida no rodapé (entradaColuna(), a de menor ordem) e, nas colunas `concluida`, o aviso do
 * Arquivo. Recolhida: pílula vertical de 44 px (clique abre; também é alvo de soltar).
 * O cabeçalho é a alça para arrastar a coluna (mouse, toque ou Espaço com o foco nele); duplo clique recolhe.
 */
import { memo, Suspense, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Clock3, MoreHorizontal, Plus } from 'lucide-react'
import { ROTULO_PAPEL_COLUNA, type Coluna, type Demanda, type Eu, type FiltrosQuadro, type Id, type Quadro } from '@shared/tipos/index.ts'
import { useColunasMutacoes } from '../api/quadros.ts'
import { contextoAcaoAgora } from '../dialogos/contexto.ts'
import type { ContextoColuna, ExtensaoEntradaColuna } from '../extensoes/tipos.ts'
import type { ModuloRegistro } from '../sessao/registro.ts'
import { BotaoIcone } from '../ui/Botao.tsx'
import { Campo } from '../ui/Campo.tsx'
import { Contador } from '../ui/Indicadores.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { MenuFlutuante, type ItemMenuUi } from '../ui/Menu.tsx'
import { Tooltip } from '../ui/Tooltip.tsx'
import type { Ancora } from '../lib/posicao.ts'
import { idArea, idColuna, type DadoArraste } from './arrastar.ts'
import { CartaoDemanda } from './CardDemanda.tsx'
import { editarNomeDaColuna, registrarElementoColuna, useColunaEmEdicao } from './estado.ts'
import { itensDoMenuColuna, type ItemColunaNucleo } from './menu-coluna.ts'

// ─────────────────────────────── cards ───────────────────────────────

/**
 * Só os cards perto da tela (a lista da coluna mais 600 px para cima e para baixo) entram no arraste: o dnd-kit
 * redesenha todo item arrastável a cada mudança de alvo, e um quadro de 500 cards travava ao pegar um card. Os de longe
 * são o mesmo card sem os ganchos do arraste e viram arrastáveis quando a rolagem (inclusive a automática, durante o
 * arraste) os aproxima.
 */
const MARGEM_PERTO = '600px 0px'
const INICIAIS = 20
const nada = () => {}

export const CardParado = memo(function CardParado({ d, tabIndex }: { d: Demanda; tabIndex: number }) {
  const arrastar = useMemo(() => ({ ref: nada, atributos: {}, fantasma: false, tabIndex }), [tabIndex])
  return (
    <div className="cartao-lugar" data-lugar-id={d.id}>
      <CartaoDemanda demanda={d} arrastar={arrastar} />
    </div>
  )
})

export const CardArrastavel = memo(function CardArrastavel({ d, colunaId, tabIndex }: { d: Demanda; colunaId: Id; tabIndex: number }) {
  const s = useSortable({ id: d.id, data: { tipo: 'card', colunaId } satisfies DadoArraste })
  const transform = CSS.Translate.toString(s.transform)
  const style = useMemo<CSSProperties>(() => ({ transform, transition: s.transition }), [transform, s.transition])
  const arrastar = useMemo(() => ({
    ref: s.setActivatorNodeRef, atributos: s.attributes, ouvintes: s.listeners, fantasma: s.isDragging, tabIndex,
  }), [s.setActivatorNodeRef, s.attributes, s.listeners, s.isDragging, tabIndex])
  // o invólucro anda (transform) e o card dentro dele só redesenha quando o que mostra muda
  return (
    <div ref={s.setNodeRef} style={style} className="cartao-lugar" data-lugar-id={d.id}>
      <CartaoDemanda demanda={d} arrastar={arrastar} />
    </div>
  )
})

// ─────────────────────────────── cabeçalho ───────────────────────────────

const ICONE_PAPEL = { aguardando_cliente: Clock3, concluida: Check } as const

function NomeEmEdicao({ coluna }: { coluna: Coluna }) {
  const [nome, setNome] = useState(coluna.nome)
  const colunas = useColunasMutacoes()
  const feito = useRef(false)
  const salvar = () => {
    if (feito.current) return
    feito.current = true
    editarNomeDaColuna(null)
    const novo = nome.trim()
    if (novo && novo !== coluna.nome) void colunas.editar(coluna, { nome: novo })
  }
  return (
    <form className="coluna-nome-campo" onSubmit={(e) => { e.preventDefault(); salvar() }}>
      <Campo
        rotulo="Nome da coluna"
        rotuloOculto
        tamanho="p"
        value={nome}
        maxLength={80}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setNome(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); feito.current = true; editarNomeDaColuna(null) }
        }}
      />
    </form>
  )
}

interface PropsCabeca {
  coluna: Coluna
  total: number
  alca: ReturnType<typeof useSortable>
  abrirMenu(a: Ancora): void
  alternarRecolhida(): void
}

function Cabeca({ coluna, total, alca, abrirMenu, alternarRecolhida }: PropsCabeca) {
  const editando = useColunaEmEdicao() === coluna.id
  const Papel = coluna.papel === 'normal' ? null : ICONE_PAPEL[coluna.papel]
  const falado = `Coluna ${coluna.nome}, ${total} ${total === 1 ? 'demanda' : 'demandas'}${coluna.limiteWip !== null ? `, limite ${coluna.limiteWip}` : ''}`
  return (
    <header
      ref={alca.setActivatorNodeRef}
      {...(editando ? {} : alca.attributes)}
      {...(editando ? {} : alca.listeners)}
      className="ui-coluna-cabeca"
      data-alca={editando ? undefined : ''}
      aria-label={falado}
      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button, input')) alternarRecolhida() }}
    >
      <span className="ui-coluna-ponto" aria-hidden="true" />
      {editando ? <NomeEmEdicao coluna={coluna} /> : <h2 className="ui-coluna-titulo">{coluna.nome}</h2>}
      {Papel && (
        <Tooltip texto={ROTULO_PAPEL_COLUNA[coluna.papel]}>
          <span className="ui-coluna-papel" role="img" aria-label={ROTULO_PAPEL_COLUNA[coluna.papel]}><Papel aria-hidden="true" /></span>
        </Tooltip>
      )}
      <Contador valor={total} limite={coluna.limiteWip} rotulo={total === 1 ? 'demanda' : 'demandas'} />
      <BotaoIcone
        icone={MoreHorizontal}
        rotulo={`Ações da coluna ${coluna.nome}`}
        tamanho="p"
        aria-haspopup="menu"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => abrirMenu(e.currentTarget)}
      />
    </header>
  )
}

// ─────────────────────────────── coluna ───────────────────────────────

export interface PropsColuna {
  coluna: Coluna
  quadro: Quadro
  ids: readonly Id[]
  demandas: ReadonlyMap<Id, Demanda>
  /** Cards da coluna sem filtro (o contador e o WIP contam todos). */
  total: number
  filtros: FiltrosQuadro
  eu: Eu
  alvoTab: Id | null
  /** O card que está sendo arrastado (fica arrastável mesmo longe da tela). */
  ativoId: Id | null
  arrastandoCard: boolean
  /** O card arrastado vai cair nesta coluna (contorno de destino). */
  alvo: boolean
  entradaAberta: boolean
  definirEntrada(colunaId: Id | null): void
  alternarRecolhida(colunaId: Id): void
  concluidasDias: number
  reg: ModuloRegistro
}

/** A entrada da coluna (criação rápida): a de menor ordem visível nesta coluna. */
export function entradaDaColuna(reg: ModuloRegistro, ctx: ContextoColuna, eu: Eu): ExtensaoEntradaColuna | null {
  for (const e of reg.entradaColuna()) {
    try { if (!e.visivel || e.visivel(ctx, eu)) return e } catch (erro) { console.error(`[entrada da coluna] ${e.id}.visivel falhou`, erro) }
  }
  return null
}

export const ColunaQuadro = memo(function ColunaQuadro(p: PropsColuna) {
  const { coluna, quadro, ids, demandas, reg } = p
  const qc = useQueryClient()
  const alca = useSortable({
    id: idColuna(coluna.id), data: { tipo: 'coluna', colunaId: coluna.id } satisfies DadoArraste,
    attributes: { role: 'group', roleDescription: 'coluna arrastável' },
  })
  const area = useDroppable({ id: idArea(coluna.id), data: { tipo: 'area', colunaId: coluna.id } satisfies DadoArraste })
  const el = useRef<HTMLElement | null>(null)
  const [menu, setMenu] = useState<{ ancora: Ancora; itens: ItemMenuUi[] } | null>(null)

  useLayoutEffect(() => {
    registrarElementoColuna(coluna.id, el.current)
    return () => registrarElementoColuna(coluna.id, null)
  }, [coluna.id])

  const lista = useMemo(() => ids.map((id) => demandas.get(id)).filter((d): d is Demanda => !!d), [ids, demandas])

  // quais cards estão perto da tela (os arrastáveis); a cada troca, o observador volta a olhar os elementos novos
  const cardsEl = useRef<HTMLDivElement | null>(null)
  const [perto, setPerto] = useState<ReadonlySet<Id>>(() => new Set(ids.slice(0, INICIAIS)))
  useLayoutEffect(() => {
    const raiz = cardsEl.current
    if (!raiz || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entradas) => {
      setPerto((atual) => {
        let novo: Set<Id> | null = null
        for (const e of entradas) {
          const id = (e.target as HTMLElement).dataset.lugarId
          if (!id || e.isIntersecting === atual.has(id)) continue
          novo ??= new Set(atual)
          if (e.isIntersecting) novo.add(id)
          else novo.delete(id)
        }
        return novo ?? atual
      })
    }, { root: raiz, rootMargin: MARGEM_PERTO })
    for (const no of raiz.querySelectorAll('[data-lugar-id]')) io.observe(no)
    return () => io.disconnect()
  }, [ids, perto])
  const sortavel = (id: Id) => perto.has(id) || id === p.ativoId || id === p.alvoTab
  const sortaveis = useMemo(() => ids.filter((id) => perto.has(id) || id === p.ativoId || id === p.alvoTab), [ids, perto, p.ativoId, p.alvoTab])
  const ctx: ContextoColuna = useMemo(() => ({ quadro, coluna, filtros: p.filtros, demandas: lista }), [quadro, coluna, p.filtros, lista])
  const entrada = entradaDaColuna(reg, ctx, p.eu)
  const EntradaC = entrada?.Componente

  const abrirMenu = (ancora: Ancora) => {
    const acao = contextoAcaoAgora(qc)
    const itens = itensDoMenuColuna(reg.menuColuna() as ItemColunaNucleo[], ctx, p.eu, acao)
    setMenu({ ancora, itens })
  }

  const estilo: CSSProperties = { transform: CSS.Translate.toString(alca.transform), transition: alca.transition }
  return (
    <section
      ref={(no) => { alca.setNodeRef(no); el.current = no }}
      style={estilo}
      className="ui-coluna"
      data-cor={coluna.cor ?? undefined}
      data-coluna-id={coluna.id}
      data-arrastando={alca.isDragging ? 'true' : undefined}
      data-alvo={p.alvo || undefined}
      aria-label={`Coluna ${coluna.nome}`}
    >
      <Cabeca coluna={coluna} total={p.total} alca={alca} abrirMenu={abrirMenu} alternarRecolhida={() => p.alternarRecolhida(coluna.id)} />
      <div ref={(no) => { area.setNodeRef(no); cardsEl.current = no }} className="ui-coluna-cards">
        <SortableContext id={coluna.id} items={sortaveis} strategy={verticalListSortingStrategy}>
          {lista.map((d) => (sortavel(d.id)
            ? <CardArrastavel key={d.id} d={d} colunaId={coluna.id} tabIndex={d.id === p.alvoTab ? 0 : -1} />
            : <CardParado key={d.id} d={d} tabIndex={-1} />))}
        </SortableContext>
        {lista.length === 0 && p.arrastandoCard && <div className="ui-coluna-soltar">Solte aqui</div>}
      </div>
      {coluna.papel === 'concluida' && (
        <p className="ui-coluna-pe">
          As concluídas há mais de {p.concluidasDias} {p.concluidasDias === 1 ? 'dia' : 'dias'} estão no <Link to="/arquivo">Arquivo</Link>.
        </p>
      )}
      {EntradaC && (
        <footer className="ui-coluna-rodape">
          {p.entradaAberta ? (
            <LimiteErro nome={`entrada ${entrada.id}`}>
              <Suspense fallback={null}>
                <EntradaC ctx={ctx} fechar={() => p.definirEntrada(null)} />
              </Suspense>
            </LimiteErro>
          ) : (
            <button type="button" className="ui-coluna-adicionar" onClick={() => p.definirEntrada(coluna.id)} aria-keyshortcuts="N">
              <Plus aria-hidden="true" /> Adicionar demanda
            </button>
          )}
        </footer>
      )}
      {menu && <MenuFlutuante aberto aoFechar={() => setMenu(null)} ancora={menu.ancora} itens={menu.itens} rotulo={`Ações da coluna ${coluna.nome}`} />}
    </section>
  )
})

// ─────────────────────────────── coluna recolhida ───────────────────────────────

export const ColunaRecolhida = memo(function ColunaRecolhida({ coluna, total, abrir }: { coluna: Coluna; total: number; abrir(id: Id): void }) {
  const alca = useSortable({
    id: idColuna(coluna.id), data: { tipo: 'coluna', colunaId: coluna.id } satisfies DadoArraste,
    attributes: { role: 'button', roleDescription: 'coluna arrastável' },
  })
  const area = useDroppable({ id: idArea(coluna.id), data: { tipo: 'area', colunaId: coluna.id } satisfies DadoArraste })
  const el = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    registrarElementoColuna(coluna.id, el.current)
    return () => registrarElementoColuna(coluna.id, null)
  }, [coluna.id])
  return (
    <button
      type="button"
      ref={(no) => { alca.setNodeRef(no); alca.setActivatorNodeRef(no); area.setNodeRef(no); el.current = no }}
      {...alca.attributes}
      {...alca.listeners}
      style={{ transform: CSS.Translate.toString(alca.transform), transition: alca.transition }}
      className="ui-coluna"
      data-cor={coluna.cor ?? undefined}
      data-recolhida=""
      data-coluna-id={coluna.id}
      data-sobre={area.isOver || undefined}
      aria-label={`Abrir a coluna ${coluna.nome}, ${total} ${total === 1 ? 'demanda' : 'demandas'}`}
      onClick={() => abrir(coluna.id)}
    >
      <span className="ui-coluna-ponto" aria-hidden="true" />
      <Contador valor={total} limite={coluna.limiteWip} />
      <span className="ui-coluna-titulo">{coluna.nome}</span>
    </button>
  )
})
