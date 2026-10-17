/**
 * Comandos da paleta (F3): Ir para a Agenda (20) e as Horas (30), depois do Início do núcleo (10); a ação
 * "Ver notificações" e "Marcar as notificações como lidas".
 */
import { Bell, CalendarDays, CheckCheck, Clock3 } from 'lucide-react'
import type { ListarNotificacoesSaida } from '@shared/tipos/index.ts'
import type { Comando } from '../tipos.ts'
import { chaves } from '../../api/chaves.ts'
import { marcarLidas } from '../../funcionalidades/paineis/api.ts'

export const comandos: Comando[] = [
  { id: 'paineis-ir-agenda', rotulo: 'Ir para a Agenda', secao: 'ir_para', ordem: 20, icone: CalendarDays, atalho: 'g a',
    palavras: ['calendario', 'prazos', 'semana', 'mes'], executar: (ctx) => ctx.navegar('/agenda') },
  { id: 'paineis-ir-horas', rotulo: 'Ir para as Horas', secao: 'ir_para', ordem: 30, icone: Clock3, atalho: 'g h',
    palavras: ['tempo', 'apontamentos', 'cronometro', 'timesheet'], executar: (ctx) => ctx.navegar('/horas') },
  { id: 'paineis-notificacoes', rotulo: 'Ver notificações', secao: 'acoes', ordem: 100, icone: Bell,
    palavras: ['sino', 'avisos', 'mencoes'], executar: (ctx) => { void ctx.abrirDialogo('notificacoes', {}) } },
  { id: 'paineis-marcar-lidas', rotulo: 'Marcar as notificações como lidas', secao: 'acoes', ordem: 110, icone: CheckCheck,
    palavras: ['sino', 'limpar', 'lidas'],
    visivel: (ctx) => (ctx.qc.getQueryData<ListarNotificacoesSaida>(chaves.notificacoes)?.naoLidas ?? 0) > 0,
    executar: (ctx) => {
      const maior = ctx.qc.getQueryData<ListarNotificacoesSaida>(chaves.notificacoes)?.itens[0]?.id
      void marcarLidas(ctx.qc, maior !== undefined ? { ate: maior } : {})
    } },
]
