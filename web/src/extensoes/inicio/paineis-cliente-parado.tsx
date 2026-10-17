/** Início · Com o cliente há mais de N dias úteis (F3, ordem 200): atendimento e admin. */
import type { ExtensaoSecaoInicio } from '../tipos.ts'

export const secao: ExtensaoSecaoInicio = {
  id: 'paineis-cliente-parado',
  ordem: 200,
  visivel: (eu) => eu.usuario.papel === 'atendimento' || eu.usuario.papel === 'admin',
  carregar: () => import('../../funcionalidades/paineis/SecaoClienteParado.tsx'),
}
