/** Seção "Modelos de demanda" das Configurações (F4; /config/modelos, ordem 400): todos veem; globais só o admin edita. */
import { LayoutTemplate } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'entrada-modelos',
  rotulo: 'Modelos de demanda',
  ordem: 400,
  caminho: 'modelos',
  acesso: ['admin', 'atendimento', 'equipe'],
  icone: LayoutTemplate,
  carregar: () => import('../../funcionalidades/entrada/TelaModelos.tsx'),
}
