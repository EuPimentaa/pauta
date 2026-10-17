/**
 * Início e Agenda (API.md §4.18, F3): as listas saem de shared/logica/paineis.ts, as mesmas que o front calcula do
 * bootstrap. "Minhas" = sou membro ou o AM; só demandas não arquivadas de quadros ativos.
 */
import type { AgendaConsulta, AgendaSaida, Demanda, Id, InicioSaida, PapelColuna } from '../../../shared/tipos/index.ts'
import {
  AGENDA_MAX_DIAS, comClienteParado, diasNoIntervalo, itensAgenda, minhasPorPrazo, primeirosPassos, resumoInicio,
} from '../../../shared/logica/paineis.ts'
import type { Ator } from '../auth.ts'
import { agoraData, leitura, marcadores, todos, um, type Db } from '../db.ts'
import { validacao } from '../erros.ts'
import { feriados as feriadosDoBanco, lerConfig } from './config-app.ts'
import { carregarDemandas, naBootstrap } from './demandas.ts'
import { mapear } from './mapear.ts'

/** Demandas vivas (não excluídas, não arquivadas) de quadros ativos. */
const ONDE_VIVAS = `d.excluido_em IS NULL AND d.arquivado_em IS NULL
  AND d.quadro_id IN (SELECT id FROM quadro WHERE arquivado_em IS NULL)`

function papeisDasColunas(db: Db, colunaIds: Id[]): (id: Id) => PapelColuna {
  const mapa = new Map<Id, PapelColuna>()
  const unicos = [...new Set(colunaIds)]
  for (let i = 0; i < unicos.length; i += 500) {
    const lote = unicos.slice(i, i + 500)
    for (const l of todos<{ id: string; papel: PapelColuna }>(db, `SELECT id, papel FROM coluna WHERE id IN (${marcadores(lote.length)})`, ...lote)) {
      mapa.set(l.id, l.papel)
    }
  }
  return (id) => mapa.get(id) ?? 'normal'
}

/** As que não estão no bootstrap (concluídas há mais de quadroConcluidasDias), para o front desenhar. */
function foraDoBootstrap(db: Db, demandas: Demanda[]): Demanda[] {
  const dias = lerConfig(db).quadroConcluidasDias
  const agora = agoraData()
  // as candidatas já são de quadros ativos e não arquivadas
  return demandas.filter((d) => !naBootstrap(d, true, agora, dias))
}

/** O ator é atendimento, ou admin (que pode tudo o que o atendimento pode): vê "com o cliente há mais de N". */
function veClienteParado(ator: Ator): boolean {
  return ator.papel === 'atendimento' || ator.papel === 'admin'
}

export function montarInicio(db: Db, ator: Ator): InicioSaida {
  const eu = ator.usuario!.id
  return leitura(db, () => {
    const config = lerConfig(db)
    const agora = agoraData()
    // minhas abertas e as abertas do meu atendimento (as duas listas saem daqui)
    const candidatas = carregarDemandas(db, `${ONDE_VIVAS} AND d.concluida_em IS NULL AND (d.atendimento_id = ?
      OR EXISTS (SELECT 1 FROM demanda_membro m WHERE m.demanda_id = d.id AND m.usuario_id = ?))`, [eu, eu])
    const papelDe = papeisDasColunas(db, candidatas.map((d) => d.colunaId))
    const minhas = minhasPorPrazo(candidatas, papelDe, eu, agora)
    const parado = veClienteParado(ator)
      ? comClienteParado(candidatas, papelDe, eu, agora, feriadosDoBanco(db), config.clienteParadoDiasUteis).map((p) => p.id)
      : []
    const mencoes = todos<Record<string, unknown>>(db, `
      SELECT n.*, d.numero AS demanda_numero FROM notificacao n LEFT JOIN demanda d ON d.id = n.demanda_id
       WHERE n.usuario_id = ? AND n.tipo = 'mencao' ORDER BY n.id DESC LIMIT 10`, eu).map(mapear.notificacao)
    const usadas = new Set([...Object.values(minhas).flat(), ...parado])
    return {
      minhas,
      comClienteParado: parado,
      mencoes,
      resumo: resumoInicio(minhas, candidatas, papelDe, eu),
      primeirosPassos: ator.papel === 'admin' ? passosDoAdmin(db) : null,
      extras: foraDoBootstrap(db, candidatas.filter((d) => usadas.has(d.id))),
    }
  })
}

function passosDoAdmin(db: Db) {
  const conta = (sql: string) => Number(um<{ n: number }>(db, sql)!.n)
  return primeirosPassos({
    usuariosAtivos: conta('SELECT count(*) AS n FROM usuario WHERE ativo = 1'),
    quadrosAtivos: conta('SELECT count(*) AS n FROM quadro WHERE arquivado_em IS NULL'),
    clientesAtivos: conta("SELECT count(*) AS n FROM cliente WHERE status <> 'ex'"),
    clientesSemAm: conta("SELECT count(*) AS n FROM cliente WHERE status <> 'ex' AND atendimento_id IS NULL"),
    modelosRevisadosEm: lerConfig(db).modelosRevisadosEm,
  })
}

const COLUNA_DO_CAMPO = { prazo: 'd.prazo', inicio: 'd.inicio', publicacao: 'd.publicacao_data' } as const

export function montarAgenda(db: Db, c: AgendaConsulta, ator: Ator): AgendaSaida {
  if (c.ate < c.de) throw validacao('O fim vem antes do começo.', { ate: 'antes de "de"' })
  if (diasNoIntervalo(c.de, c.ate) > AGENDA_MAX_DIAS) {
    throw validacao(`Escolha no máximo ${AGENDA_MAX_DIAS} dias.`, { ate: `intervalo maior que ${AGENDA_MAX_DIAS} dias` })
  }
  const eu = ator.usuario!.id
  const campos = c.campos && c.campos.length > 0 ? [...new Set(c.campos)] : ['prazo' as const]
  return leitura(db, () => {
    const onde = [ONDE_VIVAS, `(${campos.map((k) => `${COLUNA_DO_CAMPO[k]} BETWEEN ? AND ?`).join(' OR ')})`]
    const params: unknown[] = campos.flatMap(() => [c.de, c.ate])
    if (c.quadroIds && c.quadroIds.length > 0) {
      onde.push(`d.quadro_id IN (${marcadores(c.quadroIds.length)})`)
      params.push(...c.quadroIds)
    }
    if (c.incluirConcluidas === false) onde.push('d.concluida_em IS NULL')
    if (c.soMinhas) {
      onde.push('(d.atendimento_id = ? OR EXISTS (SELECT 1 FROM demanda_membro m WHERE m.demanda_id = d.id AND m.usuario_id = ?))')
      params.push(eu, eu)
    }
    const demandas = carregarDemandas(db, onde.join(' AND '), params)
    const itens = itensAgenda(demandas, { ...c, campos }, eu)
    const usadas = new Set(itens.map((i) => i.demandaId))
    return {
      de: c.de,
      ate: c.ate,
      itens,
      feriados: todos<Record<string, unknown>>(db, 'SELECT * FROM feriado WHERE data BETWEEN ? AND ? ORDER BY data', c.de, c.ate)
        .map(mapear.feriado),
      extras: foraDoBootstrap(db, demandas.filter((d) => usadas.has(d.id))),
    }
  })
}
