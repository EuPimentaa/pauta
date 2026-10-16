/** /dev/extensoes (só DEV): os hosts do NÚCLEO-WEB com as contribuições de exemplo (PLANO §2, "Hosts testados"). */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rotas: ExtensaoRota[] = import.meta.env.DEV
  ? [{ caminho: '/dev/extensoes', carregar: () => import('./TelaExtensoes.tsx'), acesso: 'autenticada', layout: 'casca', titulo: 'Extensões' }]
  : []
