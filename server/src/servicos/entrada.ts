/**
 * Entrada (PLANO §3, F4; API.md §4.13): criação rápida no rodapé da coluna e "Colar do WhatsApp". A análise é a de
 * shared/logica (a mesma da prévia ao vivo do front); a criação passa pelo criarDemanda() do núcleo (atividade, SSE e
 * notificações de POST /api/demandas, com origem 'rapida').
 */
import type {
  AnaliseRapida, AnaliseTexto, AnalisarTextoEntrada, Coluna, CriarRapidaEntrada, CriarRapidaSaida, Id,
} from '../../../shared/tipos/index.ts'
import { analisarConversa, type ClienteAnalise } from '../../../shared/logica/colar-whatsapp.ts'
import { analisarRapida, montarContextoRapida, type ContextoRapida } from '../../../shared/logica/rapida.ts'
import type { Ator } from '../auth.ts'
import { todos, um, type Db } from '../db.ts'
import { estadoInvalido, validacao } from '../erros.ts'
import { hoje } from './config-app.ts'
import { criarDemanda } from './demandas.ts'
import { mapear } from './mapear.ts'

type Linha = Record<string, unknown>

/** Apelidos de todos os clientes e as pessoas (a análise usa só as ativas). */
export function contextoRapida(db: Db): ContextoRapida {
  const apelidos = new Map<Id, string[]>()
  for (const l of todos<{ cliente_id: string; alias_norm: string }>(db, 'SELECT cliente_id, alias_norm FROM cliente_alias')) {
    apelidos.set(l.cliente_id, [...(apelidos.get(l.cliente_id) ?? []), l.alias_norm])
  }
  const clientes = todos<{ id: string; sigla: string }>(db, 'SELECT id, sigla FROM cliente')
    .map((c) => ({ id: c.id, sigla: c.sigla, apelidos: apelidos.get(c.id) ?? [] }))
  const pessoas = todos<{ id: string; nome: string; apelido: string | null; ativo: number }>(db,
    'SELECT id, nome, apelido, ativo FROM usuario').map((p) => ({ ...p, ativo: p.ativo === 1 }))
  return montarContextoRapida(clientes, pessoas)
}

/** A coluna onde a pessoa digitou: 400 se não existe, 422 se arquivada (o quadro arquivado o criarDemanda recusa). */
function colunaDaRapida(db: Db, colunaId: Id): Coluna {
  const l = um<Linha>(db, 'SELECT * FROM coluna WHERE id = ?', colunaId)
  if (!l) throw validacao('Coluna inexistente.', { colunaId: 'coluna inexistente' })
  const coluna = mapear.coluna(l)
  if (coluna.arquivadaEm) throw estadoInvalido('Esta coluna está arquivada.')
  return coluna
}

/** POST /api/demandas/rapida/previa: a análise, sem efeito. */
export function previaRapida(db: Db, e: CriarRapidaEntrada): AnaliseRapida {
  const coluna = colunaDaRapida(db, e.colunaId)
  return analisarRapida(e.texto, contextoRapida(db), { clienteIdContexto: e.clienteId ?? null, coluna })
}

/**
 * POST /api/demandas/rapida: uma linha = uma demanda na coluna. Cliente = marcador ?? o do contexto; membros = os
 * `@` casados (a pessoa da coluna entra também); sem modelo; no fim da coluna (ou na posição pedida).
 */
export function criarRapida(db: Db, e: CriarRapidaEntrada, ator: Ator): CriarRapidaSaida {
  const coluna = colunaDaRapida(db, e.colunaId)
  const analise = analisarRapida(e.texto, contextoRapida(db), { clienteIdContexto: e.clienteId ?? null, coluna })
  if (!analise.titulo) throw validacao('Escreva um título.', { texto: 'sem título' })
  const { demanda, avisos } = criarDemanda(db, {
    quadroId: coluna.quadroId, colunaId: coluna.id, posicao: e.posicao, titulo: analise.titulo, clienteId: analise.clienteId,
    membroIds: analise.membroIds, origem: 'rapida',
  }, ator)
  return { demanda, analise, avisos }
}

/** POST /api/entrada/analisar: clientes (apelidos, nome e contatos), modelos ativos e as pessoas da agência. */
export function analisarTexto(db: Db, e: AnalisarTextoEntrada): AnaliseTexto {
  const apelidos = new Map<Id, string[]>()
  for (const l of todos<{ cliente_id: string; alias_norm: string }>(db, 'SELECT cliente_id, alias_norm FROM cliente_alias')) {
    apelidos.set(l.cliente_id, [...(apelidos.get(l.cliente_id) ?? []), l.alias_norm])
  }
  const contatos = new Map<Id, string[]>()
  for (const l of todos<{ cliente_id: string; nome: string }>(db, 'SELECT cliente_id, nome FROM cliente_contato WHERE ativo = 1')) {
    contatos.set(l.cliente_id, [...(contatos.get(l.cliente_id) ?? []), l.nome])
  }
  const clientes: ClienteAnalise[] = todos<{ id: string; sigla: string; nome: string }>(db,
    "SELECT id, sigla, nome FROM cliente ORDER BY status = 'ex', sigla")
    .map((c) => ({ ...c, apelidos: apelidos.get(c.id) ?? [], contatos: contatos.get(c.id) ?? [] }))
  const modelos = todos<{ id: string; nome: string }>(db, `
    SELECT m.id, m.nome FROM modelo_demanda m LEFT JOIN quadro q ON q.id = m.quadro_id
     WHERE m.ativo = 1 AND (m.quadro_id IS NULL OR q.arquivado_em IS NULL) ORDER BY m.quadro_id IS NOT NULL, m.pos`)
  const internos = todos<{ nome: string; apelido: string | null }>(db, 'SELECT nome, apelido FROM usuario WHERE ativo = 1')
    .flatMap((u) => (u.apelido ? [u.nome, u.apelido] : [u.nome]))
  return analisarConversa(e.texto, { clientes, modelos, internos, hoje: hoje() })
}
