/**
 * Busca do iCal de uma agenda externa (API.md §F.9 "Busca"; pesquisa-ical §2.4 e §6.1), a cada 15 min pela tarefa
 * `agenda-busca` e no "Atualizar agora":
 * - o endereço é decifrado e passa por `validarEnderecoIcal` LOGO ANTES do fetch (fora do formato → `endereco_invalido`,
 *   sem buscar; não deu para decifrar → `endereco_ilegivel`);
 * - `fetch` sem seguir redirecionamento, sem credenciais, 60 s, corpo lido em fluxo com teto de 32 MB contados depois de
 *   descomprimir (o fetch do Node já descomprime o gzip); 404 → `endereco_invalido`; 429/5xx/rede → `fora_do_ar` (tenta
 *   na próxima rodada); sem BEGIN:VCALENDAR → `nao_e_ical`;
 * - hash do corpo sem as linhas DTSTAMP igual ao anterior (no mesmo dia) → só `buscada_em` muda: nada regravado, sem SSE;
 * - busca boa: as ocorrências da agenda são substituídas numa transação (só se mudaram), com `ok_em`, `contagens`,
 *   `hash_conteudo` e `ocorrencias_em`, e o evento `agenda_externa` sai com o ator sistema; erro: grava `erro` e mantém
 *   as ocorrências da última busca boa.
 * O endereço nunca vai a log, resposta ou mensagem de erro: todo erro inesperado sai por `descreverErro(e, [url])`.
 * A busca é trocável (`definirBuscaAgenda`) para os testes usarem um servidor falso local.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INTERVALO_AGENDA_EXTERNA_MIN, TETOS_AGENDA_EXTERNA, type ContagensAgenda, type ErroAgendaExterna, type Id,
} from '../../../shared/tipos/index.ts'
import { validarEnderecoIcal } from '../../../shared/logica/agenda-endereco.ts'
import { dataLocalDe, hojeSP } from '../../../shared/logica/datas.ts'
import { atorSistema } from '../auth.ts'
import { config } from '../config.ts'
import { agora, agoraData, rodar, todos, tx, type Db } from '../db.ts'
import { decifrar } from './cripto.ts'
import { emitirObjeto } from './eventos.ts'
import { descreverErro } from './segredos.ts'
import { FINALIDADE_CIFRA, agendaDaLinha, linhaAgenda, type LinhaAgenda } from './agenda.ts'
import { hashSemDtstamp, lerIcal, type OcorrenciaIcal } from './agenda-ical.ts'

export type RespostaBusca = { ok: true; corpo: Uint8Array } | { ok: false; erro: ErroAgendaExterna }
export type BuscaAgenda = (url: string) => Promise<RespostaBusca>

/**
 * Convenção só de desenvolvimento (FASE2-PLANO §1; ignorada com NODE_ENV=production): este endereço lê a fixture
 * server/test/fixtures/agenda/google-2026.ics, para o roteiro de navegador sem o endereço real.
 */
export const ENDERECO_TESTE = 'https://calendar.google.com/calendar/ical/teste%40pauta.test/private-0123456789abcdef/basic.ics'
const FIXTURE_TESTE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'agenda', 'google-2026.ics')

const INICIO_ICAL = new TextEncoder().encode('BEGIN:VCALENDAR')

/** O corpo começa com BEGIN:VCALENDAR (depois de BOM e espaços)? Com poucos bytes ainda, `null` = não dá para saber. */
function comecaComVcalendar(bytes: Uint8Array): boolean | null {
  let i = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0d || bytes[i] === 0x0a)) i++
  for (let k = 0; k < INICIO_ICAL.length; k++) {
    if (i + k >= bytes.length) return null
    const b = bytes[i + k]!
    const maiuscula = b >= 0x61 && b <= 0x7a ? b - 0x20 : b
    if (maiuscula !== INICIO_ICAL[k]) return false
  }
  return true
}

function ehTempoEsgotado(e: unknown, sinal: AbortSignal): boolean {
  const nome = (e as { name?: string } | null)?.name
  return nome === 'TimeoutError' || (sinal.aborted && (sinal.reason as { name?: string } | undefined)?.name === 'TimeoutError')
}

/**
 * GET do iCal por HTTP, com os tetos (usado pela busca de verdade e, nos testes, contra um servidor falso local).
 * Nunca lança: todo problema vira um `ErroAgendaExterna`.
 */
export async function lerIcalHttp(url: string, o: { tetoBytes?: number; tempoMs?: number } = {}): Promise<RespostaBusca> {
  const teto = o.tetoBytes ?? TETOS_AGENDA_EXTERNA.bytes
  const sinal = AbortSignal.timeout(o.tempoMs ?? TETOS_AGENDA_EXTERNA.segundos * 1000)
  let r: Response
  try {
    r = await fetch(url, { redirect: 'error', credentials: 'omit', signal: sinal, headers: { Accept: 'text/calendar' } })
  } catch (e) {
    return { ok: false, erro: ehTempoEsgotado(e, sinal) ? 'tempo_esgotado' : 'fora_do_ar' }
  }
  if (r.status !== 200) {
    void r.body?.cancel().catch(() => {})
    return { ok: false, erro: [401, 403, 404, 410].includes(r.status) ? 'endereco_invalido' : 'fora_do_ar' }
  }
  const leitor = r.body?.getReader()
  if (!leitor) return { ok: false, erro: 'nao_e_ical' }
  const partes: Uint8Array[] = []
  let total = 0
  let conferido = false
  try {
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      total += value.byteLength
      if (total > teto) {
        void leitor.cancel().catch(() => {})
        return { ok: false, erro: 'grande_demais' }
      }
      partes.push(value)
      if (!conferido) {
        const inicio = comecaComVcalendar(partes.length === 1 ? value : Buffer.concat(partes))
        if (inicio === false) {
          void leitor.cancel().catch(() => {})
          return { ok: false, erro: 'nao_e_ical' }
        }
        conferido = inicio === true
      }
    }
  } catch (e) {
    void leitor.cancel().catch(() => {})
    return { ok: false, erro: ehTempoEsgotado(e, sinal) ? 'tempo_esgotado' : 'fora_do_ar' }
  }
  const corpo = Buffer.concat(partes)
  if (comecaComVcalendar(corpo) !== true) return { ok: false, erro: 'nao_e_ical' }
  return { ok: true, corpo }
}

const buscaPadrao: BuscaAgenda = async (url) => {
  if (!config.producao && url === ENDERECO_TESTE) {
    try {
      return { ok: true, corpo: readFileSync(FIXTURE_TESTE) }
    } catch {
      return { ok: false, erro: 'fora_do_ar' }
    }
  }
  return lerIcalHttp(url)
}

let busca: BuscaAgenda = buscaPadrao

/** Troca a busca do iCal (testes); sem argumento, volta à de verdade. */
export function definirBuscaAgenda(fn?: BuscaAgenda): void {
  busca = fn ?? buscaPadrao
}

// ─────────────────────────────── uma busca ───────────────────────────────

/** Buscas em andamento por agenda (a mesma agenda nunca busca duas vezes ao mesmo tempo). */
const emAndamento = new Map<Id, Promise<void>>()

/** Espera as buscas em segundo plano terminarem (testes e scripts). */
export async function esperarBuscasAgenda(): Promise<void> {
  while (emAndamento.size > 0) await Promise.allSettled([...emAndamento.values()])
}

/** Busca a agenda agora (ou junta-se à busca que já está rodando). Erro inesperado: log mascarado, sem lançar. */
export function buscarAgenda(db: Db, id: Id): Promise<void> {
  const atual = emAndamento.get(id)
  if (atual) return atual
  const p = executar(db, id).finally(() => { emAndamento.delete(id) })
  emAndamento.set(id, p)
  return p
}

/** Linha de agenda_ocorrencia como texto canônico (para saber se as ocorrências mudaram). */
function assinatura(o: OcorrenciaIcal): string {
  return JSON.stringify([o.chave, o.titulo, o.diaInteiro, o.inicio, o.fim, o.diaInicio, o.diaFim, o.local, o.linkReuniao,
    o.descricao, o.tentativo, o.livre, o.privado])
}

function hashOcorrencias(lista: OcorrenciaIcal[]): string {
  const h = createHash('sha256')
  for (const s of lista.map(assinatura).sort()) h.update(s).update('\n')
  return h.digest('hex')
}

function ocorrenciasGravadas(db: Db, id: Id): OcorrenciaIcal[] {
  return todos<Record<string, unknown>>(db, 'SELECT * FROM agenda_ocorrencia WHERE agenda_id = ?', id).map((l) => ({
    chave: String(l.chave), titulo: String(l.titulo), diaInteiro: l.dia_inteiro === 1, inicio: l.inicio as string | null,
    fim: l.fim as string | null, diaInicio: String(l.dia_inicio), diaFim: String(l.dia_fim), local: l.local as string | null,
    linkReuniao: l.link_reuniao as string | null, descricao: l.descricao as string | null, tentativo: l.tentativo === 1,
    livre: l.livre === 1, privado: l.privado === 1,
  }))
}

/** Publica a agenda inteira (ator sistema: `a` e `t` nulos). */
function publicar(db: Db, id: Id): void {
  const l = linhaAgenda(db, id)
  if (l) emitirObjeto(db, 'agenda_externa', id, agendaDaLinha(l), atorSistema())
}

/** Grava o erro da tentativa (mantém as ocorrências); publica só se o erro mudou. */
function gravarErro(db: Db, id: Id, inicio: string, erro: ErroAgendaExterna): void {
  tx(db, () => {
    const l = linhaAgenda(db, id)
    if (!l) return
    rodar(db, 'UPDATE agenda_externa SET buscada_em = ?, erro = ? WHERE id = ?', inicio, erro, id)
    if (l.erro !== erro) publicar(db, id)
  })
}

/** Falha inesperada de uma busca, com a mensagem JÁ mascarada (pode ir ao log e a `tarefa_execucao`). */
export class FalhaBuscaAgenda extends Error {
  constructor(id: Id, descricao: string) {
    super(`agenda ${id}: ${descricao}`)
    this.name = 'FalhaBuscaAgenda'
  }
}

/**
 * Uma tentativa. Os erros esperados (404, rede, tempo, teto...) viram o `erro` da agenda; uma exceção inesperada (da
 * busca, da leitura ou do banco) também marca a agenda e sobe como `FalhaBuscaAgenda`, já mascarada.
 */
async function executar(db: Db, id: Id): Promise<void> {
  const inicio = agora()
  const t0 = performance.now()
  const linha = linhaAgenda(db, id)
  if (!linha || linha.ativa !== 1) return
  let url: string
  try {
    url = decifrar(linha.url_cifrada, FINALIDADE_CIFRA)
  } catch {
    gravarErro(db, id, inicio, 'endereco_ilegivel')
    return
  }
  // anti-SSRF: o endereço decifrado passa pela mesma validação do POST antes de cada busca
  const valido = validarEnderecoIcal(url)
  if (!valido) {
    gravarErro(db, id, inicio, 'endereco_invalido')
    return
  }
  let resposta: RespostaBusca
  try {
    resposta = await busca(valido)
  } catch (e) {
    const descricao = descreverErro(e, [url, valido])
    tentarGravarErro(db, id, inicio, 'fora_do_ar')
    throw new FalhaBuscaAgenda(id, descricao)
  }
  if (!resposta.ok) {
    gravarErro(db, id, inicio, resposta.erro)
    return
  }
  try {
    processar(db, id, inicio, resposta.corpo, t0)
  } catch (e) {
    const descricao = descreverErro(e, [url, valido])
    tentarGravarErro(db, id, inicio, 'nao_e_ical')
    throw new FalhaBuscaAgenda(id, descricao)
  }
}

function tentarGravarErro(db: Db, id: Id, inicio: string, erro: ErroAgendaExterna): void {
  try {
    gravarErro(db, id, inicio, erro)
  } catch {
    // o banco também falhou: a falha original já vai subir
  }
}

/** Corpo bom: compara o hash, lê, confere os tetos e grava (numa transação). */
function processar(db: Db, id: Id, inicio: string, corpo: Uint8Array, t0: number): void {
  const hash = hashSemDtstamp(corpo)
  const hoje = hojeSP(agoraData())
  const linha = linhaAgenda(db, id)
  if (!linha) return
  // mesmo conteúdo, sem erro e já lido hoje (a janela anda um dia por dia): só a hora da tentativa
  if (linha.hash_conteudo === hash && linha.erro === null && linha.ok_em && dataLocalDe(linha.ok_em) === hoje) {
    rodar(db, 'UPDATE agenda_externa SET buscada_em = ? WHERE id = ?', inicio, id)
    return
  }
  const leitura = lerIcal(corpo, { hoje })
  if (leitura.passouDoTeto) {
    gravarErro(db, id, inicio, 'teto_ocorrencias')
    return
  }
  const contagens: ContagensAgenda = {
    ...leitura.contagens, bytes: corpo.byteLength, duracaoMs: Math.round(performance.now() - t0),
  }
  tx(db, () => {
    const atual = linhaAgenda(db, id)
    if (!atual || atual.ativa !== 1) return
    const mudou = hashOcorrencias(leitura.ocorrencias) !== hashOcorrencias(ocorrenciasGravadas(db, id))
    const instante = agora()
    if (mudou) {
      rodar(db, 'DELETE FROM agenda_ocorrencia WHERE agenda_id = ?', id)
      for (const o of leitura.ocorrencias) {
        rodar(db, `INSERT INTO agenda_ocorrencia (agenda_id, chave, titulo, dia_inteiro, inicio, fim, dia_inicio, dia_fim, local,
                     link_reuniao, descricao, tentativo, livre, privado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, o.chave, o.titulo, o.diaInteiro, o.inicio, o.fim, o.diaInicio, o.diaFim, o.local, o.linkReuniao, o.descricao,
          o.tentativo, o.livre, o.privado)
      }
    }
    rodar(db, `UPDATE agenda_externa SET buscada_em = ?, ok_em = ?, erro = NULL, hash_conteudo = ?, contagens = ?,
                 ocorrencias_em = ? WHERE id = ?`,
      inicio, instante, hash, JSON.stringify(contagens), mudou || !atual.ocorrencias_em ? instante : atual.ocorrencias_em, id)
    publicar(db, id)
  })
}

// ─────────────────────────────── a rodada da tarefa ───────────────────────────────

/** Agendas ativas cuja última tentativa passou de 15 min (ou nunca buscaram), da mais atrasada para a mais nova. */
export function agendasDevidas(db: Db): Id[] {
  const limite = new Date(agoraData().getTime() - INTERVALO_AGENDA_EXTERNA_MIN * 60_000).toISOString()
  return todos<Pick<LinhaAgenda, 'id'>>(db, `
    SELECT id FROM agenda_externa WHERE ativa = 1 AND (buscada_em IS NULL OR buscada_em <= ?)
     ORDER BY buscada_em IS NOT NULL, buscada_em, pos`, limite).map((l) => l.id)
}

/**
 * Uma rodada: busca cada agenda devida, uma de cada vez; a falha de uma não impede a próxima. Devolve quantas buscou e
 * as falhas inesperadas, já mascaradas e no log (a tarefa decide o que registrar).
 */
export async function buscarDevidas(db: Db): Promise<{ buscadas: number; falhas: string[] }> {
  const falhas: string[] = []
  const ids = agendasDevidas(db)
  for (const id of ids) {
    try {
      await buscarAgenda(db, id)
    } catch (e) {
      const descricao = e instanceof FalhaBuscaAgenda ? e.message : descreverErro(e)
      console.error(`agenda-busca: ${descricao}`)
      falhas.push(descricao)
    }
  }
  return { buscadas: ids.length, falhas }
}
