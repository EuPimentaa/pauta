/** Estado do prazo (API.md §5.2) e prazos da repetição e dos modelos (§5.3). Puro. */
import type { Coluna } from '../tipos/quadros.ts'
import type { Demanda, EstadoPrazo } from '../tipos/demandas.ts'
import { HORA_PADRAO_PRAZO, type DataLocal, type Repeticao } from '../tipos/nucleo.ts'
import { diaUtilOuProximo, hojeSP, instanteSP, proximoDiaUtil, somarDias, somarDiasUteis, ultimoDiaDoMes } from './datas.ts'
import { comQuemEsta } from './quadro.ts'

export type DemandaPrazo = Pick<Demanda, 'prazo' | 'prazoHora' | 'concluidaEm' | 'envioPendenteEm' | 'retornoEm' | 'statusDesde'>

/**
 * concluída → 'concluida'; com o cliente → 'pausado' (nunca atrasada); sem prazo → 'sem_prazo'; senão prazo +
 * prazoHora (18:00 sem hora) contra agora: passou → 'atrasada'; é hoje → 'hoje'; senão 'em_dia'.
 */
export function estadoPrazo(d: DemandaPrazo, coluna: Pick<Coluna, 'papel'>, agora: Date): EstadoPrazo {
  const comQuem = comQuemEsta(d, coluna)
  if (comQuem === 'concluida') return 'concluida'
  if (comQuem === 'cliente') return 'pausado'
  if (!d.prazo) return 'sem_prazo'
  const limite = instanteSP(d.prazo, d.prazoHora ?? HORA_PADRAO_PRAZO)
  if (agora.getTime() > limite.getTime()) return 'atrasada'
  return hojeSP(agora) === d.prazo ? 'hoje' : 'em_dia'
}

/**
 * Prazo da próxima demanda da repetição: diária = o próximo dia útil; semanal = +7 dias; mensal = o mesmo dia do
 * mês seguinte (31 → último dia). Semanal e mensal caindo em dia não útil vão para o próximo dia útil.
 */
export function proximoPrazo(prazo: DataLocal, repetir: Exclude<Repeticao, 'nenhuma'>, feriados: ReadonlySet<string>): DataLocal {
  if (repetir === 'diaria') return proximoDiaUtil(prazo, feriados)
  if (repetir === 'semanal') return diaUtilOuProximo(somarDias(prazo, 7), feriados)
  const [a, m, d] = prazo.split('-').map(Number) as [number, number, number]
  const ano = m === 12 ? a + 1 : a
  const mes = m === 12 ? 1 : m + 1
  const dia = Math.min(d, ultimoDiaDoMes(ano, mes))
  return diaUtilOuProximo(`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, feriados)
}

/** Prazo sugerido pelo modelo: hoje + N dias úteis (nulo = o modelo não sugere prazo). */
export function prazoDoModelo(hoje: DataLocal, diasUteis: number | null, feriados: ReadonlySet<string>): DataLocal | null {
  return diasUteis === null ? null : somarDiasUteis(hoje, diasUteis, feriados)
}
