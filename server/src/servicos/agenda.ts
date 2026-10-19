/**
 * Agendas externas (API.md §F.9): cadastro (só o admin, ação `config`), a lista sem o endereço e os eventos por período
 * (qualquer usuário). O endereço vai cifrado (`cifrar(url, 'agenda_ical')`), com o `url_hash` (hmac) para não entrar
 * duas vezes e a `url_dica` para a tela; nunca volta ao navegador, ao log nem a uma mensagem de erro.
 * A busca do iCal (rede, leitura e gravação das ocorrências) fica em agenda-busca.ts.
 */
import {
  CORES, type AgendaExterna, type ContagensAgenda, type CriarAgendaExternaEntrada, type DataLocal,
  type EditarAgendaExternaEntrada, type ErroAgendaExterna, type EventoAgendaExterna, type EventosAgendaConsulta,
  type EventosAgendaSaida, type Id,
} from '../../../shared/tipos/index.ts'
import { dicaDoEndereco, validarEnderecoIcal } from '../../../shared/logica/agenda-endereco.ts'
import { AGENDA_MAX_DIAS, diasNoIntervalo } from '../../../shared/logica/paineis.ts'
import { entre, FOLGA_MINIMA, PASSO_POSICAO } from '../../../shared/logica/posicao.ts'
import type { Ator } from '../auth.ts'
import { agora, marcadores, novoId, rodar, todos, um, type Db } from '../db.ts'
import { conflito, ErroHttp, naoEncontrado, validacao } from '../erros.ts'
import { cifrar, hmac } from './cripto.ts'
import { emitirDelete, emitirObjeto } from './eventos.ts'

/** Finalidade da chave derivada do SEGREDO que cifra o endereço (HKDF própria). */
export const FINALIDADE_CIFRA = 'agenda_ical'
export const MENSAGEM_ENDERECO = 'Cole o Endereço secreto no formato iCal do Google Agenda.'

export interface LinhaAgenda {
  id: string
  nome: string
  cor: string
  url_cifrada: string
  url_dica: string
  url_hash: string
  pos: number
  ativa: number
  criada_por: string | null
  criada_em: string
  atualizado_em: string
  buscada_em: string | null
  ok_em: string | null
  erro: string | null
  hash_conteudo: string | null
  contagens: string
  ocorrencias_em: string | null
}

export function agendaDaLinha(l: LinhaAgenda): AgendaExterna {
  let contagens: ContagensAgenda | null = null
  try {
    const c = JSON.parse(l.contagens) as Partial<ContagensAgenda>
    if (typeof c.ocorrencias === 'number') contagens = c as ContagensAgenda
  } catch {
    contagens = null
  }
  return {
    id: l.id, nome: l.nome, cor: l.cor as AgendaExterna['cor'], urlDica: l.url_dica, ativa: l.ativa === 1,
    buscadaEm: l.buscada_em, okEm: l.ok_em, erro: l.erro as ErroAgendaExterna | null, contagens,
    ocorrenciasEm: l.ocorrencias_em, criadaEm: l.criada_em,
  }
}

export function linhaAgenda(db: Db, id: Id): LinhaAgenda | undefined {
  return um<LinhaAgenda>(db, 'SELECT * FROM agenda_externa WHERE id = ?', id)
}

export function carregarAgenda(db: Db, id: Id): AgendaExterna {
  const l = linhaAgenda(db, id)
  if (!l) throw naoEncontrado('Agenda não encontrada.')
  return agendaDaLinha(l)
}

/** Todas, na ordem da tela (`pos`). */
export function listarAgendas(db: Db): AgendaExterna[] {
  return todos<LinhaAgenda>(db, 'SELECT * FROM agenda_externa ORDER BY pos, criada_em, id').map(agendaDaLinha)
}

/** Endereço colado → normalizado, ou 400 com a mensagem do contrato (o texto colado nunca volta na resposta). */
export function enderecoValido(texto: string): string {
  const url = validarEnderecoIcal(texto)
  if (!url) throw validacao(MENSAGEM_ENDERECO, { url: 'endereço fora do formato' })
  return url
}

function exigirEnderecoLivre(db: Db, hash: string, exceto?: Id): void {
  const outra = um<{ id: string }>(db, 'SELECT id FROM agenda_externa WHERE url_hash = ? AND id IS NOT ?', hash, exceto ?? null)
  if (outra) throw conflito('Esta agenda já está cadastrada.')
}

function nomeValido(nome: string): string {
  const n = nome.trim()
  if (n.length < 1 || n.length > 60) throw validacao('O nome precisa ter de 1 a 60 caracteres.', { nome: 'de 1 a 60 caracteres' })
  return n
}

/** POST: grava cifrado no fim da lista. A primeira busca é de quem chama (depois do commit). */
export function criarAgenda(db: Db, e: CriarAgendaExternaEntrada, ator: Ator): AgendaExterna {
  const nome = nomeValido(e.nome)
  const url = enderecoValido(e.url)
  const hash = hmac(url)
  exigirEnderecoLivre(db, hash)
  const ultima = um<{ p: number | null }>(db, 'SELECT max(pos) AS p FROM agenda_externa')!.p
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO agenda_externa (id, nome, cor, url_cifrada, url_dica, url_hash, pos, ativa, criada_por, criada_em,
               atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    id, nome, e.cor ?? 'azul', cifrar(url, FINALIDADE_CIFRA), dicaDoEndereco(url), hash, (ultima ?? 0) + PASSO_POSICAO,
    ator.usuario?.id ?? null, instante, instante)
  const agenda = carregarAgenda(db, id)
  emitirObjeto(db, 'agenda_externa', id, agenda, ator)
  return agenda
}

export interface ResultadoEdicao {
  agenda: AgendaExterna
  /** Buscar de novo depois do commit (endereço novo ou retomada). */
  buscar: boolean
}

/** PATCH: nome, cor, pausar/retomar, colar o endereço novo (zera o hash e busca de novo) e reordenar. */
export function editarAgenda(db: Db, id: Id, e: EditarAgendaExternaEntrada, ator: Ator): ResultadoEdicao {
  const atual = linhaAgenda(db, id)
  if (!atual) throw naoEncontrado('Agenda não encontrada.')
  const sets: string[] = []
  const valores: unknown[] = []
  let buscar = false
  if (e.nome !== undefined) { sets.push('nome = ?'); valores.push(nomeValido(e.nome)) }
  if (e.cor !== undefined) {
    if (!(CORES as readonly string[]).includes(e.cor)) throw validacao('Cor inválida.', { cor: 'cor fora da paleta' })
    sets.push('cor = ?'); valores.push(e.cor)
  }
  if (e.url !== undefined) {
    const url = enderecoValido(e.url)
    const hash = hmac(url)
    exigirEnderecoLivre(db, hash, id)
    sets.push('url_cifrada = ?', 'url_dica = ?', 'url_hash = ?', 'hash_conteudo = NULL', 'erro = NULL')
    valores.push(cifrar(url, FINALIDADE_CIFRA), dicaDoEndereco(url), hash)
    buscar = true
  }
  if (e.ativa !== undefined) {
    sets.push('ativa = ?'); valores.push(e.ativa)
    if (e.ativa && atual.ativa === 0) buscar = true
  }
  if (e.posicao !== undefined) { sets.push('pos = ?'); valores.push(posicaoNova(db, id, e.posicao.depoisDeId, e.posicao.antesDeId, ator)) }
  if (sets.length > 0) {
    sets.push('atualizado_em = ?'); valores.push(agora())
    rodar(db, `UPDATE agenda_externa SET ${sets.join(', ')} WHERE id = ?`, ...valores, id)
  }
  const agenda = carregarAgenda(db, id)
  if (sets.length > 0) emitirObjeto(db, 'agenda_externa', id, agenda, ator)
  const ativa = agenda.ativa
  return { agenda, buscar: buscar && ativa }
}

/** Posição entre os vizinhos (média); folga pequena: renumera a lista toda (passo 1024) e publica cada agenda. */
function posicaoNova(db: Db, id: Id, depoisDeId: Id | null | undefined, antesDeId: Id | null | undefined, ator: Ator): number {
  const lista = todos<{ id: string; pos: number }>(db, 'SELECT id, pos FROM agenda_externa WHERE id <> ? ORDER BY pos, criada_em, id', id)
  const indice = (alvo: Id) => {
    const i = lista.findIndex((l) => l.id === alvo)
    if (i < 0) throw validacao('A agenda vizinha não existe.', { posicao: 'vizinha não encontrada' })
    return i
  }
  let antes: number | null
  let depois: number | null
  if (depoisDeId !== undefined) {
    if (depoisDeId === null) { antes = null; depois = lista[0]?.pos ?? null }
    else { const i = indice(depoisDeId); antes = lista[i]!.pos; depois = lista[i + 1]?.pos ?? null }
  } else if (antesDeId !== undefined && antesDeId !== null) {
    const i = indice(antesDeId); antes = lista[i - 1]?.pos ?? null; depois = lista[i]!.pos
  } else {
    antes = lista[lista.length - 1]?.pos ?? null; depois = null
  }
  const pos = entre(antes, depois)
  if ((antes !== null && pos - antes < FOLGA_MINIMA) || (depois !== null && depois - pos < FOLGA_MINIMA)) {
    // renumera na ordem desejada e publica as outras (a movida sai no evento de quem chamou)
    const ordem = lista.map((l) => l.id)
    const lugar = depoisDeId === null ? 0 : depoisDeId !== undefined ? ordem.indexOf(depoisDeId) + 1
      : antesDeId ? ordem.indexOf(antesDeId) : ordem.length
    ordem.splice(lugar, 0, id)
    ordem.forEach((outro, i) => {
      if (outro === id) return
      rodar(db, 'UPDATE agenda_externa SET pos = ? WHERE id = ?', (i + 1) * PASSO_POSICAO, outro)
      emitirObjeto(db, 'agenda_externa', outro, carregarAgenda(db, outro), ator)
    })
    return (lugar + 1) * PASSO_POSICAO
  }
  return pos
}

/** DELETE: as ocorrências vão junto (cascade). */
export function excluirAgenda(db: Db, id: Id, ator: Ator): void {
  const r = rodar(db, 'DELETE FROM agenda_externa WHERE id = ?', id)
  if (r.changes === 0) throw naoEncontrado('Agenda não encontrada.')
  emitirDelete(db, 'agenda_externa', id, ator)
}

// ─────────────────────────────── "Atualizar agora" ───────────────────────────────

/** Último "Atualizar agora" de cada agenda (ms do relógio do app): 1 por minuto. Um processo só. */
const pedidos = new Map<Id, number>()
const INTERVALO_PEDIDO_MS = 60_000

/** Zera o limite do "Atualizar agora" (testes). */
export function zerarPedidosAgenda(): void {
  pedidos.clear()
}

/** 404, 422 pausada, 429 com `tenteEmSegundos`; senão marca o pedido e devolve a agenda. */
export function pedirAtualizacao(db: Db, id: Id): AgendaExterna {
  const agenda = carregarAgenda(db, id)
  if (!agenda.ativa) throw new ErroHttp(422, 'estado_invalido', 'Esta agenda está pausada. Retome antes de atualizar.')
  const agoraMs = Date.parse(agora())
  const ultimo = pedidos.get(id)
  if (ultimo !== undefined && agoraMs - ultimo < INTERVALO_PEDIDO_MS) {
    const espera = Math.max(1, Math.ceil((ultimo + INTERVALO_PEDIDO_MS - agoraMs) / 1000))
    throw new ErroHttp(429, 'muitas_tentativas', 'Esta agenda acabou de ser atualizada. Espere um pouco e tente de novo.',
      { tenteEmSegundos: espera })
  }
  pedidos.set(id, agoraMs)
  return agenda
}

// ─────────────────────────────── eventos por período ───────────────────────────────

interface LinhaOcorrencia {
  agenda_id: string
  chave: string
  titulo: string
  dia_inteiro: number
  inicio: string | null
  fim: string | null
  dia_inicio: string
  dia_fim: string
  local: string | null
  link_reuniao: string | null
  descricao: string | null
  tentativo: number
  livre: number
  privado: number
}

function eventoDaLinha(l: LinhaOcorrencia): EventoAgendaExterna {
  const privado = l.privado === 1
  return {
    id: `${l.agenda_id}:${l.chave}`, agendaId: l.agenda_id, titulo: l.titulo, diaInteiro: l.dia_inteiro === 1,
    inicio: l.inicio, fim: l.fim, diaInicio: l.dia_inicio, diaFim: l.dia_fim,
    // privado: o banco já não guarda; a resposta repete a regra
    local: privado ? null : l.local, linkReuniao: privado ? null : l.link_reuniao, descricao: privado ? null : l.descricao,
    tentativo: l.tentativo === 1, livre: l.livre === 1, privado,
  }
}

/** Período válido (datas, `ate` >= `de`, até 62 dias) ou 400. */
export function exigirPeriodo(de: DataLocal, ate: DataLocal): void {
  if (ate < de) throw validacao('O fim vem antes do começo.', { ate: 'antes de "de"' })
  if (diasNoIntervalo(de, ate) > AGENDA_MAX_DIAS) {
    throw validacao(`Escolha no máximo ${AGENDA_MAX_DIAS} dias.`, { ate: `intervalo maior que ${AGENDA_MAX_DIAS} dias` })
  }
}

/**
 * Ocorrências das agendas ativas no período (`dia_inicio <= ate AND dia_fim >= de`, pelo índice), dia inteiro
 * primeiro, depois por início e título. `agendas` = todas as ativas (cor, nome e o filtro), mesmo com `agendaIds`.
 */
export function eventosAgenda(db: Db, c: EventosAgendaConsulta): EventosAgendaSaida {
  exigirPeriodo(c.de, c.ate)
  const agendas = listarAgendas(db).filter((a) => a.ativa)
  const pedidas = c.agendaIds && c.agendaIds.length > 0 ? new Set(c.agendaIds) : null
  const ids = agendas.map((a) => a.id).filter((id) => !pedidas || pedidas.has(id))
  const eventos = ids.length === 0 ? [] : todos<LinhaOcorrencia>(db, `
    SELECT * FROM agenda_ocorrencia
     WHERE dia_inicio <= ? AND dia_fim >= ? AND agenda_id IN (${marcadores(ids.length)})
     ORDER BY dia_inicio, dia_inteiro DESC, inicio, titulo, chave`, c.ate, c.de, ...ids).map(eventoDaLinha)
  return { de: c.de, ate: c.ate, agendas, eventos }
}
