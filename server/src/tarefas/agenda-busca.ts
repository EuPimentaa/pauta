/**
 * Tarefa `agenda-busca` (API.md §F.11): a cada 15 min (`aCadaMin`), busca cada agenda ativa cuja última tentativa
 * passou de 15 min, uma de cada vez. A falha de uma agenda não impede a próxima; no fim, se alguma falhou de um jeito
 * inesperado, a tarefa termina com um erro de mensagem já mascarada (vai para `tarefa_execucao.detalhe` sem o endereço).
 */
import { INTERVALO_AGENDA_EXTERNA_MIN } from '../../../shared/tipos/index.ts'
import type { Tarefa } from '../tarefas.ts'
import { buscarDevidas } from '../servicos/agenda-busca.ts'

export const tarefa: Tarefa = {
  nome: 'agenda-busca',
  horario: '00:00',
  aCadaMin: INTERVALO_AGENDA_EXTERNA_MIN,
  async executar(db) {
    const { buscadas, falhas } = await buscarDevidas(db)
    if (falhas.length > 0) {
      throw new Error(`${falhas.length} de ${buscadas} ${buscadas === 1 ? 'agenda falhou' : 'agendas falharam'}: ${falhas[0]}`.slice(0, 500))
    }
  },
}
