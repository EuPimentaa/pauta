/**
 * Fase 2 (F8): poda diária dos resultados (API.md §F.11): apaga o cache (do cliente e da carteira) sem tentativa há
 * mais de 7 dias e o uso da Windsor de mais de 90 dias. A exceção que subir sai mascarada (`descreverErro`): é o que
 * fica em `tarefa_execucao.detalhe` e no log.
 */
import type { Db } from '../db.ts'
import { podarResultados } from '../servicos/resultados.ts'
import { descreverErro } from '../servicos/segredos.ts'
import type { Tarefa } from '../tarefas.ts'

let podar: (db: Db) => unknown = podarResultados

/** Troca a poda (testes); sem argumento, volta à de verdade. */
export function definirPodaResultados(fn?: (db: Db) => unknown): void {
  podar = fn ?? podarResultados
}

export const tarefa: Tarefa = {
  nome: 'resultados-poda',
  horario: '03:40',
  executar(db) {
    try {
      podar(db)
    } catch (e) {
      throw new Error(descreverErro(e))
    }
  },
}
