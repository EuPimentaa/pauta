/**
 * Diálogo `lancar-tempo` (também aberto pela tela /horas do F3): duração ("1h30", "45", "1:15"), dia (padrão hoje) e
 * nota. Lança para mim; ninguém mais vê as minhas horas, só o total da demanda (o admin vê tudo).
 */
import { useId, useState } from 'react'
import { formatarDuracao, lerDuracao } from '@shared/logica/modal-texto.ts'
import type { DataLocal } from '@shared/tipos/index.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useListaFeriados } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { hojeLocal } from '../../../lib/datas.ts'
import { Botao } from '../../../ui/Botao.tsx'
import { AreaTexto, Campo, GrupoCampo } from '../../../ui/Campo.tsx'
import { SeletorData } from '../../../ui/SeletorData.tsx'
import { useAcoesModal } from '../api.ts'
import { useDemandaAtual } from '../comum.tsx'

const SUGESTOES = [15, 30, 45, 60, 90, 120, 240]

export default function DialogoLancarTempo({ params, fechar }: PropsDialogo<'lancar-tempo'>) {
  const d = useDemandaAtual(params.demandaId)
  const acoes = useAcoesModal()
  const feriados = useListaFeriados()
  const [texto, setTexto] = useState('')
  const [data, setData] = useState<DataLocal>(hojeLocal())
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)
  const idForm = useId()
  const minutos = lerDuracao(texto)

  async function lancar() {
    if (!d || !minutos) return
    setSalvando(true)
    const a = await acoes.lancarTempo(d, { minutos, data, nota: nota.trim() || null })
    setSalvando(false)
    if (a) fechar({ minutos })
  }

  return (
    <MolduraDialogo titulo="Lançar tempo" descricao={d ? `#${d.numero} ${d.titulo}` : undefined}
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" disabled={!minutos || !d} carregando={salvando} atalho="mod+enter">Lançar</Botao>
        </>
      )}>
      <form id={idForm} className="mdl-formulario" onSubmit={(e) => { e.preventDefault(); void lancar() }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void lancar() } }}>
        <Campo rotulo="Quanto tempo" value={texto} onChange={(e) => setTexto(e.target.value)} data-autofocus="" placeholder="1h30"
          erro={texto.trim() && !minutos ? 'Use minutos ou horas: 45, 1h30, 2h (até 24h).' : undefined}
          ajuda={minutos ? (formatarDuracao(minutos) === texto.trim() ? undefined : `= ${formatarDuracao(minutos)}`) : 'Minutos ou horas: 45, 1h30, 2h.'}
          inputMode="text" autoComplete="off" />
        <div className="mdl-sugestoes" role="group" aria-label="Sugestões">
          {SUGESTOES.map((s) => (
            <button key={s} type="button" className="mdl-chip" aria-pressed={minutos === s} onClick={() => setTexto(formatarDuracao(s).replace(' min', ''))}>
              {formatarDuracao(s)}
            </button>
          ))}
        </div>
        <GrupoCampo rotulo="Dia">
          {(aria) => <SeletorData id={aria.id} aria-describedby={aria['aria-describedby']} rotulo="Dia" valor={data} feriados={feriados} permitirLimpar={false} aoMudar={(x) => { if (x) setData(x) }} />}
        </GrupoCampo>
        <AreaTexto rotulo="Nota" opcional value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} linhas={2}
          placeholder="Ex.: ajustes da V2 com o cliente na call" />
      </form>
    </MolduraDialogo>
  )
}
