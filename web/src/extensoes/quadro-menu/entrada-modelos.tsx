/** "Modelos deste quadro" no menu ··· do quadro (F4; ordem 400): abre /config/modelos com o quadro escolhido. */
import { LayoutTemplate } from 'lucide-react'
import type { ExtensaoMenuQuadro } from '../tipos.ts'

export const itens: ExtensaoMenuQuadro[] = [
  {
    id: 'entrada-modelos', ordem: 400, rotulo: 'Modelos deste quadro', icone: LayoutTemplate,
    executar: (ctx, acao) => acao.navegar(`/config/modelos?quadro=${encodeURIComponent(ctx.quadro.id)}`),
  },
]
