/**
 * Cache do modal (F1): o detalhe da demanda (['demanda', numero]: checklists e anexos), os comentários
 * (['demanda', id, 'comentarios']) e o meu cronômetro (['bootstrap'].eu.cronometro). As mesmas funções servem à
 * resposta das mutações e aos tratadores do tempo real (idempotentes). Os contadores do card (nCheck*, nAnexos,
 * nComentarios) mudam aqui também: o evento da demanda com o meu trace é eco e o tempo real o ignora.
 * Sem React e só com imports relativos: os testes rodam no Node (server/test/modal-web.test.ts).
 */
import type { QueryClient } from '@tanstack/react-query'
import type {
  Anexo, Apontamento, Bootstrap, Checklist, ChecklistComItens, ChecklistItem, Comentario, Demanda, DemandaDetalhe, Id,
} from '../../../../shared/tipos/index.ts'
import { aplicarPatchDemanda, atualizarDetalhe, demandaConhecida, mudarBootstrap } from '../../api/cache.ts'
import { chaves } from '../../api/chaves.ts'

const porPos = <T extends { pos: number; id: string }>(a: T, b: T) => a.pos - b.pos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// ─────────────────────────────── puro: detalhe ───────────────────────────────

/** Checklist inteiro (com itens) ou só os campos dele (evento sem itens: mantém os itens que o cache tem). */
export function comChecklist(det: DemandaDetalhe, c: Checklist | ChecklistComItens): DemandaDetalhe {
  const atual = det.checklists.find((x) => x.id === c.id)
  const itens = 'itens' in c ? [...c.itens].sort(porPos) : (atual?.itens ?? [])
  const novo: ChecklistComItens = { ...(atual ?? {}), ...c, itens }
  const checklists = (atual ? det.checklists.map((x) => (x.id === c.id ? novo : x)) : [...det.checklists, novo]).sort(porPos)
  return { ...det, checklists }
}

export function semChecklist(det: DemandaDetalhe, id: Id): DemandaDetalhe {
  return det.checklists.some((c) => c.id === id) ? { ...det, checklists: det.checklists.filter((c) => c.id !== id) } : det
}

/** Item novo ou mudado (pelo checklistId; checklist que o cache não tem: nada). */
export function comItem(det: DemandaDetalhe, item: ChecklistItem): DemandaDetalhe {
  if (!det.checklists.some((c) => c.id === item.checklistId)) return det
  const checklists = det.checklists.map((c) => {
    const tinha = c.itens.some((i) => i.id === item.id)
    if (c.id !== item.checklistId) return tinha ? { ...c, itens: c.itens.filter((i) => i.id !== item.id) } : c
    const itens = tinha ? c.itens.map((i) => (i.id === item.id ? { ...i, ...item } : i)) : [...c.itens, item]
    return { ...c, itens: itens.sort(porPos) }
  })
  return { ...det, checklists }
}

/** Mescla campos de um item (evento parcial, como a renormalização de `pos`). */
export function comCamposDoItem(det: DemandaDetalhe, id: Id, campos: Partial<ChecklistItem>): DemandaDetalhe {
  const atual = det.checklists.flatMap((c) => c.itens).find((i) => i.id === id)
  return atual ? comItem(det, { ...atual, ...campos, id }) : det
}

export function semItem(det: DemandaDetalhe, id: Id): DemandaDetalhe {
  if (!det.checklists.some((c) => c.itens.some((i) => i.id === id))) return det
  return { ...det, checklists: det.checklists.map((c) => (c.itens.some((i) => i.id === id) ? { ...c, itens: c.itens.filter((i) => i.id !== id) } : c)) }
}

export function comAnexo(det: DemandaDetalhe, a: Anexo): DemandaDetalhe {
  const tinha = det.anexos.some((x) => x.id === a.id)
  const anexos = (tinha ? det.anexos.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : [...det.anexos, a]).sort(porPos)
  return { ...det, anexos }
}

export function semAnexo(det: DemandaDetalhe, id: Id): DemandaDetalhe {
  return det.anexos.some((a) => a.id === id) ? { ...det, anexos: det.anexos.filter((a) => a.id !== id) } : det
}

/** Os contadores do card que o detalhe sabe recontar sozinho. */
export function contadoresDoDetalhe(det: DemandaDetalhe): Pick<Demanda, 'nCheckTotal' | 'nCheckFeitos' | 'nAnexos'> {
  const itens = det.checklists.flatMap((c) => c.itens)
  return { nCheckTotal: itens.length, nCheckFeitos: itens.filter((i) => i.feitoEm !== null).length, nAnexos: det.anexos.length }
}

// ─────────────────────────────── puro: comentários e cronômetro ───────────────────────────────

/** Na ordem de criação. Comentário mudado mantém o lugar. */
export function comComentario(lista: readonly Comentario[], c: Comentario): Comentario[] {
  const i = lista.findIndex((x) => x.id === c.id)
  if (i >= 0) return lista.map((x) => (x.id === c.id ? c : x))
  return [...lista, c].sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0))
}

export const vivos = (lista: readonly Comentario[]) => lista.filter((c) => !c.excluidoEm).length

/**
 * O meu cronômetro depois de um `apontamento` (meu): ligado (sem minutos e sem paradoEm) vira o atual; o atual parado
 * ou excluído sai. Apontamento de outra pessoa não muda nada.
 */
export function cronometroDepois(atual: Apontamento | null, a: Apontamento | { id: Id; excluido: true }, euId: Id): Apontamento | null {
  if ('excluido' in a) return atual?.id === a.id ? null : atual
  if (a.usuarioId !== euId) return atual
  const ligado = a.origem === 'cronometro' && a.paradoEm === null && a.minutos === null
  if (ligado) return a
  return atual?.id === a.id ? null : atual
}

// ─────────────────────────────── sobre o QueryClient ───────────────────────────────

/** Muda o detalhe e acerta os contadores nCheckTotal, nCheckFeitos e nAnexos da demanda no bootstrap. */
export function mudarDetalhe(qc: QueryClient, demandaId: Id, fn: (det: DemandaDetalhe) => DemandaDetalhe): void {
  let contadores: ReturnType<typeof contadoresDoDetalhe> | null = null
  atualizarDetalhe(qc, demandaId, (det) => {
    const novo = fn(det)
    if (novo !== det) contadores = contadoresDoDetalhe(novo)
    return novo
  })
  if (contadores) aplicarPatchDemanda(qc, demandaId, contadores)
}

export function detalheDe(qc: QueryClient, demandaId: Id): DemandaDetalhe | undefined {
  for (const [chave, det] of qc.getQueriesData<DemandaDetalhe>({ queryKey: ['demanda'] })) {
    if (chave.length === 2 && det?.demanda.id === demandaId) return det
  }
  return undefined
}

/** Lista de comentários da demanda (se carregada) e o nComentarios do card. */
export function mudarComentarios(qc: QueryClient, demandaId: Id, fn: (l: Comentario[]) => Comentario[], delta = 0): void {
  const chave = chaves.comentarios(demandaId)
  const antes = qc.getQueryData<Comentario[]>(chave)
  if (antes) {
    const depois = fn(antes)
    qc.setQueryData<Comentario[]>(chave, depois)
    aplicarPatchDemanda(qc, demandaId, { nComentarios: vivos(depois) })
    return
  }
  if (delta) {
    const d = demandaConhecida(qc, demandaId)
    if (d) aplicarPatchDemanda(qc, demandaId, { nComentarios: Math.max(0, d.nComentarios + delta) })
  }
}

export function definirCronometro(qc: QueryClient, fn: (atual: Apontamento | null, euId: Id) => Apontamento | null): void {
  mudarBootstrap(qc, (b: Bootstrap) => {
    const novo = fn(b.eu.cronometro, b.eu.usuario.id)
    return novo === b.eu.cronometro ? b : { ...b, eu: { ...b.eu, cronometro: novo } }
  })
}
