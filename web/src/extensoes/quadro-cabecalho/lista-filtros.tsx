/** Filtros do quadro (F6), à esquerda do cabeçalho: "Filtrar neste quadro", o botão "Filtros" (F) e os chips. */
import type { ExtensaoCabecalhoQuadro } from '../tipos.ts'
import { FiltrosDoQuadro } from '../../funcionalidades/lista/Filtros.tsx'

export const item: ExtensaoCabecalhoQuadro = { id: 'lista-filtros', ordem: 100, lado: 'esquerda', Componente: FiltrosDoQuadro }
