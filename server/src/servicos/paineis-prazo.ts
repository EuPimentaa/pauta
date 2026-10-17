/**
 * Avisos de prazo das 8h (API.md §5.9, F3; tarefa src/tarefas/paineis-prazo.ts). Só em dia útil (feriado conta),
 * sobre demandas abertas, não arquivadas, de quadros ativos, para os membros ativos (ou o AM, sem membros ativos),
 * ignorando as com o cliente (estado `pausado`):
 *   - `prazo`: vencem hoje (estado `hoje`); no máximo uma por pessoa, demanda e dia;
 *   - `atrasada`: estado `atrasada` e a pessoa ainda não recebeu `atrasada` desta demanda depois do prazo atual (uma
 *     vez por pessoa, demanda e prazo; um prazo novo, de rodada ou renegociado, pode avisar de novo).
 */
import type { Demanda, Id, PapelColuna } from '../../../shared/tipos/index.ts'
import { HORA_PADRAO_PRAZO } from '../../../shared/tipos/index.ts'
import { ehDiaUtil, formatarPrazo, hojeSP, instanteSP } from '../../../shared/logica/datas.ts'
import { estadoPrazo } from '../../../shared/logica/prazo.ts'
import { atorSistema } from '../auth.ts'
import { agoraData, marcadores, todos, tx, um, type Db } from '../db.ts'
import { feriados } from './config-app.ts'
import { carregarDemandas } from './demandas.ts'
import { notificar } from './notificacoes.ts'

export interface ResultadoPrazos {
  /** false = não é dia útil (nada sai). */
  diaUtil: boolean
  prazo: number
  atrasada: number
}

/** "18h" ou "18h30". */
function hora(h: string): string {
  const [hh, mm] = h.split(':') as [string, string]
  return `${Number(hh)}h${mm === '00' ? '' : mm}`
}

/** "#123 Carrossel HE" (com a sigla do cliente, se houver). */
function rotulo(d: Demanda, siglas: Map<Id, string>): string {
  const sigla = d.clienteId ? siglas.get(d.clienteId) : undefined
  return `#${d.numero} ${d.titulo}${sigla ? ` ${sigla}` : ''}`
}

/** Membros ativos; sem nenhum, o AM (se ativo). */
function destinatarios(d: Demanda, ativos: ReadonlySet<Id>): Id[] {
  const membros = d.membroIds.filter((id) => ativos.has(id))
  if (membros.length > 0) return membros
  return d.atendimentoId && ativos.has(d.atendimentoId) ? [d.atendimentoId] : []
}

export function avisarPrazos(db: Db): ResultadoPrazos {
  const agora = agoraData()
  const hoje = hojeSP(agora)
  if (!ehDiaUtil(hoje, feriados(db))) return { diaUtil: false, prazo: 0, atrasada: 0 }
  // começo do dia de hoje em São Paulo: 'prazo' não se repete no mesmo dia
  const inicioDoDia = instanteSP(hoje, '00:00').toISOString()
  const ator = atorSistema()
  return tx(db, () => {
    const demandas = carregarDemandas(db, `d.excluido_em IS NULL AND d.arquivado_em IS NULL AND d.concluida_em IS NULL
      AND d.prazo IS NOT NULL AND d.prazo <= ? AND d.quadro_id IN (SELECT id FROM quadro WHERE arquivado_em IS NULL)`, [hoje])
    if (demandas.length === 0) return { diaUtil: true, prazo: 0, atrasada: 0 }
    const colunas = [...new Set(demandas.map((d) => d.colunaId))]
    const papel = new Map(todos<{ id: string; papel: PapelColuna }>(db,
      `SELECT id, papel FROM coluna WHERE id IN (${marcadores(colunas.length)})`, ...colunas).map((l) => [l.id, l.papel]))
    const ativos = new Set(todos<{ id: string }>(db, 'SELECT id FROM usuario WHERE ativo = 1').map((l) => l.id))
    const siglas = new Map(todos<{ id: string; sigla: string }>(db, 'SELECT id, sigla FROM cliente').map((l) => [l.id, l.sigla]))
    let nPrazo = 0
    let nAtrasada = 0
    for (const d of demandas) {
      const estado = estadoPrazo(d, { papel: papel.get(d.colunaId) ?? 'normal' }, agora)
      if (estado !== 'hoje' && estado !== 'atrasada') continue
      const para = destinatarios(d, ativos)
      if (para.length === 0) continue
      if (estado === 'hoje') {
        const faltam = para.filter((u) => !um(db, `SELECT 1 FROM notificacao
          WHERE tipo = 'prazo' AND usuario_id = ? AND demanda_id = ? AND criado_em >= ?`, u, d.id, inicioDoDia))
        nPrazo += notificar(db, { para: faltam, tipo: 'prazo', demandaId: d.id, ator,
          resumo: `${rotulo(d, siglas)} vence hoje, ${hora(d.prazoHora ?? HORA_PADRAO_PRAZO)}` }).length
      } else {
        const limite = instanteSP(d.prazo!, d.prazoHora ?? HORA_PADRAO_PRAZO).toISOString()
        const faltam = para.filter((u) => !um(db, `SELECT 1 FROM notificacao
          WHERE tipo = 'atrasada' AND usuario_id = ? AND demanda_id = ? AND criado_em > ?`, u, d.id, limite))
        nAtrasada += notificar(db, { para: faltam, tipo: 'atrasada', demandaId: d.id, ator,
          resumo: `${rotulo(d, siglas)} está atrasada desde ${formatarPrazo(d.prazo!, null)}` }).length
      }
    }
    return { diaUtil: true, prazo: nPrazo, atrasada: nAtrasada }
  })
}
