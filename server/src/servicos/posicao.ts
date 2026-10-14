/**
 * Chave de posição no escopo (API.md §5.10): o navegador manda depoisDeId/antesDeId e o servidor calcula a média dos
 * vizinhos; sem posição = fim; `depoisDeId: null` = topo. Folga abaixo de 1e-6: renormaliza o escopo com passo 1024
 * e publica um evento por linha que mudou.
 */
import type { Entidade, PosicaoRelativa } from '../../../shared/tipos/index.ts'
import { entre, PASSO_POSICAO, precisaRenormalizar } from '../../../shared/logica/posicao.ts'
import { atorSistema } from '../auth.ts'
import { rodar, todos, um, type Db } from '../db.ts'
import { validacao } from '../erros.ts'
import { emitir } from './eventos.ts'

export interface AlvoPosicao {
  tabela: string
  coluna: 'posicao' | 'pos'
  escopo?: { coluna: string; valor: unknown }
}

/** Tabela → entidade do evento publicado na renormalização (e se a linha tem demanda_id). */
const ENTIDADES: Record<string, { entidade: Entidade; temDemanda: boolean }> = {
  demanda: { entidade: 'demanda', temDemanda: false },
  coluna: { entidade: 'coluna', temDemanda: false },
  quadro: { entidade: 'quadro', temDemanda: false },
  etiqueta: { entidade: 'etiqueta', temDemanda: false },
  equipe: { entidade: 'equipe', temDemanda: false },
  checklist: { entidade: 'checklist', temDemanda: true },
  checklist_item: { entidade: 'checklist_item', temDemanda: true },
  anexo: { entidade: 'anexo', temDemanda: true },
  cliente_link: { entidade: 'cliente_link', temDemanda: false },
  modelo_demanda: { entidade: 'modelo_demanda', temDemanda: false },
}

const IDENT = /^[a-z_]+$/

function partes(alvo: AlvoPosicao): { onde: string; params: unknown[] } {
  if (!IDENT.test(alvo.tabela) || !IDENT.test(alvo.coluna) || (alvo.escopo && !IDENT.test(alvo.escopo.coluna))) {
    throw new Error(`posicaoEntre: identificador inválido em ${JSON.stringify(alvo)}`)
  }
  return alvo.escopo ? { onde: `${alvo.escopo.coluna} IS ?`, params: [alvo.escopo.valor] } : { onde: '1 = 1', params: [] }
}

/** Reescreve as posições do escopo com passo 1024 (ordem atual) e publica os eventos. */
export function renormalizar(db: Db, alvo: AlvoPosicao): void {
  const { onde, params } = partes(alvo)
  const linhas = todos<{ id: string; pos: number; demanda_id?: string }>(db,
    `SELECT id, ${alvo.coluna} AS pos${ENTIDADES[alvo.tabela]?.temDemanda ? ', demanda_id' : ''}
       FROM ${alvo.tabela} WHERE ${onde} ORDER BY ${alvo.coluna}, id`, ...params)
  const ator = atorSistema()
  linhas.forEach((l, i) => {
    const nova = (i + 1) * PASSO_POSICAO
    if (nova === l.pos) return
    rodar(db, `UPDATE ${alvo.tabela} SET ${alvo.coluna} = ? WHERE id = ?`, nova, l.id)
    const info = ENTIDADES[alvo.tabela]
    if (info) {
      const demandaId = alvo.tabela === 'demanda' ? l.id : (l.demanda_id ?? null)
      emitir(db, { entidade: info.entidade, id: l.id, demandaId, op: 'upsert', patch: { [alvo.coluna]: nova }, campos: [alvo.coluna], ator })
    }
  })
}

/**
 * Chave para pôr um item na posição pedida dentro do escopo. `excluirId` = o próprio item que está sendo movido
 * (não conta como vizinho). Id de referência fora do escopo → 400 validacao.
 */
export function posicaoEntre(db: Db, alvo: AlvoPosicao, rel: PosicaoRelativa | undefined, excluirId?: string): number {
  const { onde, params } = partes(alvo)
  const c = alvo.coluna
  const base = `FROM ${alvo.tabela} WHERE ${onde} AND id IS NOT ?`
  const p = [...params, excluirId ?? null]
  const posDe = (id: string): number => {
    const l = um<{ pos: number }>(db, `SELECT ${c} AS pos ${base} AND id = ?`, ...p, id)
    if (!l) throw validacao('A posição pedida aponta para um item que não está aqui.', { posicao: 'item de referência fora da lista' })
    return l.pos
  }
  let antes: number | null
  let depois: number | null
  if (rel?.depoisDeId === null) {
    antes = null
    depois = um<{ v: number | null }>(db, `SELECT min(${c}) AS v ${base}`, ...p)!.v
  } else if (typeof rel?.depoisDeId === 'string') {
    antes = posDe(rel.depoisDeId)
    depois = um<{ v: number | null }>(db, `SELECT min(${c}) AS v ${base} AND ${c} > ?`, ...p, antes)!.v
  } else if (typeof rel?.antesDeId === 'string') {
    depois = posDe(rel.antesDeId)
    antes = um<{ v: number | null }>(db, `SELECT max(${c}) AS v ${base} AND ${c} < ?`, ...p, depois)!.v
  } else {
    antes = um<{ v: number | null }>(db, `SELECT max(${c}) AS v ${base}`, ...p)!.v
    depois = null
  }
  if (antes !== null && depois !== null && precisaRenormalizar(antes, depois)) {
    renormalizar(db, alvo)
    return posicaoEntre(db, alvo, rel, excluirId)
  }
  return entre(antes, depois)
}
