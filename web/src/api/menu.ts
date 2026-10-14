/**
 * Estrela e Seguir (API §4.5, PUT /api/quadros/:id/favorito|seguir), otimistas sobre ['bootstrap'].eu.
 * O tratador SSE de `quadro_usuario` (NÚCLEO-WEB) aplica o mesmo resultado nas outras janelas.
 *
 *   const favoritar = useFavoritar()
 *   favoritar(quadro.id, true)                                  // estrela (vai para o fim dos favoritos)
 *   favoritar(quadro.id, true, { depoisDeQuadroId: null })      // reordenar: primeiro da lista
 */
import { useQueryClient } from '@tanstack/react-query'
import type { FavoritoEntrada, Id, QuadroUsuario, SeguirEntrada } from '@shared/tipos/index.ts'
import { avisar } from '../ui/avisos.tsx'
import { api, mensagemDeErro } from './cliente.ts'
import { atualizarEu, euEmCache } from './auth.ts'

/** Nova ordem dos favoritos depois de pôr/tirar/mover `id` (puro; o menu lateral usa no arrastar). */
export function reordenarFavoritos(atuais: readonly Id[], id: Id, favorito: boolean, posicao?: FavoritoEntrada['posicao']): Id[] {
  const sem = atuais.filter((x) => x !== id)
  if (!favorito) return sem
  if (!posicao || posicao.depoisDeQuadroId === undefined) return atuais.includes(id) ? [...atuais] : [...sem, id]
  if (posicao.depoisDeQuadroId === null) return [id, ...sem]
  const i = sem.indexOf(posicao.depoisDeQuadroId)
  return i < 0 ? [...sem, id] : [...sem.slice(0, i + 1), id, ...sem.slice(i + 1)]
}

export function useFavoritar(): (quadroId: Id, favorito: boolean, posicao?: FavoritoEntrada['posicao']) => Promise<QuadroUsuario | null> {
  const qc = useQueryClient()
  return async (quadroId, favorito, posicao) => {
    const antes = euEmCache(qc)?.favoritos
    atualizarEu(qc, (eu) => ({ ...eu, favoritos: reordenarFavoritos(eu.favoritos, quadroId, favorito, posicao) }))
    try {
      const corpo: FavoritoEntrada = posicao ? { favorito, posicao } : { favorito }
      return await api<QuadroUsuario>('PUT', `/api/quadros/${encodeURIComponent(quadroId)}/favorito`, { corpo })
    } catch (e) {
      if (antes) atualizarEu(qc, (eu) => ({ ...eu, favoritos: antes }))
      avisar(mensagemDeErro(e), { tipo: 'erro', descricao: favorito ? 'A estrela não foi salva.' : 'A estrela não foi tirada.' })
      return null
    }
  }
}

export function useSeguir(): (quadroId: Id, seguindo: boolean) => Promise<QuadroUsuario | null> {
  const qc = useQueryClient()
  return async (quadroId, seguindo) => {
    const antes = euEmCache(qc)?.seguindo
    atualizarEu(qc, (eu) => ({
      ...eu,
      seguindo: seguindo ? (eu.seguindo.includes(quadroId) ? eu.seguindo : [...eu.seguindo, quadroId]) : eu.seguindo.filter((x) => x !== quadroId),
    }))
    try {
      const corpo: SeguirEntrada = { seguindo }
      return await api<QuadroUsuario>('PUT', `/api/quadros/${encodeURIComponent(quadroId)}/seguir`, { corpo })
    } catch (e) {
      if (antes) atualizarEu(qc, (eu) => ({ ...eu, seguindo: antes }))
      avisar(mensagemDeErro(e), { tipo: 'erro' })
      return null
    }
  }
}
