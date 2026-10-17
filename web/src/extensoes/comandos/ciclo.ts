/**
 * Ciclo (F2) na paleta (Ações, ordem 60–80): com uma demanda em foco (card ou modal), Entregar versão, Enviar ao
 * cliente e Registrar retorno quando valem; com um quadro aberto, Automações deste quadro.
 */
import { Reply, Send, Upload, Workflow } from 'lucide-react'
import type { Comando, ContextoAcao } from '../tipos.ts'
import { acoesDoCiclo, type AcaoCiclo } from '../../funcionalidades/ciclo/logica.ts'

const vale = (acao: AcaoCiclo) => (ctx: ContextoAcao) => {
  const d = ctx.demandaEmFoco
  return !!d && acoesDoCiclo(d, { id: ctx.eu.usuario.id, papel: ctx.eu.usuario.papel }).visiveis.includes(acao)
}

export const comandos: Comando[] = [
  {
    id: 'ciclo-entregar', rotulo: 'Entregar versão', secao: 'acoes', ordem: 60, icone: Upload, atalho: 'shift+e',
    palavras: ['versao', 'entrega', 'drive'], visivel: vale('entregar'),
    executar: (ctx) => { void ctx.abrirDialogo('entregar-versao', { demandaId: ctx.demandaEmFoco!.id }) },
  },
  {
    id: 'ciclo-enviar', rotulo: 'Enviar ao cliente', secao: 'acoes', ordem: 65, icone: Send,
    palavras: ['link', 'aprovacao', 'cliente'], visivel: vale('enviar'),
    executar: (ctx) => { void ctx.abrirDialogo('enviar-ao-cliente', { demandaId: ctx.demandaEmFoco!.id }) },
  },
  {
    id: 'ciclo-retorno', rotulo: 'Registrar retorno do cliente', secao: 'acoes', ordem: 70, icone: Reply, atalho: 'shift+r',
    palavras: ['aprovado', 'ajuste', 'retorno'], visivel: vale('retorno'),
    executar: (ctx) => { void ctx.abrirDialogo('registrar-retorno', { demandaId: ctx.demandaEmFoco!.id }) },
  },
  {
    id: 'ciclo-automacoes', rotulo: 'Automações deste quadro', secao: 'acoes', ordem: 80, icone: Workflow,
    palavras: ['automacao', 'mover', 'regras'], visivel: (ctx) => !!ctx.quadroAtual,
    executar: (ctx) => { void ctx.abrirDialogo('automacoes-quadro', { quadroId: ctx.quadroAtual!.id }) },
  },
]
