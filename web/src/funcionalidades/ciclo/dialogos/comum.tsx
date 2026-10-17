/** O que os diálogos do ciclo dividem: a demanda alvo (bootstrap ou detalhe aberto), o detalhe e o "não encontrada". */
import { useQueryClient } from '@tanstack/react-query'
import type { Demanda, DemandaDetalhe, Id } from '@shared/tipos/index.ts'
import { demandaConhecida } from '../../../api/cache.ts'
import { useDetalhe } from '../../../api/demandas.ts'
import { useDemanda } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao } from '../../../ui/Botao.tsx'

/** A demanda como a tela a conhece (bootstrap; fora dele, o detalhe aberto). */
export function useDemandaAlvo(id: Id): Demanda | undefined {
  const qc = useQueryClient()
  return useDemanda(id) ?? demandaConhecida(qc, id)
}

/** O detalhe da demanda (versões, envios, decisões); usa o que o modal já carregou. */
export function useDetalheAlvo(d: Demanda | undefined): DemandaDetalhe | undefined {
  return useDetalhe(d?.numero ?? 0).data
}

export function NaoEncontrada({ fechar }: { fechar(): void }) {
  return (
    <MolduraDialogo titulo="Demanda não encontrada" rodape={<Botao onClick={fechar}>Fechar</Botao>}>
      <p className="cic-vazio">Esta demanda não está mais disponível. Recarregue a página.</p>
    </MolduraDialogo>
  )
}

/** Ctrl+Enter (ou Cmd+Enter) envia o formulário. */
export function ctrlEnter(e: React.KeyboardEvent, enviar: () => void): void {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    enviar()
  }
}
