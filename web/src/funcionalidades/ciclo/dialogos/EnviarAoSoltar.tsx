/**
 * "Enviar ao cliente agora?" (F2): o atendimento soltou numa coluna que aguarda o cliente uma demanda com versão não
 * enviada. [Enviar] abre o "Enviar ao cliente" por cima (empilha e devolve o foco); [Só mover] segue o mover;
 * [Cancelar] (e Esc) devolve o card.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { demandaConhecida } from '../../../api/cache.ts'
import { useColuna } from '../../../api/seletores.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { ultimoEnvio } from '../api.ts'
import { NaoEncontrada, useDemandaAlvo } from './comum.tsx'

export default function EnviarAoSoltar({ params, fechar }: PropsDialogo<'enviar-ao-soltar'>) {
  const qc = useQueryClient()
  const d = useDemandaAlvo(params.demandaId)
  const coluna = useColuna(params.colunaId)
  const [abrindo, setAbrindo] = useState(false)
  if (!d) return <NaoEncontrada fechar={() => fechar(null)} />

  async function enviar() {
    setAbrindo(true)
    const antes = d!
    const r = await abrirDialogo('enviar-ao-cliente', { demandaId: antes.id })
    setAbrindo(false)
    // o diálogo de envio pode ter sido fechado pelo Esc depois de enviar: vale o que a demanda diz agora
    const depois = r?.demanda ?? demandaConhecida(qc, antes.id)
    if (depois && depois.envioPendenteEm && depois.envioPendenteEm !== antes.envioPendenteEm) {
      fechar({ escolha: 'enviado', demanda: depois, automacao: ultimoEnvio(antes.id)?.automacao ?? false })
    }
  }

  return (
    <MolduraDialogo titulo="Enviar ao cliente agora?"
      rodape={(
        <>
          <Botao onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao onClick={() => fechar({ escolha: 'so_mover' })}>Só mover</Botao>
          <Botao variante="primario" icone={Send} carregando={abrindo} onClick={() => void enviar()} data-autofocus="">Enviar</Botao>
        </>
      )}>
      <p className="cic-vazio">
        A V{d.nVersoes} de #{d.numero} {d.titulo} ainda não foi enviada. Enviar agora deixa a bola com o cliente; "Só mover" leva o
        card para {coluna ? coluna.nome : 'a coluna'} sem enviar.
      </p>
    </MolduraDialogo>
  )
}
