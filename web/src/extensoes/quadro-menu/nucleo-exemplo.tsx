/** Só DEV (/dev/extensoes): item do menu ··· do quadro vindo de uma "funcionalidade". */
import { FlaskConical } from 'lucide-react'
import type { ExtensaoMenuQuadro } from '../tipos.ts'
import { anotar } from '../../telas/dev-extensoes/exemplos.ts'

export const itens: ExtensaoMenuQuadro[] = [
  { id: 'nucleo-exemplo-quadro', ordem: 500, rotulo: 'Exemplo do quadro', icone: FlaskConical,
    executar: (ctx) => anotar(`menu do quadro ${ctx.quadro.nome}: ${ctx.colunas.length} colunas`) },
]
