/**
 * Uma notificação (sino e menções do Início): o avatar de quem fez (ou o ícone do tipo, quando foi o sistema ou o
 * cliente), o resumo como texto puro, o tipo e "há 5 min". O link abre a demanda por cima da tela atual e marca como
 * lida; Ctrl/Cmd+clique abre em outra aba.
 */
import type { MouseEvent } from 'react'
import {
  AlarmClock, AtSign, BadgeCheck, Clock3, Inbox, MessageSquare, PackageCheck, RotateCcw, UserPlus,
} from 'lucide-react'
import type { Notificacao, TipoNotificacao } from '@shared/tipos/index.ts'
import type { Icone } from '../../extensoes/tipos.ts'
import { useUsuario } from '../../api/seletores.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { Avatar } from '../../ui/Avatar.tsx'
import { quando } from './logica.ts'

export const TIPO_NOTIFICACAO: Record<TipoNotificacao, { rotulo: string; icone: Icone }> = {
  membro: { rotulo: 'Membro', icone: UserPlus },
  mencao: { rotulo: 'Menção', icone: AtSign },
  comentario: { rotulo: 'Comentário', icone: MessageSquare },
  versao_entregue: { rotulo: 'Versão entregue', icone: PackageCheck },
  aprovada: { rotulo: 'Aprovada', icone: BadgeCheck },
  ajuste_pedido: { rotulo: 'Ajuste pedido', icone: RotateCcw },
  prazo: { rotulo: 'Vence hoje', icone: Clock3 },
  atrasada: { rotulo: 'Atrasada', icone: AlarmClock },
  chegou: { rotulo: 'Chegou no quadro', icone: Inbox },
}

export function ItemNotificacao({ n, agora, aoAbrir }: { n: Notificacao; agora: Date; aoAbrir?(n: Notificacao): void }) {
  const ator = useUsuario(n.atorId)
  const abrirSobreposta = useAbrirSobreposta()
  const tipo = TIPO_NOTIFICACAO[n.tipo]
  const I = tipo.icone
  const lida = n.lidaEm !== null
  const conteudo = (
    <>
      <span className="pnl-notif-quem" data-tipo={n.tipo}>
        {ator ? <Avatar pessoa={ator} tamanho={32} dica={false} /> : <span className="pnl-notif-sistema" aria-hidden="true"><I /></span>}
        {ator && <span className="pnl-notif-selo" aria-hidden="true"><I /></span>}
      </span>
      <span className="pnl-notif-corpo">
        <span className="pnl-notif-texto">{n.resumo}</span>
        <span className="pnl-notif-meta">
          <span>{tipo.rotulo}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={n.criadoEm}>{quando(n.criadoEm, agora)}</time>
        </span>
      </span>
      {!lida && <span className="pnl-notif-ponto" role="img" aria-label="não lida" />}
    </>
  )
  if (n.demandaNumero === null) {
    return (
      <div className="pnl-notif" data-lida={lida || undefined}>
        {conteudo}
      </div>
    )
  }
  const caminho = `/d/${n.demandaNumero}`
  const clicar = (e: MouseEvent<HTMLAnchorElement>) => {
    aoAbrir?.(n)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    abrirSobreposta(caminho)
  }
  return (
    <a href={caminho} className="pnl-notif" data-lida={lida || undefined} onClick={clicar} onAuxClick={() => aoAbrir?.(n)}>
      {conteudo}
    </a>
  )
}
