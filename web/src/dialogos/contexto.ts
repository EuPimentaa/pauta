/**
 * ContextoAcao (extensoes/tipos.ts): o que comandos, atalhos, itens de menu, interceptadores e abas do celular
 * recebem. `useContextoAcao()` no render; `contextoAcaoAgora(qc)` fora dele (lê o mesmo estado na hora).
 */
import { useMemo } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Demanda, Quadro } from '@shared/tipos/index.ts'
import type { AcoesNucleo, ContextoAcao } from '../extensoes/tipos.ts'
import { acoesDe } from '../api/acoes.ts'
import { useEu } from '../api/auth.ts'
import { bootstrapDe } from '../api/cache.ts'
import { useDemanda, useQuadro } from '../api/seletores.ts'
import { demandaEmFocoId, quadroAtualId, useDemandaEmFocoId, useQuadroAtualId } from '../teclado/foco.ts'
import { abrirDialogo, navegar } from './estado.ts'

function demandaDoCache(qc: QueryClient, id: string | null): Demanda | null {
  if (!id) return null
  return bootstrapDe(qc)?.demandas.find((d) => d.id === id) ?? demandaDoDetalhe(qc, id)
}

/** A demanda do modal pode estar fora do bootstrap (arquivada): o detalhe aberto tem. */
function demandaDoDetalhe(qc: QueryClient, id: string): Demanda | null {
  for (const [chave, det] of qc.getQueriesData<{ demanda: Demanda }>({ queryKey: ['demanda'] })) {
    if (chave.length === 2 && det?.demanda.id === id) return det.demanda
  }
  return null
}

function quadroDoCache(qc: QueryClient, id: string | null): Quadro | null {
  return id ? bootstrapDe(qc)?.quadros.find((q) => q.id === id) ?? null : null
}

/** O contexto de agora, fora do render. `acoes` padrão: as do núcleo (com interceptadores). */
export function contextoAcaoAgora(qc: QueryClient, acoes: AcoesNucleo = acoesDe(qc)): ContextoAcao {
  const b = bootstrapDe(qc)
  if (!b) throw new Error('contextoAcaoAgora antes do bootstrap.')
  return {
    eu: b.eu,
    navegar,
    abrirDialogo,
    demandaEmFoco: demandaDoCache(qc, demandaEmFocoId()),
    quadroAtual: quadroDoCache(qc, quadroAtualId()),
    qc,
    acoes,
  }
}

export function useContextoAcao(): ContextoAcao {
  const qc = useQueryClient()
  const eu = useEu()
  const focoId = useDemandaEmFocoId()
  const foco = useDemanda(focoId)
  const quadro = useQuadro(useQuadroAtualId())
  return useMemo<ContextoAcao>(() => ({
    eu, navegar, abrirDialogo, qc, acoes: acoesDe(qc),
    demandaEmFoco: foco ?? demandaDoCache(qc, focoId),
    quadroAtual: quadro ?? null,
  }), [eu, qc, foco, focoId, quadro])
}
