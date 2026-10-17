/** Filtros do quadro (F6): os chips dos filtros ativos numa linha própria sob o cabeçalho (lado 'abaixo'). */
import type { ExtensaoCabecalhoQuadro } from '../tipos.ts'
import { ChipsDosFiltros } from '../../funcionalidades/lista/Filtros.tsx'

export const item: ExtensaoCabecalhoQuadro = { id: 'lista-filtros-chips', ordem: 100, lado: 'abaixo', Componente: ChipsDosFiltros }
