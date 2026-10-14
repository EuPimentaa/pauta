/**
 * Banco: abrir, migrar, transações (BEGIN IMMEDIATE, reentrantes com SAVEPOINT), consultas e o relógio do app.
 * Um só processo escreve: toda mutação roda inteira dentro de `tx()` (síncrona), então nada se intercala.
 * O que precisa acontecer só depois do commit (entregar eventos ao SSE, fechar conexões) entra por `depoisDoCommit()`;
 * o que desfaz um efeito fora do banco se a transação for desfeita (apagar o upload gravado no disco), por `seDesfeita()`.
 */
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Id, Instante } from '../../shared/tipos/index.ts'

export type Db = DatabaseSync

const PASTA_MIGRACOES = join(dirname(fileURLToPath(import.meta.url)), '..', 'migracoes')

/** WAL (em arquivo), foreign_keys=ON, busy_timeout=5000. */
export function abrir(caminho: string): Db {
  const db = new DatabaseSync(caminho)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  if (caminho !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
  }
  return db
}

/**
 * Aplica `NNN_nome.sql` em ordem numérica, cada arquivo numa transação, registrando em `_migracoes`
 * (o mesmo runner de scripts/verificar-migracoes.ts). Devolve os nomes aplicados agora.
 */
export function migrar(db: Db, pasta: string = PASTA_MIGRACOES): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS _migracoes (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL) STRICT')
  const feitas = new Set(todos<{ nome: string }>(db, 'SELECT nome FROM _migracoes').map((l) => l.nome))
  const arquivos = readdirSync(pasta).filter((n) => /^\d{3}_[a-z0-9_]+\.sql$/.test(n)).sort()
  const numeros = arquivos.map((n) => n.slice(0, 3))
  if (new Set(numeros).size !== numeros.length) throw new Error(`Números de migração repetidos em ${pasta}`)
  const aplicadas: string[] = []
  for (const nome of arquivos) {
    if (feitas.has(nome)) continue
    const sql = readFileSync(join(pasta, nome), 'utf8')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sql)
      rodar(db, 'INSERT INTO _migracoes (nome, aplicada_em) VALUES (?, ?)', nome, agora())
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw new Error(`Migração ${nome} falhou: ${(e as Error).message}`)
    }
    aplicadas.push(nome)
  }
  return aplicadas
}

// ─────────────────────────────── transações ───────────────────────────────

interface EstadoTx {
  profundidade: number
  depois: (() => void)[]
  desfazer: (() => void)[]
}
const estados = new WeakMap<Db, EstadoTx>()

function estado(db: Db): EstadoTx {
  let e = estados.get(db)
  if (!e) {
    e = { profundidade: 0, depois: [], desfazer: [] }
    estados.set(db, e)
  }
  return e
}

function exigirSincrono(r: unknown): void {
  if (r instanceof Promise) throw new Error('tx() recebeu uma função assíncrona: a transação não pode esperar')
}

/** Roda cada função isolada: uma falha vai ao log e não impede as outras. */
function rodarCada(fns: (() => void)[], rotulo: string): void {
  for (const f of fns) {
    try {
      f()
    } catch (erro) {
      console.error(`${rotulo} falhou:`, erro)
    }
  }
}

/**
 * `BEGIN IMMEDIATE … COMMIT`. Dentro de outra `tx()`, vira SAVEPOINT (erro desfaz só o pedaço de dentro).
 * Depois do COMMIT de fora, roda o que foi registrado com `depoisDoCommit()` (entrega dos eventos); se a transação
 * (ou o SAVEPOINT) for desfeita, roda o que foi registrado com `seDesfeita()` dentro dela, do mais novo ao mais velho.
 */
export function tx<T>(db: Db, fn: () => T): T {
  const e = estado(db)
  if (e.profundidade === 0) {
    db.exec('BEGIN IMMEDIATE')
    e.profundidade = 1
    let r: T
    try {
      r = fn()
      exigirSincrono(r)
      db.exec('COMMIT')
    } catch (erro) {
      e.depois = []
      if (db.isTransaction) db.exec('ROLLBACK')
      const desfazer = e.desfazer.reverse()
      e.desfazer = []
      rodarCada(desfazer, 'seDesfeita')
      throw erro
    } finally {
      e.profundidade = 0
    }
    const depois = e.depois
    e.depois = []
    e.desfazer = []
    rodarCada(depois, 'depoisDoCommit')
    return r
  }
  const nome = `sp${e.profundidade}`
  const marca = e.depois.length
  const marcaDesfazer = e.desfazer.length
  db.exec(`SAVEPOINT ${nome}`)
  e.profundidade++
  try {
    const r = fn()
    exigirSincrono(r)
    db.exec(`RELEASE ${nome}`)
    return r
  } catch (erro) {
    db.exec(`ROLLBACK TO ${nome}`)
    db.exec(`RELEASE ${nome}`)
    e.depois.length = marca
    rodarCada(e.desfazer.splice(marcaDesfazer).reverse(), 'seDesfeita')
    throw erro
  } finally {
    e.profundidade--
  }
}

/** Leitura consistente (BEGIN deferido): o bootstrap lê o seq e as tabelas no mesmo instantâneo. */
export function leitura<T>(db: Db, fn: () => T): T {
  if (estado(db).profundidade > 0 || db.isTransaction) return fn()
  db.exec('BEGIN')
  try {
    const r = fn()
    exigirSincrono(r)
    return r
  } finally {
    db.exec('COMMIT')
  }
}

/** Roda `fn` depois do commit da transação atual (ou já, fora de transação). Desfeita a transação, não roda. */
export function depoisDoCommit(db: Db, fn: () => void): void {
  const e = estado(db)
  if (e.profundidade === 0) fn()
  else e.depois.push(fn)
}

/** Roda `fn` se a transação atual (ou o SAVEPOINT em que está) for desfeita. Fora de transação, não registra. */
export function seDesfeita(db: Db, fn: () => void): void {
  const e = estado(db)
  if (e.profundidade > 0) e.desfazer.push(fn)
}

export function emTransacao(db: Db): boolean {
  return estado(db).profundidade > 0
}

// ─────────────────────────────── consultas ───────────────────────────────

const cache = new WeakMap<Db, Map<string, StatementSync>>()

function preparar(db: Db, sql: string): StatementSync {
  let mapa = cache.get(db)
  if (!mapa) {
    mapa = new Map()
    cache.set(db, mapa)
  }
  let st = mapa.get(sql)
  if (!st) {
    st = db.prepare(sql)
    mapa.set(sql, st)
  }
  return st
}

function valor(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint' || v instanceof Uint8Array) return v
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Parâmetros posicionais, ou um objeto com nomes (`$nome`). Booleanos viram 0/1; objetos, JSON. */
function parametros(p: unknown[]): SQLInputValue[] | [Record<string, SQLInputValue>] {
  if (p.length === 1 && p[0] !== null && typeof p[0] === 'object' && !Array.isArray(p[0]) && !(p[0] instanceof Uint8Array)) {
    const nomeados: Record<string, SQLInputValue> = {}
    for (const [k, v] of Object.entries(p[0] as Record<string, unknown>)) nomeados[k] = valor(v)
    return [nomeados]
  }
  return p.map(valor)
}

export function um<T>(db: Db, sql: string, ...p: unknown[]): T | undefined {
  return preparar(db, sql).get(...(parametros(p) as SQLInputValue[])) as T | undefined
}

export function todos<T>(db: Db, sql: string, ...p: unknown[]): T[] {
  return preparar(db, sql).all(...(parametros(p) as SQLInputValue[])) as T[]
}

export function rodar(db: Db, sql: string, ...p: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
  const r = preparar(db, sql).run(...(parametros(p) as SQLInputValue[]))
  return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid }
}

/** `?, ?, ?` para um IN com n itens. */
export function marcadores(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ')
}

export function novoId(): Id {
  return randomUUID()
}

// ─────────────────────────────── relógio ───────────────────────────────

let relogioFixo: number | null = null

/** Relógio do app. Todo instante gravado vem daqui (os testes fixam com `fixarRelogio`). */
export function agora(): Instante {
  return new Date(relogioFixo ?? Date.now()).toISOString()
}

export function agoraData(): Date {
  return new Date(relogioFixo ?? Date.now())
}

/** max(agora, anterior + 1 ms): `status_desde` ao trocar de coluna (o gatilho exige que cresça). */
export function depoisDe(anterior: Instante): Instante {
  const minimo = new Date(anterior).getTime() + 1
  const atual = relogioFixo ?? Date.now()
  return new Date(Math.max(atual, minimo)).toISOString()
}

/** Fixa o relógio num instante (null volta ao real). Só testes e scripts. */
export function fixarRelogio(instante: Instante | null): void {
  relogioFixo = instante === null ? null : new Date(instante).getTime()
}
