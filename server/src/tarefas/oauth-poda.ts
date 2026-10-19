/**
 * Poda diária do OAuth do MCP (F7, API.md §F.11), às 03:30: pedidos e tokens vencidos há mais de 1 dia, clientes do
 * registro dinâmico sem nenhuma concessão criados há mais de 24 h e o par guardado dos refresh trocados há mais de 60 s.
 * Nunca deixa a exceção sair como veio: o log e o `tarefa_execucao.detalhe` levam só `descreverErro`.
 */
import type { Db } from '../db.ts'
import { podarOAuth } from '../servicos/oauth.ts'
import { descreverErro } from '../servicos/segredos.ts'
import type { Tarefa } from '../tarefas.ts'

export const tarefa: Tarefa = {
  nome: 'oauth-poda',
  horario: '03:30',
  executar(db: Db) {
    try {
      podarOAuth(db)
    } catch (e) {
      const seguro = new Error(descreverErro(e))
      seguro.stack = seguro.message
      throw seguro
    }
  },
}
