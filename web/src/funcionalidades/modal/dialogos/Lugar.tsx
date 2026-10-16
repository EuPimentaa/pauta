/**
 * Quadro, coluna e posição para "Mover para…" e "Copiar…" (como no Trello): o quadro atual primeiro, depois os
 * favoritos e os outros; as colunas ativas do quadro; a posição numerada ("1 · no topo", "3 · depois de #12 …",
 * "N · no fim"). Puro de estado: quem usa guarda o lugar.
 */
import { useMemo } from 'react'
import type { Bootstrap, Coluna, Demanda, Id, PosicaoRelativa, Quadro } from '@shared/tipos/index.ts'
import { ehCardDaColuna } from '@shared/logica/quadro.ts'
import { useDoBootstrap } from '../../../api/seletores.ts'
import { Selecao } from '../../../ui/Campo.tsx'

export interface Lugar {
  quadroId: Id
  colunaId: Id
  /** Índice na coluna (0 = topo); null = no fim. */
  indice: number | null
}

const selBase = (b: Bootstrap) => b

/** Os cards da coluna de destino, na ordem, sem a própria demanda. */
export function cardsDe(b: Bootstrap | undefined, colunaId: Id, sem: Id | null): Demanda[] {
  if (!b) return []
  const agora = new Date()
  return b.demandas.filter((d) => d.colunaId === colunaId && d.id !== sem && ehCardDaColuna(d, agora, b.config.quadroConcluidasDias))
    .sort((a, z) => a.posicao - z.posicao || a.numero - z.numero)
}

export function posicaoDe(cards: readonly Demanda[], indice: number | null): PosicaoRelativa | undefined {
  if (indice === null || indice >= cards.length) return undefined
  return { depoisDeId: indice === 0 ? null : cards[indice - 1]!.id }
}

export function colunasDe(b: Bootstrap | undefined, quadroId: Id): Coluna[] {
  return (b?.colunas ?? []).filter((c) => c.quadroId === quadroId && c.arquivadaEm === null).sort((x, y) => x.pos - y.pos)
}

/** Quadros na ordem do diálogo: o atual, os favoritos (na ordem do menu) e o resto. */
export function quadrosEmOrdem(b: Bootstrap | undefined, atual: Id): Quadro[] {
  if (!b) return []
  const ativos = b.quadros.filter((q) => q.arquivadoEm === null)
  const fav = b.eu.favoritos.map((id) => ativos.find((q) => q.id === id)).filter((q): q is Quadro => !!q && q.id !== atual)
  const resto = ativos.filter((q) => q.id !== atual && !fav.includes(q)).sort((x, y) => x.pos - y.pos)
  const esse = ativos.find((q) => q.id === atual)
  return [...(esse ? [esse] : []), ...fav, ...resto]
}

export function SeletorLugar({ lugar, mudar, demandaId, quadroAtual, focoNoQuadro }: {
  lugar: Lugar; mudar(l: Lugar): void; demandaId: Id | null; quadroAtual: Id; focoNoQuadro?: boolean
}) {
  const b = useDoBootstrap(selBase)
  const quadros = useMemo(() => quadrosEmOrdem(b, quadroAtual), [b, quadroAtual])
  const colunas = useMemo(() => colunasDe(b, lugar.quadroId), [b, lugar.quadroId])
  const cards = useMemo(() => cardsDe(b, lugar.colunaId, demandaId), [b, lugar.colunaId, demandaId])
  const favoritos = new Set(b?.eu.favoritos ?? [])
  const indice = lugar.indice === null || lugar.indice > cards.length ? cards.length : lugar.indice

  const posicoes = Array.from({ length: cards.length + 1 }, (_, i) => ({
    valor: String(i),
    rotulo: i === 0 ? (cards.length ? '1 · no topo' : '1 · coluna vazia')
      : i === cards.length ? `${i + 1} · no fim` : `${i + 1} · depois de #${cards[i - 1]!.numero} ${cards[i - 1]!.titulo}`,
  }))

  return (
    <div className="flex flex-col gap-3">
      <Selecao rotulo="Quadro" value={lugar.quadroId} data-autofocus={focoNoQuadro ? '' : undefined}
        onChange={(e) => {
          const q = e.target.value
          const primeira = colunasDe(b, q).find((c) => c.papel === 'normal') ?? colunasDe(b, q)[0]
          mudar({ quadroId: q, colunaId: primeira?.id ?? '', indice: 0 })
        }}
        opcoes={quadros.map((q) => ({
          valor: q.id, rotulo: `${q.nome}${q.id === quadroAtual ? ' (atual)' : favoritos.has(q.id) ? ' ★' : ''}`,
        }))} />
      <div className="mdl-duas">
        <Selecao rotulo="Coluna" value={lugar.colunaId} data-autofocus={focoNoQuadro ? undefined : ''}
          onChange={(e) => mudar({ ...lugar, colunaId: e.target.value, indice: 0 })}
          opcoes={colunas.map((c) => ({ valor: c.id, rotulo: c.nome }))} vazia={colunas.length ? undefined : 'Sem colunas'} />
        <Selecao rotulo="Posição" value={String(indice)} onChange={(e) => {
          const i = Number(e.target.value)
          mudar({ ...lugar, indice: i >= cards.length ? null : i })
        }} opcoes={posicoes} />
      </div>
    </div>
  )
}
