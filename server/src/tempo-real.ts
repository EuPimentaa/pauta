/**
 * Tempo real (API.md §3): barramento em memória (um por banco) alimentado depois do commit, filtro de público e as
 * conexões SSE abertas (para fechar as de uma pessoa desativada e revalidar a sessão no ping).
 * A fonte da verdade é a tabela `evento`: reconexão relê `seq > Last-Event-ID` dela.
 */
import type {
  Entidade, EventoResync, EventoTempoReal, Papel, PublicoEvento,
} from '../../shared/tipos/index.ts'
import { agora, um, todos, type Db } from './db.ts'

export interface EventoPublicado {
  evento: EventoTempoReal
  publico: PublicoEvento
  usuarioId: string | null
}

type Ouvinte = (e: EventoPublicado) => void

class Barramento {
  private ouvintes = new Set<Ouvinte>()

  publicar(e: EventoPublicado): void {
    for (const o of this.ouvintes) {
      try {
        o(e)
      } catch (erro) {
        console.error('ouvinte do barramento falhou:', erro)
      }
    }
  }

  inscrever(o: Ouvinte): () => void {
    this.ouvintes.add(o)
    return () => this.ouvintes.delete(o)
  }

  get tamanho(): number {
    return this.ouvintes.size
  }
}

const barramentos = new WeakMap<Db, Barramento>()

export function barramento(db: Db): Barramento {
  let b = barramentos.get(db)
  if (!b) {
    b = new Barramento()
    barramentos.set(db, b)
  }
  return b
}

/**
 * interno → todos; gestao → atendimento e admin; usuario → só o dono; usuario_admin → o dono e admins;
 * admin → admins. Igual em /api/eventos, /api/sync e /api/bootstrap.
 */
export function visivelPara(publico: PublicoEvento, usuarioId: string | null, eu: { id: string; papel: Papel }): boolean {
  switch (publico) {
    case 'interno': return true
    case 'gestao': return eu.papel === 'admin' || eu.papel === 'atendimento'
    case 'usuario': return usuarioId === eu.id
    case 'usuario_admin': return usuarioId === eu.id || eu.papel === 'admin'
    case 'admin': return eu.papel === 'admin'
  }
}

export interface LinhaEvento {
  seq: number
  entidade: string
  entidade_id: string
  demanda_id: string | null
  op: 'upsert' | 'delete'
  patch: string | null
  campos: string | null
  publico: PublicoEvento
  usuario_id: string | null
  trace_id: string | null
  ator_id: string | null
}

export function linhaParaEvento(l: LinhaEvento): EventoPublicado {
  const base = { s: Number(l.seq), e: l.entidade as Entidade, id: l.entidade_id, d: l.demanda_id, t: l.trace_id, a: l.ator_id }
  const evento = (l.op === 'delete'
    ? { ...base, op: 'delete', p: null, c: null }
    : { ...base, op: 'upsert', p: JSON.parse(l.patch ?? '{}'), c: l.campos === null ? null : JSON.parse(l.campos) }
  ) as EventoTempoReal
  return { evento, publico: l.publico, usuarioId: l.usuario_id }
}

/** Último seq gravado (sobrevive à poda; 0 em banco novo). */
export function seqAtual(db: Db): number {
  return Number(um<{ seq: number }>(db, "SELECT seq FROM sqlite_sequence WHERE name = 'evento'")?.seq ?? 0)
}

/**
 * Decide a retomada a partir de `desde` (API.md §3): resync `servidor_reiniciado` se desde > atual; resync
 * `historico_podado` se desde < atual e (tabela vazia ou desde < menor − 1); senão null (reenviar seq > desde).
 */
export function motivoResync(db: Db, desde: number): EventoResync['motivo'] | null {
  const atual = seqAtual(db)
  if (desde > atual) return 'servidor_reiniciado'
  if (desde < atual) {
    const menor = um<{ menor: number | null }>(db, 'SELECT min(seq) AS menor FROM evento')?.menor ?? null
    if (menor === null || desde < Number(menor) - 1) return 'historico_podado'
  }
  return null
}

/** Eventos `seq > desde` (até `limite`), na ordem. */
export function eventosDesde(db: Db, desde: number, limite: number): LinhaEvento[] {
  return todos<LinhaEvento>(db, 'SELECT * FROM evento WHERE seq > ? ORDER BY seq LIMIT ?', desde, limite)
}

// ─────────────────────────────── conexões SSE ───────────────────────────────

let intervaloPing = 25_000

/** Intervalo do ping (25 s; os testes encurtam). */
export function intervaloPingMs(): number {
  return intervaloPing
}

export function definirIntervaloPing(ms: number): void {
  intervaloPing = ms
}

export interface ConexaoSse {
  usuarioId: string
  papel: Papel
  sessaoId: string
  /** Escreve um bloco do protocolo SSE (já formatado). */
  escrever(texto: string): void
  fechar(): void
}

const conexoes = new WeakMap<Db, Set<ConexaoSse>>()

export function registrarConexao(db: Db, c: ConexaoSse): () => void {
  let lista = conexoes.get(db)
  if (!lista) {
    lista = new Set()
    conexoes.set(db, lista)
  }
  lista.add(c)
  return () => lista.delete(c)
}

export function conexoesAbertas(db: Db): ConexaoSse[] {
  return [...(conexoes.get(db) ?? [])]
}

export function blocoSse(evento: string, dados: unknown, id?: number): string {
  return `${id !== undefined ? `id: ${id}\n` : ''}event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`
}

/** Papel mudou ou pessoa desativada: manda `resync` (papel_alterado) e fecha os SSE dela (chamar depois do commit). */
export function fecharConexoesDe(db: Db, usuarioId: string): void {
  for (const c of conexoesAbertas(db)) {
    if (c.usuarioId !== usuarioId) continue
    c.escrever(blocoSse('resync', { motivo: 'papel_alterado' } satisfies EventoResync))
    c.fechar()
  }
}

/**
 * Revalida a sessão de uma conexão (no ping): revogada, vencida ou pessoa inativa → 'fechar'; papel mudou →
 * 'resync' (e a conexão passa a filtrar pelo papel novo); senão 'ok'.
 */
export function revalidar(db: Db, c: ConexaoSse): 'ok' | 'fechar' | 'resync' {
  const l = um<{ papel: Papel }>(db, `
    SELECT u.papel FROM sessao s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.id = ? AND s.revogada_em IS NULL AND s.expira_em > ? AND u.ativo = 1`, c.sessaoId, agora())
  if (!l) return 'fechar'
  if (l.papel !== c.papel) {
    c.papel = l.papel
    return 'resync'
  }
  return 'ok'
}
