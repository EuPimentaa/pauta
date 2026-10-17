/** Ajuda dos testes do F3 (Início, Agenda, notificações e avisos de prazo) sobre o ambiente() de todos. */
import assert from 'node:assert/strict'
import type {
  AgendaSaida, Demanda, InicioSaida, ListarNotificacoesSaida, Usuario,
} from '../../shared/tipos/index.ts'
import { rodar, todos, tx, type Db } from '../src/db.ts'
import { arquivarDemanda } from '../src/servicos/demandas.ts'
import { mover } from '../src/servicos/mover.ts'
import type { Ambiente } from './ajuda.ts'

/** GET /api/inicio como a pessoa (200 garantido). */
export async function inicioDe(a: Ambiente, p: Usuario): Promise<InicioSaida> {
  const r = await a.como(p).get('/api/inicio')
  assert.equal(r.status, 200, r.texto)
  return r.corpo
}

/** GET /api/agenda como a pessoa, com a consulta já em texto. */
export async function agendaDe(a: Ambiente, p: Usuario, consulta: string): Promise<AgendaSaida> {
  const r = await a.como(p).get(`/api/agenda?${consulta}`)
  assert.equal(r.status, 200, r.texto)
  return r.corpo
}

export async function notificacoesPelaApi(a: Ambiente, p: Usuario, consulta = ''): Promise<ListarNotificacoesSaida> {
  const r = await a.como(p).get(`/api/notificacoes${consulta ? `?${consulta}` : ''}`)
  assert.equal(r.status, 200, r.texto)
  return r.corpo
}

/** Os números das demandas, na ordem dos ids. */
export function numeros(lista: readonly string[], demandas: readonly Demanda[]): number[] {
  return lista.map((id) => demandas.find((d) => d.id === id)?.numero ?? -1)
}

/** Move pela regra do núcleo (como a pessoa). */
export function moverPara(a: Ambiente, d: Demanda, quadro: 'atendimento' | 'criacao' | 'social', coluna: string, quem: Usuario = a.pessoas.am): void {
  tx(a.db, () => mover(a.db, { demandaId: d.id, ator: a.ator(quem), colunaId: a.coluna(quadro, coluna).id }))
}

export function arquivar(a: Ambiente, d: Demanda): void {
  tx(a.db, () => arquivarDemanda(a.db, d.id, a.ator(a.pessoas.am)))
}

/** Arquiva um quadro direto no banco (as demandas dele saem do Início e da Agenda). */
export function arquivarQuadro(db: Db, quadroId: string): void {
  rodar(db, 'UPDATE quadro SET arquivado_em = ? WHERE id = ?', '2026-10-14T12:00:00.000Z', quadroId)
}

/** Concluída há N dias (por SQL; numa coluna normal, sem repetição). */
export function concluidaHa(db: Db, demandaId: string, instante: string): void {
  rodar(db, 'UPDATE demanda SET concluida_em = ?, concluida_por = criado_por WHERE id = ?', instante, demandaId)
}

/** Notificações da pessoa por tipo, mais novas por último. */
export function tiposDe(db: Db, usuarioId: string): string[] {
  return todos<{ tipo: string }>(db, 'SELECT tipo FROM notificacao WHERE usuario_id = ? ORDER BY id', usuarioId).map((l) => l.tipo)
}
