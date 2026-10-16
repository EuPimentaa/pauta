/**
 * ContextoDemanda e UtilModal (extensoes/tipos.ts) para o modal e o menu de contexto do card, e o menu ··· montado
 * a partir de extensoes/demanda-menu (menuDemanda()): `onde` filtra (padrão: os dois), `visivel` decide, `subitens`
 * vira submenu.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { Bootstrap, Coluna, Demanda, DemandaDetalhe, Quadro } from '@shared/tipos/index.ts'
import type { ContextoDemanda, ExtensaoMenuDemanda, UtilModal } from '../extensoes/tipos.ts'
import type { ItemMenuUi } from '../ui/Menu.tsx'
import { acoesDe } from '../api/acoes.ts'
import { abrirDialogo, navegar } from '../dialogos/estado.ts'

export function montarContextoDemanda(b: Bootstrap, demanda: Demanda, extra: {
  detalhe?: DemandaDetalhe; quadro?: Quadro | null; coluna?: Coluna | null
} = {}): ContextoDemanda | null {
  // o bootstrap acompanha o mover; o detalhe só vale para a demanda fora dele (e só se for o lugar dela)
  const doDetalheQ = extra.detalhe?.quadro.id === demanda.quadroId ? extra.detalhe.quadro : undefined
  const doDetalheC = extra.detalhe?.coluna.id === demanda.colunaId ? extra.detalhe.coluna : undefined
  const quadro = extra.quadro ?? b.quadros.find((q) => q.id === demanda.quadroId) ?? doDetalheQ
  const coluna = extra.coluna ?? b.colunas.find((c) => c.id === demanda.colunaId) ?? doDetalheC
  if (!quadro || !coluna) return null
  const eu = b.eu
  return {
    demanda,
    detalhe: extra.detalhe,
    eu,
    quadro,
    coluna,
    somenteLeitura: demanda.arquivadoEm !== null || quadro.arquivadoEm !== null,
    cliente: demanda.clienteId ? b.clientes.find((c) => c.id === demanda.clienteId) ?? null : null,
    souMembro: demanda.membroIds.includes(eu.usuario.id),
    souAm: demanda.atendimentoId === eu.usuario.id,
    atendimento: eu.usuario.papel === 'admin' || eu.usuario.papel === 'atendimento',
  }
}

export function montarUtilModal(qc: QueryClient, fechar: () => void = () => {}): UtilModal {
  return { abrirDialogo, navegar: (c) => navegar(c), fechar, qc, acoes: acoesDe(qc) }
}

const rotuloDe = (i: ExtensaoMenuDemanda, ctx: ContextoDemanda) => (typeof i.rotulo === 'function' ? i.rotulo(ctx) : i.rotulo)

/** Os itens do menu ··· (onde: 'modal') ou do menu de contexto do card (onde: 'card'), em ordem, com separadores. */
export function itensDoMenuDemanda(
  itens: readonly ExtensaoMenuDemanda[], ctx: ContextoDemanda, util: UtilModal, onde: 'modal' | 'card',
): ItemMenuUi[] {
  const visiveis = itens.filter((i) => {
    if (i.onde && !i.onde.includes(onde)) return false
    try { return i.visivel(ctx) } catch (e) { console.error(`[menu da demanda] ${i.id}.visivel falhou`, e); return false }
  })
  const saida: ItemMenuUi[] = []
  let faixa = -1
  for (const i of visiveis) {
    // separador entre as faixas de ordem do PLANO §4 (100–199 modal, 300 link, 900+ arquivar e excluir)
    const f = i.ordem >= 900 ? 3 : i.ordem >= 300 ? 2 : i.ordem >= 200 ? 1 : 0
    if (faixa >= 0 && f !== faixa) saida.push({ tipo: 'separador', id: `sep-${i.id}` })
    faixa = f
    const sub = i.subitens?.(ctx)
    saida.push({
      id: i.id,
      rotulo: rotuloDe(i, ctx),
      icone: i.icone,
      atalho: i.atalho,
      perigo: i.perigo,
      executar: i.executar ? () => i.executar!(ctx, util) : undefined,
      subitens: sub?.length ? sub.map((s) => ({ id: `${i.id}:${s.id}`, rotulo: s.rotulo, executar: () => s.executar(util) })) : undefined,
    })
  }
  return saida
}
