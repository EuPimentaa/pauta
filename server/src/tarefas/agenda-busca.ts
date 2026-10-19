/**
 * Tarefa `agenda-busca` (API.md §F.11): confere a cada minuto (`aCadaMin`, RODADA_AGENDA_EXTERNA_MIN) e busca cada
 * agenda ativa cuja última tentativa passou de 15 min (INTERVALO_AGENDA_EXTERNA_MIN), uma de cada vez: uma agenda
 * buscada fora da tarefa não pula a rodada seguinte. A falha de uma agenda não impede a próxima; no fim, se alguma falhou de um jeito
 * inesperado, a tarefa termina com um erro de mensagem já mascarada (vai para `tarefa_execucao.detalhe` sem o endereço).
 */
import { RODADA_AGENDA_EXTERNA_MIN } from '../../../shared/tipos/index.ts'
import type { Tarefa } from '../tarefas.ts'
import { buscarDevidas } from '../servicos/agenda-busca.ts'

export const tarefa: Tarefa = {
  nome: 'agenda-busca',
  horario: '00:00',
  aCadaMin: RODADA_AGENDA_EXTERNA_MIN,
  async executar(db) {
    const { buscadas, falhas } = await buscarDevidas(db)
    if (falhas.length > 0) {
      throw new Error(`${falhas.length} de ${buscadas} ${buscadas === 1 ? 'agenda falhou' : 'agendas falharam'}: ${falhas[0]}`.slice(0, 500))
    }
  },
}
