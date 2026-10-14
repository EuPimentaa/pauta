/**
 * Contador (pílula com número tabular), BarraProgresso, Esqueleto e EstadoVazio.
 *   <Contador valor={12} />  ·  <Contador valor={6} limite={5} rotulo="demandas" />  (6/5 em destaque)
 *   <BarraProgresso valor={3} max={5} mostrarRotulo />
 *   <Esqueleto largura="60%" altura={14} />  ·  <EsqueletoLinhas linhas={3} />
 *   <EstadoVazio icone={Inbox} titulo="Nenhuma demanda aqui." texto="…" acoes={<Botao>…</Botao>} />
 */
import type { CSSProperties, ReactNode } from 'react'
import type { Icone } from '../extensoes/tipos.ts'
import { cx } from '../lib/classes.ts'

const numero = new Intl.NumberFormat('pt-BR')

export interface PropsContador {
  valor: number
  /** Limite WIP: mostra "valor/limite" e destaca acima dele. */
  limite?: number | null
  /** Palavra para o leitor de tela: "12 demandas". */
  rotulo?: string
  tom?: 'neutro' | 'destaque' | 'suave' | 'acento'
  className?: string
}

export function Contador({ valor, limite, rotulo, tom, className }: PropsContador) {
  const acima = limite != null && valor > limite
  const texto = limite != null ? `${numero.format(valor)}/${numero.format(limite)}` : numero.format(valor)
  const falado = limite != null
    ? `${valor} de ${limite}${rotulo ? ` ${rotulo}` : ''}${acima ? ', acima do limite' : ''}`
    : `${valor}${rotulo ? ` ${rotulo}` : ''}`
  return (
    <span className={cx('ui-contador', className)} data-tom={acima ? 'destaque' : tom}>
      <span aria-hidden="true">{texto}</span>
      <span className="sr-only">{falado}</span>
    </span>
  )
}

export interface PropsBarraProgresso {
  valor: number
  max: number
  /** "3/5" ao lado. */
  mostrarRotulo?: boolean
  rotulo?: string
  altura?: number
  className?: string
}

export function BarraProgresso({ valor, max, mostrarRotulo, rotulo = 'Progresso', altura = 6, className }: PropsBarraProgresso) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0
  return (
    <div className={cx('ui-progresso', className)} data-completo={max > 0 && valor >= max ? 'true' : undefined}>
      <div className="ui-progresso-trilho" style={{ ['--altura' as string]: `${altura}px` }} role="progressbar"
        aria-label={rotulo} aria-valuemin={0} aria-valuemax={max} aria-valuenow={valor} aria-valuetext={`${valor} de ${max}`}>
        <div className="ui-progresso-barra" style={{ width: `${pct}%` }} />
      </div>
      {mostrarRotulo && <span className="ui-progresso-rotulo" aria-hidden="true">{valor}/{max}</span>}
    </div>
  )
}

export interface PropsEsqueleto {
  largura?: number | string
  altura?: number | string
  raio?: number | string
  className?: string
  style?: CSSProperties
}

export function Esqueleto({ largura = '100%', altura = 14, raio, className, style }: PropsEsqueleto) {
  return <span className={cx('ui-esqueleto', className)} aria-hidden="true" style={{ width: largura, height: altura, borderRadius: raio, ...style }} />
}

export function EsqueletoLinhas({ linhas = 3, className }: { linhas?: number; className?: string }) {
  return (
    <span className={cx('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: linhas }, (_, i) => <Esqueleto key={i} largura={i === linhas - 1 ? '62%' : '100%'} />)}
    </span>
  )
}

/** Região carregando, para leitor de tela (o esqueleto em si é aria-hidden). */
export function Carregando({ rotulo = 'Carregando', children }: { rotulo?: string; children: ReactNode }) {
  return <div role="status" aria-label={rotulo} aria-busy="true">{children}</div>
}

export interface PropsEstadoVazio {
  icone?: Icone
  titulo: ReactNode
  texto?: ReactNode
  acoes?: ReactNode
  tamanho?: 'p' | 'm'
  className?: string
}

export function EstadoVazio({ icone: I, titulo, texto, acoes, tamanho = 'm', className }: PropsEstadoVazio) {
  return (
    <div className={cx('ui-vazio', className)} data-tamanho={tamanho}>
      {I && <div className="ui-vazio-icone" aria-hidden="true"><I /></div>}
      <p className="ui-vazio-titulo">{titulo}</p>
      {texto && <p className="ui-vazio-texto">{texto}</p>}
      {acoes && <div className="ui-vazio-acoes">{acoes}</div>}
    </div>
  )
}
