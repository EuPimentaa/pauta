/** Modal (F1): abas Comentários | Atividade, compositor com @ e Ctrl+Enter, "Visível ao cliente" para o atendimento. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-atividade', ordem: 500, coluna: 'principal',
  carregar: () => import('../../funcionalidades/modal/secoes/index.ts').then((m) => ({ default: m.Atividade })),
}
