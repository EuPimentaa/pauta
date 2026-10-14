/** /dev/ui: catálogo do design system (só em desenvolvimento; o build de produção não inclui a tela). */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rotas: ExtensaoRota[] = import.meta.env.DEV
  ? [{ caminho: '/dev/ui', carregar: () => import('./TelaCatalogo.tsx'), acesso: 'publica', layout: 'vazio', titulo: 'Design system' }]
  : []
