/**
 * Início · Hoje na agenda (F9, ordem 150): os eventos de hoje das agendas externas ligadas no filtro deste aparelho
 * (a mesma chave do localStorage da Agenda), dia inteiro primeiro e depois por horário. Os que já terminaram ficam
 * recolhidos em "N já passaram" e o que está acontecendo leva "agora" (a seção se atualiza a cada minuto pelo
 * useAgora); no máximo 5 dos que ainda vêm e "Ver na Agenda". No Início, fica na coluna da direita no desktop largo e
 * logo depois do topo no resto (telas/inicio). Some quando não há agenda ativa. Vazio: "Nada na agenda hoje."
 */
import { Link } from 'react-router'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { hojeLocal } from '../../lib/datas.ts'
import { useAgora } from '../../quadro/estado.ts'
import { Botao } from '../../ui/Botao.tsx'
import { useDesligadas, useEventosAgenda } from './api.ts'
import { acontecendo, eventosDeHoje, horarioCurto, rotuloEventos, type ItemExterno } from './logica.ts'
import './agenda.css'

function Item({ i, agora }: { i: ItemExterno; agora: Date | null }) {
  const abrir = useAbrirDialogo()
  const jaAgora = agora !== null && acontecendo(i, agora)
  return (
    <li>
      <button type="button" className="agd-hoje-item" data-cor={i.cor} data-leve={i.leve || undefined}
        aria-label={`${horarioCurto(i)}${jaAgora ? ', acontecendo agora' : ''}: ${i.titulo}, ${i.origem}. Abre os detalhes.`}
        onClick={(e) => { void abrir('agenda-evento', { evento: i.evento, agenda: { nome: i.origem, cor: i.cor } }, { ancora: e.currentTarget }) }}>
        <span className="agd-hoje-hora">{horarioCurto(i)}</span>
        <span className="agd-hoje-titulo">{jaAgora && <span className="agd-hoje-agora">agora</span>}{i.titulo}</span>
        <span className="agd-hoje-origem"><span className="agd-chip-ponto" aria-hidden="true" />{i.origem}</span>
      </button>
    </li>
  )
}

export default function SecaoHojeNaAgenda() {
  const agora = useAgora()
  const hoje = hojeLocal(agora)
  const { data, isError, refetch } = useEventosAgenda(hoje, hoje)
  const { desligadas } = useDesligadas()
  if (isError) {
    return (
      <section className="pnl-secao pnl-secao-lateral agd-hoje" aria-labelledby="agd-hoje-titulo">
        <div className="pnl-secao-topo"><h2 className="pnl-secao-titulo" id="agd-hoje-titulo">Hoje na agenda</h2></div>
        <p className="pnl-secao-vazia">
          Não foi possível carregar a agenda de hoje. <Botao variante="ghost" tamanho="p" onClick={() => void refetch()}>Tentar de novo</Botao>
        </p>
      </section>
    )
  }
  // carregando ou sem agenda ativa: nada (a seção some)
  if (!data || data.agendas.filter((a) => a.ativa).length === 0) return null
  const { itens, resto, passados, aindaHoje, total, todasEscondidas } = eventosDeHoje(data, desligadas, hoje, 5, agora)
  return (
    <section className="pnl-secao pnl-secao-lateral agd-hoje" aria-labelledby="agd-hoje-titulo">
      <div className="pnl-secao-topo">
        <h2 className="pnl-secao-titulo" id="agd-hoje-titulo">Hoje na agenda</h2>
        {total > 0 && (
          <span className="pnl-secao-conta">{rotuloEventos(total)}{passados.length > 0 && aindaHoje > 0 ? ` · ${aindaHoje} ainda hoje` : ''}</span>
        )}
      </div>
      {itens.length === 0 ? (
        <p className="pnl-secao-vazia">
          <CalendarCheck aria-hidden="true" />
          {todasEscondidas ? 'As agendas estão escondidas no filtro da Agenda.' : passados.length > 0 ? 'Nada mais na agenda hoje.' : 'Nada na agenda hoje.'}
        </p>
      ) : (
        <ul className="agd-hoje-lista">{itens.map((i) => <Item key={i.id} i={i} agora={agora} />)}</ul>
      )}
      {passados.length > 0 && (
        <details className="agd-hoje-passados">
          <summary>{passados.length === 1 ? '1 já passou' : `${passados.length} já passaram`}</summary>
          <ul className="agd-hoje-lista">{passados.map((i) => <Item key={i.id} i={i} agora={null} />)}</ul>
        </details>
      )}
      <Link to="/agenda?modo=semana" className="agd-hoje-ver">
        {resto > 0 ? `Ver na Agenda (mais ${resto})` : 'Ver na Agenda'}<ChevronRight aria-hidden="true" />
      </Link>
    </section>
  )
}
