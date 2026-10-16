/** Só DEV (/dev/extensoes): slot do cabeçalho do quadro, à direita (com um filtro de prioridade para testar a URL). */
import type { ExtensaoCabecalhoQuadro, PropsCabecalhoQuadro } from '../tipos.ts'
import { Botao } from '../../ui/Botao.tsx'

function Slot({ filtros, definirFiltros }: PropsCabecalhoQuadro) {
  const ligado = !!filtros.prioridades?.includes('urgente')
  return (
    <Botao variante="ghost" tamanho="p" aria-pressed={ligado} data-exemplo="cabecalho-direita"
      onClick={() => definirFiltros({ ...filtros, prioridades: ligado ? undefined : ['urgente'] })}>
      Exemplo: só urgentes
    </Botao>
  )
}

export const item: ExtensaoCabecalhoQuadro = { id: 'nucleo-exemplo-direita', ordem: 100, lado: 'direita', Componente: Slot }
