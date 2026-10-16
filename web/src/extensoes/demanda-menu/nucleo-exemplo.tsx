/** Só DEV (/dev/extensoes): item só do card (não aparece no modal) e item com submenu. */
import { Layers, MousePointerClick } from 'lucide-react'
import type { ExtensaoMenuDemanda } from '../tipos.ts'
import { anotar, exemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

export const itens: ExtensaoMenuDemanda[] | undefined = import.meta.env.DEV ? [
  {
    id: 'nucleo-exemplo-so-card', ordem: 170, rotulo: 'Exemplo: só no card', icone: MousePointerClick, onde: ['card'],
    visivel: exemplosAtivos, executar: (ctx) => anotar(`menu do card: só no card (#${ctx.demanda.numero})`),
  },
  {
    id: 'nucleo-exemplo-submenu', ordem: 180, rotulo: (ctx) => `Exemplo: submenu de #${ctx.demanda.numero}`, icone: Layers,
    visivel: exemplosAtivos,
    subitens: (ctx) => ['Primeiro', 'Segundo', 'Terceiro'].map((r) => ({
      id: r.toLowerCase(), rotulo: r, executar: () => anotar(`submenu ${r} (#${ctx.demanda.numero})`),
    })),
  },
] : undefined
