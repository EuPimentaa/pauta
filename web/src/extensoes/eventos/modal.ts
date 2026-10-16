/**
 * Tempo real do modal (F1): comentários (['demanda', id, 'comentarios']), checklists, itens e anexos (no detalhe
 * aberto) e o meu cronômetro (['bootstrap'].eu.cronometro, com outra aba ou aparelho). Idempotente: o objeto inteiro
 * substitui, o parcial mescla com o que o cache tem (renormalização de `pos`), o delete tira. Detalhe que não está
 * aberto: nada (ele vem inteiro quando abrir).
 */
import type { Anexo, Apontamento, Checklist, ChecklistItem, Comentario, EventoTempoReal } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { atualizarDetalhe, bootstrapDe, invalidarDetalhe } from '../../api/cache.ts'
import {
  comAnexo, comCamposDoItem, comChecklist, comComentario, comItem, cronometroDepois, definirCronometro, detalheDe, mudarComentarios, semAnexo,
  semChecklist, semItem,
} from '../../funcionalidades/modal/cache.ts'

function tratar(ev: EventoTempoReal, qc: Parameters<TratadorEventos['tratar']>[1]): void {
  const demandaId = ev.d
  switch (ev.e) {
    case 'comentario': {
      if (!demandaId) return
      if (ev.op === 'delete') { mudarComentarios(qc, demandaId, (l) => l.filter((c) => c.id !== ev.id)); return }
      mudarComentarios(qc, demandaId, (l) => {
        const atual = l.find((c) => c.id === ev.id)
        const c = ev.c === null ? (ev.p as Comentario) : atual ? { ...atual, ...(ev.p as Partial<Comentario>) } : null
        return c ? comComentario(l, c) : l
      })
      return
    }
    case 'checklist': {
      if (!demandaId) return
      if (ev.op === 'delete') { atualizarDetalhe(qc, demandaId, (det) => semChecklist(det, ev.id)); return }
      atualizarDetalhe(qc, demandaId, (det) => {
        const atual = det.checklists.find((c) => c.id === ev.id)
        if (ev.c === null) return comChecklist(det, ev.p as Checklist)
        return atual ? comChecklist(det, { ...atual, ...(ev.p as Partial<Checklist>) }) : det
      })
      return
    }
    case 'checklist_item': {
      if (!demandaId) return
      if (ev.op === 'delete') { atualizarDetalhe(qc, demandaId, (det) => semItem(det, ev.id)); return }
      atualizarDetalhe(qc, demandaId, (det) => (ev.c === null
        ? comItem(det, ev.p as ChecklistItem)
        : comCamposDoItem(det, ev.id, ev.p as Partial<ChecklistItem>)))
      return
    }
    case 'anexo': {
      if (!demandaId) return
      if (ev.op === 'delete') { atualizarDetalhe(qc, demandaId, (det) => semAnexo(det, ev.id)); return }
      atualizarDetalhe(qc, demandaId, (det) => {
        const atual = det.anexos.find((a) => a.id === ev.id)
        if (ev.c === null) return comAnexo(det, ev.p as Anexo)
        return atual ? comAnexo(det, { ...atual, ...(ev.p as Partial<Anexo>) }) : det
      })
      return
    }
    case 'apontamento': {
      const eu = bootstrapDe(qc)?.eu.usuario.id
      if (!eu) return
      if (ev.op === 'delete') { definirCronometro(qc, (atual) => cronometroDepois(atual, { id: ev.id, excluido: true }, eu)); return }
      if (ev.c !== null) return
      const a = ev.p as Apontamento
      definirCronometro(qc, (atual) => cronometroDepois(atual, a, eu))
      // o "meu tempo" do detalhe aberto (minha outra aba parou ou lançou): o detalhe busca de novo
      if (a.usuarioId === eu && a.minutos !== null && demandaId && detalheDe(qc, demandaId)) invalidarDetalhe(qc, demandaId)
      return
    }
    default:
  }
}

export const tratador: TratadorEventos = {
  id: 'modal',
  entidades: ['comentario', 'checklist', 'checklist_item', 'anexo', 'apontamento'],
  tratar,
}
