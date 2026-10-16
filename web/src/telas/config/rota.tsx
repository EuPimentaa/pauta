/** /config e /config/:caminho: o host das seções de Configurações (NÚCLEO-WEB); as seções vêm do F4 e do F5. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

const carregar = () => import('./TelaConfig.tsx')

export const rotas: ExtensaoRota[] = [
  { caminho: '/config', carregar, acesso: 'autenticada', layout: 'casca', titulo: 'Configurações' },
  { caminho: '/config/:caminho', carregar, acesso: 'autenticada', layout: 'casca', titulo: 'Configurações' },
]
