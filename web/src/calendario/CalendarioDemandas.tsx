/**
 * CalendarioDemandas (PLANO §2.2): o calendário de demandas sobre a GradeCalendario do DS, para a Agenda (F3) e o
 * Calendário do quadro (F6). Mês e semana (começa na segunda), feriados marcados, concluídas riscadas.
 * - arrastar um item de prazo (ou um card da faixa "Sem prazo") para um dia muda o prazo mantendo a hora
 *   (useMudarPrazo: "Prazo: sex, 24/10 · Desfazer"); início e publicação só aparecem;
 * - no celular vira uma lista por dia (o mês inteiro não cabe numa grade de 390 px);
 * - cada item traz a sigla do cliente antes do título (o primeiro dado do card em todo o produto), o título inteiro
 *   no `title` e, no prazo vencido, o destaque de atrasada (texto em --danger-ink e o triângulo), como no card.
 * - Fase 2 (F9): `externos` = itens das agendas externas (só a Agenda passa; o Calendário do quadro não). Estilo
 *   próprio (contorno na cor da agenda, fundo leve, hora antes do título), só leitura (nunca arrastam), clicar abre os
 *   detalhes. No mês os prazos têm prioridade: os externos do dia viram uma linha depois deles ("3 eventos", que abre a
 *   lista do dia); na semana e no celular, tudo, dia inteiro no topo e o resto por horário (calendario/externos.ts).
 */
import './calendario.css'
import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Megaphone, PlayCircle } from 'lucide-react'
import type { Bootstrap, CampoAgenda, DataLocal, Demanda, Feriado, HoraLocal, PapelColuna } from '@shared/tipos/index.ts'
import { estadoPrazo } from '@shared/logica/prazo.ts'
import { useMudarPrazo } from '../api/demandas.ts'
import { useClientes, useDoBootstrap, useQuadros } from '../api/seletores.ts'
import type { ItemAgendaExterno } from '../extensoes/tipos.ts'
import { useAgora } from '../quadro/estado.ts'
import { DIAS_LONGOS, MESES, diaDaSemana, diasDaSemana, formatarHora, gradeDoMes, hojeLocal, inicioDaSemana, mesmoMes, somarDias, somarMeses } from '../lib/datas.ts'
import { useCelular } from '../lib/midia.ts'
import { Abas } from '../ui/Abas.tsx'
import { Botao, BotaoIcone } from '../ui/Botao.tsx'
import { CalendarioArrastar, GradeCalendario, ItemCalendario, type ItemDia } from '../ui/GradeCalendario.tsx'
import { Popover } from '../ui/Popover.tsx'
import { diaDoMes, diaPorHorario, porHoraExterno, rotuloResumo, type EntradaDia } from './externos.ts'

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
  /** Faixa "Sem prazo" vazia: o texto (padrão "Todas têm prazo."; com filtro, quem usa diz "Nenhuma sem prazo com estes filtros."). */
  semPrazoVazio?: string
  /** Fase 2: itens das agendas externas (só leitura). Só a Agenda passa. */
  externos?: ItemAgendaExterno[]
}

/** O que o item do calendário precisa saber além da demanda: a sigla do cliente e se o prazo venceu. */
interface Marcas { sigla: (d: Demanda) => string | null; atrasada: (d: Demanda, campo: CampoAgenda) => boolean }

const selPapeis = (b: Bootstrap) => b.colunas

function useMarcas(): Marcas {
  const clientes = useClientes()
  const colunas = useDoBootstrap(selPapeis)
  const agora = useAgora()
  return useMemo(() => {
    const siglas = new Map(clientes.map((c) => [c.id, c.sigla]))
    const papeis = new Map<string, PapelColuna>((colunas ?? []).map((c) => [c.id, c.papel]))
    return {
      sigla: (d) => (d.clienteId ? siglas.get(d.clienteId) ?? null : null),
      atrasada: (d, campo) => campo === 'prazo' && estadoPrazo(d, { papel: papeis.get(d.colunaId) ?? 'normal' }, agora) === 'atrasada',
    }
  }, [clientes, colunas, agora])
}

const ICONE_CAMPO = { prazo: CalendarClock, inicio: PlayCircle, publicacao: Megaphone } as const
const ROTULO_CAMPO = { prazo: 'Prazo', inicio: 'Início', publicacao: 'Publicação' } as const

const idDoItem = (i: ItemCalendarioDemanda) => `${i.campo}:${i.demanda.id}:${i.data}`
const idSemPrazo = (d: Demanda) => `semprazo:${d.id}`

function Chip({ demanda: d, campo, hora, corQuadro, abrir, marcas }: {
  demanda: Demanda; campo: CampoAgenda; hora: HoraLocal | null; corQuadro?: string; abrir(n: number): void; marcas: Marcas
}) {
  const I = ICONE_CAMPO[campo]
  const sigla = marcas.sigla(d)
  const atrasada = marcas.atrasada(d, campo)
  return (
    <button type="button" className="cal-chip" data-concluida={d.concluidaEm ? 'true' : undefined} data-campo={campo}
      data-atrasada={atrasada || undefined} data-cor={corQuadro} onClick={() => abrir(d.numero)}
      title={`#${d.numero} ${sigla ? `${sigla} · ` : ''}${d.titulo}`}
      aria-label={`${ROTULO_CAMPO[campo]}: #${d.numero} ${sigla ? `${sigla}, ` : ''}${d.titulo}${hora ? `, ${formatarHora(hora)}` : ''}${atrasada ? ', atrasada' : ''}${d.concluidaEm ? ', concluída' : ''}`}>
      {corQuadro && <span className="cal-chip-ponto" aria-hidden="true" />}
      {atrasada && <AlertTriangle aria-hidden="true" className="cal-chip-alerta" />}
      {campo !== 'prazo' && <I aria-hidden="true" />}
      {hora && <span className="cal-chip-hora">{formatarHora(hora)}</span>}
      {sigla && <span className="cal-chip-sigla">{sigla}</span>}
      <span className="cal-chip-titulo">{d.titulo}</span>
    </button>
  )
}

// ─────────────────────────────── externos (Fase 2) ───────────────────────────────

/** Hora curta do item externo: "10h", "até 1h" (último dia de um evento que atravessa a noite) ou nada (dia inteiro). */
function horaExterno(i: ItemAgendaExterno): string | null {
  if (i.hora) return formatarHora(i.hora)
  if (i.horaFim) return `até ${formatarHora(i.horaFim)}`
  return null
}

function rotuloExterno(i: ItemAgendaExterno): string {
  const h = i.hora ? `, ${formatarHora(i.hora)}${i.horaFim ? ` às ${formatarHora(i.horaFim)}` : ''}`
    : i.horaFim ? `, até ${formatarHora(i.horaFim)}` : ', dia inteiro'
  return `${i.origem}: ${i.titulo}${h}${i.leve ? ', livre ou talvez' : ''}. Abre os detalhes.`
}

/** Item de agenda externa: contorno na cor da agenda, fundo leve, hora antes do título; só leitura. */
function ChipExterno({ item, tabavel = true, aoAbrir }: { item: ItemAgendaExterno; tabavel?: boolean; aoAbrir?(): void }) {
  const h = horaExterno(item)
  return (
    <button type="button" className="cal-externo" data-cor={item.cor} data-leve={item.leve || undefined}
      data-dia-inteiro={!item.hora && !item.horaFim ? '' : undefined} tabIndex={tabavel ? undefined : -1}
      title={`${item.titulo} · ${item.origem}`} aria-label={rotuloExterno(item)}
      onClick={(e) => { aoAbrir?.(); item.abrir(e.currentTarget) }}>
      {h && <span className="cal-externo-hora">{h}</span>}
      <span className="cal-externo-titulo">{item.titulo}</span>
    </button>
  )
}

/** "3 eventos": a linha dos externos de um dia no mês; abre a lista do dia (popover; folha no celular). */
function ResumoExternos({ dia, itens, tabavel }: { dia: DataLocal; itens: ItemAgendaExterno[]; tabavel: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null)
  const nome = `${DIAS_LONGOS[diaDaSemana(dia)]}, ${Number(dia.slice(8))} de ${MESES[Number(dia.slice(5, 7)) - 1]}`
  return (
    <>
      <button ref={setAncora} type="button" className="cal-externos-resumo" tabIndex={tabavel ? undefined : -1}
        data-cor={itens[0]?.cor} aria-haspopup="dialog" aria-expanded={aberto}
        aria-label={`${rotuloResumo(itens.length)} das agendas externas em ${nome}. Abre a lista.`}
        onClick={() => setAberto((a) => !a)}>
        <CalendarDays aria-hidden="true" />
        <span>{rotuloResumo(itens.length)}</span>
      </button>
      <Popover aberto={aberto} aoFechar={() => setAberto(false)} ancora={ancora} titulo={`Agenda · ${nome}`} mostrarTitulo largura={300}>
        <ul className="cal-externos-lista" aria-label={`Eventos de ${nome}`}>
          {itens.map((i) => (
            <li key={i.id}>
              <ChipExterno item={{ ...i, abrir: () => i.abrir(ancora) }} aoAbrir={() => setAberto(false)} />
              <span className="cal-externos-origem" data-cor={i.cor}><span className="cal-externos-ponto" aria-hidden="true" />{i.origem}</span>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  )
}

// ─────────────────────────────── celular: lista por dia ───────────────────────────────

function ordenar(a: ItemCalendarioDemanda, b: ItemCalendarioDemanda) {
  return (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99') || a.demanda.numero - b.demanda.numero
}

/** Lista por dia (celular): os dias do período que têm item, com o cabeçalho de período da grade. */
function ListaPorDia(p: PropsCalendarioDemandas & {
  cores: Map<string, string>; porDia: Map<DataLocal, ItemCalendarioDemanda[]>; externosPorDia: Map<DataLocal, ItemAgendaExterno[]>; marcas: Marcas
}) {
  const dias = p.modo === 'mes' ? gradeDoMes(p.inicio).filter((d) => mesmoMes(d, p.inicio)) : diasDaSemana(p.inicio)
  const comItens = dias.filter((d) => p.porDia.has(d) || p.externosPorDia.has(d))
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
            {diaPorHorario(p.porDia.get(d) ?? [], p.externosPorDia.get(d) ?? []).map((e) => (e.tipo === 'demanda'
              ? <Chip key={idDoItem(e.item)} demanda={e.item.demanda} campo={e.item.campo} hora={e.item.hora} corQuadro={p.mostrarQuadro ? p.cores.get(e.item.demanda.quadroId) : undefined} abrir={p.abrir} marcas={p.marcas} />
              : e.tipo === 'externo' ? <ChipExterno key={e.item.id} item={e.item} /> : null))}
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
  const marcas = useMarcas()
  const porDia = useMemo(() => {
    const m = new Map<DataLocal, ItemCalendarioDemanda[]>()
    for (const i of p.itens) m.set(i.data, [...(m.get(i.data) ?? []), i])
    for (const lista of m.values()) lista.sort(ordenar)
    return m
  }, [p.itens])
  const externosPorDia = useMemo(() => {
    const m = new Map<DataLocal, ItemAgendaExterno[]>()
    for (const i of p.externos ?? []) m.set(i.data, [...(m.get(i.data) ?? []), i])
    for (const lista of m.values()) lista.sort(porHoraExterno)
    return m
  }, [p.externos])
  const porId = useMemo(() => {
    const m = new Map<string, Demanda>()
    for (const i of p.itens) if (i.campo === 'prazo') m.set(idDoItem(i), i.demanda)
    for (const d of p.semPrazo ?? []) m.set(idSemPrazo(d), d)
    return m
  }, [p.itens, p.semPrazo])

  if (celular) return <ListaPorDia {...p} cores={cores} porDia={porDia} externosPorDia={externosPorDia} marcas={marcas} />

  const soltar = (idItem: string, dia: DataLocal) => {
    const d = porId.get(idItem)
    if (d && d.prazo !== dia) void mudarPrazo(d, dia)
  }
  const itemDemanda = (i: ItemCalendarioDemanda): ItemDia => ({
    id: idDoItem(i),
    arrastavel: i.campo === 'prazo' && !i.demanda.concluidaEm,
    rotulo: `#${i.demanda.numero} ${i.demanda.titulo}`,
    conteudo: <Chip demanda={i.demanda} campo={i.campo} hora={i.hora} corQuadro={p.mostrarQuadro ? cores.get(i.demanda.quadroId) : undefined} abrir={p.abrir} marcas={marcas} />,
  })
  const itemExterno = (i: ItemAgendaExterno): ItemDia => ({ id: `externo:${i.id}`, arrastavel: false, conteudo: <ChipExterno item={i} /> })
  const entrada = (e: EntradaDia<ItemCalendarioDemanda, ItemAgendaExterno>): ItemDia[] =>
    (e.tipo === 'demanda' ? [itemDemanda(e.item)] : e.tipo === 'externo' ? [itemExterno(e.item)] : [])

  // mês: os prazos ocupam as vagas da célula; os externos ficam no rodapé do dia, numa linha só
  const itensDoDia = (dia: DataLocal): ItemDia[] => (p.modo === 'mes'
    ? (porDia.get(dia) ?? []).map(itemDemanda)
    : diaPorHorario(porDia.get(dia) ?? [], externosPorDia.get(dia) ?? []).flatMap(entrada))
  const rodapeDoDia = p.modo === 'mes' && externosPorDia.size > 0 ? (dia: DataLocal, foco: boolean) => {
    const { rodape } = diaDoMes(porDia.get(dia) ?? [], externosPorDia.get(dia) ?? [])
    if (!rodape) return null
    return (
      <div className="cal-externos-linha">
        {rodape.tipo === 'externo' ? <ChipExterno item={rodape.item} tabavel={foco} />
          : rodape.tipo === 'resumo' ? <ResumoExternos dia={dia} itens={rodape.itens} tabavel={foco} /> : null}
      </div>
    )
  } : undefined

  return (
    <CalendarioArrastar aoSoltar={soltar}>
      <div className="cal-demandas">
        {p.semPrazo && (
          <aside className="cal-sem-prazo" aria-label="Sem prazo">
            <h3 className="cal-sem-prazo-titulo">Sem prazo <span className="tabular">{p.semPrazo.length}</span></h3>
            {p.semPrazo.length === 0 && <p className="cal-sem-prazo-vazio">{p.semPrazoVazio ?? 'Todas têm prazo.'}</p>}
            <div className="cal-sem-prazo-itens">
              {p.semPrazo.map((d) => (
                <ItemCalendario key={d.id} id={idSemPrazo(d)} rotulo={`#${d.numero} ${d.titulo}, sem prazo`}>
                  <Chip demanda={d} campo="prazo" hora={null} corQuadro={p.mostrarQuadro ? cores.get(d.quadroId) : undefined} abrir={p.abrir} marcas={marcas} />
                </ItemCalendario>
              ))}
            </div>
          </aside>
        )}
        <GradeCalendario rotulo="Calendário de demandas" modo={p.modo} data={p.inicio} feriados={p.feriados} itensDoDia={itensDoDia}
          rodapeDoDia={rodapeDoDia} aoMudarPeriodo={p.mudarPeriodo} className="cal-grade" />
      </div>
    </CalendarioArrastar>
  )
}
