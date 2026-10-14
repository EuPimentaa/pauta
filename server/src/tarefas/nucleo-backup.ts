/** Backup diário: `VACUUM INTO DATA_DIR/backups/demandas-AAAA-MM-DD.db`, guardando os `backupManter` mais novos. */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.ts'
import { hoje, lerConfig } from '../servicos/config-app.ts'
import type { Tarefa } from '../tarefas.ts'

export function fazerBackup(db: Parameters<Tarefa['executar']>[0]): string {
  const pasta = join(config.dataDir, 'backups')
  mkdirSync(pasta, { recursive: true })
  const destino = join(pasta, `demandas-${hoje()}.db`)
  if (existsSync(destino)) rmSync(destino)
  db.prepare('VACUUM INTO ?').run(destino)
  const manter = lerConfig(db).backupManter
  const antigos = readdirSync(pasta).filter((n) => /^demandas-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().reverse().slice(manter)
  for (const n of antigos) rmSync(join(pasta, n))
  return destino
}

export const tarefa: Tarefa = {
  nome: 'nucleo-backup',
  horario: '03:00',
  executar(db) {
    fazerBackup(db)
  },
}
