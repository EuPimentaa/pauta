/**
 * Painéis (F3), lógica pura do front (os testes do servidor importam; só caminhos relativos):
 * - a lista do sino em cache (['notificacoes']): nova, lida, mais antigas, todas lidas;
 * - "há 5 min" das notificações;
 * - a Agenda: itens do bootstrap + os de fora dele (extras da API);
 * - as Horas: dias da semana, totais por dia e a ordem dos lançamentos.
 */
import type {
  AgendaConsulta, AgendaSaida, Apontamento, DataLocal, Demanda, Id, ItemAgenda, ListarNotificacoesSaida, Notificacao,
} from '../../../../shared/tipos/index.ts'
import { diaDaSemana, hojeSP, segundaDaSemana, somarDias } from '../../../../shared/logica/datas.ts'
import { itensAgenda, porDataDoItem } from '../../../../shared/logica/paineis.ts'

// ─────────────────────────────── sino ───────────────────────────────

export const LISTA_VAZIA: ListarNotificacoesSaida = { itens: [], naoLidas: 0, proximo: null }

const maiorId = (l: ListarNotificacoesSaida) => l.itens.reduce((m, n) => Math.max(m, n.id), 0)

/**
 * Notificação inteira chegando (tempo real). Nova (id maior que todas): entra no topo e soma nas não lidas; já
 * conhecida: troca. Uma antiga fora da página carregada não muda nada (ela vem quando a pessoa pedir as antigas).
 */
export function comNotificacao(l: ListarNotificacoesSaida, n: Notificacao): ListarNotificacoesSaida {
  const atual = l.itens.find((x) => x.id === n.id)
  if (atual) {
    const delta = (atual.lidaEm === null ? 1 : 0) - (n.lidaEm === null ? 1 : 0)
    return { ...l, itens: l.itens.map((x) => (x.id === n.id ? n : x)), naoLidas: Math.max(0, l.naoLidas - delta) }
  }
  if (l.itens.length > 0 && n.id < maiorId(l)) return l
  return { ...l, itens: [n, ...l.itens], naoLidas: l.naoLidas + (n.lidaEm === null ? 1 : 0) }
}

/**
 * Patch de uma notificação (o `lidaEm` que outra aba marcou). `conhecida: false` quando ela não está na página
 * carregada: quem chama recarrega a contagem.
 */
export function comPatchNotificacao(l: ListarNotificacoesSaida, id: number, patch: Partial<Notificacao>):
  { lista: ListarNotificacoesSaida; conhecida: boolean } {
  const atual = l.itens.find((x) => x.id === id)
  if (!atual) return { lista: l, conhecida: false }
  return { lista: comNotificacao(l, { ...atual, ...patch, id }), conhecida: true }
}

/** Marca como lidas as de `ids` (ou todas até `ate`, ou todas) na lista, já descontando das não lidas. */
export function marcarNaLista(l: ListarNotificacoesSaida, quais: { ids?: number[]; ate?: number }, instante: string): ListarNotificacoesSaida {
  const alvo = (n: Notificacao) => n.lidaEm === null && (quais.ids ? quais.ids.includes(n.id) : quais.ate === undefined || n.id <= quais.ate)
  const marcadas = l.itens.filter(alvo).length
  // "todas até X": as não lidas que ainda não foram carregadas também saem da contagem
  const naoLidas = quais.ids ? Math.max(0, l.naoLidas - marcadas) : 0
  return { ...l, itens: l.itens.map((n) => (alvo(n) ? { ...n, lidaEm: instante } : n)), naoLidas }
}

/** A página seguinte (mais antigas) no fim, sem repetir. */
export function comMaisAntigas(l: ListarNotificacoesSaida, pagina: ListarNotificacoesSaida): ListarNotificacoesSaida {
  const ids = new Set(l.itens.map((n) => n.id))
  return { itens: [...l.itens, ...pagina.itens.filter((n) => !ids.has(n.id))], naoLidas: pagina.naoLidas, proximo: pagina.proximo }
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** "agora", "há 5 min", "há 3 h", "ontem, 14h", "seg, 12/10" (mais de uma semana: "12/10/2025" fora do ano). */
export function quando(instante: string, agora: Date): string {
  const t = new Date(instante)
  const seg = Math.max(0, (agora.getTime() - t.getTime()) / 1000)
  if (seg < 60) return 'agora'
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`
  const hoje = hojeSP(agora)
  const dia = hojeSP(t)
  if (dia === hoje) return `há ${Math.floor(seg / 3600)} h`
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(t).replace(':00', 'h').replace(':', 'h')
  if (dia === somarDias(hoje, -1)) return `ontem, ${hora}`
  const [a, m, d] = dia.split('-') as [string, string, string]
  if (dia > somarDias(hoje, -7)) return `${DIAS[diaDaSemana(dia)]}, ${d}/${m}`
  return a === hoje.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`
}

// ─────────────────────────────── Início ───────────────────────────────

/** "3 atrasadas", "1 para hoje", "4 com o cliente" (só os que não são zero). */
export function partesDoResumo(r: { atrasadas: number; hoje: number; comCliente: number }): { id: 'atrasadas' | 'hoje' | 'cliente'; texto: string }[] {
  const partes: { id: 'atrasadas' | 'hoje' | 'cliente'; texto: string }[] = []
  if (r.atrasadas) partes.push({ id: 'atrasadas', texto: `${r.atrasadas} ${r.atrasadas === 1 ? 'atrasada' : 'atrasadas'}` })
  if (r.hoje) partes.push({ id: 'hoje', texto: `${r.hoje} para hoje` })
  if (r.comCliente) partes.push({ id: 'cliente', texto: `${r.comCliente} com o cliente` })
  return partes
}

/** "Bom dia" (5h–12h), "Boa tarde" (12h–18h), "Boa noite", pela hora de São Paulo. */
export function saudacao(agora: Date): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(agora))
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite'
}

const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const

/** "sexta, 16 de outubro". */
export function dataPorExtenso(dia: DataLocal): string {
  const [, m, d] = dia.split('-').map(Number) as [number, number, number]
  return `${DIAS_LONGOS[diaDaSemana(dia)]}, ${d} de ${MESES[m - 1]}`
}

// ─────────────────────────────── Agenda ───────────────────────────────

export interface ItemAgendaComDemanda extends ItemAgenda {
  demanda: Demanda
}

/**
 * Os itens da Agenda: calculados do bootstrap (mudam na hora em que a demanda muda: arrastar, tempo real) mais os da
 * API cujas demandas não estão no bootstrap (concluídas antigas, em `extras`).
 */
export function juntarAgenda(bootstrap: readonly Demanda[], consulta: AgendaConsulta, euId: Id, api: AgendaSaida | undefined): ItemAgendaComDemanda[] {
  const porId = new Map(bootstrap.map((d) => [d.id, d]))
  const itens: ItemAgendaComDemanda[] = itensAgenda(bootstrap, consulta, euId).map((i) => ({ ...i, demanda: porId.get(i.demandaId)! }))
  if (api) {
    const fora = new Map(api.extras.filter((d) => !porId.has(d.id)).map((d) => [d.id, d]))
    for (const i of api.itens) {
      const d = fora.get(i.demandaId)
      if (d) itens.push({ ...i, demanda: d })
    }
  }
  return itens.sort((a, b) => porDataDoItem({ ...a, numero: a.demanda.numero }, { ...b, numero: b.demanda.numero }))
}

/** O intervalo que a grade mostra: o mês inteiro em semanas completas (seg a dom) ou a semana. */
export function intervaloDaGrade(modo: 'mes' | 'semana', inicio: DataLocal): { de: DataLocal; ate: DataLocal } {
  if (modo === 'semana') {
    const de = segundaDaSemana(inicio)
    return { de, ate: somarDias(de, 6) }
  }
  const primeiro = `${inicio.slice(0, 7)}-01`
  const de = segundaDaSemana(primeiro)
  const [a, m] = primeiro.split('-').map(Number) as [number, number]
  const ultimo = somarDias(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1)
  return { de, ate: somarDias(segundaDaSemana(ultimo), 6) }
}

// ─────────────────────────────── Horas ───────────────────────────────

/** Os 7 dias (seg a dom) da semana de `dia`. */
export function diasDaSemanaDe(dia: DataLocal): DataLocal[] {
  const seg = segundaDaSemana(dia)
  return Array.from({ length: 7 }, (_, i) => somarDias(seg, i))
}

/** Minutos por dia (cronômetro ligado não soma). */
export function totaisPorDia(itens: readonly Apontamento[]): Map<DataLocal, number> {
  const m = new Map<DataLocal, number>()
  for (const a of itens) if (a.minutos !== null) m.set(a.data, (m.get(a.data) ?? 0) + a.minutos)
  return m
}

/** Lançamentos do dia: o cronômetro ligado primeiro, depois do mais novo para o mais velho. */
export function lancamentosDoDia(itens: readonly Apontamento[], dia: DataLocal): Apontamento[] {
  return itens.filter((a) => a.data === dia).sort((a, b) =>
    (a.minutos === null ? 0 : 1) - (b.minutos === null ? 0 : 1) || b.criadoEm.localeCompare(a.criadoEm))
}

/** Primeiro e último dia do mês de `dia`. */
export function mesDe(dia: DataLocal): { de: DataLocal; ate: DataLocal } {
  const de = `${dia.slice(0, 7)}-01`
  const [a, m] = de.split('-').map(Number) as [number, number]
  return { de, ate: somarDias(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1) }
}
