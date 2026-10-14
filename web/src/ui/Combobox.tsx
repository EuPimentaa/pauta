/**
 * Combobox com autocompletar (padrão ARIA 1.2: input role=combobox + listbox; aria-activedescendant).
 * Filtra sem acento e sem caixa; ↑ ↓ movem, Enter escolhe, Esc fecha a lista (e depois desfaz o texto).
 * `extra` oferece uma ação no fim da lista ("Criar cliente XYZ").
 *
 *   <GrupoCampo rotulo="Cliente">{(aria) => (
 *     <Combobox {...aria} opcoes={clientes} valor={c} aoMudar={setC} idDe={(x) => x.id}
 *       rotuloDe={(x) => x.sigla} detalheDe={(x) => x.nome} placeholder="Sigla ou nome" />
 *   )}</GrupoCampo>
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { raizCamadas, useCamada } from '../lib/camadas.ts'
import { cx } from '../lib/classes.ts'
import { usePosicao } from '../lib/posicao.ts'

export function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface PropsCombobox<T> {
  opcoes: readonly T[]
  valor: T | null
  aoMudar(v: T | null): void
  idDe(o: T): string
  rotuloDe(o: T): string
  detalheDe?(o: T): string | undefined
  /** Elemento antes do rótulo (ponto de cor, avatar). */
  iconeDe?(o: T): ReactNode
  filtrar?(o: T, termoNormalizado: string): boolean
  placeholder?: string
  vazio?: string
  extra?(termo: string): { rotulo: string; executar(): void } | null
  permitirLimpar?: boolean
  /** Máximo de opções na lista. */
  limite?: number
  desabilitado?: boolean
  tamanho?: 'p' | 'm'
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-label'?: string
  className?: string
}

export function Combobox<T>({
  opcoes, valor, aoMudar, idDe, rotuloDe, detalheDe, iconeDe, filtrar, placeholder, vazio = 'Nada encontrado.', extra,
  permitirLimpar, limite = 50, desabilitado, tamanho = 'm', id: idDado, className, ...aria
}: PropsCombobox<T>) {
  const gerado = useId()
  const id = idDado ?? gerado
  const idLista = `${id}-lista`
  const caixa = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const [aberta, setAberta] = useState(false)
  const [termo, setTermo] = useState<string | null>(null)   // null = mostrando o valor escolhido
  const [ativa, setAtiva] = useState(0)

  const texto = termo ?? (valor ? rotuloDe(valor) : '')
  const filtradas = useMemo(() => {
    const t = normalizarBusca(termo ?? '')
    const lista = !t ? opcoes : opcoes.filter((o) => (filtrar
      ? filtrar(o, t)
      : normalizarBusca(`${rotuloDe(o)} ${detalheDe?.(o) ?? ''}`).includes(t)))
    return lista.slice(0, limite)
  }, [opcoes, termo, filtrar, rotuloDe, detalheDe, limite])
  const acaoExtra = termo?.trim() ? extra?.(termo.trim()) ?? null : null
  const total = filtradas.length + (acaoExtra ? 1 : 0)

  useCamada(aberta, { aoEsc: () => setAberta(false) })
  const { estilo, medindo } = usePosicao(caixa.current, lista, aberta, { lado: 'baixo', alinhar: 'inicio', distancia: 4 })

  useEffect(() => { if (ativa >= total) setAtiva(Math.max(0, total - 1)) }, [total, ativa])
  useEffect(() => {
    if (!aberta) return
    lista.current?.querySelector(`#${CSS.escape(`${id}-op-${ativa}`)}`)?.scrollIntoView({ block: 'nearest' })
  }, [ativa, aberta, id])

  useEffect(() => {
    if (!aberta) return
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (caixa.current?.contains(alvo) || lista.current?.contains(alvo)) return
      setAberta(false)
      setTermo(null)
    }
    document.addEventListener('pointerdown', fora, true)
    return () => document.removeEventListener('pointerdown', fora, true)
  }, [aberta])

  function escolher(i: number) {
    if (i < filtradas.length) {
      aoMudar(filtradas[i])
    } else if (acaoExtra) {
      acaoExtra.executar()
    }
    setTermo(null)
    setAberta(false)
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!aberta) setAberta(true); else setAtiva((a) => Math.min(total - 1, a + 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtiva((a) => Math.max(0, a - 1)); return }
    if (e.key === 'Enter' && aberta) { e.preventDefault(); if (total > 0) escolher(ativa); return }
    if (e.key === 'Escape' && !aberta && termo !== null) { e.preventDefault(); setTermo(null) }
    if (e.key === 'Tab' && aberta) { setAberta(false); setTermo(null) }
  }

  const idAtiva = aberta && total > 0 ? `${id}-op-${ativa}` : undefined
  return (
    <div ref={caixa} className={cx('ui-entrada', className)} data-tamanho={tamanho} data-invalido={aria['aria-invalid'] ? 'true' : undefined}
      data-desabilitado={desabilitado ? 'true' : undefined}>
      {valor && termo === null && iconeDe?.(valor)}
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={aberta}
        aria-controls={idLista}
        aria-activedescendant={idAtiva}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        aria-label={aria['aria-label']}
        placeholder={placeholder}
        disabled={desabilitado}
        value={texto}
        onChange={(e) => { setTermo(e.target.value); setAtiva(0); setAberta(true) }}
        onKeyDown={aoTeclar}
        onClick={() => setAberta(true)}
        onBlur={(e) => { if (!lista.current?.contains(e.relatedTarget as Node)) { setAberta(false); setTermo(null) } }}
      />
      {permitirLimpar && valor && !desabilitado ? (
        <button type="button" className="ui-botao-icone" data-tamanho="p" aria-label="Limpar" onClick={() => { aoMudar(null); setTermo(null); input.current?.focus() }}>
          <X aria-hidden="true" />
        </button>
      ) : (
        <ChevronDown aria-hidden="true" />
      )}
      {aberta && createPortal(
        <div
          ref={lista}
          id={idLista}
          role="listbox"
          aria-label={aria['aria-label'] ?? placeholder ?? 'Opções'}
          className="ui-popover ui-lista vidro"
          style={{ ...estilo, width: caixa.current?.offsetWidth, minWidth: 220 }}
          data-medindo={medindo || undefined}
        >
          {filtradas.map((o, i) => {
            const sel = valor !== null && idDe(o) === idDe(valor)
            return (
              <div
                key={idDe(o)}
                id={`${id}-op-${i}`}
                role="option"
                aria-selected={sel}
                className="ui-opcao"
                data-ativa={i === ativa || undefined}
                onPointerDown={(e) => e.preventDefault()}
                onPointerMove={() => setAtiva(i)}
                onClick={() => escolher(i)}
              >
                {iconeDe?.(o)}
                <span className="min-w-0 truncate">{rotuloDe(o)}</span>
                {detalheDe?.(o) && <span className="ui-opcao-detalhe truncate">{detalheDe(o)}</span>}
                {sel && <Check className="ui-opcao-marca" aria-hidden="true" />}
              </div>
            )
          })}
          {filtradas.length === 0 && !acaoExtra && <div className="ui-lista-vazia" role="presentation">{vazio}</div>}
          {acaoExtra && (
            <div
              id={`${id}-op-${filtradas.length}`}
              role="option"
              aria-selected={false}
              className="ui-opcao"
              data-extra="true"
              data-ativa={ativa === filtradas.length || undefined}
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => setAtiva(filtradas.length)}
              onClick={() => escolher(filtradas.length)}
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>{acaoExtra.rotulo}</span>
            </div>
          )}
        </div>,
        raizCamadas(),
      )}
    </div>
  )
}
