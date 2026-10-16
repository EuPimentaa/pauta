/** Tratador do núcleo para quadros, colunas, etiquetas, automações, estrela/seguir e modelos de demanda. */
import type { Eu } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { api } from '../../api/cliente.ts'
import { tratarQuadros } from '../../tempo-real/tratar.ts'

const deps = { buscarEu: () => api<Eu>('GET', '/api/auth/eu') }

export const tratador: TratadorEventos = {
  id: 'nucleo-quadros',
  entidades: ['quadro', 'coluna', 'etiqueta', 'automacao', 'quadro_usuario', 'modelo_demanda'],
  tratar: (ev, qc) => tratarQuadros(ev, qc, deps),
}
