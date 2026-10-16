/**
 * Só DEV (/dev/extensoes): cinco ações no topo do modal. Duas pedem o primário (vence a de menor ordem), duas viram
 * secundárias e a quinta vai para o ···.
 */
import { Flag, Rocket, Send, Sparkles, Star } from 'lucide-react'
import type { ExtensaoAcaoDemanda } from '../tipos.ts'
import { anotar } from '../../telas/dev-extensoes/exemplos.ts'

const acao = (id: string, ordem: number, rotulo: string, icone: ExtensaoAcaoDemanda['icone'], primaria = false): ExtensaoAcaoDemanda => ({
  id, ordem, rotulo: () => rotulo, icone, visivel: () => true, primaria: primaria ? () => true : undefined,
  executar: (ctx) => anotar(`ação ${rotulo} em #${ctx.demanda.numero}`),
})

export const acoes: ExtensaoAcaoDemanda[] = [
  acao('nucleo-exemplo-acao-1', 100, 'Primária (100)', Rocket, true),
  acao('nucleo-exemplo-acao-2', 110, 'Também queria ser primária (110)', Star, true),
  acao('nucleo-exemplo-acao-3', 120, 'Secundária (120)', Send),
  acao('nucleo-exemplo-acao-4', 130, 'Vai para o menu (130)', Flag),
  acao('nucleo-exemplo-acao-5', 140, 'Também no menu (140)', Sparkles),
]
