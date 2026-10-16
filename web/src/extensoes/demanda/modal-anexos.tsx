/** Modal (F1): links, caminhos M:\ com Copiar e arquivos (Ctrl+V e arrastar); "Tornar capa" nas imagens. */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'modal-anexos', ordem: 400, coluna: 'principal',
  carregar: () => import('../../funcionalidades/modal/secoes/index.ts').then((m) => ({ default: m.Anexos })),
}
