/**
 * Datas (lateral 300): início, prazo (com hora e o estado: atrasada, hoje, com o cliente), publicação e repetir. Cada
 * linha abre o popover `datas` ancorado nela (D).
 */
import { CalendarCheck, CalendarClock, CalendarPlus, Check, Clock3, Repeat2, Send, TriangleAlert, type LucideIcon } from 'lucide-react'
import { ROTULO_REPETICAO } from '@shared/tipos/index.ts'
import { estadoPrazo } from '@shared/logica/prazo.ts'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { formatarData } from '../../../lib/datas.ts'
import { Propriedade, Vazio } from '../comum.tsx'

const ESTADO: Partial<Record<ReturnType<typeof estadoPrazo>, { texto: string; icone: LucideIcon }>> = {
  atrasada: { texto: 'atrasada', icone: TriangleAlert }, hoje: { texto: 'vence hoje', icone: Clock3 },
  pausado: { texto: 'com o cliente', icone: Send }, concluida: { texto: 'entregue', icone: Check },
}

/** O prazo na cor do estado (como no card), com o estado em palavras para o leitor de tela e na dica. */
function Prazo({ texto, estado }: { texto: string; estado: ReturnType<typeof estadoPrazo> }) {
  const e = ESTADO[estado]
  if (!e) return <span>{texto}</span>
  const Icone = e.icone
  return (
    <span className="mdl-estado" data-estado={estado} title={`Prazo ${e.texto}`}>
      <Icone aria-hidden="true" />{texto}<span className="sr-only">, {e.texto}</span>
    </span>
  )
}

export default function Datas({ ctx }: { ctx: ContextoDemanda }) {
  const d = ctx.demanda
  const so = ctx.somenteLeitura
  const abrir = (ancora: HTMLElement) => void abrirDialogo('datas', { demandaId: d.id }, { ancora })
  const estado = estadoPrazo(d, ctx.coluna, new Date())
  return (
    <>
      <Propriedade id="inicio" icone={CalendarPlus} rotulo="Início" grupo desabilitado={so} abrir={abrir} vazio={!d.inicio}>
        {d.inicio ? <span>{formatarData(d.inicio, d.inicioHora)}</span> : <Vazio>Sem data</Vazio>}
      </Propriedade>
      <Propriedade id="prazo" icone={CalendarClock} rotulo="Prazo" desabilitado={so} abrir={abrir} atalho="D">
        {d.prazo ? <Prazo texto={formatarData(d.prazo, d.prazoHora)} estado={estado} /> : <Vazio>Sem prazo</Vazio>}
      </Propriedade>
      <Propriedade id="publicacao" icone={CalendarCheck} rotulo="Publicação" desabilitado={so} abrir={abrir} vazio={!d.publicacaoData}>
        {d.publicacaoData ? <span>{formatarData(d.publicacaoData, d.publicacaoHora)}</span> : <Vazio>Sem data</Vazio>}
      </Propriedade>
      <Propriedade id="repetir" icone={Repeat2} rotulo="Repetir" desabilitado={so} abrir={abrir} vazio={d.repetir === 'nenhuma'}>
        {d.repetir !== 'nenhuma' ? <span>{ROTULO_REPETICAO[d.repetir]}</span> : <Vazio>Não repete</Vazio>}
      </Propriedade>
    </>
  )
}
