/**
 * Peças do modal (F1) que as seções e os diálogos dividem: o cabeçalho de seção da coluna principal, a linha de
 * propriedade do painel lateral, quem pode ser mencionado, nomes e tempo relativo. Traz o modal.css para o chunk.
 */
import './modal.css'
import { useCallback, useMemo, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Bootstrap, Demanda, Id, Instante, UsuarioResumo } from '@shared/tipos/index.ts'
import { FUSO } from '@shared/tipos/index.ts'
import { demandaConhecida } from '../../api/cache.ts'
import { useCamada } from '../../lib/camadas.ts'
import { useDemanda, useDoBootstrap } from '../../api/seletores.ts'
import { cx } from '../../lib/classes.ts'
import { normalizarBusca } from '../../ui/Combobox.tsx'
import type { PessoaMencao } from '../../ui/EditorMarkdown.tsx'

// ─────────────────────────────── seção principal ───────────────────────────────

export function Secao({ id, icone: Icone, titulo, meta, acoes, children, className }: {
  id: string; icone: LucideIcon; titulo: string; meta?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={cx('modal-demanda-secao mdl-secao', className)} aria-labelledby={`mdl-${id}`} data-secao={id}>
      <div className="mdl-secao-cabeca">
        <span className="mdl-secao-icone" aria-hidden="true"><Icone /></span>
        <h3 id={`mdl-${id}`} className="mdl-secao-titulo">{titulo}</h3>
        {meta && <span className="mdl-secao-meta">{meta}</span>}
        {acoes && <div className="mdl-secao-acoes">{acoes}</div>}
      </div>
      <div className="mdl-secao-corpo">{children}</div>
    </section>
  )
}

// ─────────────────────────────── linha do painel lateral ───────────────────────────────

/**
 * Rótulo com ícone à esquerda e o valor à direita (como o resumo do núcleo). Com `abrir`, o valor é um botão (o
 * popover do diálogo ancora nele, `data-mdl-ancora`); sem, só texto.
 */
export function Propriedade({ id, icone: Icone, rotulo, children, abrir, desabilitado, grupo, dica, atalho, extra, vazio }: {
  id: string; icone: LucideIcon; rotulo: string; children: ReactNode; abrir?(ancora: HTMLElement): void
  desabilitado?: boolean; grupo?: boolean; dica?: string; atalho?: string; extra?: ReactNode
  /** Sem valor: no celular a linha fica escondida até "Mostrar todos os campos". */
  vazio?: boolean
}) {
  return (
    <div className="mdl-prop" data-grupo={grupo || undefined} data-prop={id} data-vazio={vazio || undefined}>
      <div className="mdl-prop-rotulo" id={`mdl-prop-${id}`}><Icone aria-hidden="true" />{rotulo}</div>
      <div className="mdl-prop-valor">
        {abrir && !desabilitado ? (
          <button type="button" className="mdl-prop-botao" data-mdl-ancora={id} aria-labelledby={`mdl-prop-${id} mdl-prop-${id}-v`}
            aria-haspopup="dialog" title={dica} aria-keyshortcuts={atalho} onClick={(e) => abrir(e.currentTarget)}>
            <span id={`mdl-prop-${id}-v`} className="contents">{children}</span>
          </button>
        ) : (
          <span className="mdl-prop-botao" data-mdl-ancora={id} data-fixo="">{children}</span>
        )}
        {extra}
      </div>
    </div>
  )
}

export const Vazio = ({ children }: { children: ReactNode }) => <span className="mdl-prop-vazio">{children}</span>

/**
 * Esc de um campo que edita no lugar (item, título do checklist, descrição, comentário): enquanto ele está aberto, o
 * Esc é dele e não fecha o modal. As camadas do DS escutam o Esc na captura da janela, antes do campo; por isso o
 * campo entra na pilha como uma camada. Com a lista de menções do editor aberta, o Esc não faz nada (a lista some ao
 * escolher ou ao clicar fora).
 */
export function useEscLocal(ativo: boolean, aoEsc: () => void): void {
  useCamada(ativo, {
    aoEsc: () => {
      if (document.querySelector('[role="listbox"][aria-label="Pessoas para mencionar"]')) return
      aoEsc()
    },
  })
}

/** A demanda de um diálogo: a do bootstrap (reativa) ou, fora dele, a do detalhe aberto. */
export function useDemandaAtual(id: Id): Demanda | undefined {
  const qc = useQueryClient()
  return useDemanda(id) ?? demandaConhecida(qc, id)
}

// ─────────────────────────────── pessoas ───────────────────────────────

const selUsuarios = (b: Bootstrap) => b.usuarios

export function useUsuarios(): UsuarioResumo[] {
  return useDoBootstrap(selUsuarios) ?? []
}

/** Apelido ou primeiro nome. */
export const nomeCurto = (u: Pick<UsuarioResumo, 'nome' | 'apelido'>) => u.apelido || u.nome.split(' ')[0] || u.nome

/** Quem aparece no "@" do editor: pessoas ativas que casam o termo (nome ou apelido, sem acento), até 8. */
export function useBuscarPessoas(): (termo: string) => PessoaMencao[] {
  const usuarios = useUsuarios()
  const ativos = useMemo(() => usuarios.filter((u) => u.ativo), [usuarios])
  return useCallback((termo: string) => {
    const t = normalizarBusca(termo)
    // apelido que começa com o termo primeiro, depois um nome que começa, depois o que contém
    const nota = (u: UsuarioResumo) => {
      if (!t) return 1
      if (normalizarBusca(u.apelido ?? '').startsWith(t)) return 3
      if (normalizarBusca(u.nome).split(' ').some((p) => p.startsWith(t))) return 2
      return normalizarBusca(`${u.nome} ${u.apelido ?? ''}`).includes(t) ? 1 : 0
    }
    return ativos
      .map((u) => ({ u, n: nota(u) }))
      .filter((x) => x.n > 0)
      .sort((x, y) => y.n - x.n || x.u.nome.localeCompare(y.u.nome, 'pt-BR'))
      .slice(0, 8)
      .map(({ u }) => ({ id: u.id, nome: u.nome, apelido: u.apelido, cor: u.cor }))
  }, [ativos])
}

// ─────────────────────────────── tempo ───────────────────────────────

const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const diaMes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' })
const dataCompleta = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
const extenso = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'full', timeStyle: 'short' })
const diaSP = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

const horaCurta = (d: Date) => hora.format(d).replace(':', 'h').replace(/h00$/, 'h')

/** "14h30" (São Paulo). */
export const horaDe = (i: Instante) => horaCurta(new Date(i))

/** "agora", "há 5 min", "há 2 h", "ontem, 14h30", "16/10, 9h", "16/10/2025". */
export function tempoRelativo(i: Instante, agora = new Date()): string {
  const d = new Date(i)
  const seg = (agora.getTime() - d.getTime()) / 1000
  if (seg < 60) return 'agora'
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`
  const hoje = diaSP.format(agora)
  const dia = diaSP.format(d)
  if (dia === hoje) return `há ${Math.floor(seg / 3600)} h`
  const ontem = diaSP.format(new Date(agora.getTime() - 86_400_000))
  if (dia === ontem) return `ontem, ${horaCurta(d)}`
  if (dia.slice(0, 4) === hoje.slice(0, 4)) return `${diaMes.format(d)}, ${horaCurta(d)}`
  return dataCompleta.format(d)
}

/** "quinta-feira, 16 de outubro de 2026 às 14:30" (para o title). */
export const quandoPorExtenso = (i: Instante) => extenso.format(new Date(i))

/** Tamanho de arquivo: "820 KB", "2,4 MB". */
export function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}
