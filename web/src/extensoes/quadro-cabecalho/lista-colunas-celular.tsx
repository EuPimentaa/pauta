/** Faixa de colunas do celular (F6), à direita do cabeçalho (vira a última linha dele abaixo de 768 px). */
import type { ExtensaoCabecalhoQuadro } from '../tipos.ts'
import { FaixaColunas } from '../../funcionalidades/lista/FaixaColunas.tsx'

export const item: ExtensaoCabecalhoQuadro = { id: 'lista-colunas-celular', ordem: 100, lado: 'direita', Componente: FaixaColunas }
