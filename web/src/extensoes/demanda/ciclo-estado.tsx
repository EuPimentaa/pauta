/** Ciclo (F2): a linha do estado do ciclo no topo do modal (integração 3B), em demandas com versão entregue. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'ciclo-estado', ordem: 100, coluna: 'topo',
  visivel: (ctx) => ctx.demanda.nVersoes > 0,
  carregar: () => import('../../funcionalidades/ciclo/EstadoTopo.tsx'),
}
