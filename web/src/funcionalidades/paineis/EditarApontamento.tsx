/**
 * Editar um lançamento de horas (F3, tela /horas): dia, duração ("1h30", "90", "1:30") e nota, num popover ancorado
 * no lápis (folha no celular). Cronômetro ligado não se edita (pare antes).
 */
import { useState, type FormEvent } from 'react'
import type { Apontamento, DataLocal } from '@shared/tipos/index.ts'
import { formatarDuracao, lerDuracao } from '@shared/logica/paineis.ts'
import { useEditarApontamento } from '../../api/horas.ts'
import { useListaFeriados } from '../../api/seletores.ts'
import { Botao } from '../../ui/Botao.tsx'
import { AreaTexto, Campo, GrupoCampo } from '../../ui/Campo.tsx'
import { Popover } from '../../ui/Popover.tsx'
import { SeletorData } from '../../ui/SeletorData.tsx'

export function EditarApontamento({ a, ancora, fechar }: { a: Apontamento; ancora: HTMLElement | null; fechar(): void }) {
  const { editar } = useEditarApontamento()
  const feriados = useListaFeriados()
  const [data, setData] = useState<DataLocal>(a.data)
  const [duracao, setDuracao] = useState(formatarDuracao(a.minutos ?? 0))
  const [nota, setNota] = useState(a.nota ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const minutos = lerDuracao(duracao)
    if (minutos === null) { setErro('Use 45min, 1h30 ou 1:30 (até 24h).'); return }
    setSalvando(true)
    const r = await editar(a, { data, minutos, nota: nota.trim() || null })
    setSalvando(false)
    if (r) fechar()
  }

  return (
    <Popover aberto aoFechar={fechar} ancora={ancora} titulo="Editar tempo" mostrarTitulo largura={320} alinhar="fim">
      <form className="pnl-editar ui-popover-corpo" onSubmit={(e) => void salvar(e)}>
        <GrupoCampo rotulo="Dia">
          {(aria) => <SeletorData {...aria} rotulo="Dia" valor={data} permitirLimpar={false} feriados={feriados}
            aoMudar={(d) => { if (d) setData(d) }} tamanho="p" />}
        </GrupoCampo>
        <Campo rotulo="Duração" value={duracao} onChange={(e) => { setDuracao(e.target.value); setErro(null) }} erro={erro ?? undefined}
          tamanho="p" inputMode="text" autoComplete="off" ajuda={erro ? undefined : 'Ex.: 45min, 1h30, 1:30'} />
        <AreaTexto rotulo="Nota" opcional value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} linhas={2} />
        <div className="pnl-editar-acoes">
          <Botao variante="ghost" tamanho="p" onClick={fechar}>Cancelar</Botao>
          <Botao type="submit" tamanho="p" carregando={salvando}>Salvar</Botao>
        </div>
      </form>
    </Popover>
  )
}
