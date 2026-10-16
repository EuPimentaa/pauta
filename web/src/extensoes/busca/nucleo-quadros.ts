/**
 * Fonte "Quadros" da paleta (do cache): com a busca vazia lista todos (os com estrela primeiro), que é o "ir para cada
 * quadro" dos comandos do núcleo; com texto, filtra pelo nome e pela equipe.
 */
import { LayoutGrid, Star } from 'lucide-react'
import type { FontePaleta } from '../tipos.ts'
import { bootstrapAtual } from '../../api/cache.ts'
import { casaTermo } from '../../paleta/casar.ts'

export const fonte: FontePaleta = {
  id: 'nucleo-quadros',
  secao: 'Quadros',
  ordem: 100,
  minimo: 0,
  buscar(termo) {
    const b = bootstrapAtual()
    if (!b) return []
    const favoritos = b.eu.favoritos
    const equipe = (id: string | null) => (id ? b.equipes.find((e) => e.id === id)?.nome : undefined)
    return [...b.quadros]
      .sort((x, y) => {
        const fx = favoritos.indexOf(x.id), fy = favoritos.indexOf(y.id)
        return (fx < 0 ? 1e9 : fx) - (fy < 0 ? 1e9 : fy) || x.pos - y.pos
      })
      .filter((q) => casaTermo(termo, q.nome, equipe(q.equipeId)))
      .slice(0, termo ? 8 : 12)
      .map((q) => ({
        id: q.id,
        rotulo: q.nome,
        detalhe: favoritos.includes(q.id) ? 'com estrela' : equipe(q.equipeId),
        icone: favoritos.includes(q.id) ? Star : LayoutGrid,
        caminho: `/q/${encodeURIComponent(q.slug)}`,
      }))
  },
}
