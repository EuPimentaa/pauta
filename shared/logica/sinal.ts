/**
 * O único sinal do card (PLANO §2, "um sinal"), em ordem de importância:
 *   atrasada  >  com o cliente há N  >  parado há N  >  rodada extra.
 * Puro: o card do quadro, a Lista e o Início mostram o mesmo sinal. Concluída não tem sinal.
 *
 * - atrasada: estadoPrazo = 'atrasada' (com o cliente nunca é, API.md §5.2); `dias` corridos desde o prazo
 *   (0 = venceu hoje, depois da hora).
 * - cliente: a bola está com o cliente (comQuemEsta) há pelo menos 1 dia útil, desde coalesce(envioPendenteEm,
 *   statusDesde) (§5.4).
 * - parado: a bola está com a equipe há MAIS de `paradoLimiteDiasUteis` dias úteis desde a última troca de coluna.
 * - extra: a rodada atual passou das inclusas ("R3/2 · extra").
 */
import type { Demanda } from '../tipos/demandas.ts'
import type { Coluna } from '../tipos/quadros.ts'
import { diasEntre, hojeSP } from './datas.ts'
import { estadoPrazo } from './prazo.ts'
import { paradoHa } from './quadro.ts'

export type SinalCard =
  | { tipo: 'atrasada'; dias: number }
  | { tipo: 'cliente'; dias: number }
  | { tipo: 'parado'; dias: number }
  | { tipo: 'extra'; rodada: number; inclusas: number }

export type DemandaSinal = Pick<Demanda,
  'prazo' | 'prazoHora' | 'concluidaEm' | 'envioPendenteEm' | 'retornoEm' | 'statusDesde' | 'rodadaAtual' | 'rodadasInclusas'>

export function sinalDoCard(
  d: DemandaSinal, coluna: Pick<Coluna, 'papel'>, agora: Date, feriados: ReadonlySet<string>,
  limites: { paradoLimiteDiasUteis: number },
): SinalCard | null {
  if (d.concluidaEm) return null
  if (estadoPrazo(d, coluna, agora) === 'atrasada') {
    return { tipo: 'atrasada', dias: Math.max(0, diasEntre(d.prazo!, hojeSP(agora))) }
  }
  // paradoHa só lê as datas e o papel da coluna
  const { comQuem, dias } = paradoHa(d as Demanda, coluna as Coluna, agora, feriados)
  if (comQuem === 'cliente' && dias >= 1) return { tipo: 'cliente', dias }
  if (comQuem === 'equipe' && dias > limites.paradoLimiteDiasUteis) return { tipo: 'parado', dias }
  if (d.rodadaAtual > d.rodadasInclusas) return { tipo: 'extra', rodada: d.rodadaAtual, inclusas: d.rodadasInclusas }
  return null
}

const diasUteis = (n: number) => `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`

/** Texto curto do sinal: "Atrasada há 2 dias", "com o cliente há 3 dias úteis", "parado há 4 dias úteis", "R3/2 · extra". */
export function textoSinal(s: SinalCard): string {
  switch (s.tipo) {
    case 'atrasada': return s.dias === 0 ? 'Venceu hoje' : `Atrasada há ${s.dias} ${s.dias === 1 ? 'dia' : 'dias'}`
    case 'cliente': return `com o cliente há ${diasUteis(s.dias)}`
    case 'parado': return `parado há ${diasUteis(s.dias)}`
    case 'extra': return `R${s.rodada}/${s.inclusas} · extra`
  }
}
