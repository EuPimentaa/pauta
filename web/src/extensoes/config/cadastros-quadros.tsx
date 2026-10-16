/**
 * Configurações › Quadros (F5; PLANO §4: ordem 300). Todos os papéis: colunas e etiquetas são de todos (API §2); o
 * resto do quadro (nome, endereço, equipe, copiar, arquivar, restaurar, excluir) só o admin muda.
 */
import { LayoutGrid } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'cadastros-quadros', rotulo: 'Quadros', ordem: 300, caminho: 'quadros', acesso: ['admin', 'atendimento', 'equipe'], icone: LayoutGrid,
  carregar: () => import('../../funcionalidades/cadastros/ConfigQuadros.tsx'),
}
