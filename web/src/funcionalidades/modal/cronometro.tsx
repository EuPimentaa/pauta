/**
 * Cronômetro fora do modal (F1): o meu cronômetro ligado (['bootstrap'].eu.cronometro), o tempo correndo, o botão
 * da barra superior ("0:42 · #123" com ■, só com cronômetro ligado) e o selo no card da demanda em que ele corre.
 * Leves: viajam com o registro.
 */
import './cronometro.css'
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Square, Timer } from 'lucide-react'
import type { Apontamento, Bootstrap, Demanda } from '@shared/tipos/index.ts'
import { formatarCorrendo } from '@shared/logica/modal-texto.ts'
import { useDoBootstrap } from '../../api/seletores.ts'
import { navegar } from '../../dialogos/estado.ts'
import { Tooltip } from '../../ui/Tooltip.tsx'
import { acoesModal } from './api.ts'

const selCronometro = (b: Bootstrap) => b.eu.cronometro
const selDemandaDoCronometro = (b: Bootstrap) => b.eu.cronometro?.demandaId ?? null

export function useMeuCronometro(): Apontamento | null {
  return useDoBootstrap(selCronometro) ?? null
}

/** Milissegundos desde `inicio`, atualizados a cada `passoMs` (null = parado). */
export function useCorrendo(inicio: string | null, passoMs = 1000): number {
  const calc = useCallback(() => (inicio ? Math.max(0, Date.now() - Date.parse(inicio)) : 0), [inicio])
  const [ms, setMs] = useState(calc)
  useEffect(() => {
    setMs(calc())
    if (!inicio) return
    const t = window.setInterval(() => setMs(calc()), passoMs)
    return () => window.clearInterval(t)
  }, [inicio, passoMs, calc])
  return ms
}

/** Barra superior (direita, ordem 50): só aparece com o cronômetro ligado. */
export function TopoCronometro() {
  const qc = useQueryClient()
  const c = useMeuCronometro()
  const selNumero = useCallback((b: Bootstrap) => (c ? b.demandas.find((d) => d.id === c.demandaId) ?? null : null), [c])
  const d = useDoBootstrap(selNumero) as Demanda | null | undefined
  const ms = useCorrendo(c?.iniciadoEm ?? null, 15_000)
  if (!c) return null
  const tempo = formatarCorrendo(ms)
  const titulo = d ? `#${d.numero} ${d.titulo}` : 'a demanda'
  return (
    <div className="mdl-topo-cronometro" role="group" aria-label={`Cronômetro ligado: ${tempo} em ${titulo}`}>
      <Tooltip texto={`Abrir ${titulo}`}>
        <button type="button" className="mdl-topo-abrir" onClick={() => { if (d) navegar(`/d/${d.numero}`) }}>
          <span className="mdl-pulso" aria-hidden="true" />
          <Timer aria-hidden="true" />
          <span>{tempo}</span>
          {d && <span className="mdl-topo-numero">· #{d.numero}</span>}
        </button>
      </Tooltip>
      <Tooltip texto="Parar o cronômetro" atalho="t">
        <button type="button" className="mdl-topo-parar" aria-label="Parar o cronômetro" onClick={() => void acoesModal(qc).pararCronometro()}>
          <Square aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  )
}

function SeloLigado() {
  const c = useMeuCronometro()
  const ms = useCorrendo(c?.iniciadoEm ?? null, 30_000)
  if (!c) return null
  return (
    <span className="ui-sinal mdl-selo-cronometro" role="img" aria-label={`Seu cronômetro está ligado aqui: ${formatarCorrendo(ms)}`}>
      <Timer aria-hidden="true" />{formatarCorrendo(ms)}
    </span>
  )
}

/**
 * Selo do card (rodapé, ordem 200): o meu cronômetro ligado nesta demanda. Barato: cada card só lê o id da demanda do
 * cronômetro (um texto; o card não redesenha quando o resto do bootstrap muda).
 */
export function SeloCronometro({ demanda }: { demanda: Demanda }) {
  const aqui = useDoBootstrap(selDemandaDoCronometro) === demanda.id
  return aqui ? <SeloLigado /> : null
}
