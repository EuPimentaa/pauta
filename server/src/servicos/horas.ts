/**
 * Horas (API.md §4.15 e §4.20): cronômetro (no máximo um ligado por pessoa) e lançamentos, sempre numa demanda.
 * Eventos: `apontamento` só ao dono e aos admins; `demanda.minutosRegistrados` a todos, com ator e trace nulos.
 */
import type {
  Apontamento, CriarApontamentoEntrada, Demanda, EditarApontamentoEntrada, Id, ListarApontamentosConsulta,
  ListarApontamentosSaida,
} from '../../../shared/tipos/index.ts'
import { diasEntre, segundaDaSemana, somarDias } from '../../../shared/logica/datas.ts'
import type { Ator } from '../auth.ts'
import { agora, agoraData, marcadores, novoId, rodar, todos, um, type Db } from '../db.ts'
import { conflito, naoEncontrado, validacao } from '../erros.ts'
import { hoje, lerConfig } from './config-app.ts'
import { registrarAtividade } from './atividade.ts'
import { carregarDemanda, carregarDemandas, emitirContadores, naBootstrap } from './demandas.ts'
import { emitirDelete, emitirObjeto } from './eventos.ts'
import { mapear } from './mapear.ts'
import { exigir } from './permissoes.ts'

type Linha = Record<string, unknown>

export function carregarApontamento(db: Db, id: Id): Apontamento {
  const l = um<Linha>(db, 'SELECT * FROM apontamento WHERE id = ? AND excluido_em IS NULL', id)
  if (!l) throw naoEncontrado('Lançamento não encontrado.')
  return mapear.apontamento(l)
}

function emitirApontamento(db: Db, a: Apontamento, ator: Ator): void {
  emitirObjeto(db, 'apontamento', a.id, a, ator, { publico: 'usuario_admin', usuarioId: a.usuarioId, demandaId: a.demandaId })
}

/** Minutos de um cronômetro: max(1, arredondado), limitado a `limiteHoras` (longo = passou do limite). */
export function minutosDoCronometro(iniciadoEm: string, paradoEm: string, limiteHoras: number): { minutos: number; longo: boolean } {
  const brutos = Math.max(1, Math.round((Date.parse(paradoEm) - Date.parse(iniciadoEm)) / 60_000))
  const limite = Math.min(limiteHoras * 60, 1440)
  return brutos > limite ? { minutos: limite, longo: true } : { minutos: brutos, longo: false }
}

/**
 * Para os cronômetros ligados que casam com o filtro (da pessoa, da demanda ou das demandas do quadro), gravando
 * `paradoEm` e os minutos. Arquivar demanda ou quadro e desativar pessoa chamam aqui; o F1 também (iniciar outro,
 * parar). Devolve os parados, já com minutos.
 */
export function pararCronometros(db: Db, filtro: { usuarioId?: Id; demandaId?: Id; quadroId?: Id }, ator: Ator): Apontamento[] {
  const condicoes = ["a.origem = 'cronometro'", 'a.parado_em IS NULL', 'a.excluido_em IS NULL']
  const params: unknown[] = []
  if (filtro.usuarioId) { condicoes.push('a.usuario_id = ?'); params.push(filtro.usuarioId) }
  if (filtro.demandaId) { condicoes.push('a.demanda_id = ?'); params.push(filtro.demandaId) }
  if (filtro.quadroId) { condicoes.push('d.quadro_id = ?'); params.push(filtro.quadroId) }
  if (params.length === 0) throw new Error('pararCronometros sem filtro')
  const ligados = todos<Linha>(db, `SELECT a.* FROM apontamento a JOIN demanda d ON d.id = a.demanda_id WHERE ${condicoes.join(' AND ')}`, ...params)
  const limiteHoras = lerConfig(db).cronometroLimiteHoras
  const parados: Apontamento[] = []
  for (const l of ligados) {
    const paradoEm = agora()
    const { minutos } = minutosDoCronometro(String(l.iniciado_em), paradoEm, limiteHoras)
    const antes = carregarDemanda(db, String(l.demanda_id))
    rodar(db, 'UPDATE apontamento SET parado_em = ?, minutos = ?, atualizado_em = ? WHERE id = ?', paradoEm, minutos, paradoEm, l.id)
    const a = carregarApontamento(db, String(l.id))
    registrarAtividade(db, { tipo: 'tempo.lancado', ator, demandaId: a.demandaId,
      dados: { apontamentoId: a.id, minutos, origem: 'cronometro' } })
    emitirApontamento(db, a, ator)
    emitirContadores(db, antes.id, ator, antes)
    parados.push(a)
  }
  return parados
}

/** Lança tempo para o ator numa demanda (origem manual; cliente copiado da demanda; data padrão: hoje). */
export function lancarApontamento(db: Db, p: { demandaId: Id; ator: Ator; entrada: CriarApontamentoEntrada }): Apontamento {
  const antes = carregarDemanda(db, p.demandaId)
  const eu = p.ator.usuario
  if (!eu) throw new Error('lancarApontamento precisa de um usuário')
  if (!Number.isInteger(p.entrada.minutos) || p.entrada.minutos < 1 || p.entrada.minutos > 1440) {
    throw validacao('Lance de 1 minuto a 24 horas.', { minutos: 'fora da faixa' })
  }
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, minutos, origem, nota, criado_em, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)`,
    id, eu.id, antes.id, antes.clienteId, p.entrada.data ?? hoje(), p.entrada.minutos, p.entrada.nota?.trim() || null, instante, instante)
  const a = carregarApontamento(db, id)
  registrarAtividade(db, { tipo: 'tempo.lancado', ator: p.ator, demandaId: antes.id,
    dados: { apontamentoId: id, minutos: p.entrada.minutos, origem: 'manual' } })
  emitirApontamento(db, a, p.ator)
  emitirContadores(db, antes.id, p.ator, antes)
  return a
}

export function editarApontamento(db: Db, id: Id, e: EditarApontamentoEntrada, ator: Ator): Apontamento {
  const atual = carregarApontamento(db, id)
  exigir(ator, 'apontamento.editar', { apontamento: atual })
  if (atual.minutos === null) throw conflito('Pare o cronômetro antes de editar.')
  const antes = carregarDemanda(db, atual.demandaId)
  rodar(db, 'UPDATE apontamento SET data = ?, minutos = ?, nota = ?, atualizado_em = ? WHERE id = ?',
    e.data ?? atual.data, e.minutos ?? atual.minutos, e.nota === undefined ? atual.nota : (e.nota?.trim() || null), agora(), id)
  const a = carregarApontamento(db, id)
  emitirApontamento(db, a, ator)
  emitirContadores(db, antes.id, ator, antes)
  return a
}

export function excluirApontamento(db: Db, id: Id, ator: Ator): void {
  const atual = carregarApontamento(db, id)
  exigir(ator, 'apontamento.editar', { apontamento: atual })
  if (atual.minutos === null) throw conflito('Pare o cronômetro antes de excluir.')
  const antes = carregarDemanda(db, atual.demandaId)
  rodar(db, 'UPDATE apontamento SET excluido_em = ?, atualizado_em = ? WHERE id = ?', agora(), agora(), id)
  emitirDelete(db, 'apontamento', id, ator, { publico: 'usuario_admin', usuarioId: atual.usuarioId, demandaId: atual.demandaId })
  emitirContadores(db, antes.id, ator, antes)
}

/**
 * GET /api/apontamentos (API.md §4.20). Equipe: só os próprios; atendimento: os próprios + `porCliente` (de todas
 * as pessoas, só o total); admin: os do filtro (todos sem usuarioId) + porCliente + porPessoa. Excluídos não entram;
 * cronômetro ligado entra sem minutos (não soma).
 */
export function listarApontamentos(db: Db, c: ListarApontamentosConsulta, ator: Ator): ListarApontamentosSaida {
  const eu = ator.usuario!
  const admin = ator.papel === 'admin'
  if (c.usuarioId && c.usuarioId !== eu.id) exigir(ator, 'horas.outros')
  const de = c.de ?? segundaDaSemana(hoje())
  const ate = c.ate ?? somarDias(segundaDaSemana(hoje()), 6)
  if (ate < de) throw validacao('O fim vem antes do começo.', { ate: 'antes de "de"' })
  if (diasEntre(de, ate) + 1 > 92) throw validacao('Escolha no máximo 92 dias.', { ate: 'intervalo maior que 92 dias' })

  const base = ['a.excluido_em IS NULL', 'a.data >= ?', 'a.data <= ?']
  const params: unknown[] = [de, ate]
  if (c.demandaId) { base.push('a.demanda_id = ?'); params.push(c.demandaId) }
  if (c.clienteId) { base.push('a.cliente_id IS ?'); params.push(c.clienteId) }
  const usuarioFiltro = admin ? (c.usuarioId ?? null) : eu.id
  const condItens = usuarioFiltro ? [...base, 'a.usuario_id = ?'] : base
  const paramsItens = usuarioFiltro ? [...params, usuarioFiltro] : params
  const itens = todos<Linha>(db, `SELECT a.* FROM apontamento a WHERE ${condItens.join(' AND ')} ORDER BY a.data, a.criado_em`,
    ...paramsItens).map(mapear.apontamento)
  const saida: ListarApontamentosSaida = {
    itens,
    totalMin: itens.reduce((s, a) => s + (a.minutos ?? 0), 0),
    extras: [],
  }
  if (admin || ator.papel === 'atendimento') {
    saida.porCliente = todos<{ cliente_id: string | null; minutos: number }>(db, `
      SELECT a.cliente_id, sum(a.minutos) AS minutos FROM apontamento a
       WHERE ${base.join(' AND ')} AND a.minutos IS NOT NULL GROUP BY a.cliente_id ORDER BY minutos DESC`, ...params)
      .map((l) => ({ clienteId: l.cliente_id, minutos: Number(l.minutos) }))
  }
  if (admin) {
    saida.porPessoa = todos<{ usuario_id: string; minutos: number }>(db, `
      SELECT a.usuario_id, sum(a.minutos) AS minutos FROM apontamento a
       WHERE ${base.join(' AND ')} AND a.minutos IS NOT NULL GROUP BY a.usuario_id ORDER BY minutos DESC`, ...params)
      .map((l) => ({ usuarioId: l.usuario_id, minutos: Number(l.minutos) }))
  }
  const ids = [...new Set(itens.map((a) => a.demandaId))]
  if (ids.length > 0) {
    const cfg = lerConfig(db)
    const quadrosAtivos = new Set(todos<{ id: string }>(db, 'SELECT id FROM quadro WHERE arquivado_em IS NULL').map((l) => l.id))
    saida.extras = carregarDemandas(db, `d.id IN (${marcadores(ids.length)})`, ids)
      .filter((d: Demanda) => !naBootstrap(d, quadrosAtivos.has(d.quadroId), agoraData(), cfg.quadroConcluidasDias))
  }
  return saida
}
