/** Telas de acesso: públicas, sem casca (nada de bootstrap, SSE ou registro de extensões). */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rotas: ExtensaoRota[] = [
  { caminho: '/entrar', carregar: () => import('./TelaEntrar.tsx'), acesso: 'publica', layout: 'vazio', titulo: 'Entrar' },
  { caminho: '/convite', carregar: () => import('./TelaConvite.tsx'), acesso: 'publica', layout: 'vazio', titulo: 'Convite' },
  { caminho: '/redefinir', carregar: () => import('./TelaRedefinir.tsx'), acesso: 'publica', layout: 'vazio', titulo: 'Nova senha' },
]
