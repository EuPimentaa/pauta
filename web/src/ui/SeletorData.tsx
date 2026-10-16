/**
 * Seletor de data (com hora opcional) e de hora. O calendário é uma grade navegável pelo teclado:
 * ← → um dia, ↑ ↓ uma semana, PageUp/PageDown um mês, Home/End início e fim da semana, Enter escolhe.
 * Semana começa na segunda; feriados marcados (nome no title). Mudanças valem na hora (não há "Aplicar").
 *
 *   <SeletorData rotulo="Prazo" valor={prazo} hora={prazoHora} comHora aoMudar={(d, h) => …} feriados={feriados} />
 *   <SeletorHora valor={h} aoMudar={setH} />
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import type { DataLocal, HoraLocal } from '@shared/tipos/index.ts'
import { cx } from '../lib/classes.ts'
import {
  DIAS_CURTOS, diaDaSemana, ehFimDeSemana, formatarData, formatarHora, formatarMesAno, gradeDoMes, hojeLocal, inicioDaSemana,
  lerHora, mesmoMes, somarDias, somarMeses, DIAS_LONGOS, MESES,
} from '../lib/datas.ts'
import { Botao, BotaoIcone } from './Botao.tsx'
import { Combobox } from './Combobox.tsx'
import { Popover } from './Popover.tsx'

export interface FeriadoUi { data: DataLocal; nome: string }

// ─────────────────────────────── calendário do mês ───────────────────────────────

export interface PropsCalendarioMes {
  valor: DataLocal | null
  aoEscolher(d: DataLocal): void
  feriados?: readonly FeriadoUi[]
  /** Mês mostrado no começo (padrão: o do valor ou o de hoje). */
  mesInicial?: DataLocal
  rotulo?: string
}

export function CalendarioMes({ valor, aoEscolher, feriados = [], mesInicial, rotulo = 'Calendário' }: PropsCalendarioMes) {
  const hoje = hojeLocal()
  const [foco, setFoco] = useState<DataLocal>(valor ?? mesInicial ?? hoje)
  const [mes, setMes] = useState<DataLocal>(foco)
  const grade = useRef<HTMLDivElement>(null)
  const mapaFeriados = useMemo(() => new Map(feriados.map((f) => [f.data, f.nome])), [feriados])
  const dias = useMemo(() => gradeDoMes(mes), [mes])
  const idTitulo = useId()
  const focarDepois = useRef(false)

  useEffect(() => {
    if (!focarDepois.current) return
    focarDepois.current = false
    grade.current?.querySelector<HTMLElement>(`[data-dia="${foco}"]`)?.focus()
  }, [foco, mes])

  function irPara(d: DataLocal) {
    focarDepois.current = true
    setFoco(d)
    if (!mesmoMes(d, mes)) setMes(d)
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const mapa: Record<string, () => DataLocal> = {
      ArrowLeft: () => somarDias(foco, -1), ArrowRight: () => somarDias(foco, 1),
      ArrowUp: () => somarDias(foco, -7), ArrowDown: () => somarDias(foco, 7),
      PageUp: () => mesmoDiaEm(foco, -1), PageDown: () => mesmoDiaEm(foco, 1),
      Home: () => inicioDaSemana(foco), End: () => somarDias(inicioDaSemana(foco), 6),
    }
    const f = mapa[e.key]
    if (f) { e.preventDefault(); irPara(f()) }
  }

  const semanas: DataLocal[][] = []
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7))

  return (
    <div className="ui-data-cal">
      <div className="ui-data-topo">
        <span id={idTitulo} className="ui-data-mes" aria-live="polite">{formatarMesAno(mes)}</span>
        <BotaoIcone icone={ChevronLeft} rotulo="Mês anterior" tamanho="p" onClick={() => setMes(somarMeses(mes, -1))} />
        <BotaoIcone icone={ChevronRight} rotulo="Próximo mês" tamanho="p" onClick={() => setMes(somarMeses(mes, 1))} />
      </div>
      <div ref={grade} role="grid" aria-labelledby={idTitulo} aria-label={rotulo} onKeyDown={aoTeclar}>
        <div role="row" className="ui-data-semana">
          {DIAS_CURTOS.map((d, i) => <span key={d} role="columnheader" aria-label={DIAS_LONGOS[i]}>{d}</span>)}
        </div>
        {semanas.map((semana) => (
          <div key={semana[0]} role="row" className="ui-data-grade">
            {semana.map((d) => {
              const feriado = mapaFeriados.get(d)
              const sel = d === valor
              return (
                <span key={d} role="gridcell" aria-selected={sel}>
                  <button
                    type="button"
                    className="ui-data-dia"
                    data-dia={d}
                    tabIndex={d === foco ? 0 : -1}
                    aria-selected={sel}
                    aria-current={d === hoje ? 'date' : undefined}
                    aria-label={`${DIAS_LONGOS[diaDaSemana(d)]}, ${Number(d.slice(8))} de ${MESES[Number(d.slice(5, 7)) - 1]}${feriado ? `, feriado: ${feriado}` : ''}`}
                    title={feriado}
                    data-fora={!mesmoMes(d, mes) || undefined}
                    data-hoje={d === hoje || undefined}
                    data-feriado={feriado ? true : undefined}
                    data-fim-de-semana={ehFimDeSemana(d) || undefined}
                    onClick={() => { setFoco(d); aoEscolher(d) }}
                  >
                    {Number(d.slice(8))}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function mesmoDiaEm(d: DataLocal, meses: number): DataLocal {
  const alvo = somarMeses(d, meses)
  const dia = Math.min(Number(d.slice(8)), ultimoDia(alvo))
  return `${alvo.slice(0, 8)}${String(dia).padStart(2, '0')}`
}

function ultimoDia(mes: DataLocal): number {
  const [a, m] = mes.split('-').map(Number)
  return new Date(a, m, 0).getDate()
}

// ─────────────────────────────── seletor de data ───────────────────────────────

export interface PropsSeletorData {
  valor: DataLocal | null
  hora?: HoraLocal | null
  comHora?: boolean
  aoMudar(data: DataLocal | null, hora: HoraLocal | null): void
  feriados?: readonly FeriadoUi[]
  /** Nome acessível ("Prazo"). */
  rotulo: string
  placeholder?: string
  permitirLimpar?: boolean
  desabilitado?: boolean
  id?: string
  'aria-describedby'?: string
  className?: string
}

export function SeletorData({
  valor, hora = null, comHora, aoMudar, feriados, rotulo, placeholder = 'Sem data', permitirLimpar = true, desabilitado, id,
  className, ...aria
}: PropsSeletorData) {
  const [aberto, setAberto] = useState(false)
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null)
  const hoje = hojeLocal()
  const rapidos: { rotulo: string; data: DataLocal }[] = [
    { rotulo: 'Hoje', data: hoje },
    { rotulo: 'Amanhã', data: somarDias(hoje, 1) },
    { rotulo: 'Sexta', data: somarDias(inicioDaSemana(hoje), diaDaSemana(hoje) >= 4 ? 11 : 4) },
    { rotulo: 'Próxima semana', data: somarDias(inicioDaSemana(hoje), 7) },
  ]
  const texto = valor ? formatarData(valor, comHora ? hora : null) : placeholder

  return (
    <>
      <Botao
        ref={setAncora}
        id={id}
        variante="secundario"
        icone={CalendarDays}
        className={cx('ui-data-gatilho', className)}
        data-vazio={!valor || undefined}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`${rotulo}: ${valor ? texto : 'sem data'}`}
        aria-describedby={aria['aria-describedby']}
        disabled={desabilitado}
        onClick={() => setAberto((a) => !a)}
      >
        {texto}
      </Botao>
      <Popover aberto={aberto} aoFechar={() => setAberto(false)} ancora={ancora} titulo={rotulo}>
        <div className="ui-data">
          <div className="ui-data-rapidos" role="group" aria-label="Atalhos de data">
            {rapidos.map((r) => (
              <button key={r.rotulo} type="button" className="ui-data-rapido" onClick={() => { aoMudar(r.data, hora); if (!comHora) setAberto(false) }}>
                {r.rotulo}
              </button>
            ))}
          </div>
          <CalendarioMes valor={valor} feriados={feriados} rotulo={rotulo}
            aoEscolher={(d) => { aoMudar(d, hora); if (!comHora) setAberto(false) }} />
          {(comHora || permitirLimpar) && (
            <div className="ui-data-rodape">
              {comHora && (
                <div className="ui-data-hora">
                  <SeletorHora valor={hora} aoMudar={(h) => aoMudar(valor ?? hoje, h)} aria-label="Hora" permitirLimpar />
                </div>
              )}
              <span className="flex-1" />
              {permitirLimpar && valor && (
                <Botao variante="ghost" tamanho="p" onClick={() => { aoMudar(null, null); setAberto(false) }}>Limpar</Botao>
              )}
              {comHora && <Botao variante="secundario" tamanho="p" onClick={() => setAberto(false)}>Pronto</Botao>}
            </div>
          )}
        </div>
      </Popover>
    </>
  )
}

// ─────────────────────────────── seletor de hora ───────────────────────────────

const HORARIOS: HoraLocal[] = Array.from({ length: 31 }, (_, i) => {
  const min = 7 * 60 + i * 30
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
})

export interface PropsSeletorHora {
  valor: HoraLocal | null
  aoMudar(h: HoraLocal | null): void
  permitirLimpar?: boolean
  placeholder?: string
  desabilitado?: boolean
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

/** Sugestões de 30 em 30 min (7h às 22h) e qualquer hora digitada ("18", "18h30", "1830"). */
export function SeletorHora({ valor, aoMudar, permitirLimpar, placeholder = '18h', desabilitado, ...aria }: PropsSeletorHora) {
  const opcoes = useMemo(() => (valor && !HORARIOS.includes(valor) ? [...HORARIOS, valor].sort() : HORARIOS), [valor])
  return (
    <Combobox<HoraLocal>
      {...aria}
      tamanho="p"
      opcoes={opcoes}
      valor={valor}
      aoMudar={aoMudar}
      idDe={(h) => h}
      rotuloDe={formatarHora}
      filtrar={(h, t) => formatarHora(h).startsWith(t.replace(':', 'h')) || h.startsWith(t) || h.replace(':', '').startsWith(t)}
      extra={(t) => {
        const h = lerHora(t)
        return h && !opcoes.includes(h) ? { rotulo: `Usar ${formatarHora(h)}`, executar: () => aoMudar(h) } : null
      }}
      placeholder={placeholder}
      vazio="Digite a hora: 18h, 18h30."
      permitirLimpar={permitirLimpar}
      desabilitado={desabilitado}
      limite={40}
    />
  )
}
