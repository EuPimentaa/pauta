/**
 * Peças comuns da aba Resultados e da carteira (F8): o seletor de período (na URL `?periodo=`), o cartão de KPI e a
 * variação (seta + número + cor pelo sentido, nunca só a cor), a faixa "Atenção" e o período no `?periodo=`.
 */
import { useId, useRef, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { PERIODOS_RESULTADOS, ROTULO_PERIODO, type AlertaResultado, type ConectorWindsor, type PeriodoResultados } from '@shared/tipos/index.ts'
import {
  definicaoKpi, formatarValor, formatarVariacao, linhaKpi, tomVariacao, variacao, type ChaveKpi,
} from '@shared/logica/resultados-formato.ts'
import { esteMesDisponivel } from '@shared/logica/resultados-periodo.ts'
import { hojeLocal } from '../../lib/datas.ts'
import './resultados.css'

const CURTO: Record<PeriodoResultados, string> = {
  este_mes: 'Este mês', mes_passado: 'Mês passado', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias',
}

/** O período da URL (`?periodo=`, padrão 30d) e a troca que mantém o resto da URL (`?aba=`). */
export function usePeriodoDaUrl(): [PeriodoResultados, (p: PeriodoResultados) => void] {
  const [params, setParams] = useSearchParams()
  const bruto = params.get('periodo')
  const periodo = (PERIODOS_RESULTADOS as readonly string[]).includes(bruto ?? '') ? bruto as PeriodoResultados : '30d'
  const trocar = (p: PeriodoResultados) => setParams((atual) => {
    const n = new URLSearchParams(atual)
    if (p === '30d') n.delete('periodo')
    else n.set('periodo', p)
    return n
  }, { replace: true })
  return [periodo, trocar]
}

/** Grupo de opções (radiogroup) com uma parada de Tab e as setas. No dia 1, "Este mês" fica desabilitado. */
export function SeletorPeriodo({ valor, aoMudar }: { valor: PeriodoResultados; aoMudar(p: PeriodoResultados): void }) {
  const grupo = useRef<HTMLDivElement>(null)
  const dia1 = !esteMesDisponivel(hojeLocal())
  const opcoes = PERIODOS_RESULTADOS.filter((p) => !(p === 'este_mes' && dia1))
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const i = opcoes.indexOf(valor)
    const novo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? opcoes[(i + 1) % opcoes.length]
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? opcoes[(i - 1 + opcoes.length) % opcoes.length]
        : e.key === 'Home' ? opcoes[0] : e.key === 'End' ? opcoes[opcoes.length - 1] : null
    if (!novo) return
    e.preventDefault()
    aoMudar(novo)
    requestAnimationFrame(() => grupo.current?.querySelector<HTMLButtonElement>(`[data-periodo="${novo}"]`)?.focus())
  }
  return (
    <div ref={grupo} className="res-periodos" role="radiogroup" aria-label="Período" onKeyDown={aoTeclar}>
      {PERIODOS_RESULTADOS.map((p) => {
        const desabilitado = p === 'este_mes' && dia1
        return (
          <button key={p} type="button" role="radio" className="res-periodo" data-periodo={p} aria-checked={valor === p}
            tabIndex={valor === p ? 0 : -1} disabled={desabilitado} title={desabilitado ? 'O mês começa a contar amanhã.' : ROTULO_PERIODO[p]}
            onClick={() => aoMudar(p)}>
            {CURTO[p]}
            {desabilitado && <span className="sr-only"> (o mês começa a contar amanhã)</span>}
          </button>
        )
      })}
    </div>
  )
}

/** A variação com seta, número e a cor de `tomVariacao` (verde bom, vermelho ruim, cinza neutro). */
export function Variacao<C extends ConectorWindsor>({ conector, chave, atual, anterior }: {
  conector: C; chave: ChaveKpi<C>; atual: number | null; anterior: number | null
}) {
  const v = variacao(atual, anterior)
  const tom = tomVariacao(definicaoKpi(conector, chave).sentido, v)
  const I = v.tipo !== 'pct' || Math.round(v.fracao * 100) === 0 ? Minus : v.fracao > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="res-variacao" data-tom={tom} aria-hidden="true">
      <I aria-hidden="true" />{formatarVariacao(v)}
    </span>
  )
}

/** Cartão de KPI: rótulo, valor e variação; o leitor de tela ouve a linha do MCP ("Investimento R$ 1.234,56 (+12%)"). */
export function CartaoKpi<C extends ConectorWindsor>({ conector, chave, atual, anterior, dica, pequeno }: {
  conector: C; chave: ChaveKpi<C>; atual: number | null; anterior: number | null; dica?: string; pequeno?: boolean
}) {
  const def = definicaoKpi(conector, chave)
  return (
    <li className="res-cartao" data-pequeno={pequeno ? '' : undefined} title={dica}>
      <span className="sr-only">{linhaKpi(conector, chave, atual, anterior)}{dica ? `. ${dica}` : ''}</span>
      <span className="res-cartao-rotulo" aria-hidden="true">{def.rotulo}{dica ? ' *' : ''}</span>
      <span className="res-cartao-valor" aria-hidden="true">{formatarValor(atual, def.formato)}</span>
      <Variacao conector={conector} chave={chave} atual={atual} anterior={anterior} />
    </li>
  )
}

/** A faixa "Atenção" (some quando não há alerta). */
export function FaixaAtencao({ alertas, prefixo }: { alertas: readonly AlertaResultado[]; prefixo?: (a: AlertaResultado) => string | null }) {
  const id = useId()
  if (alertas.length === 0) return null
  return (
    <section className="res-atencao" aria-labelledby={id}>
      <h3 className="res-atencao-titulo" id={id}><AlertTriangle aria-hidden="true" />Atenção</h3>
      <ul>
        {alertas.map((a, i) => {
          const p = prefixo?.(a)
          return <li key={`${a.tipo}:${a.conector}:${a.contaId ?? ''}:${i}`}>{p ? <strong>{p} · </strong> : null}{a.texto}</li>
        })}
      </ul>
    </section>
  )
}
