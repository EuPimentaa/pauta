/**
 * O que os serviços do modal (F1) dividem: a demanda que ainda aceita edição (não arquivada, de quadro ativo) e o
 * mapeador de `atividade` para o histórico.
 */
import type { Atividade, Demanda, Id, TipoAtividade } from '../../../shared/tipos/index.ts'
import { um, type Db } from '../db.ts'
import { estadoInvalido } from '../erros.ts'
import { demandaViva } from './demandas.ts'

/**
 * Demanda viva (404 se não existe ou foi excluída) que ainda aceita mudanças do modal: arquivada ou de quadro
 * arquivado → 422 (o modal abre só para leitura, PLANO §4.1).
 */
export function demandaEditavel(db: Db, id: Id): Demanda {
  const d = demandaViva(db, id)
  if (d.arquivadoEm) throw estadoInvalido('Demanda arquivada. Restaure para editar.')
  if (um(db, 'SELECT 1 FROM quadro WHERE id = ? AND arquivado_em IS NOT NULL', d.quadroId)) {
    throw estadoInvalido('O quadro desta demanda está arquivado. Restaure o quadro para editar.')
  }
  return d
}

type Linha = Record<string, unknown>

/**
 * "Via Claude" (API.md §F.6): a atividade tem um `mcp_traco` com o mesmo trace e o mesmo usuário. Coluna para o SELECT
 * sobre `atividade a`: `via` = 'claude' ou NULL.
 */
export const SQL_VIA_ATIVIDADE = `(SELECT 'claude' FROM mcp_traco m WHERE m.trace_id = a.trace_id AND m.usuario_id = a.ator_id) AS via`

/** Linha de `atividade` → Atividade (dados e antes em objeto; `via` só quando veio pelo Claude). */
export function mapearAtividade(l: Linha): Atividade {
  return {
    id: Number(l.id),
    demandaId: l.demanda_id === null ? null : String(l.demanda_id),
    clienteId: l.cliente_id === null ? null : String(l.cliente_id),
    atorId: l.ator_id === null ? null : String(l.ator_id),
    atorTipo: l.ator_tipo as Atividade['atorTipo'],
    tipo: l.tipo as TipoAtividade,
    dados: JSON.parse(String(l.dados ?? '{}')),
    antes: l.antes === null || l.antes === undefined ? null : JSON.parse(String(l.antes)),
    criadoEm: String(l.criado_em),
    ...(l.via === 'claude' ? { via: 'claude' } : {}),
  } as Atividade
}
