/** Só DEV (/dev/extensoes): primeiro de dois tratadores da mesma entidade (chamados em ordem de id: a, b). */
import type { TratadorEventos } from '../tipos.ts'
import { anotar, exemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

export const tratador: TratadorEventos | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-a',
  entidades: ['demanda'],
  tratar: (ev) => { if (exemplosAtivos()) anotar(`tratador a: ${ev.e} ${ev.id.slice(0, 8)} #${ev.s}`) },
} : undefined
