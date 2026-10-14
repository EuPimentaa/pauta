/** Privacidade: apaga o `ip_hmac` e o user-agent das decisões públicas com mais de 12 meses (o gatilho permite). */
import { agoraData, rodar, tx, type Db } from '../db.ts'
import type { Tarefa } from '../tarefas.ts'

export function apagarIpsAntigos(db: Db): number {
  const limite = new Date(agoraData())
  limite.setUTCFullYear(limite.getUTCFullYear() - 1)
  return tx(db, () => rodar(db, `UPDATE aprovacao SET ip_hmac = NULL, user_agent = NULL
    WHERE criado_em < ? AND (ip_hmac IS NOT NULL OR user_agent IS NOT NULL)`, limite.toISOString()).changes)
}

export const tarefa: Tarefa = {
  nome: 'nucleo-ip',
  horario: '04:30',
  executar(db) {
    apagarIpsAntigos(db)
  },
}
