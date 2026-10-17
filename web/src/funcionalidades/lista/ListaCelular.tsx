/**
 * Lista no celular: os cards (CardDemanda do núcleo) agrupados, com o cabeçalho de cada grupo preso no topo ao rolar
 * e recolhível. Publica os grupos para a faixa de chips do cabeçalho (lista-colunas-celular), que pula para eles.
 */
import { useEffect, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Id } from '@shared/tipos/index.ts'
import { CardDemanda } from '../../quadro/index.ts'
import { Contador } from '../../ui/Indicadores.tsx'
import { BandeiraPrioridade } from './celulas.tsx'
import { marcarGrupoAtivo, publicarGrupos } from './estado.ts'
import type { Agrupamento, GrupoLista } from './logica.ts'

interface Props {
  quadroId: Id
  grupos: readonly GrupoLista[]
  agrupar: Agrupamento
  recolhidos: ReadonlySet<string>
  alternarGrupo(id: string): void
}

export function ListaCelular({ quadroId, grupos, agrupar, recolhidos, alternarGrupo }: Props) {
  const rolagem = useRef<HTMLDivElement>(null)
  const semCabeca = agrupar === 'nenhum'

  // a faixa do cabeçalho pula para o grupo (o cabeçalho do grupo fica preso no topo da lista)
  const resumo = useMemo(() => grupos.map((g) => ({ id: g.id, rotulo: g.rotulo, cor: g.cor, quantidade: g.demandas.length })), [grupos])
  useEffect(() => {
    if (semCabeca) { publicarGrupos(null); return }
    publicarGrupos({
      quadroId,
      grupos: resumo,
      ativo: resumo[0]?.id ?? null,
      rolar: (id) => {
        const el = rolagem.current
        const secao = el?.querySelector<HTMLElement>(`[data-grupo-id="${CSS.escape(id)}"]`)
        if (!el || !secao) return
        const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollTo({ top: secao.offsetTop, behavior: reduzido ? 'auto' : 'smooth' })
        marcarGrupoAtivo(id)
      },
    })
    return () => publicarGrupos(null)
  }, [quadroId, resumo, semCabeca])

  // o grupo ativo é o que está no topo da lista
  const aoRolar = () => {
    const el = rolagem.current
    if (!el || semCabeca) return
    const topo = el.scrollTop + 4
    let ativo: string | null = null
    for (const s of el.querySelectorAll<HTMLElement>('[data-grupo-id]')) {
      if (s.offsetTop <= topo) ativo = s.dataset.grupoId ?? null
      else break
    }
    marcarGrupoAtivo(ativo ?? grupos[0]?.id ?? null)
  }

  return (
    <div ref={rolagem} className="lista-celular" onScroll={aoRolar}>
      {grupos.map((g) => {
        const recolhido = !semCabeca && recolhidos.has(g.id)
        const Seta = recolhido ? ChevronRight : ChevronDown
        const filtrado = g.demandas.length !== g.total
        return (
          <section key={g.id} className="lista-cel-grupo" data-grupo-id={g.id} aria-label={semCabeca ? undefined : g.rotulo}>
            {!semCabeca && (
              <h2 className="lista-cel-cabeca">
                <button type="button" className="lista-grupo-botao" aria-expanded={!recolhido} onClick={() => alternarGrupo(g.id)}>
                  <Seta aria-hidden="true" className="lista-grupo-seta" />
                  {g.prioridade ? <BandeiraPrioridade p={g.prioridade} compacta /> : g.cor && <span className="lista-ponto" data-cor={g.cor} aria-hidden="true" />}
                  <span className="lista-grupo-nome">{g.rotulo}</span>
                  <Contador valor={g.total} visiveis={filtrado ? g.demandas.length : undefined} rotulo={g.total === 1 ? 'demanda' : 'demandas'} />
                </button>
              </h2>
            )}
            {!recolhido && (
              <div className="lista-cel-cards">
                {g.demandas.map((d) => <div key={d.id} className="lista-cel-card"><CardDemanda demanda={d} /></div>)}
                {g.demandas.length === 0 && (
                  <p className="lista-cel-vazio">{g.total > 0 ? 'Nenhuma desta coluna com estes filtros.' : 'Nenhuma demanda nesta coluna.'}</p>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
