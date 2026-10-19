/**
 * Tempo real dos resultados (F8; API.md §F.10): `resultado_cliente` (contas ligadas ou desligadas, busca na Windsor
 * começou ou terminou) invalida os resultados e as contas do cliente, a carteira e a lista de contas da Windsor (que
 * mostra os clientes de cada conta). Os números não viajam no evento: a tela pede de novo. O fim de uma busca fica
 * marcado (marcarFimDaBusca): o GET que voltar "atualizando" depois dele pede de novo na hora.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { EstadoResultadosCliente, EventoTempoReal } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { chavesResultados, marcarFimDaBusca } from '../../funcionalidades/resultados/api.ts'

function tratar(ev: EventoTempoReal, qc: QueryClient): void {
  if (ev.e !== 'resultado_cliente') return
  if (ev.op === 'upsert' && !(ev.p as EstadoResultadosCliente | null)?.atualizando) marcarFimDaBusca(ev.id)
  void qc.invalidateQueries({ queryKey: chavesResultados.cliente(ev.id) })
  void qc.invalidateQueries({ queryKey: chavesResultados.todasPanorama })
  void qc.invalidateQueries({ queryKey: chavesResultados.contasWindsor })
}

export const tratador: TratadorEventos = { id: 'resultados', entidades: ['resultado_cliente'], tratar }
