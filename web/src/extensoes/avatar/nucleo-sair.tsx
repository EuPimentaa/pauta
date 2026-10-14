/** Menu do avatar: Sair (encerra a sessão e volta para /entrar). */
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import type { ExtensaoAvatar } from '../tipos.ts'
import { useSair } from '../../api/auth.ts'

function Sair({ fechar }: { fechar(): void }) {
  const sair = useSair()
  const [saindo, setSaindo] = useState(false)
  return (
    <button type="button" className="ui-menu-item" disabled={saindo} aria-busy={saindo || undefined}
      onClick={() => { setSaindo(true); fechar(); void sair() }}>
      <LogOut aria-hidden="true" />
      <span className="ui-menu-item-rotulo">{saindo ? 'Saindo…' : 'Sair'}</span>
    </button>
  )
}

export const avatar: ExtensaoAvatar = { id: 'nucleo-sair', ordem: 900, Componente: Sair }
