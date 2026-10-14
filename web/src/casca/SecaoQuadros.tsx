/**
 * Seção Quadros do menu lateral (da própria casca, lida de ['bootstrap']): Favoritos (estrela; arrastar para ordenar,
 * com mouse ou teclado), Recentes (localStorage) e Por equipe (ordem das equipes, depois `pos`; o nome da equipe só
 * aparece quando agrupa mais de um quadro ou um quadro de outro nome), com o ponto na cor do quadro e a estrela ao passar
 * o mouse. Cada subseção recolhe pelo título. "+ Novo quadro" para o admin abre /quadros/novo por cima da tela.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, Clock3, LayoutGrid, Plus, Star, Users } from 'lucide-react'
import type { Equipe, Id, Quadro } from '@shared/tipos/index.ts'
import { useEu } from '../api/auth.ts'
import { useBootstrap } from '../api/bootstrap.ts'
import { useFavoritar } from '../api/menu.ts'
import { useLocal } from '../lib/armazenamento.ts'
import { raizCamadas } from '../lib/camadas.ts'
import { useAbrirSobreposta } from '../sessao/sobreposta.tsx'
import { Botao, BotaoIcone } from '../ui/Botao.tsx'
import { Tooltip } from '../ui/Tooltip.tsx'
import { useQuadrosRecentes } from './estado.ts'

export const caminhoQuadro = (q: Pick<Quadro, 'slug'>) => `/q/${encodeURIComponent(q.slug)}`

/**
 * Quadros de uma equipe (na ordem `pos`). `mostrarRotulo` é falso quando a equipe tem um quadro só, com o nome dela
 * ("Criação" › "Criação" seria ruído): o menu mostra o nome da equipe só quando ele agrupa alguma coisa.
 */
export interface GrupoQuadros { id: string; rotulo: string; mostrarRotulo: boolean; quadros: Quadro[] }

const mesmoNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0

/** Agrupa os quadros ativos por equipe (ordem das equipes, depois `pos`); os sem equipe vão no fim. Puro. */
export function agruparPorEquipe(quadros: readonly Quadro[], equipes: readonly Equipe[]): GrupoQuadros[] {
  const ativas = equipes.filter((e) => e.ativa).sort((a, b) => a.pos - b.pos)
  const idsEquipes = new Set(ativas.map((e) => e.id))
  const porPos = (a: Quadro, b: Quadro) => a.pos - b.pos || a.nome.localeCompare(b.nome, 'pt-BR')
  const grupos: GrupoQuadros[] = ativas
    .map((e) => {
      const lista = quadros.filter((q) => q.equipeId === e.id).sort(porPos)
      return { id: e.id, rotulo: e.nome, mostrarRotulo: !(lista.length === 1 && mesmoNome(lista[0].nome, e.nome)), quadros: lista }
    })
    .filter((g) => g.quadros.length > 0)
  const soltos = quadros.filter((q) => !q.equipeId || !idsEquipes.has(q.equipeId)).sort(porPos)
  if (soltos.length) grupos.push({ id: 'sem-equipe', rotulo: 'Sem equipe', mostrarRotulo: grupos.length > 0, quadros: soltos })
  return grupos
}

/** Organiza os quadros do bootstrap para o menu (o menu do celular e o trilho recolhido usam o mesmo). */
export function useQuadrosDoMenu() {
  const { data } = useBootstrap()
  const eu = useEu()
  const recentesIds = useQuadrosRecentes()
  return useMemo(() => {
    const quadros = (data?.quadros ?? []).filter((q) => !q.arquivadoEm)
    const porId = new Map(quadros.map((q) => [q.id, q]))
    const favoritos = eu.favoritos.map((id) => porId.get(id)).filter((q): q is Quadro => !!q)
    const favIds = new Set(favoritos.map((q) => q.id))
    const recentes = recentesIds.map((id) => porId.get(id)).filter((q): q is Quadro => !!q && !favIds.has(q.id)).slice(0, 3)
    const grupos = agruparPorEquipe(quadros, data?.equipes ?? [])
    return { quadros, favoritos, favIds, recentes, grupos }
  }, [data?.quadros, data?.equipes, eu.favoritos, recentesIds])
}

function LinhaQuadro({ q, favorito, alternarEstrela, extra, arrastavel }: {
  q: Quadro; favorito: boolean; alternarEstrela(): void; extra?: Record<string, unknown>; arrastavel?: boolean
}) {
  return (
    <div className="casca-quadro">
      <NavLink to={caminhoQuadro(q)} className={`casca-item${arrastavel ? ' casca-arrastavel' : ''}`} {...extra}>
        <span className="casca-ponto" data-cor={q.cor} aria-hidden="true" />
        <span className="casca-item-rotulo">{q.nome}</span>
      </NavLink>
      <Tooltip texto={favorito ? 'Tirar dos favoritos' : 'Marcar como favorito'} lado="direita">
        <button type="button" className="casca-estrela" aria-pressed={favorito}
          aria-label={favorito ? `Tirar ${q.nome} dos favoritos` : `Marcar ${q.nome} como favorito`} onClick={alternarEstrela}>
          <Star aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  )
}

function FavoritoOrdenavel({ q, alternarEstrela, bloquearClique }: { q: Quadro; alternarEstrela(): void; bloquearClique: { current: boolean } }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id })
  const { role: _papel, ...atributos } = attributes
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-arrastando={isDragging || undefined}
      className="casca-arrastavel">
      <LinhaQuadro q={q} favorito alternarEstrela={alternarEstrela} arrastavel
        extra={{
          ...atributos, ...listeners, 'aria-roledescription': 'favorito arrastável',
          onClickCapture: (e: React.MouseEvent) => { if (bloquearClique.current) { e.preventDefault(); e.stopPropagation() } },
        }} />
    </li>
  )
}

function Favoritos({ favoritos, arrastar }: { favoritos: Quadro[]; arrastar: boolean }) {
  const favoritar = useFavoritar()
  const [arrastando, setArrastando] = useState<Id | null>(null)
  const bloquearClique = useRef(false)
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )
  const ids = favoritos.map((q) => q.id)
  function aoSoltar(e: DragEndEvent) {
    setArrastando(null)
    document.documentElement.removeAttribute('data-arrastando')
    window.setTimeout(() => { bloquearClique.current = false }, 0)
    if (!e.over || e.active.id === e.over.id) return
    const nova = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    const i = nova.indexOf(String(e.active.id))
    void favoritar(String(e.active.id), true, { depoisDeQuadroId: i === 0 ? null : nova[i - 1] })
  }
  if (!arrastar) {
    return <ul className="casca-lista">{favoritos.map((q) => <li key={q.id}><LinhaQuadro q={q} favorito alternarEstrela={() => favoritar(q.id, false)} /></li>)}</ul>
  }
  const ativo = favoritos.find((q) => q.id === arrastando)
  return (
    <DndContext
      sensors={sensores}
      collisionDetection={closestCenter}
      onDragStart={(e) => { bloquearClique.current = true; setArrastando(String(e.active.id)); document.documentElement.setAttribute('data-arrastando', '') }}
      onDragCancel={() => { setArrastando(null); bloquearClique.current = false; document.documentElement.removeAttribute('data-arrastando') }}
      onDragEnd={aoSoltar}
      accessibility={{
        screenReaderInstructions: { draggable: 'Para reordenar, aperte Espaço, use as setas e Espaço de novo para soltar. Esc cancela.' },
        announcements: {
          onDragStart: ({ active }) => `Pegou ${nomeDe(favoritos, active.id)}.`,
          onDragOver: ({ active, over }) => (over ? `${nomeDe(favoritos, active.id)} na posição ${ids.indexOf(String(over.id)) + 1} de ${ids.length}.` : undefined),
          onDragEnd: ({ active, over }) => (over ? `${nomeDe(favoritos, active.id)} solto na posição ${ids.indexOf(String(over.id)) + 1}.` : 'Solto.'),
          onDragCancel: ({ active }) => `${nomeDe(favoritos, active.id)} voltou ao lugar.`,
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="casca-lista">
          {favoritos.map((q) => <FavoritoOrdenavel key={q.id} q={q} alternarEstrela={() => favoritar(q.id, false)} bloquearClique={bloquearClique} />)}
        </ul>
      </SortableContext>
      {/* em portal: o vidro (backdrop-filter) do menu vira o bloco de contenção do position:fixed e o fantasma
          (e a colisão do teclado) ficariam deslocados */}
      {createPortal(
        <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
          {ativo ? <div className="casca-quadro-fantasma"><LinhaQuadro q={ativo} favorito alternarEstrela={() => {}} /></div> : null}
        </DragOverlay>,
        raizCamadas(),
      )}
    </DndContext>
  )
}

const nomeDe = (lista: Quadro[], id: string | number) => lista.find((q) => q.id === String(id))?.nome ?? 'Quadro'

/** Subseção do menu (Favoritos, Recentes, Por equipe) que recolhe pelo título; o estado fica no localStorage. */
function Subsecao({ id, rotulo, icone: I, fechados, alternar, children }: {
  id: string; rotulo: string; icone: typeof Star; fechados: string[]; alternar(id: string): void; children: ReactNode
}) {
  const aberto = !fechados.includes(id)
  const idLista = `menu-sub-${id}`
  return (
    <div className="casca-sub" data-aberto={aberto}>
      <button type="button" className="casca-subtitulo" aria-expanded={aberto} aria-controls={idLista} onClick={() => alternar(id)}>
        <I aria-hidden="true" />
        <span className="casca-subtitulo-rotulo">{rotulo}</span>
        <ChevronDown className="casca-subtitulo-seta" aria-hidden="true" />
      </button>
      <div id={idLista} hidden={!aberto}>{children}</div>
    </div>
  )
}

export function SecaoQuadros({ arrastar = true }: { arrastar?: boolean }) {
  const eu = useEu()
  const { favoritos, favIds, recentes, grupos, quadros } = useQuadrosDoMenu()
  const favoritar = useFavoritar()
  const abrir = useAbrirSobreposta()
  const [fechados, setFechados] = useLocal<string[]>('menu-secoes-fechadas', [])
  const admin = eu.usuario.papel === 'admin'
  const alternar = (id: string) => setFechados((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
  const estrela = (q: Quadro) => () => favoritar(q.id, !favIds.has(q.id))

  return (
    <section className="casca-grupo" aria-labelledby="menu-quadros-titulo">
      <div className="casca-grupo-titulo">
        <span id="menu-quadros-titulo">Quadros</span>
        {admin && <BotaoIcone icone={Plus} rotulo="Novo quadro" tamanho="p" ladoDica="direita" onClick={() => abrir('/quadros/novo')} />}
      </div>

      {quadros.length === 0 && (
        <div className="casca-vazio">
          <p>Nenhum quadro ainda.</p>
          {admin
            ? <Botao variante="secundario" tamanho="p" icone={LayoutGrid} onClick={() => abrir('/quadros/novo?equipes=1')}>Criar os quadros das equipes</Botao>
            : <p className="mt-1">Peça ao admin para criar os quadros.</p>}
        </div>
      )}

      {favoritos.length > 0 && (
        <Subsecao id="favoritos" rotulo="Favoritos" icone={Star} fechados={fechados} alternar={alternar}>
          <Favoritos favoritos={favoritos} arrastar={arrastar} />
        </Subsecao>
      )}

      {recentes.length > 0 && (
        <Subsecao id="recentes" rotulo="Recentes" icone={Clock3} fechados={fechados} alternar={alternar}>
          <ul className="casca-lista">
            {recentes.map((q) => <li key={q.id}><LinhaQuadro q={q} favorito={false} alternarEstrela={estrela(q)} /></li>)}
          </ul>
        </Subsecao>
      )}

      {grupos.length > 0 && (
        <Subsecao id="equipes" rotulo="Por equipe" icone={Users} fechados={fechados} alternar={alternar}>
          {grupos.map((g) => (
            <div key={g.id} className="casca-equipe" data-com-rotulo={g.mostrarRotulo || undefined}>
              {g.mostrarRotulo && <div className="casca-equipe-rotulo" id={`menu-equipe-${g.id}`}>{g.rotulo}</div>}
              <ul className="casca-lista" aria-labelledby={g.mostrarRotulo ? `menu-equipe-${g.id}` : undefined}>
                {g.quadros.map((q) => <li key={q.id}><LinhaQuadro q={q} favorito={favIds.has(q.id)} alternarEstrela={estrela(q)} /></li>)}
              </ul>
            </div>
          ))}
        </Subsecao>
      )}
    </section>
  )
}
