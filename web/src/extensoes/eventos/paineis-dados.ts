/**
 * Tempo real dos painéis (F3): o Início e a Agenda calculam as listas do bootstrap (o núcleo já aplica a demanda);
 * aqui só se relê o que vem da API (menções, extras), com 1 s de folga para não buscar a cada arraste. Apontamento
 * relê as horas; feriado relê a Agenda.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { EventoTempoReal } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { chaves } from '../../api/chaves.ts'

const ESPERA_MS = 1000
const pendentes = new Map<string, ReturnType<typeof setTimeout>>()

function depois(chave: string, fn: () => void): void {
  if (pendentes.has(chave)) return
  pendentes.set(chave, setTimeout(() => { pendentes.delete(chave); fn() }, ESPERA_MS))
}

function tratar(ev: EventoTempoReal, qc: QueryClient): void {
  switch (ev.e) {
    case 'demanda':
      depois('demanda', () => {
        void qc.invalidateQueries({ queryKey: chaves.inicio })
        void qc.invalidateQueries({ queryKey: ['agenda'] })
      })
      return
    case 'apontamento':
      depois('apontamento', () => void qc.invalidateQueries({ queryKey: ['apontamentos'] }))
      return
    case 'feriado':
      void qc.invalidateQueries({ queryKey: ['agenda'] })
      return
    default:
      return
  }
}

export const tratador: TratadorEventos = { id: 'paineis-dados', entidades: ['demanda', 'apontamento', 'feriado'], tratar }
