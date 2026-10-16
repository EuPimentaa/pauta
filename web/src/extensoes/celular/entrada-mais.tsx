/** O "+" central da barra do celular (F4; ordem 300): a Nova demanda com o foco no Colar do WhatsApp. */
import { Plus } from 'lucide-react'
import type { ExtensaoAbaCelular } from '../tipos.ts'

export const aba: ExtensaoAbaCelular = {
  id: 'entrada-mais', ordem: 300, rotulo: 'Nova demanda', icone: Plus, destaque: true,
  // o quadro aberto o diálogo descobre sozinho (a barra do celular não sabe qual é)
  executar: (ctx) => { void ctx.abrirDialogo('nova-demanda', { focoColar: true }) },
}
