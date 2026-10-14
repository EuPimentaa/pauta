/**
 * Boot: abre o banco em DATA_DIR, aplica as migrações, cria o admin no primeiro boot (ADMIN_EMAIL/ADMIN_SENHA),
 * sobe HTTP + SSE, serve web/dist em produção e agenda os jobs diários.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { criarApp } from './app.ts'
import { config } from './config.ts'
import { abrir, migrar } from './db.ts'
import { criarAdminInicial } from './primeiro-boot.ts'
import { carregarTarefas, iniciarTarefas } from './tarefas.ts'
import { servirWeb } from './web.ts'

mkdirSync(config.dataDir, { recursive: true })
const db = abrir(join(config.dataDir, 'demandas.db'))
const aplicadas = migrar(db)
if (aplicadas.length) console.log(`Migrações aplicadas: ${aplicadas.join(', ')}`)
await criarAdminInicial(db)

const app = criarApp(db)
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist')
if (config.producao && !servirWeb(app, dist)) console.warn(`web/dist não encontrado em ${dist}: só a API está no ar.`)
const pararTarefas = iniciarTarefas(db, await carregarTarefas())

const servidor = serve({ fetch: app.fetch, port: config.porta, hostname: config.host }, (info) => {
  console.log(`${config.appNome} no ar em http://${config.host}:${info.port} (${config.producao ? 'produção' : 'desenvolvimento'})`)
})

function encerrar(): void {
  pararTarefas()
  servidor.close(() => {
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', encerrar)
process.on('SIGINT', encerrar)
