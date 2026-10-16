/** /d/:numero: o modal da demanda (NÚCLEO-WEB), sobreposto à tela de antes. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/d/:numero',
  carregar: () => import('./TelaDemanda.tsx'),
  acesso: 'autenticada',
  layout: 'sobreposta',
  titulo: 'Demanda',
}
