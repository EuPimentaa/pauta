/**
 * Eventos de tempo real: gravados na tabela `evento` NA MESMA transação da mutação e entregues ao barramento depois
 * do commit (API.md §3). Públicos: 'gestao' para link_publico, 'usuario' para notificacao e quadro_usuario,
 * 'usuario_admin' para apontamento; o resto 'interno'. `anonimo: true` grava ator e trace nulos.
 */
import type { Demanda, Entidade, Id, PublicoEvento } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, depoisDoCommit, rodar, type Db } from '../db.ts'
import { barramento, linhaParaEvento, type LinhaEvento } from '../tempo-real.ts'
import { carregarDemanda } from './demandas.ts'

export interface NovoEvento {
  entidade: Entidade
  id: string
  demandaId?: Id | null
  op: 'upsert' | 'delete'
  /** Objeto inteiro (campos nulo) ou só os campos de `campos`. Ignorado em delete. */
  patch?: object
  campos?: string[] | null
  publico?: PublicoEvento
  usuarioId?: Id
  ator: Ator
  anonimo?: boolean
}

/** Grava o evento e agenda a entrega para depois do commit. Devolve o seq. */
export function emitir(db: Db, ev: NovoEvento): number {
  const publico = ev.publico ?? 'interno'
  const patch = ev.op === 'delete' ? null : JSON.stringify(ev.patch ?? {})
  const campos = ev.op === 'delete' || ev.campos === undefined || ev.campos === null ? null : JSON.stringify(ev.campos)
  const traceId = ev.anonimo ? null : ev.ator.traceId
  const atorId = ev.anonimo ? null : (ev.ator.usuario?.id ?? null)
  const r = rodar(db, `
    INSERT INTO evento (entidade, entidade_id, demanda_id, op, patch, campos, publico, usuario_id, trace_id, ator_id, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ev.entidade, ev.id, ev.demandaId ?? null, ev.op, patch, campos, publico, ev.usuarioId ?? null, traceId, atorId, agora())
  const seq = Number(r.lastInsertRowid)
  const linha: LinhaEvento = {
    seq, entidade: ev.entidade, entidade_id: ev.id, demanda_id: ev.demandaId ?? null, op: ev.op, patch, campos,
    publico, usuario_id: ev.usuarioId ?? null, trace_id: traceId, ator_id: atorId,
  }
  depoisDoCommit(db, () => barramento(db).publicar(linhaParaEvento(linha)))
  return seq
}

/** Atalho: upsert do objeto inteiro (c = null). */
export function emitirObjeto(db: Db, entidade: Entidade, id: string, objeto: object, ator: Ator,
  extra: Partial<Pick<NovoEvento, 'demandaId' | 'publico' | 'usuarioId' | 'anonimo'>> = {}): number {
  return emitir(db, { entidade, id, op: 'upsert', patch: objeto, campos: null, ator, ...extra })
}

/** Atalho: delete. */
export function emitirDelete(db: Db, entidade: Entidade, id: string, ator: Ator,
  extra: Partial<Pick<NovoEvento, 'demandaId' | 'publico' | 'usuarioId'>> = {}): number {
  return emitir(db, { entidade, id, op: 'delete', ator, ...extra })
}

/** A demanda inteira (c = null): criar, restaurar, voltar ao conjunto do bootstrap (API.md §3). */
export function emitirDemandaInteira(db: Db, demandaId: Id, ator: Ator): number {
  const d = carregarDemanda(db, demandaId)
  return emitirObjeto(db, 'demanda', d.id, d, ator, { demandaId: d.id })
}

/**
 * Patch da demanda com os campos que mudaram entre `antes` e o estado atual. Sem mudança, não emite (devolve 0).
 * `inteira: true` emite o objeto todo (a demanda entrou no conjunto do bootstrap).
 */
export function emitirMudancasDemanda(db: Db, antes: Demanda, ator: Ator,
  opcoes: { inteira?: boolean; anonimo?: boolean; sempre?: (keyof Demanda)[] } = {}): number {
  const depois = carregarDemanda(db, antes.id)
  if (opcoes.inteira) return emitirObjeto(db, 'demanda', depois.id, depois, ator, { demandaId: depois.id, anonimo: opcoes.anonimo })
  const campos = (Object.keys(depois) as (keyof Demanda)[]).filter((k) =>
    opcoes.sempre?.includes(k) || JSON.stringify(depois[k]) !== JSON.stringify(antes[k]))
  if (campos.length === 0) return 0
  const patch: Partial<Demanda> = {}
  for (const k of campos) (patch as Record<string, unknown>)[k] = depois[k]
  return emitir(db, { entidade: 'demanda', id: depois.id, demandaId: depois.id, op: 'upsert', patch, campos, ator, anonimo: opcoes.anonimo })
}
