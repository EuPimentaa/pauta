/**
 * "Pedir ajuste interno" (F2; atendimento e admin): a rodada N+1 de origem interna, com os pedidos (uma linha por item
 * de "Ajustes R{N+1}"), o motivo e o prazo. Não move o card; os membros são avisados.
 */
import { useId, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DataLocal, HoraLocal, MotivoRodada } from '@shared/tipos/index.ts'
import { MOTIVOS_RODADA, ROTULO_MOTIVO_RODADA } from '@shared/tipos/index.ts'
import { hojeSP } from '@shared/logica/datas.ts'
import { prazoAjustePadrao } from '@shared/logica/ciclo-prazos.ts'
import { linhasParaItens } from '@shared/logica/texto.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { mensagemDeErro } from '../../../api/cliente.ts'
import { useConfig, useFeriados, useListaFeriados } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { Campo, Selecao } from '../../../ui/Campo.tsx'
import { SeletorData } from '../../../ui/SeletorData.tsx'
import { acoesCiclo } from '../api.ts'
import { NaoEncontrada, ctrlEnter, useDemandaAlvo } from './comum.tsx'

export default function AjusteInterno({ params, fechar }: PropsDialogo<'ajuste-interno'>) {
  const qc = useQueryClient()
  const d = useDemandaAlvo(params.demandaId)
  const config = useConfig()
  const feriados = useFeriados()
  const listaFeriados = useListaFeriados()
  const idForm = useId()
  const [pedidos, setPedidos] = useState('')
  const [motivo, setMotivo] = useState<MotivoRodada>('erro_execucao')
  const [motivoTexto, setMotivoTexto] = useState('')
  const prazoPadrao = useMemo(() => prazoAjustePadrao(hojeSP(new Date()), config.ajustePrazoDiasUteis, feriados), [config.ajustePrazoDiasUteis, feriados])
  const [prazo, setPrazo] = useState<{ data: DataLocal | null; hora: HoraLocal | null } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  if (!d) return <NaoEncontrada fechar={() => fechar(null)} />
  const itens = linhasParaItens(pedidos)
  const proxima = d.rodadaAtual + 1

  async function pedir() {
    if (enviando || !d) return
    if (itens.length === 0) { setErro('Escreva os ajustes, um por linha.'); return }
    setEnviando(true)
    setErro(null)
    try {
      const s = await acoesCiclo(qc).ajusteInterno(d.id, {
        linhas: itens, motivo, motivoTexto: motivoTexto.trim() || null, ...(prazo?.data ? { prazo: prazo.data, prazoHora: prazo.hora } : {}),
      })
      fechar({ demanda: s.demanda })
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MolduraDialogo titulo="Pedir ajuste interno" descricao={`#${d.numero} ${d.titulo} · abre a rodada ${proxima}`} tamanho="m"
      fecharAoClicarFora={!pedidos.trim()}
      rodape={(
        <>
          <Botao onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" atalho="mod+enter" carregando={enviando}>
            Pedir ajuste{itens.length ? ` (${itens.length})` : ''}
          </Botao>
        </>
      )}>
      <form id={idForm} className="cic-form" onSubmit={(e) => { e.preventDefault(); void pedir() }} onKeyDown={(e) => ctrlEnter(e, () => void pedir())}>
        <div className="cic-campo">
          <label className="cic-rotulo" htmlFor={`${idForm}-pedidos`}>O que ajustar</label>
          <div className="ui-entrada ui-entrada-texto">
            <textarea id={`${idForm}-pedidos`} rows={5} value={pedidos} onChange={(e) => setPedidos(e.target.value)} autoFocus
              aria-describedby={`${idForm}-ajuda`} placeholder={'Ex.:\nA fonte não é a da marca\nFalta o selo de 30 anos'} />
          </div>
          <p id={`${idForm}-ajuda`} className="cic-ajuda">Cada linha vira um item de "Ajustes R{proxima}". O card não muda de coluna.</p>
        </div>
        <div className="cic-grade">
          <Selecao rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoRodada)}
            opcoes={MOTIVOS_RODADA.map((m) => ({ valor: m, rotulo: ROTULO_MOTIVO_RODADA[m] }))} />
          <div className="cic-campo">
            <span className="cic-rotulo" id={`${idForm}-prazo`}>Prazo da próxima versão</span>
            <SeletorData rotulo={`Prazo da rodada ${proxima}`} comHora permitirLimpar={false} valor={prazo?.data ?? prazoPadrao} hora={prazo?.hora ?? null}
              feriados={listaFeriados} aria-describedby={`${idForm}-prazo`} aoMudar={(data, hora) => setPrazo({ data, hora })} />
          </div>
        </div>
        {motivo === 'outro' && <Campo rotulo="Qual motivo" value={motivoTexto} maxLength={300} onChange={(e) => setMotivoTexto(e.target.value)} />}
        {erro && <p className="cic-erro" role="alert">{erro}</p>}
      </form>
    </MolduraDialogo>
  )
}
