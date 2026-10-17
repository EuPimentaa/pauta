/**
 * Avisos de prazo às 8h de São Paulo (F3; API.md §5.9): `prazo` (vence hoje) e `atrasada` (uma vez por prazo), só
 * em dia útil. Quem perdeu o horário com o servidor desligado roda ao subir (src/tarefas.ts).
 */
import { avisarPrazos } from '../servicos/paineis-prazo.ts'
import type { Tarefa } from '../tarefas.ts'

export const tarefa: Tarefa = {
  nome: 'paineis-prazo',
  horario: '08:00',
  executar(db) {
    avisarPrazos(db)
  },
}
