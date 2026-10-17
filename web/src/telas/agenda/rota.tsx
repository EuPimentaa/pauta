/** /agenda (F3): o calendário de todos os quadros (mês e semana, começando na segunda), "Só as minhas", arrastar muda o prazo. */
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/agenda',
  carregar: () => import('./TelaAgenda.tsx'),
  acesso: 'autenticada',
  layout: 'casca',
  titulo: 'Agenda',
}
