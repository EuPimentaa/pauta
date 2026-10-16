/**
 * Componente global do tempo real (extensoes/global/nucleo-tempo-real.tsx): abre a conexão com o seq do bootstrap
 * quando a área autenticada monta e fecha ao sair. Não desenha nada (a faixa "Sem conexão" é da casca).
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SyncSaida } from '@shared/tipos/index.ts'
import { bootstrapEmCache } from '../api/bootstrap.ts'
import { definirClientePadrao } from '../api/cache.ts'
import { api, ehMeuTrace } from '../api/cliente.ts'
import { definirConexao } from '../lib/conexao.ts'
import { useRegistro } from '../sessao/registro.ts'
import { conectarTempoReal } from './conexao.ts'

export default function TempoReal() {
  const qc = useQueryClient()
  const reg = useRegistro()
  useEffect(() => {
    definirClientePadrao(qc)
    const seq = bootstrapEmCache(qc)?.seq ?? 0
    const parar = conectarTempoReal({
      qc,
      tratadores: () => reg.tratadores(),
      meuTrace: ehMeuTrace,
      definirEstado: definirConexao,
      sync: (desde) => api<SyncSaida>('GET', `/api/sync?desde=${desde}`),
    }, seq)
    return () => {
      parar()
      definirConexao('online')
      definirClientePadrao(null)
    }
  }, [qc, reg])
  return null
}
