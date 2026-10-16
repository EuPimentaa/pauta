/**
 * Demandas (PLANO §2.2): o detalhe do modal e as mutações otimistas. Cada hook devolve a função do AcoesNucleo de mesmo
 * nome (api/acoes.ts), estável entre renders: aplica na hora, reverte com aviso no erro e devolve null quando a pessoa
 * cancela (interceptador, diálogo) ou quando falha.
 *
 *   const mover = useMover(); await mover(d, { colunaId, posicao: { depoisDeId } }, 'arrastar')
 *   const { data: detalhe } = useDetalhe(12)
 */
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { CriarDemandaEntrada, CriarDemandaSaida, DemandaDetalhe } from '@shared/tipos/index.ts'
import type { AcoesNucleo } from '../extensoes/tipos.ts'
import { acoesDe, registrarDescricao } from './acoes.ts'
import { chaves } from './chaves.ts'
import { api, type ErroDaApi } from './cliente.ts'

/** GET /api/demandas/:numero (tudo o que o modal mostra, numa ida). Arquivada e de quadro arquivado também abrem. */
export function useDetalhe(numero: number): UseQueryResult<DemandaDetalhe, ErroDaApi> {
  return useQuery<DemandaDetalhe, ErroDaApi>({
    queryKey: chaves.detalhe(numero),
    queryFn: async ({ signal }) => {
      const det = await api<DemandaDetalhe>('GET', `/api/demandas/${numero}`, { sinal: signal })
      registrarDescricao(det.demanda.id, det.demanda.rev, det.descricaoMd)
      return det
    },
    enabled: Number.isInteger(numero) && numero > 0,
    staleTime: 30_000,
  })
}

/** Todas as ações do núcleo (o que os hosts injetam em ContextoAcao e UtilModal). */
export function useAcoes(): AcoesNucleo {
  return acoesDe(useQueryClient())
}

export const useMover = (): AcoesNucleo['mover'] => useAcoes().mover
export const useEditarDemanda = (): AcoesNucleo['editar'] => useAcoes().editar
/** Mantém prazoHora, manda If-Match, "Prazo: sex, 24/10 · Desfazer". */
export const useMudarPrazo = (): AcoesNucleo['mudarPrazo'] => useAcoes().mudarPrazo
export const useConcluir = (): AcoesNucleo['concluir'] => useAcoes().concluir
export const useMembros = (): AcoesNucleo['membros'] => useAcoes().membros
export const useEtiquetasDemanda = (): AcoesNucleo['etiquetas'] => useAcoes().etiquetas
/** "Arquivada · Desfazer". */
export const useArquivar = (): AcoesNucleo['arquivar'] => useAcoes().arquivar
export const useRestaurar = (): AcoesNucleo['restaurar'] => useAcoes().restaurar

/** POST /api/demandas: a demanda entra no cache com a resposta (o eco do SSE é ignorado). null no erro (com aviso). */
export function useCriarDemanda(): (e: CriarDemandaEntrada) => Promise<CriarDemandaSaida | null> {
  return acoesDe(useQueryClient()).criar
}
