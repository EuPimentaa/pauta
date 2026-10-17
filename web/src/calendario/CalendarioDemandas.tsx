/**
 * CalendarioDemandas (PLANO §2.2): o calendário de demandas sobre a GradeCalendario do DS, para a Agenda (F3) e o
 * Calendário do quadro (F6). Mês e semana (começa na segunda), feriados marcados, concluídas riscadas.
 * - arrastar um item de prazo (ou um card da faixa "Sem prazo") para um dia muda o prazo mantendo a hora
 *   (useMudarPrazo: "Prazo: sex, 24/10 · Desfazer"); início e publicação só aparecem;
 * - no celular vira uma lista por dia (o mês inteiro não cabe numa grade de 390 px).
 */
import './calendario.css'
import { useMemo } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, Megaphone, PlayCircle } from 'lucide-react'
import type { CampoAgenda, DataLocal, Demanda, Feriado, HoraLocal } from '@shared/tipos/index.ts'
import { useMudarPrazo } from '../api/demandas.ts'
import { useQuadros } from '../api/seletores.ts'
import { DIAS_LONGOS, MESES, diaDaSemana, diasDaSemana, formatarHora, gradeDoMes, hojeLocal, inicioDaSemana, mesmoMes, somarDias, somarMeses } from '../lib/datas.ts'
import { useCelular } from '../lib/midia.ts'
import { Abas } from '../ui/Abas.tsx'
import { Botao, BotaoIcone } from '../ui/Botao.tsx'
import { CalendarioArrastar, GradeCalendario, ItemCalendario, type ItemDia } from '../ui/GradeCalendario.tsx'

export interface ItemCalendarioDemanda {
  demanda: Demanda
  campo: CampoAgenda
  data: DataLocal
  hora: HoraLocal | null
}

export interface PropsCalendarioDemandas {
  modo: 'mes' | 'semana'
  inicio: DataLocal
  mudarPeriodo(inicio: DataLocal, modo: 'mes' | 'semana'): void
  itens: ItemCalendarioDemanda[]
  feriados: Feriado[]
  /** Com a lista: a faixa "Sem prazo" de onde se arrasta para um dia. */
  semPrazo?: Demanda[]
  mostrarQuadro?: boolean
  abrir(numero: number): void
  /** Celular, período sem nenhum item: o texto da lista por dia (padrão "Nada neste período."); null = nenhum (quem usa desenha o dele). */
  vazio?: string | null
}

const ICONE_CAMPO = { prazo: CalendarClock, inicio: PlayCircle, publicacao: Megaphone } as const
const ROTULO_CAMPO = { prazo: 'Prazo', inicio: 'Início', publicacao: 'Publicação' } as const

const idDoItem = (i: ItemCalendarioDemanda) => `${i.campo}:${i.demanda.id}:${i.data}`
const idSemPrazo = (d: Demanda) => `semprazo:${d.id}`

function Chip({ demanda: d, campo, hora, corQuadro, abrir }: { demanda: Demanda; campo: CampoAgenda; hora: HoraLocal | null; corQuadro?: string; abrir(n: number): void }) {
  const I = ICONE_CAMPO[campo]
  return (
    <button type="button" className="cal-chip" data-concluida={d.concluidaEm ? 'true' : undefined} data-campo={campo}
      data-cor={corQuadro} onClick={() => abrir(d.numero)}
      aria-label={`${ROTULO_CAMPO[campo]}: #${d.numero} ${d.titulo}${hora ? `, ${formatarHora(hora)}` : ''}${d.concluidaEm ? ', concluída' : ''}`}>
      {corQuadro && <span className="cal-chip-ponto" aria-hidden="true" />}
      {campo !== 'prazo' && <I aria-hidden="true" />}
      {hora && <span className="cal-chip-hora">{formatarHora(hora)}</span>}
      <span className="cal-chip-titulo">{d.titulo}</span>
    </button>
  )
}

function ordenar(a: ItemCalendarioDemanda, b: ItemCalendarioDemanda) {
  return (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99') || a.demanda.numero - b.demanda.numero
}

/** Lista por dia (celular): os dias do período que têm item, com o cabeçalho de período da grade. */
function ListaPorDia(p: PropsCalendarioDemandas & { cores: Map<string, string>; porDia: Map<DataLocal, ItemCalendarioDemanda[]> }) {
  const dias = p.modo === 'mes' ? gradeDoMes(p.inicio).filter((d) => mesmoMes(d, p.inicio)) : diasDaSemana(p.inicio)
  const comItens = dias.filter((d) => p.porDia.has(d))
  const feriados = new Map(p.feriados.map((f) => [f.data, f.nome]))
  const hoje = hojeLocal()
  const andar = (n: number) => p.mudarPeriodo(p.modo === 'mes' ? somarMeses(p.inicio, n) : somarDias(inicioDaSemana(p.inicio), 7 * n), p.modo)
  const titulo = p.modo === 'mes'
    ? `${MESES[Number(p.inicio.slice(5, 7)) - 1]} de ${p.inicio.slice(0, 4)}`
    : `Semana de ${Number(dias[0].slice(8))}/${dias[0].slice(5, 7)}`
  return (
    <section className="cal-lista" aria-label="Calendário">
      <div className="ui-cal-topo">
        <h2 className="ui-cal-titulo" aria-live="polite">{titulo}</h2>
        <Abas rotulo="Período" abas={[{ id: 'mes', rotulo: 'Mês' }, { id: 'semana', rotulo: 'Semana' }]} ativa={p.modo} aoMudar={(m) => p.mudarPeriodo(p.inicio, m)} />
        <Botao variante="secundario" tamanho="p" onClick={() => p.mudarPeriodo(hoje, p.modo)}>Hoje</Botao>
        <BotaoIcone icone={ChevronLeft} rotulo={p.modo === 'mes' ? 'Mês anterior' : 'Semana anterior'} onClick={() => andar(-1)} />
        <BotaoIcone icone={ChevronRight} rotulo={p.modo === 'mes' ? 'Próximo mês' : 'Próxima semana'} onClick={() => andar(1)} />
      </div>
      {comItens.length === 0 && p.vazio !== null && <p className="cal-lista-vazia">{p.vazio ?? 'Nada neste período.'}</p>}
      {comItens.map((d) => (
        <div key={d} className="cal-lista-dia" data-hoje={d === hoje || undefined}>
          <h3 className="cal-lista-data">
            {DIAS_LONGOS[diaDaSemana(d)]}, {Number(d.slice(8))} de {MESES[Number(d.slice(5, 7)) - 1]}
            {d === hoje && <span className="cal-lista-hoje">hoje</span>}
            {feriados.get(d) && <span className="ui-cal-feriado">{feriados.get(d)}</span>}
          </h3>
          <div className="cal-lista-itens">
            {p.porDia.get(d)!.map((i) => (
              <Chip key={idDoItem(i)} demanda={i.demanda} campo={i.campo} hora={i.hora} corQuadro={p.mostrarQuadro ? p.cores.get(i.demanda.quadroId) : undefined} abrir={p.abrir} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export function CalendarioDemandas(p: PropsCalendarioDemandas) {
  const celular = useCelular()
  const mudarPrazo = useMudarPrazo()
  const quadros = useQuadros()
  const cores = useMemo(() => new Map<string, string>(quadros.map((q) => [q.id, q.cor])), [quadros])
  const porDia = useMemo(() => {
    const m = new Map<DataLocal, ItemCalendarioDemanda[]>()
    for (const i of p.itens) m.set(i.data, [...(m.get(i.data) ?? []), i])
    for (const lista of m.values()) lista.sort(ordenar)
    return m
  }, [p.itens])
  const porId = useMemo(() => {
    const m = new Map<string, Demanda>()
    for (const i of p.itens) if (i.campo === 'prazo') m.set(idDoItem(i), i.demanda)
    for (const d of p.semPrazo ?? []) m.set(idSemPrazo(d), d)
    return m
  }, [p.itens, p.semPrazo])

  if (celular) return <ListaPorDia {...p} cores={cores} porDia={porDia} />

  const soltar = (idItem: string, dia: DataLocal) => {
    const d = porId.get(idItem)
    if (d && d.prazo !== dia) void mudarPrazo(d, dia)
  }
  const itensDoDia = (dia: DataLocal): ItemDia[] => (porDia.get(dia) ?? []).map((i) => ({
    id: idDoItem(i),
    arrastavel: i.campo === 'prazo' && !i.demanda.concluidaEm,
    rotulo: `#${i.demanda.numero} ${i.demanda.titulo}`,
    conteudo: <Chip demanda={i.demanda} campo={i.campo} hora={i.hora} corQuadro={p.mostrarQuadro ? cores.get(i.demanda.quadroId) : undefined} abrir={p.abrir} />,
  }))

  return (
    <CalendarioArrastar aoSoltar={soltar}>
      <div className="cal-demandas">
        {p.semPrazo && (
          <aside className="cal-sem-prazo" aria-label="Sem prazo">
            <h3 className="cal-sem-prazo-titulo">Sem prazo <span className="tabular">{p.semPrazo.length}</span></h3>
            {p.semPrazo.length === 0 && <p className="cal-sem-prazo-vazio">Todas têm prazo.</p>}
            <div className="cal-sem-prazo-itens">
              {p.semPrazo.map((d) => (
                <ItemCalendario key={d.id} id={idSemPrazo(d)} rotulo={`#${d.numero} ${d.titulo}, sem prazo`}>
                  <Chip demanda={d} campo="prazo" hora={null} corQuadro={p.mostrarQuadro ? cores.get(d.quadroId) : undefined} abrir={p.abrir} />
                </ItemCalendario>
              ))}
            </div>
          </aside>
        )}
        <GradeCalendario rotulo="Calendário de demandas" modo={p.modo} data={p.inicio} feriados={p.feriados} itensDoDia={itensDoDia}
          aoMudarPeriodo={p.mudarPeriodo} className="cal-grade" />
      </div>
    </CalendarioArrastar>
  )
}
