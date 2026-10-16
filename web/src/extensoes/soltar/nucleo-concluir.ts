/**
 * Interceptador do núcleo (PLANO §2, "Mover"; ordem 200): soltar numa coluna `concluida` uma demanda que repete não
 * pergunta nada, segue para o /mover. O aviso "Concluída. A próxima fica para sex, 24/10 · Desfazer" sai do useMover
 * com a data que o servidor calculou (feriados inclusos), e o Desfazer reabre e arquiva a repetição (API §5.11).
 * Está registrado para ocupar o lugar do núcleo na fila (ciclo 100, núcleo 200): só o primeiro que casa decide.
 */
import type { InterceptadorSoltar } from '../tipos.ts'

export const interceptador: InterceptadorSoltar = {
  id: 'nucleo-concluir',
  ordem: 200,
  quando: (p) => p.para.coluna.papel === 'concluida' && p.de.coluna.papel !== 'concluida'
    && !p.demanda.concluidaEm && p.demanda.repetir !== 'nenhuma' && p.demanda.prazo !== null,
  executar: async () => ({ tipo: 'seguir' }),
}
