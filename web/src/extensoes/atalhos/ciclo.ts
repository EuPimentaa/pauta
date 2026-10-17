/**
 * Atalhos do ciclo (F2), no card em foco e no modal: Shift+R registra o retorno (atendimento, com envio pendente) e
 * Shift+E entrega uma versão (quem pode entregar). Demanda arquivada: nada.
 */
import type { Atalho, ContextoAtalho, EscopoAtalho } from '../tipos.ts'
import { acoesDoCiclo } from '../../funcionalidades/ciclo/logica.ts'

const disponivel = (ctx: ContextoAtalho, acao: 'retorno' | 'entregar') => {
  const d = ctx.demandaEmFoco
  return !!d && acoesDoCiclo(d, { id: ctx.eu.usuario.id, papel: ctx.eu.usuario.papel }).visiveis.includes(acao)
}

function deEscopo(escopo: EscopoAtalho): Atalho[] {
  return [
    {
      id: `ciclo-retorno-${escopo}`, teclas: 'shift+r', descricao: 'Registrar o retorno do cliente', escopo, grupo: 'demanda',
      quando: (ctx) => disponivel(ctx, 'retorno'),
      executar: (ctx) => { void ctx.abrirDialogo('registrar-retorno', { demandaId: ctx.demandaEmFoco!.id }) },
    },
    {
      id: `ciclo-entregar-${escopo}`, teclas: 'shift+e', descricao: 'Entregar versão', escopo, grupo: 'demanda',
      quando: (ctx) => disponivel(ctx, 'entregar'),
      executar: (ctx) => { void ctx.abrirDialogo('entregar-versao', { demandaId: ctx.demandaEmFoco!.id }) },
    },
  ]
}

export const atalhos: Atalho[] = [...deEscopo('card'), ...deEscopo('modal')]
