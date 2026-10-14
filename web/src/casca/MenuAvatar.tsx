/** Botão do avatar na barra superior e o popover da conta, com as contribuições de extensoes/avatar (tema, sair...). */
import { useState } from 'react'
import { ROTULO_PAPEL } from './rotulos.ts'
import { useEu } from '../api/auth.ts'
import { useRegistro } from '../sessao/registro.ts'
import { Avatar } from '../ui/Avatar.tsx'
import { Popover } from '../ui/Popover.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'

export function MenuAvatar() {
  const eu = useEu()
  const reg = useRegistro()
  const [aberto, setAberto] = useState(false)
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null)
  const u = eu.usuario
  const fechar = () => setAberto(false)
  return (
    <>
      <button ref={setAncora} type="button" className="casca-avatar-botao" aria-haspopup="dialog" aria-expanded={aberto}
        aria-label={`Sua conta: ${u.nome}`} onClick={() => setAberto((a) => !a)}>
        <Avatar pessoa={u} tamanho={30} dica={false} />
      </button>
      <Popover aberto={aberto} aoFechar={fechar} ancora={ancora} alinhar="fim" largura={300} titulo="Sua conta">
        <div className="casca-conta">
          <Avatar pessoa={u} tamanho={40} dica={false} />
          <div className="min-w-0">
            <div className="casca-conta-nome truncate">{u.nome}</div>
            <div className="casca-conta-email">{u.email}</div>
            <span className="casca-conta-papel">{ROTULO_PAPEL[u.papel]}</span>
          </div>
        </div>
        <div className="casca-conta-itens">
          {reg.avatar().map((a) => (
            <LimiteErro key={a.id} nome={`avatar ${a.id}`} fallback={null}>
              <a.Componente fechar={fechar} />
            </LimiteErro>
          ))}
        </div>
      </Popover>
    </>
  )
}
