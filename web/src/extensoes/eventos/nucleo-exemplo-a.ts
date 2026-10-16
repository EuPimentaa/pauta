/** Só DEV (/dev/extensoes): primeiro de dois tratadores da mesma entidade (chamados em ordem de id: a, b). */
import type { TratadorEventos } from '../tipos.ts'
import { anotar } from '../../telas/dev-extensoes/exemplos.ts'

export const tratador: TratadorEventos = {
  id: 'nucleo-exemplo-a',
  entidades: ['demanda'],
  tratar: (ev) => anotar(`tratador a: ${ev.e} ${ev.id.slice(0, 8)} #${ev.s}`),
}
