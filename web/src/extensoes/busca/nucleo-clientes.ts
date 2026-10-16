/** Fonte "Clientes" da paleta (do cache): sigla, nome e apelidos; abre a página do cliente. */
import { Building2 } from 'lucide-react'
import type { FontePaleta } from '../tipos.ts'
import { bootstrapAtual } from '../../api/cache.ts'
import { casaTermo } from '../../paleta/casar.ts'

export const fonte: FontePaleta = {
  id: 'nucleo-clientes',
  secao: 'Clientes',
  ordem: 300,
  minimo: 1,
  buscar(termo) {
    const b = bootstrapAtual()
    if (!b) return []
    const t = termo.trim().toUpperCase()
    return b.clientes
      .filter((c) => c.status !== 'ex' || t.length >= 2)
      .filter((c) => casaTermo(termo, c.sigla, c.nome, ...c.apelidos))
      // a sigla exata primeiro
      .sort((x, y) => (x.sigla === t ? -1 : 0) - (y.sigla === t ? -1 : 0) || x.sigla.localeCompare(y.sigla))
      .slice(0, 6)
      .map((c) => ({
        id: c.id, rotulo: `${c.sigla} · ${c.nome}`, detalhe: c.pendencias.length ? 'cadastro incompleto' : undefined,
        icone: Building2, caminho: `/clientes/${encodeURIComponent(c.sigla)}`,
      }))
  },
}
