/**
 * Chips de etiqueta e de cliente.
 *   <ChipEtiqueta etiqueta={e} />                          // nome no chip; '' = só a cor
 *   <ChipEtiqueta etiqueta={e} recolhida aoClicar={alternar} />   // barra fina, como no Trello
 *   <ChipCliente cliente={c} />                            // sigla na cor do cliente; o nome no hover
 * Etiqueta sempre carrega o nome em texto ou em aria-label/tooltip (marca §7.1: a cor nunca é o único indicador).
 */
import type { Cor } from '@shared/tipos/index.ts'
import { cx } from '../lib/classes.ts'
import { ROTULO_COR } from '../lib/cores.ts'
import { Tooltip } from './Tooltip.tsx'

export interface PropsChipEtiqueta {
  etiqueta: { nome: string; cor: Cor }
  recolhida?: boolean
  /** Clicar recolhe/expande todas (o estado fica com quem desenha o card). */
  aoClicar?(): void
  className?: string
}

export function ChipEtiqueta({ etiqueta, recolhida, aoClicar, className }: PropsChipEtiqueta) {
  const nome = etiqueta.nome.trim()
  const descricao = nome ? `Etiqueta ${nome}` : `Etiqueta ${ROTULO_COR[etiqueta.cor].toLowerCase()}`
  const soCor = !nome && !recolhida
  const conteudo = <span>{nome}</span>
  const props = {
    className: cx('ui-etiqueta', className),
    'data-cor': etiqueta.cor,
    'data-recolhida': recolhida || undefined,
    'data-so-cor': soCor || undefined,
  }
  const el = aoClicar ? (
    <button type="button" {...props} aria-label={recolhida || !nome ? `${descricao}. Clique para ${recolhida ? 'mostrar' : 'recolher'} os nomes` : undefined}
      aria-pressed={!recolhida} onClick={(e) => { e.stopPropagation(); aoClicar() }}>
      {conteudo}
    </button>
  ) : (
    <span {...props} role={recolhida || !nome ? 'img' : undefined} aria-label={recolhida || !nome ? descricao : undefined}>{conteudo}</span>
  )
  return recolhida || !nome ? <Tooltip texto={nome || ROTULO_COR[etiqueta.cor]}>{el}</Tooltip> : el
}

export interface PropsChipCliente {
  cliente: { sigla: string; nome: string; cor: Cor; logoUrl?: string | null }
  tamanho?: 'p' | 'm'
  /** Mostra o nome completo ao lado da sigla. */
  comNome?: boolean
  className?: string
}

export function ChipCliente({ cliente, tamanho = 'p', comNome, className }: PropsChipCliente) {
  const el = (
    <span className={cx('ui-chip-cliente', className)} data-cor={cliente.cor} data-tamanho={tamanho}
      aria-label={comNome ? undefined : `Cliente ${cliente.nome} (${cliente.sigla})`} role={comNome ? undefined : 'img'}>
      {cliente.logoUrl && <img src={cliente.logoUrl} alt="" />}
      <span aria-hidden={comNome ? undefined : true}>{cliente.sigla}</span>
      {/* o nome se separa da sigla só pelo peso (400 x 600), na tinta cheia: com opacidade ficava abaixo de AA */}
      {comNome && <span className="font-normal">· {cliente.nome}</span>}
    </span>
  )
  return comNome ? el : <Tooltip texto={cliente.nome}>{el}</Tooltip>
}
