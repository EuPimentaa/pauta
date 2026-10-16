/**
 * Comandos da Entrada na paleta (F4): Nova demanda (em qualquer tela), Nova demanda neste quadro (no quadro aberto),
 * Colar do WhatsApp, a lista de atalhos e os modelos de demanda.
 */
import { ClipboardPaste, Keyboard, LayoutTemplate, Plus, SquarePlus } from 'lucide-react'
import type { Comando } from '../tipos.ts'

export const comandos: Comando[] = [
  {
    id: 'entrada-nova', rotulo: 'Nova demanda', secao: 'acoes', icone: Plus, atalho: 'shift+n',
    palavras: ['criar', 'card', 'tarefa', 'pedido', 'job'], visivel: (ctx) => !ctx.quadroAtual,
    executar: (ctx) => { void ctx.abrirDialogo('nova-demanda', {}) },
  },
  {
    id: 'entrada-nova-quadro', rotulo: 'Nova demanda neste quadro', secao: 'acoes', icone: SquarePlus, atalho: 'shift+n',
    palavras: ['criar', 'card', 'tarefa', 'pedido', 'job'], visivel: (ctx) => !!ctx.quadroAtual,
    executar: (ctx) => { void ctx.abrirDialogo('nova-demanda', { quadroId: ctx.quadroAtual?.id }) },
  },
  {
    id: 'entrada-colar', rotulo: 'Colar do WhatsApp', secao: 'acoes', icone: ClipboardPaste,
    palavras: ['whatsapp', 'conversa', 'mensagem', 'zap', 'nova demanda'],
    executar: (ctx) => { void ctx.abrirDialogo('nova-demanda', { quadroId: ctx.quadroAtual?.id, focoColar: true }) },
  },
  {
    id: 'entrada-atalhos', rotulo: 'Atalhos do teclado', secao: 'acoes', icone: Keyboard, atalho: '?',
    palavras: ['teclas', 'teclado', 'ajuda'], executar: (ctx) => { void ctx.abrirDialogo('atalhos', {}) },
  },
  {
    id: 'entrada-modelos', rotulo: 'Modelos de demanda', secao: 'ir_para', icone: LayoutTemplate,
    palavras: ['briefing', 'checklist', 'configuracoes', 'modelo'],
    executar: (ctx) => ctx.navegar(ctx.quadroAtual ? `/config/modelos?quadro=${encodeURIComponent(ctx.quadroAtual.id)}` : '/config/modelos'),
  },
]
