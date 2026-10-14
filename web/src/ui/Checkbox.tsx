/**
 * Checkbox (input nativo por baixo: teclado e leitor de tela de graça) e Interruptor (role="switch").
 *   <Checkbox checked={feito} onChange={(e) => marcar(e.target.checked)}>Revisar texto</Checkbox>
 *   <Interruptor ligado={atalhos} aoMudar={setAtalhos}>Atalhos de uma tecla</Interruptor>
 */
import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import { cx } from '../lib/classes.ts'

export interface PropsCheckbox extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children?: ReactNode
  descricao?: ReactNode
  indeterminado?: boolean
  /** 'sucesso' para "Concluída" (verde); padrão laranja (seleção). */
  tom?: 'acento' | 'sucesso'
}

export function Checkbox({ children, descricao, indeterminado, tom = 'acento', className, disabled, ...input }: PropsCheckbox) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminado }, [indeterminado])
  const caixa = (
    <span className="ui-check-caixa" data-tom={tom}>
      <input ref={ref} type="checkbox" disabled={disabled} {...input} />
      {indeterminado ? <Minus aria-hidden="true" /> : <Check aria-hidden="true" />}
    </span>
  )
  if (!children) return caixa
  return (
    <label className={cx('ui-check', className)} data-desabilitado={disabled ? 'true' : undefined}>
      {caixa}
      <span>
        {children}
        {descricao && <span className="ui-check-descricao">{descricao}</span>}
      </span>
    </label>
  )
}

export interface PropsInterruptor {
  ligado: boolean
  aoMudar(ligado: boolean): void
  children?: ReactNode
  /** Sem texto visível: nome acessível. */
  rotulo?: string
  desabilitado?: boolean
  className?: string
}

export function Interruptor({ ligado, aoMudar, children, rotulo, desabilitado, className }: PropsInterruptor) {
  const id = useId()
  return (
    <span className={cx('ui-interruptor', className)}>
      <button
        type="button"
        role="switch"
        id={id}
        className="ui-interruptor-trilho"
        aria-checked={ligado}
        aria-label={children ? undefined : rotulo}
        disabled={desabilitado}
        onClick={() => aoMudar(!ligado)}
      />
      {children && <label htmlFor={id}>{children}</label>}
    </span>
  )
}
