/** Menu ··· do quadro, itens do núcleo (PLANO §4: seguir 100, copiar link 110). */
import { BellOff, BellRing, Link2 } from 'lucide-react'
import type { ExtensaoMenuQuadro } from '../tipos.ts'
import { seguirQuadro } from '../../api/quadros.ts'
import { avisar } from '../../ui/avisos.tsx'
import { copiarParaAreaDeTransferencia } from '../../ui/Texto.tsx'

export const itens: ExtensaoMenuQuadro[] = [
  {
    id: 'nucleo-seguir', ordem: 100, rotulo: 'Seguir', icone: BellRing,
    visivel: (ctx) => !ctx.eu.seguindo.includes(ctx.quadro.id),
    executar: (ctx, acao) => { void seguirQuadro(acao.qc, ctx.quadro.id, true) },
  },
  {
    id: 'nucleo-deixar-de-seguir', ordem: 100, rotulo: 'Deixar de seguir', icone: BellOff,
    visivel: (ctx) => ctx.eu.seguindo.includes(ctx.quadro.id),
    executar: (ctx, acao) => { void seguirQuadro(acao.qc, ctx.quadro.id, false) },
  },
  {
    id: 'nucleo-copiar-link', ordem: 110, rotulo: 'Copiar link do quadro', icone: Link2,
    executar: async (ctx) => {
      const ok = await copiarParaAreaDeTransferencia(`${window.location.origin}/q/${encodeURIComponent(ctx.quadro.slug)}`)
      avisar(ok ? 'Link do quadro copiado.' : 'Não foi possível copiar o link.', { tipo: ok ? 'sucesso' : 'erro' })
    },
  },
]
