/**
 * Itens de fora do Pauta no calendário (Fase 2, F9; FASE2-PLANO §3): como cada dia mistura os prazos com os eventos das
 * agendas externas. Puro (os testes do servidor importam; só caminhos relativos).
 * - Mês: os prazos têm prioridade. As demandas ocupam as vagas da célula (com o "+N" da grade) e os externos do dia
 *   viram UMA linha depois delas: o próprio evento quando é um só, senão "3 eventos" (abre a lista do dia).
 * - Semana e a lista do celular: tudo, com os de dia inteiro no topo e o resto por horário.
 */
import type { HoraLocal } from '../../../shared/tipos/index.ts'

/** O mínimo que a ordenação precisa saber de um item de demanda e de um externo. */
export interface ComHora {
  hora: HoraLocal | null
}

export type EntradaDia<D, E> =
  | { tipo: 'demanda'; item: D }
  | { tipo: 'externo'; item: E }
  | { tipo: 'resumo'; itens: E[] }

/** Externos: dia inteiro (e dias do meio) primeiro, depois pela hora; empate pelo título. */
export function porHoraExterno<E extends ComHora & { titulo: string }>(a: E, b: E): number {
  return (a.hora ?? '').localeCompare(b.hora ?? '') || a.titulo.localeCompare(b.titulo)
}

/**
 * Mês: as demandas (já ordenadas por quem chama) e, depois, a linha dos externos. A grade corta as demandas no limite
 * da célula; a linha dos externos fica fora do corte (vai no rodapé do dia).
 */
export function diaDoMes<D, E extends ComHora & { titulo: string }>(demandas: D[], externos: E[]):
  { demandas: D[]; rodape: EntradaDia<D, E> | null } {
  const ordenados = [...externos].sort(porHoraExterno)
  const rodape: EntradaDia<D, E> | null = ordenados.length === 0 ? null
    : ordenados.length === 1 ? { tipo: 'externo', item: ordenados[0]! } : { tipo: 'resumo', itens: ordenados }
  return { demandas, rodape }
}

/**
 * Semana e lista do celular: os externos de dia inteiro (e os dias do meio) no topo; depois demandas e externos juntos
 * pelo horário (no empate, a demanda primeiro), com as demandas sem hora no fim, como sempre foram. As demandas chegam
 * já ordenadas (hora, número) e mantêm essa ordem entre si: sem externos, o dia fica exatamente como antes da Fase 2.
 */
export function diaPorHorario<D extends ComHora, E extends ComHora & { titulo: string }>(demandas: D[], externos: E[]): EntradaDia<D, E>[] {
  if (externos.length === 0) return demandas.map((item) => ({ tipo: 'demanda', item }))
  const ext = [...externos].sort(porHoraExterno)
  const topo = ext.filter((e) => e.hora === null).map((item): EntradaDia<D, E> => ({ tipo: 'externo', item }))
  const resto: { chave: HoraLocal; ordem: number; e: EntradaDia<D, E> }[] = [
    ...demandas.map((item, i) => ({ chave: item.hora ?? '99:99', ordem: i, e: { tipo: 'demanda', item } as EntradaDia<D, E> })),
    ...ext.filter((e) => e.hora !== null).map((item, i) => ({ chave: item.hora!, ordem: 100_000 + i, e: { tipo: 'externo', item } as EntradaDia<D, E> })),
  ]
  resto.sort((a, b) => a.chave.localeCompare(b.chave) || a.ordem - b.ordem)
  return [...topo, ...resto.map((x) => x.e)]
}

/** "1 evento", "3 eventos". */
export function rotuloResumo(n: number): string {
  return `${n} ${n === 1 ? 'evento' : 'eventos'}`
}
