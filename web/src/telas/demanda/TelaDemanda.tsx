/**
 * /d/:numero (rota sobreposta): o modal da demanda por cima da tela de antes (ou do Início, aberta direto pela URL).
 * Abre do cache e completa com o detalhe; fora do cache espera o detalhe (esqueleto). Número inexistente ou demanda
 * excluída: "Demanda não encontrada.".
 */
import { useParams } from 'react-router'
import { FileQuestion } from 'lucide-react'
import { useDetalhe } from '../../api/demandas.ts'
import { useDemandaPorNumero } from '../../api/seletores.ts'
import { ConteudoModal, EsqueletoModal } from '../../demanda/ModalDemanda.tsx'
import { useFecharSobreposta } from '../../sessao/sobreposta.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { EstadoVazio } from '../../ui/Indicadores.tsx'
import { Modal } from '../../ui/Modal.tsx'

export default function TelaDemanda() {
  const { numero = '' } = useParams()
  const n = Number(numero)
  const fechar = useFecharSobreposta()
  const doCache = useDemandaPorNumero(n)
  const detalhe = useDetalhe(n)
  const demanda = doCache ?? detalhe.data?.demanda

  let conteudo
  if (demanda) {
    conteudo = <ConteudoModal demanda={demanda} detalhe={detalhe.data} fechar={fechar} />
  } else if (detalhe.isError || !Number.isInteger(n) || n <= 0) {
    const naoExiste = detalhe.error?.status === 404 || !Number.isInteger(n) || n <= 0
    conteudo = (
      <EsqueletoModal fechar={fechar} mensagem={(
        <EstadoVazio icone={FileQuestion} tamanho="p" como="h2"
          titulo={naoExiste ? 'Demanda não encontrada.' : 'Não foi possível abrir a demanda.'}
          texto={naoExiste ? `Não há demanda #${numero}: o número pode estar errado ou ela foi excluída.` : detalhe.error?.mensagem}
          acoes={!naoExiste ? <Botao variante="secundario" onClick={() => void detalhe.refetch()}>Tentar de novo</Botao> : undefined} />
      )} />
    )
  } else {
    conteudo = <EsqueletoModal fechar={fechar} />
  }

  return (
    <Modal aberto aoFechar={fechar} semCabecalho rotulo={demanda ? `Demanda #${demanda.numero}: ${demanda.titulo}` : `Demanda #${numero}`}
      tamanho="xg" className="modal-demanda-janela" classeCorpo="modal-demanda-rolagem">
      {conteudo}
    </Modal>
  )
}
