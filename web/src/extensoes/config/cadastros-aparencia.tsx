/** Configurações › Aparência (F5, todos; PLANO §4: ordem 600): tema e atalhos de uma tecla. */
import { Palette } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'cadastros-aparencia', rotulo: 'Aparência', ordem: 600, caminho: 'aparencia', acesso: ['admin', 'atendimento', 'equipe'], icone: Palette,
  carregar: () => import('../../funcionalidades/cadastros/ConfigAparencia.tsx'),
}
