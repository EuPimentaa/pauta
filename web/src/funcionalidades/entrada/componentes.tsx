/**
 * Peças da Nova demanda: a grade de modelos e os segmentos (grupos de rádio com foco itinerante: Tab entra no
 * marcado, as setas andam e marcam, como o rádio nativo, mas com o anel no próprio cartão), as pessoas (chips +
 * adicionar) e as etiquetas do quadro (botões que ligam e desligam).
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, Plus, Repeat2, X } from 'lucide-react'
import type { Etiqueta, Id, ModeloDemanda, UsuarioResumo } from '@shared/tipos/index.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Combobox, normalizarBusca } from '../../ui/Combobox.tsx'
import { cx } from '../../lib/classes.ts'
import { iconeDoModelo } from './icones.ts'
import { nomeCurto } from '@shared/logica/rapida.ts'

// ─────────────────────────────── grupo de rádio ───────────────────────────────

/** Setas, Home e End movem a escolha entre os botões do grupo (role=radio) e levam o foco junto. */
function teclasDoGrupo(e: KeyboardEvent<HTMLElement>, ids: readonly string[], atual: string, escolher: (id: string) => void, colunas = 1) {
  const i = Math.max(0, ids.indexOf(atual))
  const mapa: Record<string, number> = {
    ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + colunas, ArrowUp: i - colunas, Home: 0, End: ids.length - 1,
  }
  if (!(e.key in mapa)) return
  e.preventDefault()
  const alvo = Math.min(ids.length - 1, Math.max(0, mapa[e.key]!))
  escolher(ids[alvo]!)
  const grupo = e.currentTarget
  requestAnimationFrame(() => grupo.querySelector<HTMLElement>(`[data-valor="${CSS.escape(ids[alvo]!)}"]`)?.focus())
}

export interface PropsSegmentos<T extends string> {
  rotulo: string
  opcoes: readonly { valor: T; rotulo: string; dica?: string }[]
  valor: T
  aoMudar(v: T): void
  className?: string
}

/** Escolha curta (prioridade): botões lado a lado. */
export function Segmentos<T extends string>({ rotulo, opcoes, valor, aoMudar, className }: PropsSegmentos<T>) {
  const ids = opcoes.map((o) => o.valor)
  return (
    <div role="radiogroup" aria-label={rotulo} className={cx('entrada-segmentos', className)}
      onKeyDown={(e) => teclasDoGrupo(e, ids, valor, (v) => aoMudar(v as T))}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={o.valor === valor} tabIndex={o.valor === valor ? 0 : -1}
          data-valor={o.valor} className="entrada-segmento" title={o.dica} onClick={() => aoMudar(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────── modelos ───────────────────────────────

export interface PropsGradeModelos {
  modelos: readonly ModeloDemanda[]
  /** null = sem modelo. */
  valor: Id | null
  aoMudar(id: Id | null): void
  /** Modelo sugerido pelo Colar do WhatsApp (selo "sugerido"). */
  sugerido?: Id | null
  idRotulo: string
}

const SEM = '__sem__'

/**
 * Com um modelo escolhido (clique, Enter ou o foco saindo da grade), a grade recolhe numa linha "Carrossel · Trocar"
 * e devolve o espaço à descrição; as setas andam entre os cartões sem recolher.
 */
export function GradeModelos({ modelos, valor, aoMudar, sugerido, idRotulo }: PropsGradeModelos) {
  const grade = useRef<HTMLDivElement>(null)
  const trocar = useRef<HTMLButtonElement>(null)
  const [expandida, setExpandida] = useState(valor === null)
  const ids = [SEM, ...modelos.map((m) => m.id)]
  const atual = valor ?? SEM
  const escolhido = valor ? modelos.find((m) => m.id === valor) ?? null : null
  if (escolhido && !expandida) {
    const I = iconeDoModelo(escolhido.icone)
    return (
      <div className="entrada-modelo-escolhido" role="group" aria-labelledby={idRotulo}>
        <span className="entrada-modelo-icone" aria-hidden="true"><I /></span>
        <span className="entrada-modelo-textos">
          <span className="entrada-modelo-nome">
            {escolhido.nome}
            {sugerido === escolhido.id && <span className="entrada-selo">sugerido</span>}
          </span>
          {escolhido.descricao && <span className="entrada-modelo-descricao">{escolhido.descricao}</span>}
        </span>
        <Botao ref={trocar} variante="ghost" tamanho="p" icone={Repeat2} onClick={() => {
          setExpandida(true)
          requestAnimationFrame(() => grade.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
        }}>Trocar</Botao>
      </div>
    )
  }
  const recolher = () => requestAnimationFrame(() => {
    setExpandida(false)
    requestAnimationFrame(() => trocar.current?.focus())
  })
  const colunas = () => {
    const el = grade.current
    if (!el) return 1
    return getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length || 1
  }
  const cartao = (id: string, nome: string, descricao: string, icone: ReactNode, quadro: boolean) => (
    <button key={id} type="button" role="radio" aria-checked={atual === id} tabIndex={atual === id ? 0 : -1} data-valor={id}
      className="entrada-modelo" onClick={() => { aoMudar(id === SEM ? null : id); if (id !== SEM) recolher() }} title={descricao || undefined}>
      <span className="entrada-modelo-icone" aria-hidden="true">{icone}</span>
      <span className="entrada-modelo-textos">
        <span className="entrada-modelo-nome">
          {nome}
          {sugerido === id && <span className="entrada-selo">sugerido</span>}
          {quadro && <span className="sr-only"> (deste quadro)</span>}
        </span>
        {descricao && <span className="entrada-modelo-descricao">{descricao}</span>}
      </span>
    </button>
  )
  return (
    <div ref={grade} role="radiogroup" aria-labelledby={idRotulo} className="entrada-modelos"
      onKeyDown={(e) => teclasDoGrupo(e, ids, atual, (id) => aoMudar(id === SEM ? null : id), colunas())}
      onBlur={(e) => { if (valor && !e.currentTarget.contains(e.relatedTarget as Node | null)) setExpandida(false) }}>
      {cartao(SEM, 'Sem modelo', 'Só o título e o que você escrever.', <span className="entrada-modelo-traco">—</span>, false)}
      {modelos.map((m) => {
        const I = iconeDoModelo(m.icone)
        return cartao(m.id, m.nome, m.descricao, <I />, m.quadroId !== null)
      })}
    </div>
  )
}

// ─────────────────────────────── pessoas ───────────────────────────────

export interface PropsSeletorPessoas {
  pessoas: readonly UsuarioResumo[]
  valor: readonly Id[]
  aoMudar(ids: Id[]): void
  /** A pessoa da coluna (entra sozinha; aparece fixa). */
  fixa?: Id | null
  id?: string
  'aria-describedby'?: string
}

export function SeletorPessoas({ pessoas, valor, aoMudar, fixa, id, ...aria }: PropsSeletorPessoas) {
  const porId = new Map(pessoas.map((p) => [p.id, p]))
  const escolhidas = valor.map((i) => porId.get(i)).filter((p): p is UsuarioResumo => !!p && p.id !== fixa)
  const fixaP = fixa ? porId.get(fixa) : undefined
  const livres = pessoas.filter((p) => p.ativo && !valor.includes(p.id) && p.id !== fixa)
  return (
    <div className="entrada-pessoas">
      {(fixaP || escolhidas.length > 0) && (
        <ul className="entrada-chips" aria-label="Pessoas na demanda">
          {fixaP && (
            <li className="entrada-chip" data-fixa="">
              <Avatar pessoa={fixaP} tamanho={20} dica={false} />
              <span>{nomeCurto(fixaP)}</span>
              <span className="entrada-chip-nota">pela coluna</span>
            </li>
          )}
          {escolhidas.map((p) => (
            <li key={p.id} className="entrada-chip">
              <Avatar pessoa={p} tamanho={20} dica={false} />
              <span>{nomeCurto(p)}</span>
              <button type="button" className="entrada-chip-tirar" aria-label={`Tirar ${p.nome}`}
                onClick={() => aoMudar(valor.filter((x) => x !== p.id))}>
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Combobox<UsuarioResumo>
        id={id}
        aria-describedby={aria['aria-describedby']}
        tamanho="p"
        opcoes={livres}
        valor={null}
        aoMudar={(p) => { if (p) aoMudar([...valor, p.id]) }}
        idDe={(p) => p.id}
        rotuloDe={(p) => p.nome}
        detalheDe={(p) => (p.apelido && p.apelido !== p.nome.split(' ')[0] ? p.apelido : undefined)}
        iconeDe={(p) => <Avatar pessoa={p} tamanho={20} dica={false} />}
        filtrar={(p, t) => normalizarBusca(`${p.nome} ${p.apelido ?? ''}`).includes(t)}
        placeholder="Adicionar pessoa"
        vazio="Ninguém com esse nome."
      />
    </div>
  )
}

// ─────────────────────────────── etiquetas ───────────────────────────────

export interface PropsSeletorEtiquetas {
  etiquetas: readonly Etiqueta[]
  valor: readonly Id[]
  aoMudar(ids: Id[]): void
  /** Etiquetas do modelo que ainda não existem no quadro (nascem com a demanda). */
  novas?: readonly { nome: string; cor: Etiqueta['cor'] }[]
  idRotulo: string
}

export function SeletorEtiquetas({ etiquetas, valor, aoMudar, novas = [], idRotulo }: PropsSeletorEtiquetas) {
  if (etiquetas.length === 0 && novas.length === 0) return <p className="entrada-vazio">Este quadro ainda não tem etiquetas.</p>
  return (
    <div role="group" aria-labelledby={idRotulo} className="entrada-etiquetas">
      {etiquetas.map((e) => {
        const ligada = valor.includes(e.id)
        // marcada: cheia na cor da etiqueta, com ✓; não marcada: só o contorno e o +, para não parecer já aplicada
        return (
          <button key={e.id} type="button" className="entrada-etiqueta" data-cor={e.cor} aria-pressed={ligada}
            aria-label={e.nome ? undefined : `Etiqueta sem nome (${e.cor})`}
            onClick={() => aoMudar(ligada ? valor.filter((x) => x !== e.id) : [...valor, e.id])}>
            {ligada ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
            <span className="entrada-etiqueta-ponto" aria-hidden="true" />
            {e.nome && <span className="entrada-etiqueta-nome">{e.nome}</span>}
          </button>
        )
      })}
      {novas.map((e) => (
        <span key={e.nome} className="entrada-etiqueta" data-cor={e.cor} data-nova="" data-marcada=""
          title="Nasce no quadro com a demanda (etiqueta do modelo)">
          <Check aria-hidden="true" />
          <span className="entrada-etiqueta-ponto" aria-hidden="true" />
          <span className="entrada-etiqueta-nome">{e.nome}</span>
          <span className="sr-only"> (nova, do modelo)</span>
        </span>
      ))}
    </div>
  )
}
