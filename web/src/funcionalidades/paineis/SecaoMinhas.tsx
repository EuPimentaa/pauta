/**
 * Início · Minhas demandas (F3, ordem 100): as abertas em que sou membro ou o AM, por prazo: Atrasadas, Hoje, Esta
 * semana, Depois e Sem prazo, com o card de cada uma (e o quadro dela). Grupos longos mostram os primeiros e
 * "Mostrar mais". Nada comigo: "Nada com você agora. Veja os seus quadros favoritos." com os favoritos.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { AlarmClock, CalendarClock, CalendarDays, CalendarRange, Coffee, Inbox, Star } from 'lucide-react'
import type { Bootstrap, Demanda, Id, MinhasPorPrazo, Quadro } from '@shared/tipos/index.ts'
import type { Icone } from '../../extensoes/tipos.ts'
import { useEu } from '../../api/auth.ts'
import { useDoBootstrap } from '../../api/seletores.ts'
import { CardDemanda } from '../../quadro/index.ts'
import { Botao } from '../../ui/Botao.tsx'
import { Contador, EstadoVazio } from '../../ui/Indicadores.tsx'
import { useDadosInicio } from './inicio.ts'
import './paineis.css'

const GRUPOS: { id: keyof MinhasPorPrazo; ancora: string; titulo: string; icone: Icone; mostrar: number }[] = [
  { id: 'atrasadas', ancora: 'pnl-atrasadas', titulo: 'Atrasadas', icone: AlarmClock, mostrar: 12 },
  { id: 'hoje', ancora: 'pnl-hoje', titulo: 'Hoje', icone: CalendarClock, mostrar: 12 },
  { id: 'semana', ancora: 'pnl-semana', titulo: 'Esta semana', icone: CalendarDays, mostrar: 8 },
  { id: 'depois', ancora: 'pnl-depois', titulo: 'Depois', icone: CalendarRange, mostrar: 4 },
  { id: 'semPrazo', ancora: 'pnl-sem-prazo', titulo: 'Sem prazo', icone: Inbox, mostrar: 4 },
]

function Grupo({ g, ids, porId }: { g: (typeof GRUPOS)[number]; ids: Id[]; porId: Map<Id, Demanda> }) {
  const [todas, setTodas] = useState(false)
  const demandas = ids.map((id) => porId.get(id)).filter((d): d is Demanda => !!d)
  if (demandas.length === 0) return null
  const visiveis = todas ? demandas : demandas.slice(0, g.mostrar)
  const resto = demandas.length - visiveis.length
  const I = g.icone
  return (
    <section className="pnl-grupo" data-grupo={g.id} aria-labelledby={g.ancora}>
      <h3 className="pnl-grupo-titulo" id={g.ancora} tabIndex={-1}>
        <I aria-hidden="true" />
        <span>{g.titulo}</span>
        <Contador valor={demandas.length} rotulo={demandas.length === 1 ? 'demanda' : 'demandas'} tom={g.id === 'atrasadas' ? 'destaque' : 'suave'} />
      </h3>
      <div className="pnl-cards">
        {visiveis.map((d) => <CardDemanda key={d.id} demanda={d} mostrarQuadro />)}
      </div>
      {resto > 0 && (
        <Botao variante="ghost" tamanho="p" className="pnl-grupo-mais" onClick={() => setTodas(true)}>
          Mostrar mais {resto}
        </Botao>
      )}
    </section>
  )
}

const selFavoritos = (b: Bootstrap): Quadro[] => {
  const ativos = b.quadros.filter((q) => q.arquivadoEm === null)
  const fav = b.eu.favoritos.map((id) => ativos.find((q) => q.id === id)).filter((q): q is Quadro => !!q)
  if (fav.length > 0) return fav
  // sem favoritos: os quadros da minha equipe; sem equipe (o admin), todos
  const daEquipe = ativos.filter((q) => q.equipeId && b.eu.usuario.equipeIds.includes(q.equipeId))
  return (daEquipe.length > 0 ? daEquipe : ativos).sort((a, z) => a.pos - z.pos)
}

function Vazio() {
  const quadros = useDoBootstrap(selFavoritos) ?? []
  const eu = useEu()
  const favoritos = eu.favoritos.length > 0
  const texto = favoritos || quadros.length === 0 ? 'Veja os seus quadros favoritos.'
    : eu.usuario.equipeIds.length > 0 ? 'Veja os quadros da sua equipe.' : 'Veja os quadros da agência.'
  return (
    <div className="pnl-vazio">
      <EstadoVazio icone={Coffee} titulo="Nada com você agora." texto={texto} />
      {quadros.length > 0 && (
        <ul className="pnl-vazio-quadros" aria-label={favoritos ? 'Quadros favoritos' : 'Quadros'}>
          {quadros.slice(0, 8).map((q) => (
            <li key={q.id}>
              <Link to={`/q/${q.slug}`} className="pnl-quadro-link">
                <span className="casca-ponto" data-cor={q.cor} aria-hidden="true" />
                <span className="pnl-quadro-nome">{q.nome}</span>
                {favoritos && <Star className="pnl-quadro-estrela" aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SecaoMinhas() {
  const { minhas, porId } = useDadosInicio()
  const total = Object.values(minhas).reduce((s, l) => s + l.length, 0)
  return (
    <section className="pnl-secao" aria-labelledby="pnl-minhas-titulo">
      <div className="pnl-secao-topo">
        <h2 className="pnl-secao-titulo" id="pnl-minhas-titulo">Minhas demandas</h2>
        {total > 0 && <span className="pnl-secao-conta tabular">{total} {total === 1 ? 'aberta' : 'abertas'}</span>}
      </div>
      {total === 0 ? <Vazio /> : (
        <div className="pnl-grupos">
          {GRUPOS.map((g) => <Grupo key={g.id} g={g} ids={minhas[g.id]} porId={porId} />)}
        </div>
      )}
    </section>
  )
}
