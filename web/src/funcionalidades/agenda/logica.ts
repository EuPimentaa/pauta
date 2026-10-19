/**
 * Agenda externa (F9), lógica pura do front (os testes do servidor importam; só caminhos relativos, sem o alias
 * @shared): as chaves do cache, os itens do calendário por dia, o filtro de calendários guardado no aparelho, os
 * eventos de hoje, os textos de horário e o estado de cada agenda em português.
 */
import type {
  AgendaExterna, Cor, DataLocal, ErroAgendaExterna, EventoAgendaExterna, EventosAgendaSaida, HoraLocal,
} from '../../../../shared/tipos/index.ts'
import { horaLocalDe, somarDias } from '../../../../shared/logica/datas.ts'

/** Chaves do TanStack Query (FASE2-PLANO §3 F9). */
export const chavesAgenda = {
  lista: ['agendas-externas'] as const,
  eventos: (de: DataLocal, ate: DataLocal) => ['agenda-externa', 'eventos', de, ate] as const,
  todosEventos: ['agenda-externa', 'eventos'] as const,
}

/** localStorage (com o prefixo `pauta:` do lerLocal): os ids das agendas escondidas no filtro deste aparelho. */
export const CHAVE_DESLIGADAS = 'agenda-externa-desligadas'

/** O que a fonte da Agenda desenha (o ItemAgendaExterno sem o `abrir`) e o evento de onde veio. */
export interface ItemExterno {
  id: string
  fonteId: string
  data: DataLocal
  titulo: string
  cor: Cor
  hora: HoraLocal | null
  horaFim: HoraLocal | null
  origem: string
  leve: boolean
  evento: EventoAgendaExterna
}

export const ID_FONTE = 'agenda'

/** Um item por dia do evento dentro do período (dia inteiro e os dias do meio sem hora; a hora no 1º, o fim no último). */
export function diasDoEvento(e: EventoAgendaExterna, de: DataLocal, ate: DataLocal):
  { data: DataLocal; hora: HoraLocal | null; horaFim: HoraLocal | null }[] {
  const saida: { data: DataLocal; hora: HoraLocal | null; horaFim: HoraLocal | null }[] = []
  const inicio = e.diaInicio < de ? de : e.diaInicio
  const fim = e.diaFim > ate ? ate : e.diaFim
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    if (e.diaInteiro || !e.inicio || !e.fim) { saida.push({ data: d, hora: null, horaFim: null }); continue }
    const primeiro = d === e.diaInicio
    const ultimo = d === e.diaFim
    saida.push({
      data: d,
      hora: primeiro ? horaLocalDe(e.inicio) : null,
      horaFim: ultimo && e.fim !== e.inicio ? horaLocalDe(e.fim) : null,
    })
  }
  return saida
}

/** Itens do calendário: só das agendas ativas e ligadas no filtro, um por dia de cada evento. */
export function itensDoPeriodo(s: EventosAgendaSaida | undefined, desligadas: ReadonlySet<string>, de: DataLocal, ate: DataLocal): ItemExterno[] {
  if (!s) return []
  const agendas = new Map(s.agendas.filter((a) => a.ativa && !desligadas.has(a.id)).map((a) => [a.id, a]))
  const itens: ItemExterno[] = []
  for (const e of s.eventos) {
    const agenda = agendas.get(e.agendaId)
    if (!agenda) continue
    for (const p of diasDoEvento(e, de, ate)) {
      itens.push({
        id: `${e.id}:${p.data}`, fonteId: ID_FONTE, data: p.data, titulo: e.titulo, cor: agenda.cor, hora: p.hora,
        horaFim: p.horaFim, origem: agenda.nome, leve: e.livre || e.tentativo, evento: e,
      })
    }
  }
  return itens
}

/** Dia inteiro (e dia do meio) primeiro, depois pela hora; empate pelo título. */
export function ordenarExternos<T extends { hora: HoraLocal | null; titulo: string; evento?: EventoAgendaExterna }>(a: T, b: T): number {
  const ka = a.hora ?? '', kb = b.hora ?? ''
  return ka.localeCompare(kb) || a.titulo.localeCompare(b.titulo)
}

/** "1 evento", "3 eventos". */
export function rotuloEventos(n: number): string {
  return `${n} ${n === 1 ? 'evento' : 'eventos'}`
}

/** "10h", "10h30" (o formato do produto). */
export function hora(h: HoraLocal): string {
  const [hh, mm] = h.split(':')
  return mm === '00' ? `${Number(hh)}h` : `${Number(hh)}h${mm}`
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const

function diaSemana(d: DataLocal): string {
  const [a, m, dia] = d.split('-').map(Number) as [number, number, number]
  return DIAS[new Date(Date.UTC(a, m - 1, dia)).getUTCDay()]!
}

/** "seg, 20 de outubro". */
export function diaPorExtenso(d: DataLocal): string {
  return `${diaSemana(d)}, ${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]}`
}

const curto = (d: DataLocal) => `${diaSemana(d)}, ${d.slice(8, 10)}/${d.slice(5, 7)}`

/**
 * O horário do evento para os detalhes: "seg, 20 de outubro · 10h–11h", "Dia inteiro · seg, 2 de novembro",
 * "10 a 12 de novembro (dia inteiro)", "sex, 23/10, 22h – sáb, 24/10, 1h".
 */
export function horarioDoEvento(e: EventoAgendaExterna): string {
  if (e.diaInteiro || !e.inicio || !e.fim) {
    if (e.diaInicio === e.diaFim) return `Dia inteiro · ${diaPorExtenso(e.diaInicio)}`
    const mesmoMes = e.diaInicio.slice(0, 7) === e.diaFim.slice(0, 7)
    return mesmoMes
      ? `${Number(e.diaInicio.slice(8, 10))} a ${Number(e.diaFim.slice(8, 10))} de ${MESES[Number(e.diaFim.slice(5, 7)) - 1]} (dia inteiro)`
      : `${curto(e.diaInicio)} a ${curto(e.diaFim)} (dia inteiro)`
  }
  const hi = hora(horaLocalDe(e.inicio))
  if (e.fim === e.inicio) return `${diaPorExtenso(e.diaInicio)} · ${hi}`
  const hf = hora(horaLocalDe(e.fim))
  if (e.diaInicio === e.diaFim) return `${diaPorExtenso(e.diaInicio)} · ${hi}–${hf}`
  return `${curto(e.diaInicio)}, ${hi} – ${curto(e.diaFim)}, ${hf}`
}

/** O horário curto no chip e na lista do Início: "Dia inteiro", "10h–11h", "22h" (atravessa o dia), "até 1h". */
export function horarioCurto(i: { hora: HoraLocal | null; horaFim: HoraLocal | null; evento: EventoAgendaExterna }): string {
  if (i.evento.diaInteiro) return 'Dia inteiro'
  if (i.hora && i.horaFim && i.horaFim !== i.hora) return `${hora(i.hora)}–${hora(i.horaFim)}`
  if (i.hora) return hora(i.hora)
  if (i.horaFim) return `até ${hora(i.horaFim)}`
  return 'Dia inteiro'
}

/** O item tem horário (não é de dia inteiro nem sem fim)? */
const comHorario = (i: ItemExterno) => !i.evento.diaInteiro && !!i.evento.inicio && !!i.evento.fim

/** Já terminou em `agora`? Dia inteiro (e sem horário) vale o dia todo: nunca "já passou" dentro de hoje. */
export function encerrado(i: ItemExterno, agora: Date): boolean {
  return comHorario(i) && Date.parse(i.evento.fim!) <= agora.getTime()
}

/** Acontecendo agora (começou e não terminou)? */
export function acontecendo(i: ItemExterno, agora: Date): boolean {
  return comHorario(i) && Date.parse(i.evento.inicio!) <= agora.getTime() && agora.getTime() < Date.parse(i.evento.fim!)
}

/**
 * Os eventos de hoje (Início): das agendas ligadas, dia inteiro primeiro e depois pelo horário. Com `agora`, os que já
 * terminaram saem da lista principal e vão para `passados` (a seção os mostra recolhidos): a tarde não fica com as
 * reuniões da manhã na frente e as próximas escondidas no "mais 4" (revisão visual da Fase 2, achado 2). `itens`: até
 * `max` dos que ainda vêm; `resto`: quantos deles ficaram de fora; `aindaHoje`: os com horário que ainda não terminaram.
 */
export function eventosDeHoje(s: EventosAgendaSaida | undefined, desligadas: ReadonlySet<string>, hoje: DataLocal, max = 5, agora?: Date):
  { itens: ItemExterno[]; resto: number; passados: ItemExterno[]; aindaHoje: number; total: number; todasEscondidas: boolean } {
  const ativas = (s?.agendas ?? []).filter((a) => a.ativa)
  const todos = itensDoPeriodo(s, desligadas, hoje, hoje).sort(ordenarExternos)
  const passados = agora ? todos.filter((i) => encerrado(i, agora)) : []
  const vindo = agora ? todos.filter((i) => !encerrado(i, agora)) : todos
  return {
    itens: vindo.slice(0, max), resto: Math.max(0, vindo.length - max), passados,
    aindaHoje: vindo.filter(comHorario).length, total: todos.length,
    todasEscondidas: ativas.length > 0 && ativas.every((a) => desligadas.has(a.id)),
  }
}

/** Liga ou desliga uma agenda no filtro (lista de ids desligados, sem repetir). */
export function alternarDesligada(desligadas: readonly string[], id: string): string[] {
  return desligadas.includes(id) ? desligadas.filter((x) => x !== id) : [...desligadas, id]
}

// ─────────────────────────────── estado da agenda (Configurações) ───────────────────────────────

/** A ordem das cores sugeridas para uma agenda nova (a primeira ainda livre; azul era a de todas). */
export const CORES_SUGERIDAS: readonly Cor[] = ['azul', 'verde', 'roxo', 'ambar', 'rosa', 'turquesa', 'magenta', 'berinjela', 'amarelo', 'grafite']

/**
 * A cor sugerida para uma agenda nova: a primeira de CORES_SUGERIDAS que nenhuma agenda usa (na grade, a cor é a única
 * pista da origem do evento). Todas usadas: a menos usada, na mesma ordem.
 */
export function corLivre(usadas: readonly Cor[]): Cor {
  const conta = (c: Cor) => usadas.filter((u) => u === c).length
  return [...CORES_SUGERIDAS].sort((a, b) => conta(a) - conta(b) || CORES_SUGERIDAS.indexOf(a) - CORES_SUGERIDAS.indexOf(b))[0]!
}

/** Os erros que só se resolvem colando o endereço de novo (a tela mostra "Trocar o endereço" no próprio aviso). */
export const ERROS_DO_ENDERECO: readonly ErroAgendaExterna[] = ['endereco_invalido', 'endereco_ilegivel', 'nao_e_ical']

export const TEXTO_ERRO: Record<ErroAgendaExterna, string> = {
  endereco_invalido: 'O Google não reconhece mais este endereço (ele foi redefinido ou apagado). Cole o endereço novo.',
  endereco_ilegivel: 'Não deu para ler o endereço guardado (o segredo do servidor mudou). Cole o endereço de novo.',
  nao_e_ical: 'O endereço não devolveu uma agenda. Confira se copiou o Endereço secreto no formato iCal.',
  grande_demais: 'A agenda passou de 32 MB e não foi lida.',
  tempo_esgotado: 'O Google demorou mais de 1 minuto para responder. Tentamos de novo em 15 minutos.',
  fora_do_ar: 'O Google não respondeu agora. Tentamos de novo em 15 minutos.',
  teto_ocorrencias: 'Mais de 20.000 eventos entre 30 dias atrás e 180 dias à frente: a agenda não foi lida.',
}

const milhar = (n: number) => n.toLocaleString('pt-BR')

/**
 * A linha de estado: "Atualizada às 14:05 · 312 eventos", "Buscando a agenda…", "Pausada" ou o erro (com "os eventos
 * da última busca continuam" quando houve uma busca boa). `avisos`: repetições não entendidas e fusos desconhecidos.
 */
export function estadoDaAgenda(a: AgendaExterna, hojeSP: DataLocal):
  { tom: 'ok' | 'erro' | 'neutro'; texto: string; detalhe: string | null; avisos: string[] } {
  const avisos: string[] = []
  const c = a.contagens
  if (c && c.repeticoesNaoEntendidas > 0) {
    avisos.push(c.repeticoesNaoEntendidas === 1
      ? '1 evento com uma repetição que o Pauta não entende: aparece só a primeira vez.'
      : `${milhar(c.repeticoesNaoEntendidas)} eventos com repetições que o Pauta não entende: aparece só a primeira vez de cada.`)
  }
  if (c && c.fusosDesconhecidos > 0) {
    avisos.push(c.fusosDesconhecidos === 1 ? '1 fuso horário desconhecido (usamos o do convite ou o de São Paulo).'
      : `${c.fusosDesconhecidos} fusos horários desconhecidos (usamos o do convite ou o de São Paulo).`)
  }
  const quando = (i: string) => {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(i))
    const h = horaLocalDe(i)
    return dia === hojeSP ? `às ${h}` : `em ${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${h}`
  }
  if (!a.ativa) return { tom: 'neutro', texto: 'Pausada: não busca nem aparece na Agenda.', detalhe: null, avisos }
  if (a.erro) {
    return {
      tom: 'erro', texto: TEXTO_ERRO[a.erro],
      detalhe: a.okEm ? `Os eventos da última busca boa (${quando(a.okEm).replace(/^às /, 'hoje às ')}) continuam na Agenda.` : null,
      avisos,
    }
  }
  if (!a.okEm) return { tom: 'neutro', texto: 'Buscando a agenda…', detalhe: null, avisos }
  // sem erro, a última tentativa deu certo (mesmo quando nada mudou e só a buscadaEm andou)
  const n = c?.ocorrencias ?? 0
  return { tom: 'ok', texto: `Atualizada ${quando(a.buscadaEm ?? a.okEm)} · ${rotuloEventos(n).replace(/^\d+/, milhar(n))}`, detalhe: null, avisos }
}
