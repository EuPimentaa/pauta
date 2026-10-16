/**
 * Abrir os seletores do F1 (membros, etiquetas, datas, capa, mover) de fora do render: menu ··· do modal, menu de
 * contexto do card e atalhos (M, L, D, Shift+M, T). O popover ancora na linha do painel lateral quando o modal está
 * aberto, senão no card da demanda; sem nenhum dos dois, abre como modal.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { Demanda, Id } from '@shared/tipos/index.ts'
import type { AbrirDialogo } from '../../extensoes/tipos.ts'
import { bootstrapDe } from '../../api/cache.ts'
import { acoesModal } from './api.ts'

export type Seletor = 'membros' | 'etiquetas' | 'datas' | 'capa'

const ANCORA: Record<Seletor, string> = { membros: 'membros', etiquetas: 'etiquetas', datas: 'prazo', capa: 'capa' }

/** A linha do painel do modal aberto (desta demanda) ou o card dela no quadro. */
export function ancoraPara(qual: Seletor | 'tempo', demandaId: Id): HTMLElement | null {
  const modal = document.querySelector<HTMLElement>('[data-modal-demanda]')
  if (modal) {
    const alvo = modal.querySelector<HTMLElement>(`[data-mdl-ancora="${qual === 'tempo' ? 'tempo' : ANCORA[qual]}"]`)
    if (alvo) return alvo
  }
  return document.querySelector<HTMLElement>(`article[data-demanda-id="${CSS.escape(demandaId)}"]`)
}

export function abrirSeletor(abrir: AbrirDialogo, qual: Seletor, d: Demanda): void {
  const ancora = ancoraPara(qual, d.id)
  if (qual === 'etiquetas') void abrir('etiquetas', { quadroId: d.quadroId, demandaId: d.id }, { ancora })
  else void abrir(qual, { demandaId: d.id }, { ancora })
}

/** T: liga o cronômetro nesta demanda ou, se ele já corre nela, para. */
export function alternarCronometro(qc: QueryClient, d: Demanda): void {
  const meu = bootstrapDe(qc)?.eu.cronometro
  const acoes = acoesModal(qc)
  void (meu?.demandaId === d.id ? acoes.pararCronometro() : acoes.iniciarCronometro(d))
}

/** Pode mexer: não arquivada e de quadro ativo (o modal de arquivada abre só para leitura). */
export function editavel(qc: QueryClient, d: Demanda | null): d is Demanda {
  if (!d || d.arquivadoEm) return false
  return !!bootstrapDe(qc)?.quadros.some((q) => q.id === d.quadroId && q.arquivadoEm === null)
}
