/** Configurações › Feriados (F5; PLANO §4: ordem 500). Todos veem; só o admin cadastra e tira. */
import { CalendarDays } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'cadastros-feriados', rotulo: 'Feriados', ordem: 500, caminho: 'feriados', acesso: ['admin', 'atendimento', 'equipe'], icone: CalendarDays,
  carregar: () => import('../../funcionalidades/cadastros/ConfigFeriados.tsx'),
}
