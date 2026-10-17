/**
 * Ciclo (F2; ordem 100, antes do núcleo): o atendimento solta numa coluna `aguardando_cliente` uma demanda com versão
 * entregue e não enviada → "Enviar ao cliente agora?" [Enviar | Só mover | Cancelar] (vale para arrastar, teclado,
 * menu e o "Mover para…", que empilha o diálogo). Enviado: se a automação já levou o card (ou ele está na coluna
 * escolhida), `feito` com a demanda do servidor; senão `seguir` (o núcleo move para onde a pessoa soltou).
 */
import type { InterceptadorSoltar } from '../tipos.ts'
import { passoCiclo } from '../../funcionalidades/ciclo/logica.ts'

export const interceptador: InterceptadorSoltar = {
  id: 'ciclo',
  ordem: 100,
  quando: (p, eu) => (eu.usuario.papel === 'atendimento' || eu.usuario.papel === 'admin')
    && p.para.coluna.papel === 'aguardando_cliente' && p.de.coluna.id !== p.para.coluna.id
    && !p.demanda.arquivadoEm && passoCiclo(p.demanda) === 'nao_enviada',
  async executar(p, ctx) {
    const r = await ctx.abrirDialogo('enviar-ao-soltar', { demandaId: p.demanda.id, colunaId: p.para.coluna.id })
    if (!r) return { tipo: 'cancelado' }
    if (r.escolha === 'so_mover') return { tipo: 'seguir' }
    if (r.automacao || r.demanda.colunaId === p.para.coluna.id) return { tipo: 'feito', demanda: r.demanda }
    return { tipo: 'seguir' }
  },
}
