/**
 * Montagem das ocorrências de um iCal do Google (API.md §F.9; pesquisa-ical §3, §6 e §7): agrupa os VEVENT por UID,
 * expande a série só até o fim da janela, tira as EXDATE, troca as ocorrências pelas exceções (RECURRENCE-ID casado por
 * instante UTC, `SEQUENCE` maior vence; exceção movida para dentro ou para fora da janela; exceção sem mestre vira
 * avulso), tira os cancelados (avulso, mestre ou exceção) e filtra a janela de hoje − 30 a hoje + 180 (São Paulo; entra
 * a ocorrência cujo intervalo cruza a janela). "Esta e as seguintes" (`UID` com `_R<data>`) é série própria.
 *
 * Texto de fora (PLANO §0 regra 9): título e local numa linha; descrição HTML → texto puro (até 2 KB); link da reunião
 * só https em Meet, Zoom e Teams (`X-GOOGLE-CONFERENCE`, senão o primeiro link em LOCATION ou DESCRIPTION). Evento
 * privado vira "Ocupado", sem local, descrição nem link. ORGANIZER, ATTENDEE, ATTACH e VALARM nunca são lidos.
 * Puro: recebe os bytes e o dia de hoje; nada de banco, rede ou relógio.
 */
import { createHash } from 'node:crypto'
import type { DataLocal } from '../../../shared/tipos/index.ts'
import { JANELA_AGENDA_EXTERNA, TETOS_AGENDA_EXTERNA } from '../../../shared/tipos/index.ts'
import { instanteSP, somarDias } from '../../../shared/logica/datas.ts'
import { FUSO } from '../../../shared/tipos/index.ts'
import { linkReuniaoNoTexto, linkReuniaoValido } from '../../../shared/logica/agenda-endereco.ts'
import { componentesDo, lerComponentes, param, prop, props, textoIcal, type Componente, type Propriedade } from './agenda-ical-leitura.ts'
import { DIA_MS, Fusos, dataDoLocal, lerDuracao, lerValorData, paredeRapida, type ParaInstante, type ValorData } from './agenda-ical-fuso.ts'
import { expandir, lerRegra } from './agenda-ical-repeticao.ts'

/** Uma linha de agenda_ocorrencia (sem agenda_id). */
export interface OcorrenciaIcal {
  chave: string
  titulo: string
  diaInteiro: boolean
  /** Instantes ISO (nulos no dia inteiro); `fim` exclusivo (sem DTEND: = início). */
  inicio: string | null
  fim: string | null
  diaInicio: DataLocal
  diaFim: DataLocal
  local: string | null
  linkReuniao: string | null
  descricao: string | null
  tentativo: boolean
  livre: boolean
  privado: boolean
}

export interface LeituraIcal {
  ocorrencias: OcorrenciaIcal[]
  contagens: { eventos: number; ocorrencias: number; repeticoesNaoEntendidas: number; fusosDesconhecidos: number; avisos: number }
  /** Mais ocorrências na janela que `TETOS_AGENDA_EXTERNA.ocorrenciasPorAgenda`. */
  passouDoTeto: boolean
}

export interface OpcoesLeitura {
  /** Hoje em São Paulo: a janela vai de hoje − 30 a hoje + 180. */
  hoje: DataLocal
  tetoPorSerie?: number
  tetoPorAgenda?: number
}

export const TITULO_SEM_TITULO = '(sem título)'
export const TITULO_PRIVADO = 'Ocupado'
const LIMITE_TITULO = 300
const LIMITE_LOCAL = 300
const LIMITE_DESCRICAO = 2048

// ─────────────────────────────── texto ───────────────────────────────

/** Controles C0/C1 (menos quebra e tab) e os de direção do texto (U+202E inverte o que vem depois). */
const CONTROLES = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g

function cortar(texto: string, max: number): string {
  if (texto.length <= max) return texto
  let t = texto.slice(0, max)
  if (/[\ud800-\udbff]$/.test(t)) t = t.slice(0, -1)
  return t
}

/** Uma linha: quebras e controles viram espaço, espaços repetidos somem. */
export function umaLinhaIcal(texto: string, max: number): string {
  return cortar(texto.replace(/[\r\n\t]+/g, ' ').replace(CONTROLES, ' ').replace(/\s{2,}/g, ' ').trim(), max).trim()
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodificarEntidades(t: string): string {
  return t.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (inteira, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return inteira
      return String.fromCodePoint(n)
    }
    return ENTIDADES[e.toLowerCase()] ?? inteira
  })
}

const PARECE_HTML = /<\/?[a-z][^>]*>|&(#\d+|#x[0-9a-f]+|[a-z]{2,8});/i

/**
 * Descrição do Google (HTML em 91% dos eventos) → texto puro: `<br>`, `</p>`, `</div>` viram quebra;
 * `<a href="https://x">t</a>` vira "t (https://x)"; `<script>`/`<style>` saem com o conteúdo; o resto das tags some;
 * entidades decodificadas. Texto sem cara de HTML passa como está. Até 2 KB.
 */
export function htmlParaTexto(entrada: string): string {
  let t = entrada.replace(/\r\n?/g, '\n')
  if (PARECE_HTML.test(t)) {
    t = t.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<(script|style)\b[\s\S]*$/gi, '')
    t = t.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_, atributos: string, dentro: string) => {
      const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(atributos)
      const href = decodificarEntidades((m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim())
      const texto = decodificarEntidades(dentro.replace(/<[^>]*>/g, '')).trim()
      if (!/^https:\/\/\S+$/i.test(href)) return texto
      if (!texto || texto === href) return href
      return `${texto} (${href})`
    })
    t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|blockquote)\s*>/gi, '\n')
    t = t.replace(/<[^>]*>/g, '')
    t = decodificarEntidades(t)
  }
  t = t.replace(CONTROLES, '').replace(/ /g, ' ')
  t = t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return cortar(t, LIMITE_DESCRICAO).trim()
}

// ─────────────────────────────── eventos lidos ───────────────────────────────

interface EventoLido {
  uid: string
  /** RECURRENCE-ID lido (nulo no mestre e no avulso). */
  recorrencia: ValorData | null
  inicio: ValorData
  fim: ValorData | null
  duracao: { ms: number; dias: number } | null
  regras: string[]
  exdates: ValorData[]
  rdates: ValorData[]
  cancelado: boolean
  tentativo: boolean
  privado: boolean
  livre: boolean
  sequencia: number
  modificado: string
  ordem: number
  titulo: string
  local: string | null
  descricao: string | null
  linkReuniao: string | null
}

/** Valores de data de uma propriedade (lista com vírgula; TZID do parâmetro; VALUE=PERIOD é ignorado). */
function valoresData(p: Propriedade): ValorData[] {
  const tipo = (param(p, 'VALUE') ?? '').toUpperCase()
  if (tipo === 'PERIOD') return []
  const tzid = param(p, 'TZID') ?? null
  const saida: ValorData[] = []
  for (const parte of p.valor.split(',')) {
    const v = lerValorData(parte, tzid, tipo === 'DATE')
    if (v) saida.push(v)
  }
  return saida
}

/** Um VEVENT → evento (null: sem DTSTART legível ou com RECURRENCE-ID ilegível; quem chama conta 1 aviso). */
function lerEvento(c: Componente, ordem: number): EventoLido | null {
  const dtstart = prop(c, 'DTSTART')
  const inicio = dtstart ? valoresData(dtstart)[0] : undefined
  if (!inicio) return null
  const recId = prop(c, 'RECURRENCE-ID')
  const recorrencia = recId ? valoresData(recId)[0] ?? null : null
  if (recId && !recorrencia) return null
  const dtend = prop(c, 'DTEND')
  const durTexto = prop(c, 'DURATION')?.valor
  const status = (prop(c, 'STATUS')?.valor ?? '').trim().toUpperCase()
  const classe = (prop(c, 'CLASS')?.valor ?? '').trim().toUpperCase()
  const privado = classe === 'PRIVATE' || classe === 'CONFIDENTIAL'
  const seq = Number((prop(c, 'SEQUENCE')?.valor ?? '0').trim())
  const base = {
    uid: (prop(c, 'UID')?.valor ?? '').trim(),
    recorrencia, inicio,
    fim: dtend ? valoresData(dtend)[0] ?? null : null,
    duracao: durTexto ? lerDuracao(durTexto) : null,
    regras: props(c, 'RRULE').map((p) => p.valor),
    exdates: props(c, 'EXDATE').flatMap(valoresData),
    rdates: props(c, 'RDATE').flatMap(valoresData),
    cancelado: status === 'CANCELLED',
    tentativo: status === 'TENTATIVE',
    privado,
    livre: (prop(c, 'TRANSP')?.valor ?? '').trim().toUpperCase() === 'TRANSPARENT',
    sequencia: Number.isFinite(seq) ? seq : 0,
    modificado: (prop(c, 'LAST-MODIFIED')?.valor ?? '').trim(),
    ordem,
  }
  // privado: "Ocupado", sem nem ler local, descrição e link (toda a equipe vê a Agenda)
  if (privado) return { ...base, titulo: TITULO_PRIVADO, local: null, descricao: null, linkReuniao: null }
  const localCru = textoIcal(prop(c, 'LOCATION')?.valor ?? '')
  const descricaoCrua = textoIcal(prop(c, 'DESCRIPTION')?.valor ?? '')
  const conferencia = linkReuniaoValido(textoIcal(prop(c, 'X-GOOGLE-CONFERENCE')?.valor ?? '').trim())
  return {
    ...base,
    titulo: umaLinhaIcal(textoIcal(prop(c, 'SUMMARY')?.valor ?? ''), LIMITE_TITULO) || TITULO_SEM_TITULO,
    local: umaLinhaIcal(localCru, LIMITE_LOCAL) || null,
    descricao: htmlParaTexto(descricaoCrua) || null,
    linkReuniao: conferencia ?? linkReuniaoNoTexto(localCru) ?? linkReuniaoNoTexto(descricaoCrua),
  }
}

/** A versão que vale entre duas do mesmo UID (+ RECURRENCE-ID): SEQUENCE maior, depois LAST-MODIFIED, depois a última. */
function vence(a: EventoLido, b: EventoLido): EventoLido {
  if (a.sequencia !== b.sequencia) return a.sequencia > b.sequencia ? a : b
  if (a.modificado !== b.modificado) return a.modificado > b.modificado ? a : b
  return a.ordem > b.ordem ? a : b
}

// ─────────────────────────────── montagem ───────────────────────────────

interface Janela {
  de: DataLocal
  ate: DataLocal
  inicioMs: number
  fimMs: number
}

/** Início de uma ocorrência: data (dia inteiro, ms local da meia-noite) ou instante (ms). */
type Inicio = { tipo: 'data'; localMs: number } | { tipo: 'instante'; ms: number }

/** Chave do UID: até 300 caracteres como está; mais que isso, o sha256 (a chave da linha tem até 400). */
function chaveUid(uid: string, ordem: number): string {
  if (!uid) return `sem-uid:${ordem}`
  return uid.length <= 300 ? uid : `h:${createHash('sha256').update(uid).digest('hex')}`
}

/** A janela de hoje − 30 a hoje + 180 (São Paulo, inclusive). */
export function janelaDe(hoje: DataLocal): Janela {
  const de = somarDias(hoje, -JANELA_AGENDA_EXTERNA.diasAntes)
  const ate = somarDias(hoje, JANELA_AGENDA_EXTERNA.diasDepois)
  return { de, ate, inicioMs: instanteSP(de, '00:00').getTime(), fimMs: instanteSP(somarDias(ate, 1), '00:00').getTime() }
}

export function lerIcal(bytes: Uint8Array, opcoes: OpcoesLeitura): LeituraIcal {
  const tetoSerie = opcoes.tetoPorSerie ?? TETOS_AGENDA_EXTERNA.ocorrenciasPorSerie
  const tetoAgenda = opcoes.tetoPorAgenda ?? TETOS_AGENDA_EXTERNA.ocorrenciasPorAgenda
  const janela = janelaDe(opcoes.hoje)

  const { raiz, avisos: avisosLeitura } = lerComponentes(bytes)
  let avisos = avisosLeitura
  let naoEntendidas = 0
  const calendario = raiz.find((c) => c.nome === 'VCALENDAR')
  const xWr = calendario ? (prop(calendario, 'X-WR-TIMEZONE')?.valor.trim() || null) : null
  const fusos = new Fusos(componentesDo(raiz, 'VTIMEZONE'), xWr)
  const vevents = componentesDo(raiz, 'VEVENT')
  avisos += raiz.filter((c) => c.nome !== 'VCALENDAR').length

  // por UID: o mestre (ou avulso) e as exceções por RECURRENCE-ID
  const grupos = new Map<string, { mestre: EventoLido | null; excecoes: Map<string, EventoLido> }>()
  vevents.forEach((c, ordem) => {
    const evento = lerEvento(c, ordem)
    if (!evento) { avisos++; return }
    const uid = chaveUid(evento.uid, ordem)
    let g = grupos.get(uid)
    if (!g) { g = { mestre: null, excecoes: new Map() }; grupos.set(uid, g) }
    if (evento.recorrencia) {
      const k = chaveDoValor(evento.recorrencia, fusos)
      const atual = g.excecoes.get(k)
      g.excecoes.set(k, atual ? vence(atual, evento) : evento)
    } else {
      g.mestre = g.mestre ? vence(g.mestre, evento) : evento
    }
  })

  const saida: OcorrenciaIcal[] = []
  const vistas = new Set<string>()
  const incluir = (o: OcorrenciaIcal | null) => {
    if (!o || vistas.has(o.chave)) return
    vistas.add(o.chave)
    saida.push(o)
  }

  for (const [uid, { mestre, excecoes }] of grupos) {
    if (mestre?.cancelado) continue                                  // série (ou avulso) cancelada: nada dela aparece
    if (mestre) {
      const recorrente = mestre.regras.length > 0 || mestre.rdates.length > 0 || excecoes.size > 0
      const r = ocorrenciasDoMestre(mestre, fusos, janela, tetoSerie)
      if (r.naoEntendida) naoEntendidas++
      if (r.cortada) avisos++
      const excluidas = new Set(mestre.exdates.map((v) => chaveDoValor(v, fusos)))
      for (const inicio of r.inicios) {
        const k = chaveDoInicio(inicio)
        if (excluidas.has(k) || excecoes.has(k)) continue
        incluir(montar(mestre, inicio, recorrente ? `${uid}|${k}` : uid, fusos, janela))
      }
    }
    // exceções: valem por inteiro (título, horário, local e link delas); sem mestre no arquivo, viram avulsos
    for (const [k, ex] of excecoes) {
      if (ex.cancelado) continue
      incluir(montar(ex, inicioDoValor(ex.inicio, fusos), `${uid}|${k}`, fusos, janela))
    }
  }

  saida.sort((a, b) => (a.diaInicio < b.diaInicio ? -1 : a.diaInicio > b.diaInicio ? 1 : 0)
    || Number(b.diaInteiro) - Number(a.diaInteiro)
    || (a.inicio ?? '').localeCompare(b.inicio ?? '') || a.titulo.localeCompare(b.titulo))
  return {
    ocorrencias: saida,
    contagens: {
      eventos: vevents.length, ocorrencias: saida.length, repeticoesNaoEntendidas: naoEntendidas,
      fusosDesconhecidos: fusos.desconhecidos.size, avisos,
    },
    passouDoTeto: saida.length > tetoAgenda,
  }
}

function inicioDoValor(v: ValorData, fusos: Fusos): Inicio {
  return v.tipo === 'data' ? { tipo: 'data', localMs: v.localMs } : { tipo: 'instante', ms: fusos.instante(v) }
}

function chaveDoInicio(i: Inicio): string {
  return i.tipo === 'data' ? dataDoLocal(i.localMs) : new Date(i.ms).toISOString()
}

/** EXDATE e RECURRENCE-ID: casados por instante UTC (o Google mistura TZID e Z); data com data. */
function chaveDoValor(v: ValorData, fusos: Fusos): string {
  return v.tipo === 'data' ? dataDoLocal(v.localMs) : new Date(fusos.instante(v)).toISOString()
}

/** Inícios do mestre: a série expandida (ou só o DTSTART, se a regra não for entendida) mais as RDATE. */
function ocorrenciasDoMestre(m: EventoLido, fusos: Fusos, janela: Janela, teto: number):
  { inicios: Inicio[]; naoEntendida: boolean; cortada: boolean } {
  const diaInteiro = m.inicio.tipo === 'data'
  const unico = inicioDoValor(m.inicio, fusos)
  const extras = m.rdates.map((v): Inicio => (diaInteiro && v.tipo !== 'data'
    ? { tipo: 'data', localMs: Date.parse(`${dataDoLocal(v.tipo === 'utc' ? v.ms : v.localMs)}T00:00:00Z`) }
    : inicioDoValor(v, fusos)))
  if (m.regras.length === 0) return { inicios: [unico, ...extras], naoEntendida: false, cortada: false }
  const regra = m.regras.length === 1 ? lerRegra(m.regras[0]!) : null
  if (!regra) return { inicios: [unico, ...extras], naoEntendida: true, cortada: false }

  // relógio de parede da série: dia inteiro e hora local andam no próprio fuso; UTC anda em UTC
  let inicioLocal: number
  let paraInstante: ParaInstante
  if (m.inicio.tipo === 'data') { inicioLocal = m.inicio.localMs; paraInstante = (l) => l }
  else if (m.inicio.tipo === 'utc') { inicioLocal = m.inicio.ms; paraInstante = (l) => l }
  else { inicioLocal = m.inicio.localMs; paraInstante = fusos.conversor(m.inicio.tzid) }
  const duracaoMs = Math.max(0, duracaoDe(m, fusos))
  const margem = 2 * DIA_MS
  const exp = expandir(regra, {
    inicioLocal, paraInstante, teto,
    desdeLocal: Date.parse(`${janela.de}T00:00:00Z`) - duracaoMs - margem,
    ateLocal: Date.parse(`${janela.ate}T00:00:00Z`) + DIA_MS + margem,
  })
  const inicios = exp.locais.map((l): Inicio => (diaInteiro ? { tipo: 'data', localMs: l } : { tipo: 'instante', ms: paraInstante(l) }))
  return { inicios: [...inicios, ...extras], naoEntendida: false, cortada: exp.cortada }
}

/** Duração: DTEND − DTSTART (instantes; dia inteiro em dias), senão DURATION, senão a da RFC (1 dia ou zero). */
function duracaoDe(e: EventoLido, fusos: Fusos): number {
  if (e.inicio.tipo === 'data') {
    if (e.fim) {
      const fimLocal = e.fim.tipo === 'utc' ? e.fim.ms : e.fim.localMs
      const dias = Math.round((Date.parse(`${dataDoLocal(fimLocal)}T00:00:00Z`) - e.inicio.localMs) / DIA_MS)
      return Math.max(1, dias) * DIA_MS
    }
    if (e.duracao) return Math.max(1, e.duracao.dias || Math.ceil(e.duracao.ms / DIA_MS)) * DIA_MS
    return DIA_MS
  }
  if (e.fim) return fusos.instante(e.fim) - fusos.instante(e.inicio)
  if (e.duracao) return e.duracao.ms
  return 0
}

/** A linha da ocorrência, ou null fora da janela. */
function montar(e: EventoLido, inicio: Inicio, chave: string, fusos: Fusos, janela: Janela): OcorrenciaIcal | null {
  const comum = {
    chave, titulo: e.titulo, local: e.local, linkReuniao: e.linkReuniao, descricao: e.descricao,
    tentativo: e.tentativo, livre: e.livre, privado: e.privado,
  }
  const duracaoMs = Math.max(0, duracaoDe(e, fusos))
  if (inicio.tipo === 'data') {
    const diaInicio = dataDoLocal(inicio.localMs)
    const diaFim = somarDias(diaInicio, Math.max(1, Math.round(duracaoMs / DIA_MS)) - 1)
    if (diaInicio > janela.ate || diaFim < janela.de) return null
    return { ...comum, diaInteiro: true, inicio: null, fim: null, diaInicio, diaFim }
  }
  const ini = inicio.ms
  const fim = ini + duracaoMs
  const cruza = ini < janela.fimMs && (fim > janela.inicioMs || (fim === ini && ini >= janela.inicioMs))
  if (!cruza) return null
  const diaSP = (ms: number) => dataDoLocal(paredeRapida(FUSO, ms))
  return {
    ...comum, diaInteiro: false, inicio: new Date(ini).toISOString(), fim: new Date(fim).toISOString(),
    diaInicio: diaSP(ini), diaFim: diaSP(fim > ini ? fim - 1 : ini),
  }
}

/** sha256 do corpo sem as linhas DTSTAMP (o Google regrava o DTSTAMP de todos os eventos a cada pedido). */
export function hashSemDtstamp(bytes: Uint8Array): string {
  const texto = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')
  return createHash('sha256').update(texto.replace(/^DTSTAMP[:;][^\n]*(\n|$)/gim, ''), 'latin1').digest('hex')
}
