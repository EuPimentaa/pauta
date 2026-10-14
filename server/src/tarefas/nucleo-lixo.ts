/**
 * Lixo de arquivos (API.md §4.14): apaga do disco (1) os órfãos — enviados há mais de 24 h e sem uso (versão, logo ou
 * anexo ativo) — e (2) os excluídos há mais de `arquivoLixoDias`. A linha fica, com `apagado_em`.
 */
import { rmSync } from 'node:fs'
import { agora, agoraData, rodar, todos, tx, type Db } from '../db.ts'
import { caminhoDoArquivo } from '../servicos/arquivos.ts'
import { lerConfig } from '../servicos/config-app.ts'
import type { Tarefa } from '../tarefas.ts'

const SEM_USO = `NOT EXISTS (SELECT 1 FROM versao_item vi WHERE vi.arquivo_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM cliente c WHERE c.logo_arquivo_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM anexo x WHERE x.arquivo_id = a.id AND x.excluido_em IS NULL)`

export function limparArquivos(db: Db): { apagados: string[] } {
  const ha = (ms: number) => new Date(agoraData().getTime() - ms).toISOString()
  const ids = tx(db, () => {
    const instante = agora()
    const orfaos = todos<{ id: string }>(db, `SELECT a.id FROM arquivo a WHERE a.excluido_em IS NULL AND a.criado_em < ? AND ${SEM_USO}`,
      ha(86_400_000)).map((l) => l.id)
    for (const id of orfaos) rodar(db, 'UPDATE arquivo SET excluido_em = ?, apagado_em = ? WHERE id = ?', instante, instante, id)
    const vencidos = todos<{ id: string }>(db, `SELECT a.id FROM arquivo a WHERE a.excluido_em IS NOT NULL AND a.apagado_em IS NULL
      AND a.excluido_em < ?`, ha(lerConfig(db).arquivoLixoDias * 86_400_000)).map((l) => l.id)
    for (const id of vencidos) rodar(db, 'UPDATE arquivo SET apagado_em = ? WHERE id = ?', instante, id)
    return [...orfaos, ...vencidos]
  })
  for (const id of ids) rmSync(caminhoDoArquivo(id), { force: true })
  return { apagados: ids }
}

export const tarefa: Tarefa = {
  nome: 'nucleo-lixo',
  horario: '04:00',
  executar(db) {
    limparArquivos(db)
  },
}
