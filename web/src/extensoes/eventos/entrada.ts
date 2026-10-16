/**
 * Tratador da Entrada (F4): `modelo_demanda` de outra pessoa atualiza a lista completa ['modelos-demanda'] (a tela de
 * modelos, com os desativados). O bootstrap o tratador do núcleo já cuida.
 */
import type { ModeloDemanda } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { chaves } from '../../api/chaves.ts'
import { inserirOuAtualizar } from '../../api/cache.ts'

export const tratador: TratadorEventos = {
  id: 'entrada',
  entidades: ['modelo_demanda'],
  tratar(ev, qc) {
    qc.setQueryData<ModeloDemanda[]>(chaves.modelosDemanda, (lista) => {
      if (!lista) return lista
      if (ev.op === 'delete') return lista.filter((m) => m.id !== ev.id)
      const atual = lista.find((m) => m.id === ev.id)
      if (ev.c === null) return inserirOuAtualizar(lista, ev.p as ModeloDemanda)
      return atual ? inserirOuAtualizar(lista, { ...atual, ...(ev.p as Partial<ModeloDemanda>) }) : lista
    })
  },
}
