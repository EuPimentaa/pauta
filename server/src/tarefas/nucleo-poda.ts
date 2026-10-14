/**
 * Poda diária: eventos com mais de `eventoRetencaoDias` (nunca o último: o seq atual continua em sqlite_sequence e a
 * retomada do SSE depende de haver pelo menos um), tentativas de login com mais de 7 dias e sessões e tokens vencidos
 * há mais de 30 dias.
 */
import { agoraData, rodar, tx, type Db } from '../db.ts'
import { lerConfig } from '../servicos/config-app.ts'
import type { Tarefa } from '../tarefas.ts'

const dias = (n: number) => new Date(agoraData().getTime() - n * 86_400_000).toISOString()

export function podar(db: Db): { eventos: number } {
  return tx(db, () => {
    const eventos = rodar(db, 'DELETE FROM evento WHERE criado_em < ? AND seq < (SELECT max(seq) FROM evento)',
      dias(lerConfig(db).eventoRetencaoDias)).changes
    rodar(db, 'DELETE FROM login_tentativa WHERE criado_em < ?', dias(7))
    rodar(db, 'DELETE FROM sessao WHERE expira_em < ? OR revogada_em < ?', dias(30), dias(30))
    rodar(db, 'DELETE FROM token_acesso WHERE expira_em < ?', dias(30))
    return { eventos }
  })
}

export const tarefa: Tarefa = {
  nome: 'nucleo-poda',
  horario: '03:30',
  executar(db) {
    podar(db)
  },
}
