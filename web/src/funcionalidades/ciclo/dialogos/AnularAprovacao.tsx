/**
 * "Anular aprovação" (F2): a aprovação válida mais recente sai da trilha como anulada, a peça volta a aguardar o
 * cliente e, se ninguém moveu o card depois da decisão, ele volta para onde estava.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { mensagemDeErro } from '../../../api/cliente.ts'
import { useClienteDetalhe } from '../../../api/clientes.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { acoesCiclo, lugarDe } from '../api.ts'
import { quando } from '../comum.tsx'
import { ultimaDecisao } from '../logica.ts'
import { NaoEncontrada, useDemandaAlvo, useDetalheAlvo } from './comum.tsx'

export default function AnularAprovacao({ params, fechar }: PropsDialogo<'anular-aprovacao'>) {
  const qc = useQueryClient()
  const d = useDemandaAlvo(params.demandaId)
  const det = useDetalheAlvo(d)
  const { data: cliente } = useClienteDetalhe(d?.clienteId ?? null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  if (!d) return <NaoEncontrada fechar={() => fechar(null)} />
  const a = det ? ultimaDecisao(det.aprovacoes) : null
  const aprovacao = a?.decisao === 'aprovado' ? a : null
  const versao = aprovacao ? det!.versoes.find((v) => v.id === aprovacao.versaoId) : undefined
  const quem = aprovacao ? (cliente?.contatos.find((c) => c.id === aprovacao.contatoId)?.nome ?? aprovacao.nomeInformado ?? 'o cliente') : ''
  const antes = aprovacao ? lugarDe(qc, { quadroId: aprovacao.quadroAntesId, colunaId: aprovacao.colunaAntesId }, d.quadroId) : null

  async function anular() {
    if (!aprovacao || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const s = await acoesCiclo(qc).anular(aprovacao.id)
      fechar({ demanda: s.demanda })
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MolduraDialogo titulo={versao ? `Anular a aprovação da V${versao.numero}?` : 'Anular a aprovação?'}
      rodape={(
        <>
          <Botao onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao variante="perigo-cheio" carregando={enviando} disabled={!aprovacao} onClick={() => void anular()}>Anular aprovação</Botao>
        </>
      )}>
      <div className="cic-form">
        {!det ? <p className="cic-vazio">Carregando…</p> : !aprovacao ? (
          <p className="cic-vazio">Esta demanda não tem uma aprovação para anular.</p>
        ) : (
          <p className="cic-vazio">
            {`A aprovação de ${quem} (${quando(aprovacao.criadoEm)}) fica na trilha como anulada e a peça volta a aguardar o cliente.`}
            {antes ? ` Se ninguém moveu o card depois da aprovação, ele volta para ${antes}.` : ''}
          </p>
        )}
        {erro && <p className="cic-erro" role="alert">{erro}</p>}
      </div>
    </MolduraDialogo>
  )
}
