/** Modal (F1): descrição em Markdown com @ (salva com Ctrl+Enter ou ao sair) e o texto original do WhatsApp. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-descricao', ordem: 100, coluna: 'principal',
  carregar: () => import('../../funcionalidades/modal/secoes/index.ts').then((m) => ({ default: m.Descricao })),
}
