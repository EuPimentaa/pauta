/**
 * Só DEV: /dev/cadastros-inicio desenha as seções do Início (secoesInicio()) para conferir os Primeiros passos do F5
 * antes de o Início do F3 chegar. Fora do DEV não existe.
 */
import type { ExtensaoRota } from '../../../extensoes/tipos.ts'

export const rotas: ExtensaoRota[] = import.meta.env.DEV ? [{
  caminho: '/dev/cadastros-inicio', carregar: () => import('./TelaInicioDev.tsx'), acesso: 'autenticada', layout: 'casca', titulo: 'Início (teste)',
}] : []
