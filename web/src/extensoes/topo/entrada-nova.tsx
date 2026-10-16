/** Botão laranja "+ Nova demanda" da barra superior (F4; à direita, ordem 100): o único primário da casca. */
import { Plus } from 'lucide-react'
import type { ExtensaoTopo } from '../tipos.ts'
import { useContextoAcao } from '../../dialogos/index.ts'
import { Botao } from '../../ui/Botao.tsx'

function BotaoNovaDemanda() {
  const ctx = useContextoAcao()
  return (
    <Botao variante="primario" tamanho="p" icone={Plus} atalho="shift+n" dica="Nova demanda" className="entrada-topo-nova"
      aria-haspopup="dialog" onClick={() => void ctx.abrirDialogo('nova-demanda', { quadroId: ctx.quadroAtual?.id })}>
      Nova demanda
    </Botao>
  )
}

export const topo: ExtensaoTopo = { id: 'entrada-nova', ordem: 100, lado: 'direita', Componente: BotaoNovaDemanda }
