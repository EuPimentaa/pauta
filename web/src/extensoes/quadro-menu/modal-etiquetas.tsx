/** Modal (F1): "Etiquetas do quadro" no menu ··· do quadro (ordem 200): criar, renomear, cor e excluir. */
import { Tag } from 'lucide-react'
import type { ExtensaoMenuQuadro } from '../tipos.ts'

export const itens: ExtensaoMenuQuadro[] = [
  {
    id: 'modal-etiquetas', ordem: 200, rotulo: 'Etiquetas do quadro', icone: Tag,
    executar: (ctx, acao) => { void acao.abrirDialogo('etiquetas', { quadroId: ctx.quadro.id }) },
  },
]
