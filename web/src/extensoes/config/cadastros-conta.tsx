/**
 * Configurações › Sua conta (F5, todos; integração 3A, ordem 50, antes de Pessoas): nome, apelido, cor e senha. O
 * menu do avatar tem o atalho "Sua conta" para cá (extensoes/avatar/cadastros-conta.tsx).
 */
import { UserRound } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'cadastros-conta', rotulo: 'Sua conta', ordem: 50, caminho: 'conta', acesso: ['admin', 'atendimento', 'equipe'], icone: UserRound,
  carregar: () => import('../../funcionalidades/cadastros/ConfigConta.tsx'),
}
