/**
 * Menu ··· do quadro, itens do F5 (PLANO §4: editar 800, copiar 850, arquivar 900), só para o admin: Editar quadro
 * (Configurações › Quadros com o quadro escolhido), Copiar quadro (diálogo `copiar-quadro`) e Arquivar quadro.
 */
import { Archive, Copy, Settings2 } from 'lucide-react'
import type { ExtensaoMenuQuadro } from '../tipos.ts'
import { avisarErro } from '../../api/acoes.ts'
import { arquivarQuadro, restaurarQuadro } from '../../funcionalidades/cadastros/api.ts'
import '../../funcionalidades/cadastros/dialogos.ts'
import { avisar } from '../../ui/avisos.tsx'

const admin = (ctx: { eu: { usuario: { papel: string } } }) => ctx.eu.usuario.papel === 'admin'

export const itens: ExtensaoMenuQuadro[] = [
  {
    id: 'cadastros-editar', ordem: 800, rotulo: 'Editar quadro', icone: Settings2, visivel: admin,
    executar: (ctx, acao) => acao.navegar(`/config/quadros?quadro=${encodeURIComponent(ctx.quadro.slug)}`),
  },
  {
    id: 'cadastros-copiar', ordem: 850, rotulo: 'Copiar quadro', icone: Copy, visivel: admin,
    executar: (ctx, acao) => { void acao.abrirDialogo('copiar-quadro', { quadroId: ctx.quadro.id }) },
  },
  {
    id: 'cadastros-arquivar', ordem: 900, rotulo: 'Arquivar quadro', icone: Archive, perigo: true, visivel: admin,
    executar: async (ctx, acao) => {
      const q = ctx.quadro
      const ok = await acao.abrirDialogo('confirmar', {
        titulo: `Arquivar ${q.nome}?`, confirmar: 'Arquivar quadro', perigo: true,
        mensagem: 'O quadro e as demandas dele saem do menu, do Início e da Agenda (nada se perde). As automações de outros quadros que levavam para ele são desligadas. Dá para restaurar em Configurações › Quadros.',
      })
      if (!ok) return
      try {
        await arquivarQuadro(acao.qc, q)
        acao.navegar('/')
        avisar(`Quadro ${q.nome} arquivado.`, {
          desfazer: async () => {
            try {
              await restaurarQuadro(acao.qc, q)
              acao.navegar(`/q/${encodeURIComponent(q.slug)}`)
            } catch (e) { avisarErro(e, { titulo: 'Não foi possível restaurar o quadro.' }) }
          },
        })
      } catch (e) {
        avisarErro(e, { titulo: 'Não foi possível arquivar o quadro.' })
      }
    },
  },
]
