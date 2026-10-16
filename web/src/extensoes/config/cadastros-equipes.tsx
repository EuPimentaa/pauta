/** Configurações › Equipes (F5, admin; PLANO §4: ordem 200). */
import { UsersRound } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'cadastros-equipes', rotulo: 'Equipes', ordem: 200, caminho: 'equipes', acesso: ['admin'], icone: UsersRound,
  carregar: () => import('../../funcionalidades/cadastros/ConfigEquipes.tsx'),
}
