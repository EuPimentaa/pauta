/** Atalhos do F6: F abre os filtros do quadro (no Quadro, na Lista e no Calendário). */
import type { Atalho } from '../tipos.ts'
import { abrirPainelFiltros } from '../../funcionalidades/lista/estado.ts'

export const atalhos: Atalho[] = [
  { id: 'lista-filtros', teclas: 'f', descricao: 'Abrir os filtros', escopo: 'quadro', grupo: 'quadro', executar: () => { abrirPainelFiltros() } },
]
