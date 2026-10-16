/**
 * Atalhos do modal (F1), no card em foco (quadro, Lista, Início, Agenda) e no modal: M membros, L etiquetas, D datas,
 * T liga/para o cronômetro, Shift+M "Mover para…". C não é usada (no Trello ela arquiva). Demanda arquivada ou de
 * quadro arquivado: nada (só leitura).
 */
import type { Atalho, ContextoAtalho, EscopoAtalho } from '../tipos.ts'
import { abrirSeletor, alternarCronometro, editavel, type Seletor } from '../../funcionalidades/modal/abrir.ts'

const pode = (ctx: ContextoAtalho) => editavel(ctx.qc, ctx.demandaEmFoco)

function seletor(id: string, teclas: string, qual: Seletor, descricao: string, escopo: EscopoAtalho): Atalho {
  return {
    id: `modal-${id}-${escopo}`, teclas, descricao, escopo, grupo: 'demanda', quando: pode,
    executar: (ctx) => { if (ctx.demandaEmFoco) abrirSeletor(ctx.abrirDialogo, qual, ctx.demandaEmFoco) },
  }
}

function deEscopo(escopo: EscopoAtalho): Atalho[] {
  return [
    seletor('membros', 'm', 'membros', 'Membros da demanda', escopo),
    seletor('etiquetas', 'l', 'etiquetas', 'Etiquetas da demanda', escopo),
    seletor('datas', 'd', 'datas', 'Datas: início, prazo, publicação e repetir', escopo),
    {
      id: `modal-cronometro-${escopo}`, teclas: 't', descricao: 'Ligar ou parar o cronômetro', escopo, grupo: 'demanda', quando: pode,
      executar: (ctx) => { if (ctx.demandaEmFoco) alternarCronometro(ctx.qc, ctx.demandaEmFoco) },
    },
    {
      id: `modal-mover-${escopo}`, teclas: 'shift+m', descricao: 'Mover para…', escopo, grupo: 'demanda', quando: pode,
      executar: (ctx) => { if (ctx.demandaEmFoco) void ctx.abrirDialogo('mover-demanda', { demandaId: ctx.demandaEmFoco.id }) },
    },
  ]
}

export const atalhos: Atalho[] = [...deEscopo('card'), ...deEscopo('modal')]
