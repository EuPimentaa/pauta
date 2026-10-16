/** Só DEV (/dev/extensoes): slot do cabeçalho do quadro, à esquerda. */
import type { ExtensaoCabecalhoQuadro, PropsCabecalhoQuadro } from '../tipos.ts'
import { useExemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

function Slot({ layout, total }: PropsCabecalhoQuadro) {
  if (!useExemplosAtivos()) return null
  return <span className="ui-sinal" data-exemplo="cabecalho-esquerda">esquerda · {layout} · {total}</span>
}

export const item: ExtensaoCabecalhoQuadro | undefined = import.meta.env.DEV
  ? { id: 'nucleo-exemplo-esquerda', ordem: 100, lado: 'esquerda', Componente: Slot }
  : undefined
