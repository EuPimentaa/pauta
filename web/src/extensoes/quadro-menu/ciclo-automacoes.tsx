/** Ciclo (F2): "Automações" no menu ··· do quadro (ordem 300). Todos veem; atendimento e admin mudam. */
import { Workflow } from 'lucide-react'
import type { ExtensaoMenuQuadro } from '../tipos.ts'

export const itens: ExtensaoMenuQuadro[] = [
  {
    id: 'ciclo-automacoes', ordem: 300, rotulo: 'Automações', icone: Workflow,
    executar: (ctx, acao) => { void acao.abrirDialogo('automacoes-quadro', { quadroId: ctx.quadro.id }) },
  },
]
