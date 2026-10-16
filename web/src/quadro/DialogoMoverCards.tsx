/**
 * "Mover todos os cards…" do menu da coluna (API §4.6, POST /api/colunas/:id/mover-cards): quadro e coluna de destino;
 * indo para outro quadro, o que fazer com as etiquetas sem par e com os membros (como no "Mover para…").
 * As concluídas antigas, que já saíram do quadro, não vão.
 */
import { useId, useMemo, useState } from 'react'
import './dialogos-coluna.ts'
import type { EtiquetasSemPar, MembrosAoMover } from '@shared/tipos/index.ts'
import { useColuna, useDemandasDoQuadro, useQuadros, useDoBootstrap } from '../api/seletores.ts'
import { useColunasMutacoes } from '../api/quadros.ts'
import { MolduraDialogo } from '../dialogos/Moldura.tsx'
import type { PropsDialogo } from '../extensoes/tipos.ts'
import { Botao } from '../ui/Botao.tsx'
import { Selecao } from '../ui/Campo.tsx'
import { useAgora } from './estado.ts'
import { ehCardDaColuna } from '@shared/logica/quadro.ts'
import type { Bootstrap } from '@shared/tipos/index.ts'

const selColunas = (b: Bootstrap) => b.colunas.filter((c) => c.arquivadaEm === null)
const selDias = (b: Bootstrap) => b.config.quadroConcluidasDias

export default function DialogoMoverCards({ params, fechar }: PropsDialogo<'nucleo-mover-cards'>) {
  const origem = useColuna(params.colunaId)
  const quadros = useQuadros()
  const todasColunas = useDoBootstrap(selColunas) ?? []
  const dias = useDoBootstrap(selDias) ?? 7
  const agora = useAgora()
  const doQuadro = useDemandasDoQuadro(origem?.quadroId ?? '')
  const quantos = doQuadro.filter((d) => d.colunaId === params.colunaId && ehCardDaColuna(d, agora, dias)).length
  const colunas = useColunasMutacoes()
  const [quadroId, setQuadroId] = useState(origem?.quadroId ?? '')
  const opcoesColuna = useMemo(
    () => todasColunas.filter((c) => c.quadroId === quadroId && c.id !== params.colunaId).sort((a, b) => a.pos - b.pos),
    [todasColunas, quadroId, params.colunaId],
  )
  const [colunaId, setColunaId] = useState('')
  const destino = opcoesColuna.find((c) => c.id === colunaId) ?? opcoesColuna[0]
  const [etiquetas, setEtiquetas] = useState<EtiquetasSemPar>('deixar')
  const [membros, setMembros] = useState<MembrosAoMover>('manter')
  const [salvando, setSalvando] = useState(false)
  const idForm = useId()
  const outroQuadro = !!origem && quadroId !== origem.quadroId

  async function mover() {
    if (!origem || !destino) return
    setSalvando(true)
    const r = await colunas.moverCards(origem, {
      destinoColunaId: destino.id, ...(outroQuadro ? { etiquetasSemPar: etiquetas, membros } : {}),
    })
    setSalvando(false)
    if (r) fechar({ feito: true })
  }

  return (
    <MolduraDialogo
      titulo={origem ? `Mover os cards de ${origem.nome}` : 'Mover os cards'}
      descricao={`${quantos} ${quantos === 1 ? 'card vai' : 'cards vão'} para o fim da coluna escolhida.`}
      tamanho="m"
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={salvando} disabled={!destino || quantos === 0}>Mover</Botao>
        </>
      )}
    >
      <form id={idForm} className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void mover() }}>
        <Selecao rotulo="Quadro" value={quadroId} onChange={(e) => { setQuadroId(e.target.value); setColunaId('') }}
          opcoes={quadros.map((q) => ({ valor: q.id, rotulo: q.nome }))} data-autofocus="" />
        <Selecao rotulo="Coluna" value={destino?.id ?? ''} onChange={(e) => setColunaId(e.target.value)}
          opcoes={opcoesColuna.map((c) => ({ valor: c.id, rotulo: c.nome }))} vazia={opcoesColuna.length ? undefined : 'Este quadro não tem outra coluna'} />
        {outroQuadro && (
          <>
            <Selecao rotulo="Etiquetas sem par no destino" value={etiquetas} onChange={(e) => setEtiquetas(e.target.value as EtiquetasSemPar)}
              opcoes={[{ valor: 'deixar', rotulo: 'Deixar no quadro de origem (voltam se o card voltar)' }, { valor: 'criar', rotulo: 'Criar lá com o mesmo nome e cor' }]} />
            <Selecao rotulo="Membros" value={membros} onChange={(e) => setMembros(e.target.value as MembrosAoMover)}
              opcoes={[{ valor: 'manter', rotulo: 'Manter os mesmos' }, { valor: 'responsavel_destino', rotulo: 'Responsável do cliente no destino' }]} />
          </>
        )}
      </form>
    </MolduraDialogo>
  )
}
