/**
 * Cronômetro e "Lançar tempo" (API.md §4.15), sempre para quem pede. No máximo um cronômetro ligado por pessoa
 * (índice apontamento_um_cronometro_uk): iniciar outro para o anterior na mesma transação e soma os minutos dele.
 * Parar grava max(1, arredondado) minutos, limitado a cronometroLimiteHoras (aviso cronometro_longo). Os serviços de
 * parar e lançar são do núcleo (servicos/horas.ts); aqui só a regra de ligar e a resposta das rotas.
 */
import type { Apontamento, CriarApontamentoEntrada, CronometroSaida, Id } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agora, novoId, rodar, type Db } from '../db.ts'
import { hoje, lerConfig } from './config-app.ts'
import { carregarApontamento, lancarApontamento, minutosDoCronometro, pararCronometros } from './horas.ts'
import { emitirObjeto } from './eventos.ts'
import { demandaEditavel } from './modal-comum.ts'
import { demandaViva } from './demandas.ts'

/** O parado passou do limite (o serviço do núcleo gravou o limite). */
function longo(db: Db, a: Apontamento | null): boolean {
  if (!a?.iniciadoEm || !a.paradoEm) return false
  return minutosDoCronometro(a.iniciadoEm, a.paradoEm, lerConfig(db).cronometroLimiteHoras).longo
}

function eu(ator: Ator): Id {
  if (!ator.usuario) throw new Error('cronômetro precisa de um usuário')
  return ator.usuario.id
}

/** POST /api/demandas/:id/cronometro: para o meu ligado (em qualquer demanda) e liga um nesta. */
export function iniciarCronometro(db: Db, demandaId: Id, ator: Ator): CronometroSaida {
  const usuarioId = eu(ator)
  const d = demandaEditavel(db, demandaId)
  const [parado = null] = pararCronometros(db, { usuarioId }, ator)
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, iniciado_em, origem, criado_em, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, 'cronometro', ?, ?)`, id, usuarioId, d.id, d.clienteId, hoje(), instante, instante, instante)
  const ativo = carregarApontamento(db, id)
  emitirObjeto(db, 'apontamento', id, ativo, ator, { publico: 'usuario_admin', usuarioId, demandaId: d.id })
  return { ativo, parado, avisos: longo(db, parado) ? ['cronometro_longo'] : [] }
}

/** POST /api/cronometro/parar: sem cronômetro ligado, `ativo: null, parado: null`. */
export function pararMeuCronometro(db: Db, ator: Ator): CronometroSaida {
  const [parado = null] = pararCronometros(db, { usuarioId: eu(ator) }, ator)
  return { ativo: null, parado, avisos: longo(db, parado) ? ['cronometro_longo'] : [] }
}

/** POST /api/demandas/:id/apontamentos: lança para mim (o cliente vem da demanda; data padrão: hoje). */
export function lancarTempo(db: Db, demandaId: Id, e: CriarApontamentoEntrada, ator: Ator): Apontamento {
  eu(ator)
  demandaViva(db, demandaId)
  return lancarApontamento(db, { demandaId, ator, entrada: e })
}
