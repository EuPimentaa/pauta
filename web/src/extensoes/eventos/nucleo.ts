/** Tratador do núcleo para `demanda` (tempo-real/tratar.ts): patch, objeto inteiro, saída do quadro e o destaque. */
import type { EventoDe } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { tratarDemanda } from '../../tempo-real/tratar.ts'

export const tratador: TratadorEventos = {
  id: 'nucleo',
  entidades: ['demanda'],
  tratar: (ev, qc) => tratarDemanda(ev as EventoDe<'demanda'>, qc),
}
