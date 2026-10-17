/**
 * "Entregar versão" (Shift+E; F2): links do Drive (testados na hora), caminho da pasta de saída (a do cliente vem
 * sugerida) e arquivos até 10 MB (botão, arrastar ou Ctrl+V), mais uma nota para o atendimento. Não muda a coluna;
 * o AM é avisado. O formulário mexido não fecha no clique fora.
 */
import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { mensagemDeErro } from '../../../api/cliente.ts'
import { useCliente } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { avisar } from '../../../ui/avisos.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { acoesCiclo } from '../api.ts'
import { ItensEntrega, type ItemNovo } from '../comum.tsx'
import { NaoEncontrada, ctrlEnter, useDemandaAlvo } from './comum.tsx'

export default function EntregarVersao({ params, fechar }: PropsDialogo<'entregar-versao'>) {
  const qc = useQueryClient()
  const d = useDemandaAlvo(params.demandaId)
  const cliente = useCliente(d?.clienteId ?? null)
  const [itens, setItens] = useState<ItemNovo[]>([])
  const [nota, setNota] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const idForm = useId()
  if (!d) return <NaoEncontrada fechar={() => fechar(null)} />
  const numero = d.nVersoes + 1
  const sujo = itens.length > 0 || nota.trim() !== ''
  const privado = itens.some((x) => x.drive === 'privado')

  async function entregar() {
    if (enviando) return
    if (itens.length === 0) { setErro('Acrescente pelo menos um link, caminho ou arquivo.'); return }
    setEnviando(true)
    setErro(null)
    try {
      const s = await acoesCiclo(qc).entregar(d!.id, { nota: nota.trim() || null, itens: itens.map((x) => x.item) })
      avisar(`V${s.versao.numero} entregue`, { tipo: 'sucesso', descricao: d!.atendimentoId ? 'O atendimento foi avisado.' : undefined })
      fechar({ demanda: s.demanda })
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MolduraDialogo titulo={`Entregar V${numero}`} descricao={`#${d.numero} ${d.titulo}`} tamanho="m" fecharAoClicarFora={!sujo}
      rodape={(
        <>
          <Botao onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" atalho="mod+enter" carregando={enviando}>Entregar V{numero}</Botao>
        </>
      )}>
      <form id={idForm} className="cic-form" onSubmit={(e) => { e.preventDefault(); void entregar() }} onKeyDown={(e) => ctrlEnter(e, () => void entregar())}>
        <ItensEntrega itens={itens} mudar={(fn) => { setItens(fn); setErro(null) }} sugestaoCaminho={cliente?.pastaSaida} autoFoco />
        {privado && (
          <div className="cic-alerta" role="status">
            <AlertTriangle aria-hidden="true" />
            <span><strong>Um arquivo do Drive está privado.</strong> O cliente verá uma tela de login: abra o compartilhamento antes do envio por link.</span>
          </div>
        )}
        <div className="cic-campo">
          <label className="cic-rotulo" htmlFor={`${idForm}-nota`}>Nota para o atendimento <span className="cic-ajuda">(opcional)</span></label>
          <div className="ui-entrada ui-entrada-texto">
            <textarea id={`${idForm}-nota`} rows={2} maxLength={4000} value={nota} placeholder="Ex.: troquei a foto e ajustei o logo"
              onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>
        {erro && <p className="cic-erro" role="alert">{erro}</p>}
      </form>
    </MolduraDialogo>
  )
}
