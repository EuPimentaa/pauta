/**
 * "Copiar…" (`copiar-demanda`), como no Trello: título, o que manter (checklists, etiquetas, membros, anexos e datas)
 * e o lugar (qualquer quadro). Descrição, cliente, AM, prioridade, estimativa e modelo vão sempre; a cópia nasce sem
 * versões, comentários nem histórico.
 */
import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Bootstrap, CopiarDemandaEntrada } from '@shared/tipos/index.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useDoBootstrap } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { Campo } from '../../../ui/Campo.tsx'
import { Checkbox } from '../../../ui/Checkbox.tsx'
import { useAcoesModal } from '../api.ts'
import { detalheDe } from '../cache.ts'
import { useDemandaAtual } from '../comum.tsx'
import { cardsDe, posicaoDe, SeletorLugar, type Lugar } from './Lugar.tsx'

type Manter = NonNullable<CopiarDemandaEntrada['manter']>
const selBase = (b: Bootstrap) => b

export default function DialogoCopiarDemanda({ params, fechar }: PropsDialogo<'copiar-demanda'>) {
  const d = useDemandaAtual(params.demandaId)
  const b = useDoBootstrap(selBase)
  const qc = useQueryClient()
  const acoes = useAcoesModal()
  const idForm = useId()
  const det = d ? detalheDe(qc, d.id) : undefined
  const [titulo, setTitulo] = useState(d?.titulo ?? '')
  const [manter, setManter] = useState<Required<Manter>>({ checklists: true, etiquetas: true, membros: true, anexos: true, datas: true })
  const [lugar, setLugar] = useState<Lugar>(() => ({ quadroId: d?.quadroId ?? '', colunaId: d?.colunaId ?? '', indice: null }))
  const [salvando, setSalvando] = useState(false)
  if (!d) return <MolduraDialogo titulo="Copiar"><p className="mdl-vazio">Esta demanda não está mais aqui.</p></MolduraDialogo>

  const itens = det ? det.checklists.filter((c) => !c.rodadaId).reduce((n, c) => n + c.itens.length, 0) : d.nCheckTotal
  const anexos = det ? det.anexos.filter((a) => a.finalidade === 'referencia' && !a.comentarioId).length : d.nAnexos
  const opcoes: { id: keyof Manter; rotulo: string; detalhe?: string; ha: boolean }[] = [
    { id: 'checklists', rotulo: 'Checklists', detalhe: itens ? `${itens} ${itens === 1 ? 'item' : 'itens'}, desmarcados` : undefined, ha: itens > 0 },
    { id: 'etiquetas', rotulo: 'Etiquetas', detalhe: lugar.quadroId !== d.quadroId ? 'as de mesmo nome no quadro escolhido' : undefined, ha: d.etiquetaIds.length > 0 },
    { id: 'membros', rotulo: 'Membros', ha: d.membroIds.length > 0 },
    { id: 'anexos', rotulo: 'Anexos', detalhe: anexos ? `${anexos} de referência` : undefined, ha: anexos > 0 },
    { id: 'datas', rotulo: 'Datas', detalhe: d.repetir !== 'nenhuma' ? 'e a repetição' : undefined, ha: !!(d.prazo || d.inicio || d.publicacaoData) },
  ]

  async function copiar() {
    if (!d || !lugar.colunaId || !titulo.trim()) return
    setSalvando(true)
    const r = await acoes.copiar(d, {
      colunaId: lugar.colunaId, posicao: posicaoDe(cardsDe(b, lugar.colunaId, null), lugar.indice), titulo: titulo.trim(),
      manter: Object.fromEntries(opcoes.map((o) => [o.id, o.ha && manter[o.id]])),
    })
    setSalvando(false)
    if (r) fechar({ demanda: r.demanda })
  }

  return (
    <MolduraDialogo titulo={`Copiar #${d.numero}`} tamanho="m"
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={salvando} disabled={!lugar.colunaId || !titulo.trim()}>Criar cópia</Botao>
        </>
      )}>
      <form id={idForm} className="mdl-formulario" onSubmit={(e) => { e.preventDefault(); void copiar() }}>
        <Campo rotulo="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={500} data-autofocus="" />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-rotulo font-medium text-fg">Manter</legend>
          {opcoes.map((o) => (
            <Checkbox key={o.id} checked={o.ha && manter[o.id]} disabled={!o.ha} descricao={o.ha ? o.detalhe : 'Nada para copiar.'}
              onChange={(e) => setManter((m) => ({ ...m, [o.id]: e.target.checked }))}>
              {o.rotulo}
            </Checkbox>
          ))}
          <p className="text-meta text-fg-2">Descrição, cliente, atendimento, prioridade, estimativa e modelo vão sempre. Versões, comentários e histórico, não.</p>
        </fieldset>
        <SeletorLugar lugar={lugar} mudar={setLugar} demandaId={null} quadroAtual={d.quadroId} />
      </form>
    </MolduraDialogo>
  )
}
