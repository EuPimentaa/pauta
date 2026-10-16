/** Só DEV (/dev/extensoes): slot do cabeçalho do quadro, à esquerda. */
import type { ExtensaoCabecalhoQuadro, PropsCabecalhoQuadro } from '../tipos.ts'

function Slot({ layout, total }: PropsCabecalhoQuadro) {
  return <span className="ui-sinal" data-exemplo="cabecalho-esquerda">esquerda · {layout} · {total}</span>
}

export const item: ExtensaoCabecalhoQuadro = { id: 'nucleo-exemplo-esquerda', ordem: 100, lado: 'esquerda', Componente: Slot }
