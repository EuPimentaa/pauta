/**
 * Só DEV (/dev/extensoes): interceptador de exemplo (ordem 50, antes dos de verdade) que pergunta ao soltar um card em
 * outra coluna arrastando: Seguir (o núcleo chama /mover com `membros: 'manter'` de extra), Feito (atualiza o cache
 * sozinho e não chama /mover) ou Cancelar (o card volta em 200 ms; Esc também).
 */
import '../../telas/dev-extensoes/exemplos.ts'
import type { InterceptadorSoltar } from '../tipos.ts'
import { aplicarPatchDemanda } from '../../api/cache.ts'
import { anotar } from '../../telas/dev-extensoes/exemplos.ts'

export const interceptador: InterceptadorSoltar = {
  id: 'nucleo-exemplo',
  ordem: 50,
  quando: (p) => p.origem === 'arrastar' && p.para.coluna.id !== p.de.coluna.id,
  async executar(p, ctx) {
    anotar(`interceptador: #${p.demanda.numero} de ${p.de.coluna.nome} para ${p.para.coluna.nome} (card pendente)`)
    const r = await ctx.abrirDialogo('nucleo-exemplo-soltar', { demandaId: p.demanda.id, colunaNome: p.para.coluna.nome })
    const escolha = r?.escolha ?? 'cancelado'
    anotar(`interceptador: ${escolha}${escolha === 'seguir' ? ' → o núcleo chama /mover' : escolha === 'feito' ? ' → sem /mover (só no cache)' : ' → o card volta'}`)
    if (escolha === 'seguir') return { tipo: 'seguir', extras: { membros: 'manter' } }
    if (escolha === 'feito') {
      aplicarPatchDemanda(ctx.qc, p.demanda.id, { colunaId: p.para.coluna.id, quadroId: p.para.quadro.id })
      return { tipo: 'feito', demanda: { ...p.demanda, colunaId: p.para.coluna.id, quadroId: p.para.quadro.id } }
    }
    return { tipo: 'cancelado' }
  },
}
