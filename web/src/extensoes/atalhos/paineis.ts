/**
 * Atalhos dos painéis (F3): G I Início, G A Agenda, G H Horas (em qualquer tela); na Agenda (escopo `agenda`),
 * Shift+← e Shift+→ mudam o período e Shift+T volta para hoje. As letras sozinhas ficam com o card em foco.
 */
import type { Atalho } from '../tipos.ts'
import { controleAgenda } from '../../funcionalidades/paineis/agenda-estado.ts'

export const atalhos: Atalho[] = [
  { id: 'paineis-ir-inicio', teclas: 'g i', descricao: 'Ir para o Início', escopo: 'global', grupo: 'navegacao', executar: (ctx) => ctx.navegar('/inicio') },
  { id: 'paineis-ir-agenda', teclas: 'g a', descricao: 'Ir para a Agenda', escopo: 'global', grupo: 'navegacao', executar: (ctx) => ctx.navegar('/agenda') },
  { id: 'paineis-ir-horas', teclas: 'g h', descricao: 'Ir para as Horas', escopo: 'global', grupo: 'navegacao', executar: (ctx) => ctx.navegar('/horas') },
  {
    id: 'paineis-agenda-anterior', teclas: 'shift+arrowleft', descricao: 'Período anterior', escopo: 'agenda', grupo: 'navegacao',
    quando: () => !!controleAgenda(), executar: () => controleAgenda()?.andar(-1),
  },
  {
    id: 'paineis-agenda-proximo', teclas: 'shift+arrowright', descricao: 'Próximo período', escopo: 'agenda', grupo: 'navegacao',
    quando: () => !!controleAgenda(), executar: () => controleAgenda()?.andar(1),
  },
  {
    id: 'paineis-agenda-hoje', teclas: 'shift+t', descricao: 'Voltar para hoje', escopo: 'agenda', grupo: 'navegacao',
    quando: () => !!controleAgenda(), executar: () => controleAgenda()?.hoje(),
  },
]
