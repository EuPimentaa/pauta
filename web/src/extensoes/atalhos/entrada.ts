/**
 * Atalhos da Entrada (F4): Shift+N abre a Nova demanda (no quadro aberto; com um card em foco, na coluna dele) e "?"
 * abre a lista de atalhos. Os dois valem em qualquer tela (fora de campo de texto).
 */
import type { Atalho } from '../tipos.ts'

export const atalhos: Atalho[] = [
  {
    id: 'entrada-nova-demanda', teclas: 'shift+n', descricao: 'Nova demanda', escopo: 'global', grupo: 'geral',
    executar: (ctx) => {
      const quadroId = ctx.quadroAtual?.id
      const card = ctx.demandaEmFoco && ctx.demandaEmFoco.quadroId === quadroId ? ctx.demandaEmFoco : null
      void ctx.abrirDialogo('nova-demanda', { quadroId, colunaId: card?.colunaId })
    },
  },
  {
    id: 'entrada-atalhos', teclas: '?', descricao: 'Lista de atalhos', escopo: 'global', grupo: 'geral',
    executar: (ctx) => { void ctx.abrirDialogo('atalhos', {}) },
  },
]
