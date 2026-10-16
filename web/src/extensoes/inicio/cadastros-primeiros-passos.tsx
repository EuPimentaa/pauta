/**
 * Início: Primeiros passos do admin (F5, a pedido da orquestração da Onda 3; o Início em si é do F3). Ordem 50, a do
 * PLANO §4 para os primeiros passos: o F3 hospeda e não precisa repetir o bloco (docs/pedidos/cadastros.md).
 */
import type { ExtensaoSecaoInicio } from '../tipos.ts'

export const secao: ExtensaoSecaoInicio = {
  id: 'cadastros-primeiros-passos',
  ordem: 50,
  visivel: (eu) => eu.usuario.papel === 'admin',
  carregar: () => import('../../funcionalidades/cadastros/PrimeirosPassos.tsx'),
}
