/**
 * Botões. Primário laranja: UM por tela (marca §1). Secundário, ghost e perigo para o resto.
 *   <Botao variante="primario" icone={Plus}>Nova demanda</Botao>
 *   <BotaoIcone icone={MoreHorizontal} rotulo="Mais ações" atalho="." />
 * propsBotao() estiliza um <Link> do react-router como botão.
 */
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Loader2 } from 'lucide-react'
import type { Icone } from '../extensoes/tipos.ts'
import { cx } from '../lib/classes.ts'
import { ariaTecla } from '../lib/teclas.ts'
import { Tooltip } from './Tooltip.tsx'
import type { Lado } from '../lib/posicao.ts'

export type VarianteBotao = 'primario' | 'secundario' | 'ghost' | 'perigo' | 'perigo-cheio'
export type TamanhoBotao = 'p' | 'm' | 'g'

export interface PropsBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  icone?: Icone
  iconeDireita?: Icone
  carregando?: boolean
  larguraTotal?: boolean
  /** Mostra a tecla no tooltip e anuncia em aria-keyshortcuts. */
  atalho?: string
  dica?: string
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

export function Botao({
  variante = 'secundario', tamanho = 'm', icone: IconeEsq, iconeDireita: IconeDir, carregando, larguraTotal, atalho, dica,
  className, children, type = 'button', disabled, ref, ...resto
}: PropsBotao) {
  const botao = (
    <button
      ref={ref}
      type={type}
      className={cx('ui-botao', className)}
      data-variante={variante}
      data-tamanho={tamanho}
      data-largura={larguraTotal ? 'total' : undefined}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      aria-keyshortcuts={atalho ? ariaTecla(atalho) : undefined}
      {...resto}
    >
      {IconeEsq && <IconeEsq aria-hidden="true" />}
      {children !== undefined && <span>{children}</span>}
      {IconeDir && <IconeDir aria-hidden="true" />}
      {carregando && <Loader2 className="ui-giro" aria-hidden="true" />}
    </button>
  )
  if (!atalho && !dica) return botao
  return <Tooltip texto={dica ?? children} atalho={atalho}>{botao}</Tooltip>
}

/** Props para estilizar um link como botão: <Link {...propsBotao({ variante: 'ghost' })} to="/x">. */
export function propsBotao(o: { variante?: VarianteBotao; tamanho?: TamanhoBotao; className?: string } = {}) {
  return {
    className: cx('ui-botao', o.className),
    'data-variante': o.variante ?? 'secundario',
    'data-tamanho': o.tamanho ?? 'm',
  } as const
}

export interface PropsBotaoIcone extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icone: Icone
  /** Nome acessível e texto do tooltip (obrigatório: botão só com ícone). */
  rotulo: string
  atalho?: string
  tamanho?: TamanhoBotao
  variante?: 'ghost' | 'secundario'
  ladoDica?: Lado
  semDica?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function BotaoIcone({
  icone: I, rotulo, atalho, tamanho = 'm', variante = 'ghost', ladoDica = 'baixo', semDica, className, type = 'button', ref, ...resto
}: PropsBotaoIcone) {
  const botao = (
    <button
      ref={ref}
      type={type}
      className={cx('ui-botao-icone', className)}
      data-tamanho={tamanho}
      data-variante={variante}
      aria-label={rotulo}
      aria-keyshortcuts={atalho ? ariaTecla(atalho) : undefined}
      {...resto}
    >
      <I aria-hidden="true" />
    </button>
  )
  if (semDica) return botao
  return <Tooltip texto={rotulo} atalho={atalho} lado={ladoDica}>{botao}</Tooltip>
}
