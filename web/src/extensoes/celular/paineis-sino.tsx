/**
 * Aba Sino do celular (F3; ordem 500): o número de não lidas e o diálogo `notificacoes` como folha. A folha precisa de
 * uma âncora para ser popover (o Popover vira folha no celular): a própria aba, ou a barra de abas.
 */
import { Bell } from 'lucide-react'
import type { ExtensaoAbaCelular } from '../tipos.ts'
import { useNaoLidas } from '../../funcionalidades/paineis/api.ts'
import { useRelerSinoNoResync } from '../../funcionalidades/paineis/Sino.tsx'
import { fecharSinoAberto, sinoAberto } from '../../funcionalidades/paineis/sino-estado.ts'

function useContador(): number {
  useRelerSinoNoResync()
  return useNaoLidas()
}

export const aba: ExtensaoAbaCelular = {
  id: 'paineis-sino', ordem: 500, rotulo: 'Avisos', icone: Bell, useContador,
  executar: (ctx) => {
    if (sinoAberto()) { fecharSinoAberto(); return }
    const ativo = document.activeElement
    const ancora = ativo instanceof HTMLElement && ativo.closest('.casca-abas') ? ativo : document.querySelector<HTMLElement>('.casca-abas')
    void ctx.abrirDialogo('notificacoes', {}, { ancora })
  },
}
