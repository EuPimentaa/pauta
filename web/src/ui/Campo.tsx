/**
 * Campos de formulário com rótulo, ajuda e erro ligados por aria (aria-describedby, aria-invalid).
 *   <Campo rotulo="E-mail" type="email" autoComplete="email" erro={erro} />
 *   <AreaTexto rotulo="Observação" linhas={4} />
 *   <Selecao rotulo="Papel" opcoes={[{ valor: 'admin', rotulo: 'Admin' }]} value={p} onChange={...} />
 *   <GrupoCampo rotulo="Cliente">{(aria) => <Combobox {...aria} … />}</GrupoCampo>
 */
import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'
import type { Icone } from '../extensoes/tipos.ts'
import { cx } from '../lib/classes.ts'

export function Rotulo({ htmlFor, children, opcional, className, id }: { htmlFor?: string; children: ReactNode; opcional?: boolean; className?: string; id?: string }) {
  return (
    <label htmlFor={htmlFor} id={id} className={cx('ui-rotulo', className)}>
      {children}
      {opcional && <span className="ui-rotulo-opcional">(opcional)</span>}
    </label>
  )
}

export interface AriaCampo {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

export interface PropsGrupoCampo {
  rotulo?: ReactNode
  /** Rótulo só para leitor de tela (o visual já explica). */
  rotuloOculto?: boolean
  ajuda?: ReactNode
  erro?: ReactNode
  opcional?: boolean
  id?: string
  className?: string
  children: (aria: AriaCampo) => ReactNode
}

export function GrupoCampo({ rotulo, rotuloOculto, ajuda, erro, opcional, id: idDado, className, children }: PropsGrupoCampo) {
  const gerado = useId()
  const id = idDado ?? gerado
  const idAjuda = ajuda ? `${id}-ajuda` : undefined
  const idErro = erro ? `${id}-erro` : undefined
  const descr = [idErro, idAjuda].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx('ui-campo-grupo', className)}>
      {rotulo && <Rotulo htmlFor={id} opcional={opcional} className={rotuloOculto ? 'sr-only' : undefined}>{rotulo}</Rotulo>}
      {children({ id, 'aria-describedby': descr, 'aria-invalid': erro ? true : undefined })}
      {erro && <p id={idErro} className="ui-campo-erro"><AlertCircle aria-hidden="true" />{erro}</p>}
      {ajuda && <p id={idAjuda} className="ui-campo-ajuda">{ajuda}</p>}
    </div>
  )
}

type Base = Omit<PropsGrupoCampo, 'children' | 'className'> & { classeGrupo?: string }

export interface PropsCampo extends Base, Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'size'> {
  icone?: Icone
  /** Elemento no fim da caixa (ex.: botão de mostrar senha). */
  sufixo?: ReactNode
  tamanho?: 'p' | 'm'
  ref?: Ref<HTMLInputElement>
}

export function Campo({ rotulo, rotuloOculto, ajuda, erro, opcional, id, classeGrupo, icone: I, sufixo, tamanho = 'm', className, disabled, ref, ...input }: PropsCampo) {
  return (
    <GrupoCampo rotulo={rotulo} rotuloOculto={rotuloOculto} ajuda={ajuda} erro={erro} opcional={opcional} id={id} className={classeGrupo}>
      {(aria) => (
        <div className={cx('ui-entrada', className)} data-tamanho={tamanho} data-invalido={erro ? 'true' : undefined} data-desabilitado={disabled ? 'true' : undefined}>
          {I && <I aria-hidden="true" />}
          <input ref={ref} disabled={disabled} {...aria} {...input} />
          {sufixo && <span className="ui-entrada-sufixo">{sufixo}</span>}
        </div>
      )}
    </GrupoCampo>
  )
}

export interface PropsAreaTexto extends Base, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  /** Altura mínima em linhas (cresce com o texto). */
  linhas?: number
  ref?: Ref<HTMLTextAreaElement>
}

export function AreaTexto({ rotulo, rotuloOculto, ajuda, erro, opcional, id, classeGrupo, linhas = 3, className, disabled, ref, style, ...area }: PropsAreaTexto) {
  return (
    <GrupoCampo rotulo={rotulo} rotuloOculto={rotuloOculto} ajuda={ajuda} erro={erro} opcional={opcional} id={id} className={classeGrupo}>
      {(aria) => (
        <div className={cx('ui-entrada ui-entrada-texto', className)} data-invalido={erro ? 'true' : undefined} data-desabilitado={disabled ? 'true' : undefined}>
          <textarea ref={ref} disabled={disabled} rows={linhas} style={{ ['--linhas' as string]: linhas, ...style }} {...aria} {...area} />
        </div>
      )}
    </GrupoCampo>
  )
}

export interface OpcaoSelecao { valor: string; rotulo: string; desabilitada?: boolean }

export interface PropsSelecao extends Base, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  opcoes: OpcaoSelecao[]
  /** Primeira opção vazia ("Escolha…"). */
  vazia?: string
  tamanho?: 'p' | 'm'
  ref?: Ref<HTMLSelectElement>
}

/** Select nativo (acessível e bom no celular) com o visual da marca. */
export function Selecao({ rotulo, rotuloOculto, ajuda, erro, opcional, id, classeGrupo, opcoes, vazia, tamanho = 'm', className, disabled, ref, ...sel }: PropsSelecao) {
  return (
    <GrupoCampo rotulo={rotulo} rotuloOculto={rotuloOculto} ajuda={ajuda} erro={erro} opcional={opcional} id={id} className={classeGrupo}>
      {(aria) => (
        <div className={cx('ui-entrada', className)} data-tamanho={tamanho} data-invalido={erro ? 'true' : undefined} data-desabilitado={disabled ? 'true' : undefined}>
          <select ref={ref} disabled={disabled} {...aria} {...sel}>
            {vazia !== undefined && <option value="">{vazia}</option>}
            {opcoes.map((o) => <option key={o.valor} value={o.valor} disabled={o.desabilitada}>{o.rotulo}</option>)}
          </select>
          <ChevronDown className="ui-selecao-seta" aria-hidden="true" />
        </div>
      )}
    </GrupoCampo>
  )
}
