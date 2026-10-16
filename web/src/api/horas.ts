/**
 * Horas (API §4.20): GET /api/apontamentos em ['apontamentos', consulta] (tela /horas do F3, aba Horas do cliente do
 * F5) e editar/excluir (o dono ou o admin). Excluir é "Excluído · Desfazer": some na hora e só vai ao servidor
 * depois do aviso (o Desfazer cancela o envio); sair da página manda o que estiver pendente.
 */
import { useMemo } from 'react'
import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  Apontamento, EditarApontamentoEntrada, Id, ListarApontamentosConsulta, ListarApontamentosSaida,
} from '@shared/tipos/index.ts'
import { avisar } from '../ui/avisos.tsx'
import { avisarErro } from './acoes.ts'
import { chaves } from './chaves.ts'
import { api, comConsulta, type ErroDaApi } from './cliente.ts'

export function useApontamentos(c: ListarApontamentosConsulta): UseQueryResult<ListarApontamentosSaida, ErroDaApi> {
  return useQuery<ListarApontamentosSaida, ErroDaApi>({
    queryKey: chaves.apontamentos(c),
    queryFn: ({ signal }) => api<ListarApontamentosSaida>('GET', comConsulta('/api/apontamentos', { ...c }), { sinal: signal }),
    staleTime: 30_000,
  })
}

/** Aplica em todas as listas de apontamentos em cache (cada consulta é uma chave). */
function nasListas(qc: QueryClient, fn: (itens: Apontamento[]) => Apontamento[]) {
  for (const [chave, dado] of qc.getQueriesData<ListarApontamentosSaida>({ queryKey: ['apontamentos'] })) {
    if (!dado) continue
    const itens = fn(dado.itens)
    if (itens === dado.itens) continue
    qc.setQueryData<ListarApontamentosSaida>(chave, { ...dado, itens, totalMin: itens.reduce((s, a) => s + (a.minutos ?? 0), 0) })
  }
}

const trocar = (a: Apontamento) => (itens: Apontamento[]) => (itens.some((x) => x.id === a.id) ? itens.map((x) => (x.id === a.id ? a : x)) : itens)

const ESPERA_EXCLUIR_MS = 8000
const pendentes = new Map<Id, () => Promise<void>>()

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { for (const enviar of pendentes.values()) void enviar() })
}

export interface MutacoesApontamento {
  editar(a: Apontamento, e: EditarApontamentoEntrada): Promise<Apontamento | null>
  excluir(a: Apontamento): Promise<boolean>
}

export function apontamentosMutacoes(qc: QueryClient): MutacoesApontamento {
  const rota = (a: Apontamento) => `/api/apontamentos/${encodeURIComponent(a.id)}`
  const recalcular = () => void qc.invalidateQueries({ queryKey: ['apontamentos'] })
  return {
    async editar(a, e) {
      nasListas(qc, trocar({ ...a, ...e }))
      try {
        const novo = await api<Apontamento>('PATCH', rota(a), { corpo: e })
        nasListas(qc, trocar(novo))
        recalcular()
        return novo
      } catch (erro) {
        nasListas(qc, trocar(a))
        avisarErro(erro)
        return null
      }
    },
    excluir(a) {
      nasListas(qc, (itens) => itens.filter((x) => x.id !== a.id))
      return new Promise<boolean>((resolver) => {
        let feito = false
        const enviar = async () => {
          if (feito) return
          feito = true
          clearTimeout(timer)
          pendentes.delete(a.id)
          try {
            await api<void>('DELETE', rota(a))
            recalcular()
            resolver(true)
          } catch (erro) {
            recalcular()
            avisarErro(erro, { titulo: 'Não foi possível excluir o tempo.' })
            resolver(false)
          }
        }
        const timer = setTimeout(() => void enviar(), ESPERA_EXCLUIR_MS)
        pendentes.set(a.id, enviar)
        avisar('Excluído', {
          duracao: ESPERA_EXCLUIR_MS,
          desfazer: () => {
            if (feito) return
            feito = true
            clearTimeout(timer)
            pendentes.delete(a.id)
            recalcular()
            resolver(false)
          },
        })
      })
    },
  }
}

const cache = new WeakMap<QueryClient, MutacoesApontamento>()

export function useEditarApontamento(): MutacoesApontamento {
  const qc = useQueryClient()
  return useMemo(() => {
    let m = cache.get(qc)
    if (!m) { m = apontamentosMutacoes(qc); cache.set(qc, m) }
    return m
  }, [qc])
}
