/** Membros (lateral 100): avatares (e os nomes, até 2) e o popover `membros`; "Entrar" quando não sou membro (Espaço). */
import { Users } from 'lucide-react'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { PilhaAvatares } from '../../../ui/Avatar.tsx'
import { Tooltip } from '../../../ui/Tooltip.tsx'
import { Propriedade, Vazio, nomeCurto, useUsuarios } from '../comum.tsx'

export default function Membros({ ctx }: { ctx: ContextoDemanda }) {
  const usuarios = useUsuarios()
  const acoes = useAcoes()
  const d = ctx.demanda
  const membros = d.membroIds.map((id) => usuarios.find((u) => u.id === id)).filter((u) => !!u)
  const eu = ctx.eu.usuario.id
  const entrar = !ctx.somenteLeitura && !d.membroIds.includes(eu)
  return (
    <Propriedade id="membros" icone={Users} rotulo="Membros" atalho="M" desabilitado={ctx.somenteLeitura}
      abrir={(ancora) => void abrirDialogo('membros', { demandaId: d.id }, { ancora })}
      extra={entrar && (
        <Tooltip texto="Entrar na demanda" atalho="space">
          <button type="button" className="mdl-entrar" onClick={() => void acoes.membros.entrar(d, eu)}>Entrar</button>
        </Tooltip>
      )}>
      {membros.length ? (
        <>
          <PilhaAvatares pessoas={membros} max={4} tamanho={24} borda="var(--surface-raised)" />
          {membros.length <= 2 && <span>{membros.map(nomeCurto).join(', ')}</span>}
        </>
      ) : <Vazio>Ninguém ainda</Vazio>}
    </Propriedade>
  )
}
