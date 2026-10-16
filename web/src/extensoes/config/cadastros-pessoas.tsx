/** Configurações › Pessoas (F5, admin; PLANO §4: ordem 100). */
import { Users } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'cadastros-pessoas', rotulo: 'Pessoas', ordem: 100, caminho: 'pessoas', acesso: ['admin'], icone: Users,
  carregar: () => import('../../funcionalidades/cadastros/ConfigPessoas.tsx'),
}
