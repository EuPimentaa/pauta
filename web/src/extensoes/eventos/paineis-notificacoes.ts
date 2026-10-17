/**
 * Tempo real do sino (F3): a notificação nova entra no topo da lista (['notificacoes']) e soma nas não lidas; o
 * `lidaEm` marcado em outra aba ou aparelho desconta. As menções do Início acompanham. Idempotente: a mesma
 * notificação de novo só troca. Lida fora da página carregada: relê a lista (a contagem vem do servidor).
 */
import type { QueryClient } from '@tanstack/react-query'
import type { EventoTempoReal, InicioSaida, ListarNotificacoesSaida, Notificacao } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { chaves } from '../../api/chaves.ts'
import { marcarMencoes } from '../../funcionalidades/paineis/api.ts'
import { comNotificacao, comPatchNotificacao } from '../../funcionalidades/paineis/logica.ts'

const MENCOES_NO_INICIO = 10
let releitura: ReturnType<typeof setTimeout> | null = null

function relerDepois(qc: QueryClient): void {
  if (releitura) return
  releitura = setTimeout(() => { releitura = null; void qc.invalidateQueries({ queryKey: chaves.notificacoes }) }, 500)
}

export function tratarNotificacao(ev: EventoTempoReal, qc: QueryClient): void {
  if (ev.e !== 'notificacao' || ev.op !== 'upsert') return
  const lista = qc.getQueryData<ListarNotificacoesSaida>(chaves.notificacoes)
  if (ev.c === null) {
    const n = ev.p as Notificacao
    if (lista) qc.setQueryData(chaves.notificacoes, comNotificacao(lista, n))
    if (n.tipo === 'mencao') {
      qc.setQueryData<InicioSaida>(chaves.inicio, (ini) => {
        if (!ini) return ini
        if (ini.mencoes.some((m) => m.id === n.id)) return { ...ini, mencoes: ini.mencoes.map((m) => (m.id === n.id ? n : m)) }
        return { ...ini, mencoes: [n, ...ini.mencoes].sort((a, b) => b.id - a.id).slice(0, MENCOES_NO_INICIO) }
      })
    }
    return
  }
  const id = Number(ev.id)
  const patch = ev.p as Partial<Notificacao>
  if (lista) {
    const { lista: nova, conhecida } = comPatchNotificacao(lista, id, patch)
    if (conhecida) qc.setQueryData(chaves.notificacoes, nova)
    else relerDepois(qc)
  }
  if (patch.lidaEm !== undefined) marcarMencoes(qc, (m) => (m.id === id ? patch.lidaEm ?? null : m.lidaEm))
}

export const tratador: TratadorEventos = { id: 'paineis-notificacoes', entidades: ['notificacao'], tratar: tratarNotificacao }
