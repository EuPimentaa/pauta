/** Só DEV (/dev/extensoes): segundo tratador da mesma entidade (vem depois do "a"). */
import type { TratadorEventos } from '../tipos.ts'
import { anotar, exemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

export const tratador: TratadorEventos | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-b',
  entidades: ['demanda'],
  tratar: (ev) => { if (exemplosAtivos()) anotar(`tratador b: ${ev.e} ${ev.id.slice(0, 8)} #${ev.s}`) },
} : undefined
