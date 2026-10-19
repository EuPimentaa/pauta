/** Aba "Resultados" da página do cliente (F8, ordem 150, todos os internos): os números da Windsor do cliente. */
import type { ExtensaoAbaCliente } from '../tipos.ts'

export const aba: ExtensaoAbaCliente = {
  id: 'resultados', rotulo: 'Resultados', ordem: 150,
  carregar: () => import('../../funcionalidades/resultados/AbaResultados.tsx'),
}
