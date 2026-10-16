/**
 * Tempo (lateral 500): o cronômetro desta demanda (▶ liga, e para o que estiver ligado em outra; ■ para) com o tempo
 * correndo, o total registrado e o meu, e [Lançar tempo] (diálogo `lancar-tempo`). Tecla T.
 */
import '../cronometro.css'
import { Play, Plus, Square, Timer } from 'lucide-react'
import { formatarCorrendo, formatarDuracao } from '@shared/logica/modal-texto.ts'
import type { Bootstrap } from '@shared/tipos/index.ts'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { useDoBootstrap } from '../../../api/seletores.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { Botao } from '../../../ui/Botao.tsx'
import { Tooltip } from '../../../ui/Tooltip.tsx'
import { useAcoesModal } from '../api.ts'
import { horaDe } from '../comum.tsx'
import { useCorrendo, useMeuCronometro } from '../cronometro.tsx'

const selDemandas = (b: Bootstrap) => b.demandas

/** h:mm:ss com segundos (a barra superior mostra h:mm). */
function relogio(ms: number): string {
  const s = Math.floor(ms / 1000) % 60
  return `${formatarCorrendo(ms)}:${String(s).padStart(2, '0')}`
}

export default function Tempo({ ctx }: { ctx: ContextoDemanda }) {
  const acoes = useAcoesModal()
  const c = useMeuCronometro()
  const demandas = useDoBootstrap(selDemandas) ?? []
  const d = ctx.demanda
  const aqui = c?.demandaId === d.id
  const ms = useCorrendo(aqui ? c!.iniciadoEm : null, 1000)
  const outra = c && !aqui ? demandas.find((x) => x.id === c.demandaId) : undefined
  const total = d.minutosRegistrados
  const meus = ctx.detalhe?.tempo.meusMin ?? 0
  const so = ctx.somenteLeitura

  const inicio = aqui && c?.iniciadoEm ? horaDe(c.iniciadoEm) : null
  return (
    <div className="mdl-tempo" data-ligado={aqui || undefined} data-prop="tempo" role="group" aria-label="Tempo">
      {!so ? (
        <Tooltip texto={aqui ? 'Parar o cronômetro' : outra ? `Parar o da #${outra.numero} e ligar aqui` : 'Ligar o cronômetro'} atalho="t">
          <button type="button" className="mdl-tempo-play" data-mdl-ancora="tempo"
            aria-label={aqui ? 'Parar o cronômetro' : 'Ligar o cronômetro nesta demanda'}
            onClick={() => void (aqui ? acoes.pararCronometro() : acoes.iniciarCronometro(d))}>
            {aqui ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
        </Tooltip>
      ) : <span className="mdl-tempo-play" aria-hidden="true" data-desligado=""><Timer /></span>}
      <span className="mdl-tempo-relogio">{aqui ? relogio(ms) : formatarDuracao(total)}</span>
      <span className="mdl-tempo-sub">
        {aqui ? <span className="inline-flex items-center gap-1.5"><span className="mdl-pulso" aria-hidden="true" />Correndo desde {inicio}</span>
          : outra ? `Seu cronômetro está na #${outra.numero}` : total > 0 ? 'registrados nesta demanda' : 'Ligue o cronômetro ou lance o tempo'}
      </span>
      <div className="mdl-tempo-rodape">
        <span className="mdl-tempo-sub">{total > 0 || aqui ? `Total ${formatarDuracao(total)} · meu ${formatarDuracao(meus)}` : ''}</span>
        {!so && <Botao variante="ghost" tamanho="p" icone={Plus} onClick={() => void abrirDialogo('lancar-tempo', { demandaId: d.id })}>Lançar tempo</Botao>}
      </div>
    </div>
  )
}
