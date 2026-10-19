/**
 * Início · Hoje na agenda (F9, ordem 150): os eventos de hoje das agendas externas ligadas no filtro deste aparelho
 * (a mesma chave do localStorage da Agenda), dia inteiro primeiro e depois por horário, no máximo 5, e "Ver na
 * Agenda". Some quando não há agenda ativa. Vazio: "Nada na agenda hoje." Clicar abre os detalhes do evento.
 */
import { Link } from 'react-router'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { hojeLocal } from '../../lib/datas.ts'
import { useAgora } from '../../quadro/estado.ts'
import { Botao } from '../../ui/Botao.tsx'
import { useDesligadas, useEventosAgenda } from './api.ts'
import { eventosDeHoje, horarioCurto, rotuloEventos } from './logica.ts'
import './agenda.css'

export default function SecaoHojeNaAgenda() {
  const agora = useAgora()
  const hoje = hojeLocal(agora)
  const { data, isError, refetch } = useEventosAgenda(hoje, hoje)
  const { desligadas } = useDesligadas()
  const abrir = useAbrirDialogo()
  if (isError) {
    return (
      <section className="pnl-secao agd-hoje" aria-labelledby="agd-hoje-titulo">
        <div className="pnl-secao-topo"><h2 className="pnl-secao-titulo" id="agd-hoje-titulo">Hoje na agenda</h2></div>
        <p className="pnl-secao-vazia">
          Não foi possível carregar a agenda de hoje. <Botao variante="ghost" tamanho="p" onClick={() => void refetch()}>Tentar de novo</Botao>
        </p>
      </section>
    )
  }
  // carregando ou sem agenda ativa: nada (a seção some)
  if (!data || data.agendas.filter((a) => a.ativa).length === 0) return null
  const { itens, resto, todasEscondidas } = eventosDeHoje(data, desligadas, hoje, 5)
  const total = itens.length + resto
  return (
    <section className="pnl-secao agd-hoje" aria-labelledby="agd-hoje-titulo">
      <div className="pnl-secao-topo">
        <h2 className="pnl-secao-titulo" id="agd-hoje-titulo">Hoje na agenda</h2>
        {total > 0 && <span className="pnl-secao-conta">{rotuloEventos(total)}</span>}
      </div>
      {itens.length === 0 ? (
        <p className="pnl-secao-vazia">
          <CalendarCheck aria-hidden="true" />
          {todasEscondidas ? 'As agendas estão escondidas no filtro da Agenda.' : 'Nada na agenda hoje.'}
        </p>
      ) : (
        <ul className="agd-hoje-lista">
          {itens.map((i) => (
            <li key={i.id}>
              <button type="button" className="agd-hoje-item" data-cor={i.cor} data-leve={i.leve || undefined}
                aria-label={`${horarioCurto(i)}: ${i.titulo}, ${i.origem}. Abre os detalhes.`}
                onClick={(e) => { void abrir('agenda-evento', { evento: i.evento, agenda: { nome: i.origem, cor: i.cor } }, { ancora: e.currentTarget }) }}>
                <span className="agd-hoje-hora">{horarioCurto(i)}</span>
                <span className="agd-hoje-titulo">{i.titulo}</span>
                <span className="agd-hoje-origem"><span className="agd-chip-ponto" aria-hidden="true" />{i.origem}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/agenda?modo=semana" className="agd-hoje-ver">
        {resto > 0 ? `Ver na Agenda (mais ${resto})` : 'Ver na Agenda'}<ChevronRight aria-hidden="true" />
      </Link>
    </section>
  )
}
