/**
 * Configurações › Prazos e limites (F5, admin): os parâmetros de PATCH /api/config/app. Ordem 550, entre Feriados (500)
 * e Aparência (600): um número novo entre os existentes (PLANO §4).
 */
import { SlidersHorizontal } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'cadastros-parametros', rotulo: 'Prazos e limites', ordem: 550, caminho: 'parametros', acesso: ['admin'], icone: SlidersHorizontal,
  carregar: () => import('../../funcionalidades/cadastros/ConfigParametros.tsx'),
}
