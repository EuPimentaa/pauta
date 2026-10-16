/**
 * Modal (vidro, raio 20, tela cheia abaixo de 768 px) e Folha (painel que sobe do rodapé, desce do topo ou entra pela
 * esquerda; é como popovers e menus aparecem no celular). Os dois: portal em #pauta-camadas, Esc fecha (só a camada do topo),
 * foco preso dentro e devolvido a quem abriu, fundo travado e inert.
 *
 *   <Modal aberto={a} aoFechar={fechar} titulo="Excluir demanda" rodape={<>…botões…</>}>…</Modal>
 *   <Folha aberto={a} aoFechar={fechar} titulo="Menu" lado="topo">…</Folha>
 */
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { raizCamadas, useCamada } from '../lib/camadas.ts'
import { cx } from '../lib/classes.ts'
import { useArmadilhaFoco } from '../lib/foco.ts'
import { usePresenca } from '../lib/presenca.ts'
import { BotaoIcone } from './Botao.tsx'

/** Fecha só quando o clique começa e termina no fundo (arrastar uma seleção para fora não fecha). */
function useCliqueFora(aoFechar: () => void, ativo: boolean) {
  const comecou = useRef<EventTarget | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent) => { comecou.current = e.target },
    onClick: (e: React.MouseEvent) => {
      if (ativo && e.target === e.currentTarget && comecou.current === e.currentTarget) aoFechar()
      comecou.current = null
    },
  }
}

export interface PropsModal {
  aberto: boolean
  aoFechar(): void
  /** Título visível (e nome acessível). Com `semCabecalho`, use `rotulo`. */
  titulo?: ReactNode
  descricao?: ReactNode
  /** Nome acessível quando o título não é texto ou não aparece. */
  rotulo?: string
  tamanho?: 'p' | 'm' | 'g' | 'xg'
  rodape?: ReactNode
  /** Botões extras ao lado do fechar (ex.: menu ···). */
  acoesCabeca?: ReactNode
  /** O conteúdo desenha o próprio cabeçalho (o modal da demanda). */
  semCabecalho?: boolean
  fecharAoClicarFora?: boolean
  className?: string
  classeCorpo?: string
  children?: ReactNode
}

export function Modal({
  aberto, aoFechar, titulo, descricao, rotulo, tamanho = 'm', rodape, acoesCabeca, semCabecalho,
  fecharAoClicarFora = true, className, classeCorpo, children,
}: PropsModal) {
  const { montado, estado } = usePresenca(aberto, 140)
  const ref = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idDescr = useId()
  useCamada(aberto, { modal: true, aoEsc: aoFechar })
  useArmadilhaFoco(ref, aberto && montado)
  const fora = useCliqueFora(aoFechar, fecharAoClicarFora)
  if (!montado) return null
  return createPortal(
    <>
      <div className="ui-scrim" data-estado={estado} aria-hidden="true" />
      <div className="ui-modal-posicao" {...fora}>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={!semCabecalho && titulo ? idTitulo : undefined}
          aria-label={semCabecalho || !titulo ? rotulo : undefined}
          aria-describedby={descricao ? idDescr : undefined}
          tabIndex={-1}
          className={cx('ui-modal vidro', className)}
          data-tamanho={tamanho}
          data-estado={estado}
        >
          {!semCabecalho && (
            <div className="ui-modal-cabeca">
              <div className="ui-modal-titulos">
                {titulo && <h2 id={idTitulo} className="ui-modal-titulo">{titulo}</h2>}
                {descricao && <p id={idDescr} className="ui-modal-descricao">{descricao}</p>}
              </div>
              {acoesCabeca}
              <BotaoIcone icone={X} rotulo="Fechar" atalho="esc" onClick={aoFechar} />
            </div>
          )}
          <div className={cx('ui-modal-corpo', classeCorpo)}>{children}</div>
          {rodape && <div className="ui-modal-rodape">{rodape}</div>}
        </div>
      </div>
    </>,
    raizCamadas(),
  )
}

export interface PropsFolha {
  aberto: boolean
  aoFechar(): void
  titulo?: ReactNode
  rotulo?: string
  lado?: 'baixo' | 'topo' | 'esquerda'
  /** Esconde o cabeçalho com título e fechar (o conteúdo traz o seu). */
  semCabecalho?: boolean
  className?: string
  classeCorpo?: string
  children?: ReactNode
}

export function Folha({ aberto, aoFechar, titulo, rotulo, lado = 'baixo', semCabecalho, className, classeCorpo, children }: PropsFolha) {
  const { montado, estado } = usePresenca(aberto, 200)
  const ref = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  useCamada(aberto, { modal: true, aoEsc: aoFechar })
  useArmadilhaFoco(ref, aberto && montado)
  if (!montado) return null
  return createPortal(
    <>
      <div className="ui-scrim" data-estado={estado} onClick={aoFechar} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo && !semCabecalho ? idTitulo : undefined}
        aria-label={!titulo || semCabecalho ? rotulo : undefined}
        tabIndex={-1}
        className={cx('ui-folha vidro', className)}
        data-lado={lado}
        data-estado={estado}
      >
        {lado === 'baixo' && <div className="ui-folha-alca" aria-hidden="true" />}
        {!semCabecalho && (
          <div className="ui-folha-cabeca">
            <h2 id={idTitulo} className="ui-folha-titulo">{titulo}</h2>
            <BotaoIcone icone={X} rotulo="Fechar" onClick={aoFechar} semDica />
          </div>
        )}
        <div className={cx('ui-folha-corpo', classeCorpo)}>{children}</div>
      </div>
    </>,
    raizCamadas(),
  )
}
