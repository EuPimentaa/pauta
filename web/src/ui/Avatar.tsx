/**
 * Avatar com as iniciais na cor da pessoa (--label-<cor>-bg/-ink; nunca laranja) e a pilha "até 3 + 2".
 *   <Avatar pessoa={usuario} tamanho={24} />
 *   <PilhaAvatares pessoas={membros} max={3} tamanho={24} />
 */
import type { Cor } from '@shared/tipos/index.ts'
import { cx } from '../lib/classes.ts'
import { corPorHash, iniciais } from '../lib/cores.ts'
import { Tooltip } from './Tooltip.tsx'

export interface PessoaAvatar {
  id?: string
  nome: string
  apelido?: string | null
  cor?: Cor | null
  ativo?: boolean
}

export interface PropsAvatar {
  pessoa: PessoaAvatar
  tamanho?: number
  /** Mostra o nome no hover (padrão: sim). */
  dica?: boolean
  className?: string
}

export function Avatar({ pessoa, tamanho = 28, dica = true, className }: PropsAvatar) {
  const cor = pessoa.cor ?? corPorHash(pessoa.id ?? pessoa.nome)
  const nome = pessoa.ativo === false ? `${pessoa.nome} (desativada)` : pessoa.nome
  const el = (
    <span
      className={cx('ui-avatar', className)}
      data-cor={cor}
      data-inativo={pessoa.ativo === false || undefined}
      style={{ ['--tam' as string]: `${tamanho}px` }}
      role="img"
      aria-label={nome}
    >
      <span aria-hidden="true">{iniciais(pessoa.nome)}</span>
    </span>
  )
  return dica ? <Tooltip texto={nome}>{el}</Tooltip> : el
}

export interface PropsPilha {
  pessoas: PessoaAvatar[]
  max?: number
  tamanho?: number
  /** Cor do anel entre avatares (o fundo onde a pilha está). Padrão --surface. */
  borda?: string
  className?: string
}

export function PilhaAvatares({ pessoas, max = 3, tamanho = 24, borda, className }: PropsPilha) {
  const visiveis = pessoas.length > max ? pessoas.slice(0, max) : pessoas
  const resto = pessoas.length - visiveis.length
  const nomes = pessoas.map((p) => p.nome).join(', ')
  return (
    <span
      className={cx('ui-pilha', className)}
      style={{ ['--tam' as string]: `${tamanho}px`, ...(borda ? { ['--pilha-borda' as string]: borda } : {}) }}
      role="group"
      aria-label={pessoas.length === 1 ? nomes : `${pessoas.length} pessoas: ${nomes}`}
    >
      {visiveis.map((p, i) => <Avatar key={p.id ?? i} pessoa={p} tamanho={tamanho} />)}
      {resto > 0 && (
        <Tooltip texto={pessoas.slice(max).map((p) => p.nome).join(', ')}>
          <span className="ui-pilha-mais tabular" aria-hidden="true">+{resto}</span>
        </Tooltip>
      )}
    </span>
  )
}
