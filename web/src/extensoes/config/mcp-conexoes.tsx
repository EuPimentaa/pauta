/** Configurações › Conexões (F7, ordem 60, logo depois de "Sua conta"; todos os papéis): o Claude conectado ao Pauta. */
import { PlugZap } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'mcp-conexoes', rotulo: 'Conexões', ordem: 60, caminho: 'conexoes', acesso: ['admin', 'atendimento', 'equipe'], icone: PlugZap,
  carregar: () => import('../../funcionalidades/mcp/ConfigConexoes.tsx'),
}
