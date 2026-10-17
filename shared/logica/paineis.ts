/**
 * Início e Agenda (API.md §4.18), puro: o servidor monta GET /api/inicio e GET /api/agenda com estas funções e o
 * front calcula as mesmas listas do bootstrap (o card entra e sai do Início na hora em que muda, sem esperar a
 * consulta). Também: duração das horas ("1h30") e os Primeiros passos do admin (critérios da API §4.18).
 *
 * "Minhas" = sou membro ou o AM (ehMinha). Quem chama passa só demandas vivas (não arquivadas, de quadro ativo).
 */
import type { AgendaConsulta, ItemAgenda, MinhasPorPrazo } from '../tipos/paineis.ts'
import type { Demanda } from '../tipos/demandas.ts'
import type { Coluna } from '../tipos/quadros.ts'
import type { PassoInicial, PrimeirosPassos } from '../tipos/config.ts'
import { PASSOS_INICIAIS } from '../tipos/config.ts'
import { HORA_PADRAO_PRAZO, type DataLocal, type Id, type PapelColuna, type Prioridade } from '../tipos/nucleo.ts'
import { diasEntre, hojeSP, segundaDaSemana, somarDias } from './datas.ts'
import { estadoPrazo } from './prazo.ts'
import { comQuemEsta, ehMinha, paradoHa } from './quadro.ts'

/** O papel da coluna de cada demanda (coluna fora da lista conta como normal). */
export type PapelDe = (colunaId: Id) => PapelColuna

const PESO_PRIORIDADE: Record<Prioridade, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 }

/** Prazo, hora (sem hora = 18:00), prioridade (urgente primeiro) e número. */
export function porPrazo(a: Demanda, b: Demanda): number {
  return (a.prazo ?? '9999-99-99').localeCompare(b.prazo ?? '9999-99-99')
    || (a.prazoHora ?? HORA_PADRAO_PRAZO).localeCompare(b.prazoHora ?? HORA_PADRAO_PRAZO)
    || PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]
    || a.numero - b.numero
}

/** Último dia da semana de `hoje` (a semana começa na segunda): o domingo. */
export function domingoDaSemana(hoje: DataLocal): DataLocal {
  return somarDias(segundaDaSemana(hoje), 6)
}

/**
 * Minhas abertas por prazo (estadoPrazo, API.md §5.2): atrasadas, hoje, esta semana (de amanhã até domingo), depois e
 * sem prazo. As com o cliente (estado `pausado`) nunca são atrasadas: vão para "depois" (com prazo) ou "sem prazo".
 */
export function minhasPorPrazo(demandas: readonly Demanda[], papelDe: PapelDe, euId: Id, agora: Date): MinhasPorPrazo {
  const grupos: Record<keyof MinhasPorPrazo, Demanda[]> = { atrasadas: [], hoje: [], semana: [], depois: [], semPrazo: [] }
  const domingo = domingoDaSemana(hojeSP(agora))
  for (const d of demandas) {
    if (d.concluidaEm || d.arquivadoEm || !ehMinha(d, euId)) continue
    switch (estadoPrazo(d, { papel: papelDe(d.colunaId) }, agora)) {
      case 'atrasada': grupos.atrasadas.push(d); break
      case 'hoje': grupos.hoje.push(d); break
      case 'em_dia': (d.prazo! <= domingo ? grupos.semana : grupos.depois).push(d); break
      case 'pausado': (d.prazo ? grupos.depois : grupos.semPrazo).push(d); break
      case 'sem_prazo': grupos.semPrazo.push(d); break
      case 'concluida': break
    }
  }
  const ids = (l: Demanda[]) => l.sort(porPrazo).map((d) => d.id)
  return { atrasadas: ids(grupos.atrasadas), hoje: ids(grupos.hoje), semana: ids(grupos.semana), depois: ids(grupos.depois), semPrazo: ids(grupos.semPrazo) }
}

/** "3 atrasadas · 2 para hoje · 4 com o cliente" (das minhas abertas). */
export function resumoInicio(minhas: MinhasPorPrazo, demandas: readonly Demanda[], papelDe: PapelDe, euId: Id):
  { atrasadas: number; hoje: number; comCliente: number } {
  let comCliente = 0
  for (const d of demandas) {
    if (d.concluidaEm || d.arquivadoEm || !ehMinha(d, euId)) continue
    if (comQuemEsta(d, { papel: papelDe(d.colunaId) }) === 'cliente') comCliente++
  }
  return { atrasadas: minhas.atrasadas.length, hoje: minhas.hoje.length, comCliente }
}

/**
 * As do meu atendimento (AM) com o cliente há MAIS de `limiteDiasUteis` dias úteis (paradoHa: desde o envio, senão
 * desde a entrada na coluna aguardando_cliente; feriado não conta). Decisão registrada devolve a bola e tira daqui.
 * Mais antigas primeiro.
 */
export function comClienteParado(demandas: readonly Demanda[], papelDe: PapelDe, euId: Id, agora: Date,
  feriados: ReadonlySet<string>, limiteDiasUteis: number): { id: Id; dias: number }[] {
  const saida: { id: Id; dias: number; numero: number }[] = []
  for (const d of demandas) {
    if (d.concluidaEm || d.arquivadoEm || d.atendimentoId !== euId) continue
    // paradoHa só lê as datas e o papel da coluna
    const { comQuem, dias } = paradoHa(d, { papel: papelDe(d.colunaId) } as Coluna, agora, feriados)
    if (comQuem === 'cliente' && dias > limiteDiasUteis) saida.push({ id: d.id, dias, numero: d.numero })
  }
  return saida.sort((a, b) => b.dias - a.dias || a.numero - b.numero).map(({ id, dias }) => ({ id, dias }))
}

// ─────────────────────────────── Agenda ───────────────────────────────

/** Máximo de dias entre `de` e `ate` na Agenda (inclusive: 62 = dois meses de 31). */
export const AGENDA_MAX_DIAS = 62

/** Dias de `de` a `ate`, inclusive (0 se `ate` vier antes). */
export function diasNoIntervalo(de: DataLocal, ate: DataLocal): number {
  return ate < de ? 0 : diasEntre(de, ate) + 1
}

const DATA_DO_CAMPO = {
  prazo: (d: Demanda) => [d.prazo, d.prazoHora] as const,
  inicio: (d: Demanda) => [d.inicio, d.inicioHora] as const,
  publicacao: (d: Demanda) => [d.publicacaoData, d.publicacaoHora] as const,
}

/** Data, hora (sem hora por último no dia) e número. */
export function porDataDoItem(a: ItemAgenda & { numero: number }, b: ItemAgenda & { numero: number }): number {
  return a.data.localeCompare(b.data) || (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99') || a.numero - b.numero
}

/**
 * Itens da Agenda: cada data pedida (`campos`, padrão prazo) dentro de `de`..`ate`, das demandas não arquivadas dos
 * quadros pedidos (todos sem `quadroIds`), só as minhas com `soMinhas`, concluídas incluídas por padrão.
 */
export function itensAgenda(demandas: readonly Demanda[], c: AgendaConsulta, euId: Id): ItemAgenda[] {
  const campos = c.campos && c.campos.length > 0 ? [...new Set(c.campos)] : ['prazo' as const]
  const quadros = c.quadroIds && c.quadroIds.length > 0 ? new Set(c.quadroIds) : null
  const incluirConcluidas = c.incluirConcluidas ?? true
  const itens: (ItemAgenda & { numero: number })[] = []
  for (const d of demandas) {
    if (d.arquivadoEm) continue
    if (quadros && !quadros.has(d.quadroId)) continue
    if (!incluirConcluidas && d.concluidaEm) continue
    if (c.soMinhas && !ehMinha(d, euId)) continue
    for (const campo of campos) {
      const [data, hora] = DATA_DO_CAMPO[campo](d)
      if (!data || data < c.de || data > c.ate) continue
      itens.push({ demandaId: d.id, campo, data, hora, numero: d.numero })
    }
  }
  return itens.sort(porDataDoItem).map(({ numero: _n, ...i }) => i)
}

// ─────────────────────────────── horas ───────────────────────────────

/** "45 min", "1h", "1h30", "12h05". */
export function formatarDuracao(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`
}

/**
 * Duração digitada → minutos (1 a 1440), ou null se não der para entender: "90", "45min", "1h", "1h30", "1h 30min",
 * "1:30", "1,5h", "1.5 h", "2 horas".
 */
export function lerDuracao(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null
  let min: number | null = null
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d{1,2}):([0-5]\d)$/))) min = Number(m[1]) * 60 + Number(m[2])
  else if ((m = t.match(/^(\d{1,4}) ?(?:m|min|mins|minutos?)?$/))) min = Number(m[1])
  else if ((m = t.match(/^(\d{1,2})(?:[.,](\d{1,2}))? ?(?:h|hs|hora|horas)$/))) min = Math.round((Number(m[1]) + Number(`0.${m[2] ?? '0'}`)) * 60)
  else if ((m = t.match(/^(\d{1,2}) ?(?:h|hs|hora|horas) ?(?:e )?(\d{1,2}) ?(?:m|min|mins|minutos?)?$/))) {
    if (Number(m[2]) < 60) min = Number(m[1]) * 60 + Number(m[2])
  }
  return min !== null && min >= 1 && min <= 1440 ? min : null
}

// ─────────────────────────────── Primeiros passos ───────────────────────────────

const ROTULO_PASSO: Record<PassoInicial, string> = {
  convidar_equipe: 'Convidar a equipe',
  criar_quadros: 'Criar os quadros das equipes',
  cadastrar_clientes: 'Cadastrar os clientes',
  revisar_modelos: 'Revisar os modelos de demanda',
}

const CAMINHO_PASSO: Record<PassoInicial, string> = {
  convidar_equipe: '/config/pessoas',
  criar_quadros: '/quadros/novo?equipes=1',
  cadastrar_clientes: '/clientes',
  revisar_modelos: '/config/modelos',
}

/**
 * Primeiros passos do admin (API.md §4.18), na ordem de PASSOS_INICIAIS: 2+ pessoas ativas; 1+ quadro ativo; 1+
 * cliente fora de 'ex' e nenhum deles sem AM; "Revisei os modelos" apertado. Tudo feito: null (o bloco some).
 */
export function primeirosPassos(d: { usuariosAtivos: number; quadrosAtivos: number; clientesAtivos: number;
  clientesSemAm: number; modelosRevisadosEm: string | null }): PrimeirosPassos | null {
  const feito: Record<PassoInicial, boolean> = {
    convidar_equipe: d.usuariosAtivos >= 2,
    criar_quadros: d.quadrosAtivos >= 1,
    cadastrar_clientes: d.clientesAtivos >= 1 && d.clientesSemAm === 0,
    revisar_modelos: d.modelosRevisadosEm !== null,
  }
  const itens = PASSOS_INICIAIS.map((id) => ({ id, rotulo: ROTULO_PASSO[id], caminho: CAMINHO_PASSO[id], feito: feito[id] }))
  const concluido = itens.every((i) => i.feito)
  return concluido ? null : { itens, concluido }
}
