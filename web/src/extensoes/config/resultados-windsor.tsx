/**
 * Configurações › Resultados (Windsor) (F8, ordem 560, entre Prazos e limites 550 e Aparência 600; admin e atendimento):
 * a chave, o uso de hoje e todas as contas da Windsor com o "Ligar a…".
 */
import { BarChart3 } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'resultados-windsor', rotulo: 'Resultados (Windsor)', ordem: 560, caminho: 'resultados-windsor', acesso: ['admin', 'atendimento'],
  icone: BarChart3, carregar: () => import('../../funcionalidades/resultados/ConfigWindsor.tsx'),
}
