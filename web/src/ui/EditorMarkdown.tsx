/**
 * Editor de Markdown (descrição, comentários) com @menção. O TipTap só baixa quando o editor aparece (lazy):
 * enquanto carrega, mostra uma caixa com a mesma altura.
 *
 *   <EditorMarkdown valor={md} aoMudar={setMd} aoSalvar={salvar} rotulo="Descrição"
 *     buscarPessoas={(t) => usuarios.filter((u) => casa(u, t)).slice(0, 8)} />
 *
 * Ctrl/Cmd+Enter = aoSalvar; Esc = aoCancelar (fora da lista de menções).
 */
import { lazy, Suspense } from 'react'
import type { Cor } from '@shared/tipos/index.ts'
import { cx } from '../lib/classes.ts'

export interface PessoaMencao {
  id: string
  nome: string
  apelido?: string | null
  cor?: Cor | null
}

export interface PropsEditorMarkdown {
  valor: string
  aoMudar(markdown: string): void
  aoSalvar?(): void
  aoCancelar?(): void
  /** Quem aparece no "@" (já filtrado pelo termo; até ~8). */
  buscarPessoas?(termo: string): PessoaMencao[] | Promise<PessoaMencao[]>
  /** Nome acessível do campo. */
  rotulo: string
  placeholder?: string
  autoFoco?: boolean
  desabilitado?: boolean
  /** Sem a barra de formatação (comentário curto). */
  semBarra?: boolean
  minLinhas?: number
  className?: string
}

const Interno = lazy(() => import('./editor/EditorInterno.tsx'))

export function EditorMarkdown(p: PropsEditorMarkdown) {
  return (
    <Suspense fallback={<div className={cx('ui-editor ui-editor-carregando', p.className)} style={{ ['--min-linhas' as string]: p.minLinhas ?? 4 }} aria-busy="true" aria-label={p.rotulo} />}>
      <Interno {...p} />
    </Suspense>
  )
}
