/**
 * Fase 2 (F8): as datas de cada período dos resultados da Windsor (API.md §F.8; shared/tipos/resultados.ts). Puro: o
 * servidor calcula com `hojeSP(agora())`, a tela só mostra o que a API devolveu.
 *
 * Todos terminam ONTEM (dias fechados): hoje pela metade mostraria queda falsa todo dia.
 * - 7d / 30d / 90d: os N dias que terminam ontem; comparação = os N dias logo antes;
 * - este_mes: do dia 1 até ontem; comparação = os mesmos dias do mês anterior (o dia que não existe vira o último dia
 *   do mês: em 31/03, 01/03–30/03 × 01/02–28/02). No dia 1 o mês ainda não tem dia fechado: vale `mes_passado`;
 * - mes_passado: o mês anterior inteiro; comparação = o mês retrasado inteiro.
 */
import type { DataLocal } from '../tipos/nucleo.ts'
import type { PeriodoResultados } from '../tipos/resultados.ts'
import { diasEntre, somarDias, ultimoDiaDoMes } from './datas.ts'

export interface DatasPeriodo {
  /** O período efetivo (no dia 1, `este_mes` vira `mes_passado`). */
  periodo: PeriodoResultados
  de: DataLocal
  ate: DataLocal
  deAnterior: DataLocal
  ateAnterior: DataLocal
}

const DIAS: Record<'7d' | '30d' | '90d', number> = { '7d': 7, '30d': 30, '90d': 90 }

const dd = (n: number) => String(n).padStart(2, '0')
const data = (ano: number, mes: number, dia: number): DataLocal => `${ano}-${dd(mes)}-${dd(dia)}`

/** Ano e mês (1–12) somando `n` meses. */
function mesMais(ano: number, mes: number, n: number): [number, number] {
  const total = ano * 12 + (mes - 1) + n
  return [Math.floor(total / 12), (total % 12) + 1]
}

/** O mês inteiro de `ano`/`mes`. */
function mesInteiro(ano: number, mes: number): [DataLocal, DataLocal] {
  return [data(ano, mes, 1), data(ano, mes, ultimoDiaDoMes(ano, mes))]
}

/** As datas do período pedido, a partir do dia de hoje em São Paulo. */
export function periodoDe(periodo: PeriodoResultados, hoje: DataLocal): DatasPeriodo {
  const [ano, mes, dia] = hoje.split('-').map(Number) as [number, number, number]
  const ontem = somarDias(hoje, -1)
  if (periodo === '7d' || periodo === '30d' || periodo === '90d') {
    const n = DIAS[periodo]
    const de = somarDias(ontem, -(n - 1))
    const ateAnterior = somarDias(de, -1)
    return { periodo, de, ate: ontem, deAnterior: somarDias(ateAnterior, -(n - 1)), ateAnterior }
  }
  if (periodo === 'este_mes' && dia > 1) {
    const [aA, mA] = mesMais(ano, mes, -1)
    const ultimoDia = dia - 1
    return {
      periodo, de: data(ano, mes, 1), ate: ontem,
      deAnterior: data(aA, mA, 1), ateAnterior: data(aA, mA, Math.min(ultimoDia, ultimoDiaDoMes(aA, mA))),
    }
  }
  const [aP, mP] = mesMais(ano, mes, -1)
  const [aR, mR] = mesMais(ano, mes, -2)
  const [de, ate] = mesInteiro(aP, mP)
  const [deAnterior, ateAnterior] = mesInteiro(aR, mR)
  return { periodo: 'mes_passado', de, ate, deAnterior, ateAnterior }
}

/** No dia 1, "Este mês" não tem dia fechado (a tela desabilita o chip: "o mês começa a contar amanhã"). */
export function esteMesDisponivel(hoje: DataLocal): boolean {
  return !hoje.endsWith('-01')
}

/** Os dias de `de` a `ate`, inclusive. */
export function diasDe(de: DataLocal, ate: DataLocal): DataLocal[] {
  const n = diasEntre(de, ate)
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => somarDias(de, i))
}

/** "20/08–18/09" (com o ano quando os dois anos diferem de `anoAtual`: "20/12/2025–18/01/2026"). */
export function rotuloIntervalo(de: DataLocal, ate: DataLocal, anoAtual?: string): string {
  const curto = (d: DataLocal) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const longo = (d: DataLocal) => `${curto(d)}/${d.slice(0, 4)}`
  const comAno = anoAtual !== undefined && (de.slice(0, 4) !== anoAtual || ate.slice(0, 4) !== anoAtual)
  return comAno ? `${longo(de)}–${longo(ate)}` : `${curto(de)}–${curto(ate)}`
}

/**
 * Validade do cache (API.md §F.8): 3 h; período que terminou há mais de 3 dias, 24 h (a Windsor não rebusca esses dias).
 */
export function validadeCacheMs(ate: DataLocal, hoje: DataLocal): number {
  return diasEntre(ate, hoje) > 3 ? 24 * 3_600_000 : 3 * 3_600_000
}
