/**
 * /inicio PROVISÓRIO (integração 3A), até o Início do F3 chegar: sem ele, a rota inicial (Eu.rotaInicial) era
 * "Página não encontrada" para todo mundo depois de entrar ou aceitar o convite. O F3 substitui esta pasta inteira
 * (web/src/telas/inicio/** é dele, PLANO §3) e apaga a rota de DEV /dev/cadastros-inicio.
 */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/inicio',
  carregar: () => import('./TelaInicioProvisoria.tsx'),
  acesso: 'autenticada',
  layout: 'casca',
  titulo: 'Início',
}
