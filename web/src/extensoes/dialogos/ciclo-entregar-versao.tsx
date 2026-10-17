/** Ciclo (F2): Entregar versão (links, caminho, arquivos e nota). */
import type { ExtensaoDialogo } from '../tipos.ts'

export const dialogo: ExtensaoDialogo<'entregar-versao'> = {
  id: 'entregar-versao',
  carregar: () => import('../../funcionalidades/ciclo/dialogos/index.ts').then((m) => ({ default: m.EntregarVersao })),
}
