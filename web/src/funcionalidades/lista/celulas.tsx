/**
 * Pedaços da linha da Lista: prioridade (bandeira na cor do nível), prazo (o mesmo chip de estado do card), datas
 * curtas, etiquetas (até 2 e "+N") e a coluna com o ponto na cor dela.
 */
import { Calendar, Check, Clock3, Flag, TriangleAlert } from 'lucide-react'
import type { Coluna, DataLocal, Demanda, EstadoPrazo, Etiqueta, HoraLocal, Prioridade } from '@shared/tipos/index.ts'
import { ROTULO_PRIORIDADE } from '@shared/tipos/index.ts'
import { estadoPrazo } from '@shared/logica/prazo.ts'
import { hojeSP } from '@shared/logica/datas.ts'
import { DIAS_CURTOS, diaDaSemana, formatarDiaMes, formatarHora } from '../../lib/datas.ts'
import { ChipEtiqueta } from '../../ui/Chips.tsx'

/** "sex, 24 out" (+ ", 14h"). */
export function dataCurta(data: DataLocal, hora?: HoraLocal | null): string {
  const base = `${DIAS_CURTOS[diaDaSemana(data)]}, ${formatarDiaMes(data)}`
  return hora ? `${base}, ${formatarHora(hora)}` : base
}

export function BandeiraPrioridade({ p, compacta }: { p: Prioridade; compacta?: boolean }) {
  return (
    <span className="lista-prioridade" data-prioridade={p} title={compacta ? `Prioridade ${ROTULO_PRIORIDADE[p].toLowerCase()}` : undefined}>
      <Flag aria-hidden="true" />
      {compacta ? <span className="sr-only">Prioridade {ROTULO_PRIORIDADE[p].toLowerCase()}</span> : ROTULO_PRIORIDADE[p]}
    </span>
  )
}

const ICONE_PRAZO = { atrasada: TriangleAlert, hoje: Clock3, em_dia: Calendar, pausado: Clock3, concluida: Check } as const
const DICA_PRAZO: Partial<Record<EstadoPrazo, string>> = {
  atrasada: 'Atrasada', hoje: 'Vence hoje', pausado: 'Com o cliente: o prazo fica parado até ele decidir', concluida: 'Concluída',
}

/** O prazo com o estado (estadoPrazo, API §5.2): atrasada em vermelho, hoje em âmbar, com o cliente em azul. */
export function PrazoCelula({ d, coluna, agora }: { d: Demanda; coluna: Pick<Coluna, 'papel'>; agora: Date }) {
  if (!d.prazo) return null
  const estado = estadoPrazo(d, coluna, agora)
  if (estado === 'sem_prazo') return null
  const I = ICONE_PRAZO[estado]
  const texto = estado === 'hoje'
    ? `Hoje, ${formatarHora(d.prazoHora ?? '18:00')}`
    : estado === 'atrasada' && d.prazo === hojeSP(agora) ? `Hoje, ${formatarHora(d.prazoHora ?? '18:00')}` : dataCurta(d.prazo, d.prazoHora)
  return (
    <span className="ui-prazo lista-prazo" data-estado={estado} title={DICA_PRAZO[estado]}>
      <I aria-hidden="true" />{texto}
      {DICA_PRAZO[estado] && <span className="sr-only">, {DICA_PRAZO[estado]!.toLowerCase()}</span>}
    </span>
  )
}

/** "14 out" (+ ", 9h"): a coluna é estreita; o dia da semana fica para o prazo. */
export function DataCelula({ data, hora }: { data: DataLocal | null; hora?: HoraLocal | null }) {
  if (!data) return null
  return <span className="lista-data" title={dataCurta(data, hora)}>{formatarDiaMes(data)}{hora ? `, ${formatarHora(hora)}` : ''}</span>
}

export function ConcluidaCelula({ d }: { d: Demanda }) {
  if (!d.concluidaEm) return null
  return (
    <span className="lista-concluida">
      <Check aria-hidden="true" />
      <span className="sr-only">Concluída em </span>{formatarDiaMes(hojeSP(new Date(d.concluidaEm)))}
    </span>
  )
}

export function EtiquetasCelula({ etiquetas }: { etiquetas: readonly Etiqueta[] }) {
  if (!etiquetas.length) return null
  const mostrar = etiquetas.slice(0, 2)
  const resto = etiquetas.length - mostrar.length
  return (
    <span className="lista-etiquetas">
      {mostrar.map((e) => <ChipEtiqueta key={e.id} etiqueta={e} />)}
      {resto > 0 && (
        <span className="lista-mais" title={etiquetas.slice(2).map((e) => e.nome || 'sem nome').join(', ')}>
          +{resto}<span className="sr-only"> {resto === 1 ? 'etiqueta' : 'etiquetas'}: {etiquetas.slice(2).map((e) => e.nome || 'sem nome').join(', ')}</span>
        </span>
      )}
    </span>
  )
}

export function ColunaCelula({ coluna }: { coluna: Coluna | undefined }) {
  if (!coluna) return null
  return (
    <span className="lista-coluna" data-cor={coluna.cor ?? 'nenhuma'}>
      <span className="lista-ponto" aria-hidden="true" />
      <span className="lista-coluna-nome">{coluna.nome}</span>
    </span>
  )
}
