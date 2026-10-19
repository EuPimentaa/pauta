/**
 * RRULE no subconjunto que o Google gera pela tela (pesquisa-ical §5.3; RFC 5545 §3.3.10 e §3.8.5.3):
 * FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL (inclusivo), BYDAY (com ordinal no mês: 1MO, -1WE),
 * BYMONTHDAY (inclusive negativo), BYMONTH e WKST. Fora disso (BYSETPOS, BYYEARDAY, BYWEEKNO, BYHOUR..., FREQ abaixo de
 * DAILY): `lerRegra` devolve null e quem chama mostra só a 1ª ocorrência e conta "repetição não entendida".
 *
 * A expansão anda no relógio de parede (ms "local", ver agenda-ical-fuso.ts): uma reunião semanal às 10:00 continua às
 * 10:00 quando o horário de verão começa ou acaba. Só gera até o fim da janela; sem COUNT, DAILY e WEEKLY saltam direto
 * para perto do começo da janela (uma série diária desde 2015 custa o mesmo que uma de ontem). O DTSTART é sempre a
 * primeira ocorrência e conta no COUNT; datas que não existem (31/11, 29/02) são puladas e não contam.
 */
import { DIA_MS, utc } from './agenda-ical-fuso.ts'

export type Frequencia = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface Regra {
  freq: Frequencia
  intervalo: number
  count: number | null
  /** UNTIL: instante (com Z) ou relógio de parede (data ou hora flutuante; a data vale o dia inteiro). */
  until: { tipo: 'instante'; ms: number } | { tipo: 'local'; ms: number } | null
  /** dia: 0 = domingo … 6 = sábado; ordinal 0 = todos daquele dia. */
  byDay: { dia: number; ordinal: number }[] | null
  byMonthDay: number[] | null
  byMonth: number[] | null
  /** Começo da semana (0 = domingo); padrão segunda. */
  wkst: number
}

const DIAS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const PARTES_CONHECIDAS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST'])
const FREQUENCIAS = new Set<Frequencia>(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])

function inteiros(texto: string, min: number, max: number, semZero = true): number[] | null {
  const lista = texto.split(',').map((x) => x.trim())
  const saida: number[] = []
  for (const x of lista) {
    if (!/^[+-]?\d{1,4}$/.test(x)) return null
    const n = Number(x)
    if (n < min || n > max || (semZero && n === 0)) return null
    saida.push(n)
  }
  return saida.length > 0 ? saida : null
}

/** RRULE → regra (null = fora do subconjunto ou malformada). */
export function lerRegra(valor: string): Regra | null {
  const partes = new Map<string, string>()
  for (const par of valor.trim().split(';')) {
    if (!par) continue
    const i = par.indexOf('=')
    if (i <= 0) return null
    const nome = par.slice(0, i).trim().toUpperCase()
    if (!PARTES_CONHECIDAS.has(nome) || partes.has(nome)) return null
    partes.set(nome, par.slice(i + 1).trim().toUpperCase())
  }
  const freq = partes.get('FREQ') as Frequencia | undefined
  if (!freq || !FREQUENCIAS.has(freq)) return null
  const regra: Regra = { freq, intervalo: 1, count: null, until: null, byDay: null, byMonthDay: null, byMonth: null, wkst: 1 }
  const intervalo = partes.get('INTERVAL')
  if (intervalo !== undefined) {
    if (!/^\d{1,4}$/.test(intervalo) || Number(intervalo) < 1) return null
    regra.intervalo = Number(intervalo)
  }
  const count = partes.get('COUNT')
  if (count !== undefined) {
    if (!/^\d{1,6}$/.test(count) || Number(count) < 1) return null
    regra.count = Number(count)
  }
  const until = partes.get('UNTIL')
  if (until !== undefined) {
    if (count !== undefined) return null
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(until)
    if (!m) return null
    const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (m[4] === undefined) regra.until = { tipo: 'local', ms: utc(a, me, d, 23, 59, 59) }
    else {
      const ms = utc(a, me, d, Number(m[4]), Number(m[5]), Math.min(59, Number(m[6])))
      regra.until = m[7] ? { tipo: 'instante', ms } : { tipo: 'local', ms }
    }
  }
  const wkst = partes.get('WKST')
  if (wkst !== undefined) {
    if (!(wkst in DIAS)) return null
    regra.wkst = DIAS[wkst]!
  }
  const byDay = partes.get('BYDAY')
  if (byDay !== undefined) {
    const lista: { dia: number; ordinal: number }[] = []
    for (const x of byDay.split(',')) {
      const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim())
      if (!m) return null
      const ordinal = m[1] ? Number(m[1]) : 0
      if (ordinal !== 0 && (Math.abs(ordinal) > 5 || (freq !== 'MONTHLY' && freq !== 'YEARLY'))) return null
      lista.push({ dia: DIAS[m[2]!]!, ordinal })
    }
    regra.byDay = lista
  }
  const byMonthDay = partes.get('BYMONTHDAY')
  if (byMonthDay !== undefined) {
    regra.byMonthDay = inteiros(byMonthDay, -31, 31)
    if (!regra.byMonthDay || freq === 'WEEKLY') return null
  }
  const byMonth = partes.get('BYMONTH')
  if (byMonth !== undefined) {
    regra.byMonth = inteiros(byMonth, 1, 12)
    if (!regra.byMonth) return null
  }
  // YEARLY com BYDAY sem BYMONTH (o "20º domingo do ano") fica fora: o Google não gera pela tela
  if (freq === 'YEARLY' && regra.byDay && !regra.byMonth) return null
  return regra
}

// ─────────────────────────────── expansão ───────────────────────────────

export interface OpcoesExpansao {
  /** DTSTART como relógio de parede (ms "local"; dia inteiro = meia-noite). */
  inicioLocal: number
  /** Hora local → instante (para o UNTIL com Z). */
  paraInstante(localMs: number): number
  /** Só devolve ocorrências com início local >= isto (a contagem do COUNT começa no DTSTART mesmo assim). */
  desdeLocal: number
  /** Para quando a ocorrência passa disto (início local). */
  ateLocal: number
  /** Teto de ocorrências devolvidas (passou: `cortada`). */
  teto: number
}

export interface Expansao {
  /** Inícios locais das ocorrências (em ordem). */
  locais: number[]
  /** Parou no teto ou no limite de voltas (aviso). */
  cortada: boolean
}

const VOLTAS_MAX = 200_000

const diaSemana = (diaMs: number) => new Date(diaMs).getUTCDay()
const DIAS_DO_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function ehBissexto(a: number): boolean {
  return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
}

function diasNoMes(ano: number, mes: number): number {
  return mes === 2 && ehBissexto(ano) ? 29 : DIAS_DO_MES[mes - 1]!
}

/** Dias (1..n) do mês que casam com BYMONTHDAY e/ou BYDAY; sem nenhum, o dia do DTSTART. */
function diasDoMes(r: Regra, ano: number, mes: number, diaInicio: number): number[] {
  const n = diasNoMes(ano, mes)
  let porDiaMes: Set<number> | null = null
  if (r.byMonthDay) {
    porDiaMes = new Set()
    for (const md of r.byMonthDay) {
      const d = md > 0 ? md : n + md + 1
      if (d >= 1 && d <= n) porDiaMes.add(d)
    }
  }
  let porDiaSemana: Set<number> | null = null
  if (r.byDay) {
    porDiaSemana = new Set()
    const primeiro = diaSemana(utc(ano, mes, 1))
    for (const { dia, ordinal } of r.byDay) {
      const primeiroDesse = 1 + ((dia - primeiro + 7) % 7)
      const todos: number[] = []
      for (let d = primeiroDesse; d <= n; d += 7) todos.push(d)
      if (ordinal === 0) todos.forEach((d) => porDiaSemana!.add(d))
      else {
        const d = ordinal > 0 ? todos[ordinal - 1] : todos[todos.length + ordinal]
        if (d !== undefined) porDiaSemana.add(d)
      }
    }
  }
  let dias: number[]
  if (porDiaMes && porDiaSemana) dias = [...porDiaMes].filter((d) => porDiaSemana!.has(d))
  else if (porDiaMes) dias = [...porDiaMes]
  else if (porDiaSemana) dias = [...porDiaSemana]
  else dias = diaInicio <= n ? [diaInicio] : []
  return dias.sort((a, b) => a - b)
}

/**
 * Inícios locais da série a partir do DTSTART. Tudo em ms locais; UNTIL com Z compara pelo instante. Termina sempre
 * (fim da janela, COUNT, UNTIL, teto ou limite de voltas).
 */
export function expandir(r: Regra, o: OpcoesExpansao): Expansao {
  const locais: number[] = []
  let cortada = false
  const inicio = o.inicioLocal
  const horaDoDia = ((inicio % DIA_MS) + DIA_MS) % DIA_MS
  const diaInicioMs = inicio - horaDoDia
  const dI = new Date(diaInicioMs)
  const [ano0, mes0, dia0] = [dI.getUTCFullYear(), dI.getUTCMonth() + 1, dI.getUTCDate()]

  let contados = 0
  let acabou = false
  const passou = (local: number) => r.until !== null
    && (r.until.tipo === 'instante' ? o.paraInstante(local) > r.until.ms : local > r.until.ms)

  /** Uma ocorrência candidata, em ordem. Devolve false quando a série acabou. */
  const aceitar = (local: number): boolean => {
    if (local > o.ateLocal) return false
    if (local !== inicio && passou(local)) return false
    contados++
    if (r.count !== null && contados > r.count) return false
    if (local >= o.desdeLocal) {
      if (locais.length >= o.teto) { cortada = true; return false }
      locais.push(local)
    }
    return true
  }

  // o DTSTART é a 1ª ocorrência (mesmo que não case com a regra)
  if (!aceitar(inicio)) return { locais, cortada }

  const mesesOk = (mes: number) => !r.byMonth || r.byMonth.includes(mes)
  let voltas = 0
  const candidato = (diaMs: number) => diaMs + horaDoDia

  if (r.freq === 'DAILY') {
    const passo = r.intervalo * DIA_MS
    let k = 0
    if (r.count === null && o.desdeLocal > inicio) k = Math.max(0, Math.floor((o.desdeLocal - inicio) / passo) - 1)
    for (; !acabou; k++) {
      if (++voltas > VOLTAS_MAX) { cortada = true; break }
      const diaMs = diaInicioMs + k * passo
      if (candidato(diaMs) > o.ateLocal) break
      const d = new Date(diaMs)
      if (!mesesOk(d.getUTCMonth() + 1)) continue
      if (r.byMonthDay) {
        const n = diasNoMes(d.getUTCFullYear(), d.getUTCMonth() + 1)
        if (!r.byMonthDay.some((md) => (md > 0 ? md : n + md + 1) === d.getUTCDate())) continue
      }
      if (r.byDay && !r.byDay.some((b) => b.dia === d.getUTCDay())) continue
      const local = candidato(diaMs)
      if (local <= inicio) continue
      if (!aceitar(local)) acabou = true
    }
  } else if (r.freq === 'WEEKLY') {
    const semana0 = diaInicioMs - ((diaSemana(diaInicioMs) - r.wkst + 7) % 7) * DIA_MS
    const passo = 7 * r.intervalo * DIA_MS
    const dias = (r.byDay ? [...new Set(r.byDay.map((b) => b.dia))] : [diaSemana(diaInicioMs)])
      .map((dia) => (dia - r.wkst + 7) % 7).sort((a, b) => a - b)
    let k = 0
    if (r.count === null && o.desdeLocal > inicio) k = Math.max(0, Math.floor((o.desdeLocal - semana0) / passo) - 1)
    for (; !acabou; k++) {
      if (++voltas > VOLTAS_MAX) { cortada = true; break }
      const semana = semana0 + k * passo
      if (candidato(semana) > o.ateLocal) break
      for (const desloc of dias) {
        const diaMs = semana + desloc * DIA_MS
        if (!mesesOk(new Date(diaMs).getUTCMonth() + 1)) continue
        const local = candidato(diaMs)
        if (local <= inicio) continue
        if (!aceitar(local)) { acabou = true; break }
      }
    }
  } else if (r.freq === 'MONTHLY') {
    for (let k = 0; !acabou; k++) {
      if (++voltas > VOLTAS_MAX) { cortada = true; break }
      const indice = (ano0 * 12 + mes0 - 1) + k * r.intervalo
      const [ano, mes] = [Math.floor(indice / 12), (indice % 12) + 1]
      if (candidato(utc(ano, mes, 1)) > o.ateLocal) break
      if (!mesesOk(mes)) continue
      for (const dia of diasDoMes(r, ano, mes, dia0)) {
        const local = candidato(utc(ano, mes, dia))
        if (local <= inicio) continue
        if (!aceitar(local)) { acabou = true; break }
      }
    }
  } else {
    const meses = r.byMonth ? [...r.byMonth].sort((a, b) => a - b) : r.byMonthDay ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [mes0]
    for (let k = 0; !acabou; k++) {
      if (++voltas > VOLTAS_MAX) { cortada = true; break }
      const ano = ano0 + k * r.intervalo
      if (candidato(utc(ano, 1, 1)) > o.ateLocal) break
      for (const mes of meses) {
        for (const dia of diasDoMes(r, ano, mes, dia0)) {
          const local = candidato(utc(ano, mes, dia))
          if (local <= inicio) continue
          if (!aceitar(local)) { acabou = true; break }
        }
        if (acabou) break
      }
    }
  }
  return { locais, cortada }
}
