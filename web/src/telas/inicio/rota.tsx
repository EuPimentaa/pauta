/**
 * /inicio (F3): minhas demandas por prazo, com o cliente há mais de N dias úteis (atendimento), menções recentes e as
 * seções de outras funcionalidades (os Primeiros passos do admin vêm do F5 por extensoes/inicio).
 */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/inicio',
  carregar: () => import('./TelaInicio.tsx'),
  acesso: 'autenticada',
  layout: 'casca',
  titulo: 'Início',
}
