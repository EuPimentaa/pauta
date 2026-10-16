/** Tratador do núcleo para os cadastros: cliente, contato e link do cliente, pessoa, equipe, feriado e configuração. */
import type { TratadorEventos } from '../tipos.ts'
import { tratarCadastros } from '../../tempo-real/tratar.ts'

export const tratador: TratadorEventos = {
  id: 'nucleo-cadastros',
  entidades: ['cliente', 'cliente_contato', 'cliente_link', 'usuario', 'equipe', 'feriado', 'config'],
  tratar: tratarCadastros,
}
