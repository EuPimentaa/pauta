/**
 * Gráfico de linha da evolução diária (F8), em SVG próprio, sem biblioteca (FASE2.md §2). Duas séries alinhadas por dia
 * (o 1º dia do período atual com o 1º do anterior): a atual em laranja (a ênfase), a anterior tracejada em cinza (o
 * contexto). Um eixo só, 3–4 marcas redondas, grade em linha fina, ponto no fim da atual com anel da superfície.
 *
 * Leitura: a mira acompanha o ponteiro (mouse e toque) e mostra os dois valores do dia; pelo teclado, o gráfico é um
 * controle deslizante (setas, Home, End) que diz o mesmo em `aria-valuetext`. O SVG é `role="img"` com o resumo em texto
 * e [Ver como tabela] mostra todos os valores. Cores só por tokens (os dois temas).
 */
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { Table2 } from 'lucide-react'
import { formatarValor } from '@shared/logica/resultados-formato.ts'
import { diaDaSemana } from '@shared/logica/datas.ts'
import { useCelular } from '../../lib/midia.ts'
import { Botao } from '../../ui/Botao.tsx'
import { diaMes, formatarCompacto, marcasEixo, resumoGrafico, type MetricaGrafico, type PontoGrafico } from './logica.ts'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
const diaCurto = (d: string) => `${DIAS[diaDaSemana(d)]}, ${diaMes(d)}`

function useLargura(ref: RefObject<HTMLElement | null>, padrao: number): number {
  const [largura, setLargura] = useState(padrao)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setLargura(el.clientWidth || padrao)
    const obs = new ResizeObserver(([e]) => { if (e) setLargura(Math.round(e.contentRect.width) || padrao) })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, padrao])
  return largura
}

export interface PropsGraficoSerie {
  metrica: MetricaGrafico
  atual: PontoGrafico[]
  anterior: PontoGrafico[]
  /** "12/10–18/10" */
  rotuloAtual: string
  rotuloAnterior: string
}

export function GraficoSerie({ metrica, atual, anterior, rotuloAtual, rotuloAnterior }: PropsGraficoSerie) {
  const caixa = useRef<HTMLDivElement>(null)
  const celular = useCelular()
  const largura = useLargura(caixa, 640)
  const [indice, setIndice] = useState<number | null>(null)
  const [tabela, setTabela] = useState(false)
  const idResumo = useId()
  const idTabela = useId()

  const n = Math.max(atual.length, anterior.length)
  const fmt = (v: number) => formatarValor(v, metrica.formato)
  const resumo = resumoGrafico(metrica, atual, anterior, { atual: rotuloAtual, anterior: rotuloAnterior })
  const valores = [...atual, ...anterior].map((p) => p.valor)
  const marcas = marcasEixo(Math.max(0, ...valores), metrica.formato === 'inteiro')
  const topo = marcas[marcas.length - 1]!
  const rotulosY = marcas.map((m) => formatarCompacto(m, metrica.formato))
  const altura = celular ? 190 : 230
  const margem = { esq: Math.max(36, Math.max(...rotulosY.map((r) => r.length)) * 7.5 + 12), dir: 14, cima: 10, baixo: 28 }
  const w = Math.max(40, largura - margem.esq - margem.dir)
  const h = altura - margem.cima - margem.baixo
  const passo = n > 1 ? w / (n - 1) : 0
  const x = (i: number) => margem.esq + (n > 1 ? i * passo : w / 2)
  const y = (v: number) => margem.cima + h - (topo > 0 ? (v / topo) * h : 0)
  const caminho = (ps: PontoGrafico[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join('')
  const rotuloDia = (i: number) => atual[i]?.data ?? anterior[i]?.data ?? ''
  const marcasX = [...new Set([0, Math.round((n - 1) / 2), n - 1])].filter((i) => i >= 0 && i < n)

  const textoDia = (i: number) => {
    const a = atual[i]
    const b = anterior[i]
    return [a ? `${diaCurto(a.data)}: ${fmt(a.valor)}` : null, b ? `anterior, ${diaCurto(b.data)}: ${fmt(b.valor)}` : null]
      .filter(Boolean).join('; ')
  }

  function aoMover(e: PointerEvent<HTMLDivElement>) {
    if (n === 0) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left - margem.esq
    setIndice(Math.max(0, Math.min(n - 1, n > 1 ? Math.round(px / passo) : 0)))
  }
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (n === 0) return
    const atualI = indice ?? n - 1
    const novo = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? atualI - 1
      : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? atualI + 1
        : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'PageDown' ? atualI - 7 : e.key === 'PageUp' ? atualI + 7 : null
    if (novo === null) return
    e.preventDefault()
    setIndice(Math.max(0, Math.min(n - 1, novo)))
  }

  if (n === 0) return <p className="res-nota">Sem dias para mostrar neste período.</p>

  const ultimo = atual.length - 1
  const dicaEsquerda = indice !== null && x(indice) > largura / 2
  return (
    <div className="res-grafico-corpo">
      <ul className="res-legenda" aria-label="Legenda">
        <li><span className="res-chave-linha" data-serie="atual" aria-hidden="true" />{rotuloAtual}</li>
        <li><span className="res-chave-linha" data-serie="anterior" aria-hidden="true" />{rotuloAnterior} (anterior)</li>
      </ul>
      <div className="res-plot" ref={caixa}>
        <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-labelledby={idResumo}>
          <title id={idResumo}>{resumo}</title>
          {marcas.map((m, i) => (
            <g key={m}>
              <line className="res-grade" x1={margem.esq} x2={margem.esq + w} y1={y(m)} y2={y(m)} />
              <text className="res-eixo" x={margem.esq - 8} y={y(m)} textAnchor="end" dominantBaseline="middle">{rotulosY[i]}</text>
            </g>
          ))}
          {marcasX.map((i) => (
            <text key={i} className="res-eixo" x={x(i)} y={altura - 8}
              textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{diaMes(rotuloDia(i))}</text>
          ))}
          <path className="res-linha" data-serie="anterior" d={caminho(anterior)} />
          <path className="res-linha" data-serie="atual" d={caminho(atual)} />
          {indice !== null && (
            <g aria-hidden="true">
              <line className="res-mira" x1={x(indice)} x2={x(indice)} y1={margem.cima} y2={margem.cima + h} />
              {anterior[indice] && <circle className="res-ponto" data-serie="anterior" cx={x(indice)} cy={y(anterior[indice]!.valor)} r={4} />}
              {atual[indice] && <circle className="res-ponto" data-serie="atual" cx={x(indice)} cy={y(atual[indice]!.valor)} r={4.5} />}
            </g>
          )}
          {indice === null && ultimo >= 0 && <circle className="res-ponto" data-serie="atual" cx={x(ultimo)} cy={y(atual[ultimo]!.valor)} r={4.5} aria-hidden="true" />}
        </svg>
        <div
          className="res-explorar" style={{ left: 0, top: 0, width: largura, height: altura }}
          role="slider" tabIndex={0} aria-label={`${metrica.rotulo} por dia: escolha o dia com as setas`}
          aria-valuemin={1} aria-valuemax={n} aria-valuenow={(indice ?? n - 1) + 1} aria-valuetext={textoDia(indice ?? n - 1)}
          aria-describedby={idResumo}
          onPointerMove={aoMover} onPointerDown={aoMover} onPointerLeave={(e) => { if (document.activeElement !== e.currentTarget) setIndice(null) }}
          onFocus={() => setIndice((i) => i ?? n - 1)} onBlur={() => setIndice(null)} onKeyDown={aoTeclar}
        />
        {indice !== null && (
          <div className="res-dica" aria-hidden="true"
            style={{ top: margem.cima, ...(dicaEsquerda ? { right: largura - x(indice) + 10 } : { left: x(indice) + 10 }) }}>
            {atual[indice] && (
              <span className="res-dica-linha"><span className="res-chave-linha" data-serie="atual" />
                <strong>{fmt(atual[indice]!.valor)}</strong><span>{diaCurto(atual[indice]!.data)}</span></span>
            )}
            {anterior[indice] && (
              <span className="res-dica-linha"><span className="res-chave-linha" data-serie="anterior" />
                <strong>{fmt(anterior[indice]!.valor)}</strong><span>{diaCurto(anterior[indice]!.data)}</span></span>
            )}
          </div>
        )}
      </div>
      <div>
        <Botao tamanho="p" variante="ghost" icone={Table2} aria-expanded={tabela} aria-controls={idTabela} onClick={() => setTabela((t) => !t)}>
          {tabela ? 'Esconder a tabela' : 'Ver como tabela'}
        </Botao>
      </div>
      {tabela && (
        <div className="res-tabela-rolagem" id={idTabela}>
          <table className="res-tabela res-tabela-serie">
            <caption className="sr-only">{resumo}</caption>
            <thead>
              <tr><th scope="col">Dia</th><th scope="col" className="num">{metrica.rotulo}</th><th scope="col">Dia anterior</th><th scope="col" className="num">Anterior</th></tr>
            </thead>
            <tbody>
              {Array.from({ length: n }, (_, i) => (
                <tr key={i}>
                  <td data-rotulo="Dia">{atual[i] ? diaCurto(atual[i]!.data) : '—'}</td>
                  <td data-rotulo={metrica.rotulo} className="num">{atual[i] ? fmt(atual[i]!.valor) : '—'}</td>
                  <td data-rotulo="Dia anterior">{anterior[i] ? diaCurto(anterior[i]!.data) : '—'}</td>
                  <td data-rotulo="Anterior" className="num">{anterior[i] ? fmt(anterior[i]!.valor) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
