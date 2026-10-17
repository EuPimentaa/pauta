/**
 * Ciclo (F2): ações do topo do modal (ordem 100–199). O primário laranja depende do passo: sem versão → Entregar;
 * versão não enviada → Enviar ao cliente; envio pendente → Registrar retorno; depois de um ajuste → Entregar de novo.
 * As secundárias seguem a ordem (o modal mostra até 2; o resto vai para o ···).
 */
import { CheckCheck, MessageCircle, Send, Undo2, Upload, Wrench, Reply } from 'lucide-react'
import type { ContextoDemanda, ExtensaoAcaoDemanda } from '../tipos.ts'
import { acoesCiclo } from '../../funcionalidades/ciclo/api.ts'
import { acoesDoCiclo, entregueNaRodada, rodadaAberta, type AcaoCiclo } from '../../funcionalidades/ciclo/logica.ts'

function calcular(ctx: ContextoDemanda) {
  const det = ctx.detalhe
  return acoesDoCiclo(ctx.demanda, { id: ctx.eu.usuario.id, papel: ctx.eu.usuario.papel }, det ? {
    rodadaAberta: !!rodadaAberta(det.rodadas), entregueNaRodada: entregueNaRodada(det),
  } : {})
}

const visivel = (a: AcaoCiclo) => (ctx: ContextoDemanda) => !ctx.somenteLeitura && calcular(ctx).visiveis.includes(a)
const primaria = (a: AcaoCiclo) => (ctx: ContextoDemanda) => calcular(ctx).primaria === a

export const acoes: ExtensaoAcaoDemanda[] = [
  {
    id: 'ciclo-retorno', ordem: 100, icone: Reply, atalho: 'Shift+R',
    rotulo: () => 'Registrar retorno', visivel: visivel('retorno'), primaria: primaria('retorno'),
    executar: (ctx, util) => { void util.abrirDialogo('registrar-retorno', { demandaId: ctx.demanda.id }) },
  },
  {
    id: 'ciclo-enviar', ordem: 110, icone: Send,
    rotulo: () => 'Enviar ao cliente', visivel: visivel('enviar'), primaria: primaria('enviar'),
    executar: (ctx, util) => { void util.abrirDialogo('enviar-ao-cliente', { demandaId: ctx.demanda.id }) },
  },
  {
    id: 'ciclo-ajuste-interno', ordem: 115, icone: Wrench,
    rotulo: () => 'Pedir ajuste interno', visivel: visivel('ajuste_interno'),
    executar: (ctx, util) => { void util.abrirDialogo('ajuste-interno', { demandaId: ctx.demanda.id }) },
  },
  {
    id: 'ciclo-entregar', ordem: 120, icone: Upload, atalho: 'Shift+E',
    rotulo: (ctx) => (ctx.demanda.nVersoes === 0 ? 'Entregar versão' : `Entregar V${ctx.demanda.nVersoes + 1}`),
    visivel: visivel('entregar'), primaria: primaria('entregar'),
    executar: (ctx, util) => { void util.abrirDialogo('entregar-versao', { demandaId: ctx.demanda.id }) },
  },
  {
    id: 'ciclo-aprovado-whatsapp', ordem: 130, icone: CheckCheck,
    rotulo: () => 'Aprovado pelo WhatsApp', visivel: visivel('aprovado_whatsapp'),
    executar: async (ctx, util) => { await acoesCiclo(util.qc).aprovadoWhatsapp(ctx.demanda.id) },
  },
  {
    id: 'ciclo-copiar-whatsapp', ordem: 140, icone: MessageCircle,
    rotulo: () => 'Copiar para WhatsApp', visivel: visivel('copiar_whatsapp'),
    executar: (ctx, util) => {
      const d = ctx.demanda
      const modelo = d.envioPendenteEm ? 'lembrete' : d.aprovadaEm ? 'aprovado' : d.versaoEnviadaId && d.versaoEnviadaId === d.versaoAtualId ? 'ajuste' : 'envio'
      void util.abrirDialogo('copiar-whatsapp', { demandaId: d.id, modelo })
    },
  },
  {
    id: 'ciclo-anular', ordem: 160, icone: Undo2,
    rotulo: () => 'Anular aprovação', visivel: visivel('anular'),
    executar: (ctx, util) => { void util.abrirDialogo('anular-aprovacao', { demandaId: ctx.demanda.id }) },
  },
]
