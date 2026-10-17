/**
 * Prazos padrão do ciclo da peça (API.md §4.16 e §5.7), puros: o servidor grava com eles e as telas de enviar e de
 * registrar o retorno mostram o mesmo valor antes de mandar.
 */
import type { DataLocal } from '../tipos/nucleo.ts'
import { diaUtilAnterior, somarDiasUteis } from './datas.ts'

/**
 * Prazo de retorno do cliente: hoje + `diasUteis` (retornoPrazoDiasUteis), sem passar da véspera útil da publicação
 * (e nunca antes de hoje).
 */
export function prazoRetornoPadrao(hoje: DataLocal, diasUteis: number, publicacao: DataLocal | null, feriados: ReadonlySet<string>): DataLocal {
  let prazo = somarDiasUteis(hoje, diasUteis, feriados)
  if (publicacao) {
    const vespera = diaUtilAnterior(publicacao, feriados)
    if (vespera < prazo) prazo = vespera < hoje ? hoje : vespera
  }
  return prazo
}

/** Prazo da rodada de ajuste: hoje + `diasUteis` (ajustePrazoDiasUteis), pulando fim de semana e feriado. */
export function prazoAjustePadrao(hoje: DataLocal, diasUteis: number, feriados: ReadonlySet<string>): DataLocal {
  return somarDiasUteis(hoje, diasUteis, feriados)
}
