/**
 * Selo do ciclo no card (F2; rodapé, ordem 100): "V2" com o estado (entregue, com o cliente, aprovada, ajuste) e
 * "R3/2" quando a rodada passou das inclusas e o sinal do núcleo mostra outra coisa (atrasada, com o cliente, parado);
 * quando o sinal do núcleo já é o "R3/2 · extra", o selo não repete. Barato: só campos da demanda e dois seletores
 * estáveis do bootstrap.
 */
import './selo.css'
import { CheckCircle2, Clock3, Upload, Wrench } from 'lucide-react'
import type { Bootstrap, Coluna, Demanda } from '@shared/tipos/index.ts'
import { sinalDoCard } from '@shared/logica/sinal.ts'
import { useDoBootstrap, useFeriados } from '../../api/seletores.ts'
import { Tooltip } from '../../ui/Tooltip.tsx'
import { rodadaExtra, seloDoCard } from './logica.ts'

const ICONE = { entregue: Upload, com_cliente: Clock3, aprovada: CheckCircle2, ajuste: Wrench } as const
const selLimite = (b: Bootstrap) => b.config.paradoLimiteDiasUteis

export function SeloCiclo({ demanda, coluna }: { demanda: Demanda; coluna: Coluna | null }) {
  const feriados = useFeriados()
  const limite = useDoBootstrap(selLimite) ?? 2
  const selo = seloDoCard(demanda)
  const extra = rodadaExtra(demanda)
  if (!selo && !extra) return null
  const sinal = extra ? sinalDoCard(demanda, coluna ?? { papel: 'normal' }, new Date(), feriados, { paradoLimiteDiasUteis: limite }) : null
  const mostrarExtra = !!extra && sinal?.tipo !== 'extra' && !demanda.concluidaEm
  const Icone = selo ? ICONE[selo.estado] : null
  return (
    <>
      {selo && Icone && (
        <Tooltip texto={selo.dica}>
          <span className="cic-selo-card" data-estado={selo.estado} role="img" aria-label={selo.dica} tabIndex={-1}>
            <Icone aria-hidden="true" /><span aria-hidden="true">V{selo.versao}</span>
          </span>
        </Tooltip>
      )}
      {mostrarExtra && (
        <span className="cic-selo-card" data-estado="extra" role="img" aria-label={`Rodada ${demanda.rodadaAtual}, passou das ${demanda.rodadasInclusas} inclusas`}>
          <span aria-hidden="true">{extra}</span>
        </span>
      )}
    </>
  )
}
