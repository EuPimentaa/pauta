/** Menu do avatar: "Sua conta" (nome, apelido, cor e senha em Configurações › Sua conta; F5, integração 3A, ordem 100). */
import { useNavigate } from 'react-router'
import { UserRound } from 'lucide-react'
import type { ExtensaoAvatar } from '../tipos.ts'

function SuaConta({ fechar }: { fechar(): void }) {
  const navegar = useNavigate()
  return (
    <button type="button" className="ui-menu-item" onClick={() => { fechar(); navegar('/config/conta') }}>
      <UserRound aria-hidden="true" />
      <span className="ui-menu-item-rotulo">Sua conta: nome, cor e senha</span>
    </button>
  )
}

export const avatar: ExtensaoAvatar = { id: 'cadastros-conta', ordem: 100, Componente: SuaConta }
