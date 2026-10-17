/** Ciclo (F2): "Versões e aprovação" na coluna principal do modal (ordem 300, entre checklists e anexos). */
import type { ExtensaoSecaoDemanda } from '../tipos.ts'

export const secao: ExtensaoSecaoDemanda = {
  id: 'ciclo-versoes', ordem: 300, coluna: 'principal',
  carregar: () => import('../../funcionalidades/ciclo/Versoes.tsx'),
}
