/** Só DEV (/dev/extensoes): item do menu da coluna vindo de uma "funcionalidade". */
import { FlaskConical } from 'lucide-react'
import type { ExtensaoMenuColuna } from '../tipos.ts'
import { anotar } from '../../telas/dev-extensoes/exemplos.ts'

export const itens: ExtensaoMenuColuna[] = [
  { id: 'nucleo-exemplo-coluna', ordem: 250, rotulo: 'Exemplo da coluna', icone: FlaskConical,
    executar: (ctx) => anotar(`menu da coluna ${ctx.coluna.nome}: ${ctx.demandas.length} cards visíveis`) },
]
