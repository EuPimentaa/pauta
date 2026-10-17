/**
 * /horas (F3): as minhas horas da semana (total por dia, editar, excluir, lançar tempo); atendimento e admin veem o
 * total por cliente no mês; o admin, o total por pessoa e as horas de qualquer pessoa.
 */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/horas',
  carregar: () => import('./TelaHoras.tsx'),
  acesso: 'autenticada',
  layout: 'casca',
  titulo: 'Horas',
}
