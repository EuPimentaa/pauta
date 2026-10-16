/**
 * Fonte "Pessoas" da paleta (do cache): nome e apelido. Escolher filtra o quadro aberto pelas demandas da pessoa; sem
 * quadro aberto, abre o quadro da equipe dela já filtrado.
 */
import { UserRound } from 'lucide-react'
import { codificarFiltros } from '@shared/logica/filtros.ts'
import type { FontePaleta } from '../tipos.ts'
import { bootstrapAtual } from '../../api/cache.ts'
import { casaTermo } from '../../paleta/casar.ts'

export const fonte: FontePaleta = {
  id: 'nucleo-pessoas',
  secao: 'Pessoas',
  ordem: 400,
  minimo: 1,
  buscar(termo) {
    const b = bootstrapAtual()
    if (!b) return []
    return b.usuarios
      .filter((u) => u.ativo && casaTermo(termo, u.nome, u.apelido))
      .slice(0, 6)
      .map((u) => {
        const daEquipe = b.quadros.find((q) => q.equipeId !== null && u.equipeIds.includes(q.equipeId))
        return {
          id: u.id,
          rotulo: u.apelido ? `${u.apelido} · ${u.nome}` : u.nome,
          detalhe: 'ver as demandas no quadro',
          icone: UserRound,
          executar(ctx) {
            const quadro = ctx.quadroAtual ?? daEquipe ?? b.quadros[0]
            if (!quadro) return
            ctx.navegar(`/q/${encodeURIComponent(quadro.slug)}?f=${codificarFiltros({ membros: [u.id] })}`)
          },
        }
      })
  },
}
