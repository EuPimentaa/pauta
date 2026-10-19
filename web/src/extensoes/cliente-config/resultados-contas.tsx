/** "Contas de resultados" na aba Configurações do cliente (F8, ordem 100): ligar e desligar as contas da Windsor. */
import type { ExtensaoSecaoCliente } from '../tipos.ts'

export const secao: ExtensaoSecaoCliente = {
  id: 'resultados-contas', ordem: 100,
  carregar: () => import('../../funcionalidades/resultados/ContasCliente.tsx'),
}
