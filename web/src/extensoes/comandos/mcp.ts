/** Comando da paleta (F7, ordem 540, junto dos cadastros): "Conectar o Claude" → Configurações › Conexões. */
import { PlugZap } from 'lucide-react'
import type { Comando } from '../tipos.ts'

export const comandos: Comando[] = [
  { id: 'mcp-conectar', rotulo: 'Conectar o Claude', secao: 'ir_para', ordem: 540, icone: PlugZap,
    palavras: ['claude', 'mcp', 'conector', 'conexoes', 'ia', 'assistente', 'claude code'], executar: (ctx) => ctx.navegar('/config/conexoes') },
]
