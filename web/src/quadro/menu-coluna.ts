/**
 * Menu ··· da coluna: os itens de extensoes/coluna-menu (menuColuna()), em ordem, com separadores entre as faixas do
 * PLANO §4 (100–199 editar, 200 ordenar, 300 mover, 800+ arquivar). Os itens do núcleo podem trazer `subitens`
 * (Cor, Papel, Ordenar por…): é um acréscimo só do núcleo, o contrato (ExtensaoMenuColuna) não tem.
 */
import type { Eu } from '@shared/tipos/index.ts'
import type { ContextoAcao, ContextoColuna, ExtensaoMenuColuna } from '../extensoes/tipos.ts'
import type { ItemMenuUi } from '../ui/Menu.tsx'

export interface SubitemColuna {
  id: string
  rotulo: string
  marcado?: boolean
  desabilitado?: boolean
  executar(): void | Promise<void>
}

export interface ItemColunaNucleo extends ExtensaoMenuColuna {
  subitens?(ctx: ContextoColuna, acao: ContextoAcao): SubitemColuna[]
  /** Item indisponível (mostrado em cinza), com o motivo no rótulo. */
  desabilitado?(ctx: ContextoColuna): boolean
}

export function itensDoMenuColuna(
  itens: readonly ItemColunaNucleo[], ctx: ContextoColuna, eu: Eu, acao: ContextoAcao,
): ItemMenuUi[] {
  const visiveis = itens.filter((i) => {
    try { return !i.visivel || i.visivel(ctx, eu) } catch (e) { console.error(`[menu da coluna] ${i.id}.visivel falhou`, e); return false }
  })
  const saida: ItemMenuUi[] = []
  let faixa = -1
  for (const i of visiveis) {
    const f = i.ordem >= 800 ? 3 : i.ordem >= 300 ? 2 : i.ordem >= 200 ? 1 : 0
    if (faixa >= 0 && f !== faixa) saida.push({ tipo: 'separador', id: `sep-${i.id}` })
    faixa = f
    const sub = i.subitens?.(ctx, acao)
    saida.push({
      id: i.id,
      rotulo: i.rotulo,
      icone: i.icone,
      perigo: i.perigo,
      desabilitado: i.desabilitado?.(ctx),
      executar: sub ? undefined : () => i.executar(ctx, acao),
      subitens: sub?.map((s) => ({ id: `${i.id}:${s.id}`, rotulo: s.rotulo, marcado: s.marcado, desabilitado: s.desabilitado, executar: s.executar })),
    })
  }
  return saida
}
