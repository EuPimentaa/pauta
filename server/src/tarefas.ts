/**
 * Jobs descobertos em src/tarefas/*.ts (cada arquivo exporta `tarefa: Tarefa`). Os diários rodam uma vez por dia
 * depois do horário (São Paulo); quem perdeu o horário com o servidor desligado roda ao subir. Os de intervalo
 * (`aCadaMin`, Fase 2: `agenda-busca` a cada 15 min) ignoram o horário e rodam quando a última execução passou de
 * `aCadaMin` minutos (ou nunca rodaram). A última execução fica em `tarefa_execucao`.
 */
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { HoraLocal } from '../../shared/tipos/index.ts'
import { dataLocalDe, ehHoraLocal, hojeSP, horaLocalDe } from '../../shared/logica/datas.ts'
import { agora, agoraData, rodar, um, type Db } from './db.ts'

export interface Tarefa {
  nome: string
  /** "HH:MM" de São Paulo (ignorado com `aCadaMin`). */
  horario: HoraLocal
  /** Intervalo em minutos (inteiro >= 1): com ele, a tarefa roda quando a última execução passou disso. */
  aCadaMin?: number
  executar(db: Db): void | Promise<void>
}

const PASTA = join(dirname(fileURLToPath(import.meta.url)), 'tarefas')

export async function carregarTarefas(pasta = PASTA): Promise<Tarefa[]> {
  const tarefas: Tarefa[] = []
  for (const nome of readdirSync(pasta).filter((n) => n.endsWith('.ts')).sort()) {
    const mod = (await import(pathToFileURL(join(pasta, nome)).href)) as { tarefa?: Tarefa }
    const t = mod.tarefa
    const intervaloOk = t?.aCadaMin === undefined || (Number.isInteger(t.aCadaMin) && t.aCadaMin >= 1)
    if (!t || typeof t.executar !== 'function' || !ehHoraLocal(t.horario) || !intervaloOk) {
      throw new Error(`src/tarefas/${nome} não exporta uma tarefa válida`)
    }
    tarefas.push(t)
  }
  return tarefas
}

/** Devidas agora: as diárias, se passou do horário hoje e ainda não rodaram hoje; as de intervalo, se o intervalo passou. */
export function tarefasDevidas(db: Db, tarefas: Tarefa[]): Tarefa[] {
  const agoraDt = agoraData()
  const hoje = hojeSP(agoraDt)
  const hora = horaLocalDe(agoraDt.toISOString())
  return tarefas.filter((t) => {
    const ultima = um<{ ultima_em: string }>(db, 'SELECT ultima_em FROM tarefa_execucao WHERE nome = ?', t.nome)
    if (t.aCadaMin !== undefined) return !ultima || agoraDt.getTime() - Date.parse(ultima.ultima_em) >= t.aCadaMin * 60_000
    if (hora < t.horario) return false
    return !ultima || dataLocalDe(ultima.ultima_em) < hoje
  })
}

/** Roda e registra (ok ou o erro). Devolve true se deu certo. */
export async function executarTarefa(db: Db, t: Tarefa): Promise<boolean> {
  let ok = true
  let detalhe: string | null = null
  try {
    await t.executar(db)
  } catch (e) {
    ok = false
    detalhe = String((e as Error).message ?? e).slice(0, 500)
    console.error(`tarefa ${t.nome} falhou:`, e)
  }
  rodar(db, `INSERT INTO tarefa_execucao (nome, ultima_em, ok, detalhe) VALUES (?, ?, ?, ?)
             ON CONFLICT (nome) DO UPDATE SET ultima_em = excluded.ultima_em, ok = excluded.ok, detalhe = excluded.detalhe`,
    t.nome, agora(), ok, detalhe)
  return ok
}

/** Confere a cada minuto e roda as devidas, uma de cada vez. Devolve a função que para o agendador. */
export function iniciarTarefas(db: Db, tarefas: Tarefa[], intervaloMs = 60_000): () => void {
  let rodando = false
  const ciclo = async () => {
    if (rodando) return
    rodando = true
    try {
      for (const t of tarefasDevidas(db, tarefas)) await executarTarefa(db, t)
    } finally {
      rodando = false
    }
  }
  void ciclo()
  const timer = setInterval(() => void ciclo(), intervaloMs)
  timer.unref()
  return () => clearInterval(timer)
}
