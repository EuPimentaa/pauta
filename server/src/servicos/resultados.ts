/**
 * Fase 2 (F8): os resultados da Windsor de cada cliente e a carteira (API.md §F.8; shared/tipos/resultados.ts).
 *
 * - Resposta NA HORA com o cache (resultado_cache por cliente + conector + as quatro datas); conector vencido ou sem
 *   cache começa a busca em segundo plano e a resposta sai com `atualizando: true` (o SSE `resultado_cliente` avisa no
 *   começo e no fim). Validade: 3 h; período que terminou há mais de 3 dias, 24 h. `contas` diferente das ligadas agora
 *   = vencido. Erro grava `erro` e `tentado_em` e mantém os dados e o `buscado_em` de antes; depois de um erro, tenta de
 *   novo só 10 min depois (a Windsor fora do ar não leva uma chamada por abertura de tela).
 * - Uma busca por cliente e período por vez (trava em memória): duas leituras ao mesmo tempo esperam a mesma busca.
 * - Até 8 chamadas por cliente e período (Meta 3, Google Ads 1, GA4 4; conector sem conta ligada não chama).
 * - Carteira: uma chamada por conector e período com todas as contas ligadas (6 no máximo), cache de 3 h em
 *   resultado_panorama_cache (migração 120), a mesma conta para a aba e para a carteira.
 * - "Atualizar agora": 1 por cliente a cada 5 min (qualquer período); força a busca de todos os conectores.
 * - Todo `void busca…()` leva `.catch(registrarFalhaMascarada(…))`; exceção que não é FalhaWindsor vira `fora_do_ar`
 *   com o log mascarado (API.md §F.1).
 */
import {
  CONECTORES_WINDSOR, type AlertaResultado, type ConectorWindsor, type ContaLigada, type DataLocal, type ErroWindsor,
  type EstadoResultadosCliente, type Id, type LinhaPanorama, type PanoramaResultados, type PeriodoResultados,
  type PodeBuscarResultados, type ResultadoConector, type ResultadoGa4, type ResultadoGoogleAds, type ResultadoMeta, type ResultadosCliente,
} from '../../../shared/tipos/index.ts'
import type {
  DadosConector, DadosGa4, DadosGoogleAds, DadosMeta, DadosPanorama, GastoRecente, LinhaWindsor, SomasPorConector,
} from '../../../shared/tipos/ext/resultados.ts'
import { hojeSP, somarDias } from '../../../shared/logica/datas.ts'
import { alertasResultados, type ConectorParaAlertas } from '../../../shared/logica/resultados-alertas.ts'
import {
  calcularGa4, calcularGoogleAds, calcularMeta, gastoRecente, linhasEntre, principaisDeSomas, somarContas, somasPorConta,
} from '../../../shared/logica/resultados-calculo.ts'
import { periodoDe, validadeCacheMs, type DatasPeriodo } from '../../../shared/logica/resultados-periodo.ts'
import { atorSistema, type Ator } from '../auth.ts'
import { agora, agoraData, rodar, todos, tx, um, type Db } from '../db.ts'
import { ErroHttp } from '../erros.ts'
import { emitirObjeto } from './eventos.ts'
import { chamarDados, FalhaWindsor, temChave, type PedidoDados } from './resultados-windsor.ts'
import { descreverErro, registrarFalhaMascarada } from './segredos.ts'

/** `buscar` true/false, ou a função do MCP: chamada só quando ia buscar de verdade (a busca do limite por hora). */
function vaiBuscar(buscar: PodeBuscarResultados): boolean {
  return typeof buscar === 'function' ? buscar() : buscar
}

/** "Atualizar agora": 1 por cliente neste intervalo. */
export const ATUALIZAR_A_CADA_MS = 5 * 60_000
/** Depois de uma busca com erro, a próxima automática só depois disto. */
export const REPETIR_ERRO_MS = 10 * 60_000

// ─────────────────────────────── estado em memória (um processo) ───────────────────────────────

interface Memoria {
  /** Buscas em andamento: cliente|datas → promessa. */
  buscas: Map<string, Promise<void>>
  /** Buscas da carteira em andamento: datas → promessa. */
  panoramas: Map<string, Promise<void>>
  /** Última "Atualizar agora" de cada cliente (ms do relógio do app). */
  atualizadoAgora: Map<Id, number>
}
const memorias = new WeakMap<Db, Memoria>()

function memoria(db: Db): Memoria {
  let m = memorias.get(db)
  if (!m) {
    m = { buscas: new Map(), panoramas: new Map(), atualizadoAgora: new Map() }
    memorias.set(db, m)
  }
  return m
}

const chaveDatas = (d: DatasPeriodo) => `${d.de}|${d.ate}|${d.deAnterior}|${d.ateAnterior}`
const chaveBusca = (clienteId: Id, d: DatasPeriodo) => `${clienteId}|${chaveDatas(d)}`

/** Espera todas as buscas em segundo plano deste banco (testes e scripts). */
export async function esperarBuscas(db: Db): Promise<void> {
  const m = memoria(db)
  for (;;) {
    const pendentes = [...m.buscas.values(), ...m.panoramas.values()]
    if (pendentes.length === 0) return
    await Promise.allSettled(pendentes)
  }
}

/** Espera a promessa ou o tempo, o que vier primeiro (nunca rejeita). */
async function esperarAte(p: Promise<unknown>, ms: number): Promise<void> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    p.then(() => undefined, () => undefined),
    new Promise<void>((pronto) => { relogio = setTimeout(pronto, Math.max(0, ms)) }),
  ])
  clearTimeout(relogio)
}

// ─────────────────────────────── contas ligadas ───────────────────────────────

interface LinhaLigacao { id: string; cliente_id: string; conector: ConectorWindsor; conta_id: string; nome: string; ligada_por: string | null; ligada_em: string }

const ordemConector = (c: ConectorWindsor) => CONECTORES_WINDSOR.indexOf(c)

function paraContaLigada(l: LinhaLigacao): ContaLigada {
  return { id: l.id, conector: l.conector, contaId: l.conta_id, nome: l.nome, ligadaPor: l.ligada_por, ligadaEm: l.ligada_em }
}

function ordenarContas<T extends { conector: ConectorWindsor; nome: string; contaId: string }>(lista: T[]): T[] {
  return lista.sort((a, b) => ordemConector(a.conector) - ordemConector(b.conector)
    || a.nome.localeCompare(b.nome, 'pt-BR') || a.contaId.localeCompare(b.contaId))
}

/** As contas ligadas ao cliente, por conector e nome. */
export function contasLigadas(db: Db, clienteId: Id): ContaLigada[] {
  return ordenarContas(todos<LinhaLigacao>(db, 'SELECT * FROM cliente_conta_resultados WHERE cliente_id = ?', clienteId).map(paraContaLigada))
}

/** Os ids das contas de cada conector, em ordem (o `contas` do cache). */
function idsPorConector(contas: readonly { conector: ConectorWindsor; contaId: string }[]): Map<ConectorWindsor, string[]> {
  const m = new Map<ConectorWindsor, string[]>()
  for (const c of contas) m.set(c.conector, [...(m.get(c.conector) ?? []), c.contaId])
  for (const [k, v] of m) m.set(k, [...new Set(v)].sort())
  return m
}

// ─────────────────────────────── cache ───────────────────────────────

interface LinhaCache {
  contas: string
  dados: string | null
  buscado_em: string | null
  tentado_em: string
  erro: ErroWindsor | null
}

/**
 * O cache precisa de busca nova? Contas diferentes: sim. Depois de um erro: 10 min depois do `tentado_em`, mesmo com os
 * dados bons de antes ainda na validade (API §F.8; sem isso o erro de um "Atualizar agora" na queda ficava na tela até
 * os dados velhos vencerem, 3 h ou 24 h, com a Windsor já de volta). Sem erro: a validade dos dados (3 h ou 24 h).
 */
function vencido(l: LinhaCache | undefined, contas: readonly string[], ate: DataLocal, hoje: DataLocal): boolean {
  if (!l || l.contas !== JSON.stringify(contas)) return true
  const agoraMs = Date.parse(agora())
  if (l.erro) return agoraMs - Date.parse(l.tentado_em) >= REPETIR_ERRO_MS
  const idade = l.buscado_em ? agoraMs - Date.parse(l.buscado_em) : Number.POSITIVE_INFINITY
  return idade > validadeCacheMs(ate, hoje)
}

function linhaCache(db: Db, clienteId: Id, conector: ConectorWindsor, d: DatasPeriodo): LinhaCache | undefined {
  return um<LinhaCache>(db, `SELECT contas, dados, buscado_em, tentado_em, erro FROM resultado_cache
    WHERE cliente_id = ? AND conector = ? AND de = ? AND ate = ? AND de_anterior = ? AND ate_anterior = ?`,
  clienteId, conector, d.de, d.ate, d.deAnterior, d.ateAnterior)
}

function gravarCache(db: Db, clienteId: Id, conector: ConectorWindsor, d: DatasPeriodo, contas: readonly string[],
  r: { dados: DadosConector } | { erro: ErroWindsor }): void {
  const instante = agora()
  if ('dados' in r) {
    rodar(db, `INSERT INTO resultado_cache (cliente_id, conector, de, ate, de_anterior, ate_anterior, contas, dados, buscado_em, tentado_em, erro)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
               ON CONFLICT (cliente_id, conector, de, ate, de_anterior, ate_anterior) DO UPDATE SET contas = excluded.contas,
                 dados = excluded.dados, buscado_em = excluded.buscado_em, tentado_em = excluded.tentado_em, erro = NULL`,
    clienteId, conector, d.de, d.ate, d.deAnterior, d.ateAnterior, JSON.stringify(contas), JSON.stringify(r.dados), instante, instante)
  } else {
    // erro: os dados de antes continuam valendo (se forem das mesmas contas)
    rodar(db, `INSERT INTO resultado_cache (cliente_id, conector, de, ate, de_anterior, ate_anterior, contas, dados, buscado_em, tentado_em, erro)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
               ON CONFLICT (cliente_id, conector, de, ate, de_anterior, ate_anterior) DO UPDATE SET contas = excluded.contas,
                 dados = CASE WHEN resultado_cache.contas = excluded.contas THEN resultado_cache.dados END,
                 buscado_em = CASE WHEN resultado_cache.contas = excluded.contas THEN resultado_cache.buscado_em END,
                 tentado_em = excluded.tentado_em, erro = excluded.erro`,
    clienteId, conector, d.de, d.ate, d.deAnterior, d.ateAnterior, JSON.stringify(contas), instante, r.erro)
  }
}

// ─────────────────────────────── chamadas à Windsor ───────────────────────────────

const LEADS = 'actions_lead'
const CONVERSAS = 'actions_onsite_conversion_messaging_conversation_started_7d'
/** Os campos de cada chamada (API.md §F.8; a 5 leva também active_users do dia, para a série de usuários). */
export const CAMPOS = {
  metaDiario: ['date', 'account_id', 'campaign_id', 'campaign', 'objective', 'spend', 'impressions', 'clicks', 'link_clicks',
    LEADS, CONVERSAS, 'actions_omni_purchase', 'action_values_omni_purchase'],
  metaTotal: ['account_id', 'reach', 'impressions'],
  googleDiario: ['date', 'account_id', 'campaign_id', 'campaign', 'advertising_channel_type', 'spend', 'impressions', 'clicks',
    'conversions', 'conversions_value'],
  ga4Diario: ['date', 'account_id', 'sessions', 'engaged_sessions', 'average_session_duration', 'screen_page_views', 'conversions',
    'active_users'],
  ga4Total: ['account_id', 'active_users', 'newusers'],
  ga4Eventos: ['event_name', 'conversions'],
  // carteira
  panoramaMetaA: ['date', 'account_id', 'spend', 'impressions', 'clicks', LEADS, CONVERSAS],
  panoramaMetaB: ['account_id', 'spend', 'impressions', 'clicks', LEADS, CONVERSAS],
  panoramaGoogleA: ['date', 'account_id', 'spend', 'impressions', 'clicks', 'conversions', 'conversions_value'],
  panoramaGoogleB: ['account_id', 'spend', 'impressions', 'clicks', 'conversions', 'conversions_value'],
  panoramaGa4: ['account_id', 'active_users', 'sessions', 'engaged_sessions', 'conversions'],
} as const

/** Como Promise.all, mas espera todas terminarem antes de falhar (nenhuma chamada fica solta depois da resposta). */
async function todas<T extends readonly unknown[]>(ps: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const r = await Promise.allSettled(ps as readonly Promise<unknown>[])
  const falha = r.find((x): x is PromiseRejectedResult => x.status === 'rejected')
  if (falha) throw falha.reason
  return r.map((x) => (x as PromiseFulfilledResult<unknown>).value) as unknown as T
}

function pedido(conector: ConectorWindsor, campos: readonly string[], de: DataLocal, ate: DataLocal, contas: readonly string[],
  filtro?: unknown): PedidoDados {
  return { conector, campos, de, ate, contas, ...(filtro === undefined ? {} : { filtro }) }
}

/** As chamadas de um conector para o cliente (Meta 3, Google Ads 1, GA4 4) e o cálculo. */
async function buscarConector(db: Db, conector: ConectorWindsor, contas: readonly string[], d: DatasPeriodo): Promise<DadosConector> {
  const chamar = (campos: readonly string[], de: DataLocal, ate: DataLocal, filtro?: unknown) =>
    chamarDados(db, pedido(conector, campos, de, ate, contas, filtro))
  if (conector === 'facebook') {
    const [diario, totalAtual, totalAnterior] = await todas<[LinhaWindsor[], LinhaWindsor[], LinhaWindsor[]]>([
      chamar(CAMPOS.metaDiario, d.deAnterior, d.ate), chamar(CAMPOS.metaTotal, d.de, d.ate),
      chamar(CAMPOS.metaTotal, d.deAnterior, d.ateAnterior),
    ])
    return calcularMeta({ diario, totalAtual, totalAnterior, datas: d })
  }
  if (conector === 'google_ads') {
    return calcularGoogleAds({ diario: await chamar(CAMPOS.googleDiario, d.deAnterior, d.ate), datas: d })
  }
  const [diario, totalAtual, totalAnterior, eventos] = await todas<[LinhaWindsor[], LinhaWindsor[], LinhaWindsor[], LinhaWindsor[]]>([
    chamar(CAMPOS.ga4Diario, d.deAnterior, d.ate), chamar(CAMPOS.ga4Total, d.de, d.ate),
    chamar(CAMPOS.ga4Total, d.deAnterior, d.ateAnterior), chamar(CAMPOS.ga4Eventos, d.de, d.ate, [['conversions', 'gt', 0]]),
  ])
  return calcularGa4({ diario, totalAtual, totalAnterior, eventos, datas: d })
}

/** Qualquer exceção da busca de um conector → o erro guardado (e o log mascarado se não for da Windsor). */
function erroDe(e: unknown, rotulo: string): ErroWindsor {
  if (e instanceof FalhaWindsor) return e.erro
  console.error(`${rotulo}: ${descreverErro(e)}`)
  return 'fora_do_ar'
}

// ─────────────────────────────── estado e SSE ───────────────────────────────

/** O objeto do evento `resultado_cliente`. */
export function estadoResultados(db: Db, clienteId: Id): EstadoResultadosCliente {
  const m = memoria(db)
  const prefixo = `${clienteId}|`
  const ultima = um<{ t: string | null }>(db, 'SELECT max(tentado_em) t FROM resultado_cache WHERE cliente_id = ?', clienteId)?.t ?? null
  return {
    clienteId, contas: contasLigadas(db, clienteId),
    atualizando: [...m.buscas.keys()].some((k) => k.startsWith(prefixo)), atualizadoEm: ultima,
  }
}

/** Emite `resultado_cliente` (objeto inteiro). Sem ator de pessoa: sistema, com `a` e `t` nulos. */
export function emitirEstadoResultados(db: Db, clienteId: Id, ator: Ator | null): void {
  tx(db, () => emitirObjeto(db, 'resultado_cliente', clienteId, estadoResultados(db, clienteId), ator ?? atorSistema(),
    { anonimo: ator === null }))
}

// ─────────────────────────────── busca do cliente ───────────────────────────────

/**
 * Começa (ou junta-se a) a busca do cliente no período, em segundo plano. `ator`: quem pediu ("Atualizar agora"); nulo
 * na busca automática. Devolve a promessa (que nunca rejeita).
 */
function iniciarBusca(db: Db, clienteId: Id, d: DatasPeriodo, conectores: ConectorWindsor[], ator: Ator | null): Promise<void> {
  const m = memoria(db)
  const chave = chaveBusca(clienteId, d)
  const existente = m.buscas.get(chave)
  if (existente) return existente
  const contas = idsPorConector(contasLigadas(db, clienteId))
  const alvo = conectores.filter((c) => (contas.get(c)?.length ?? 0) > 0)
  let pronta!: () => void
  const promessa = new Promise<void>((ok) => { pronta = ok })
  m.buscas.set(chave, promessa)
  const executar = async () => {
    try {
      emitirEstadoResultados(db, clienteId, ator)
      await Promise.all(alvo.map(async (conector) => {
        const ids = contas.get(conector)!
        try {
          const dados = await buscarConector(db, conector, ids, d)
          tx(db, () => gravarCache(db, clienteId, conector, d, ids, { dados }))
        } catch (e) {
          const erro = erroDe(e, `resultados busca ${conector}`)
          tx(db, () => gravarCache(db, clienteId, conector, d, ids, { erro }))
        }
      }))
    } finally {
      m.buscas.delete(chave)
      pronta()
      emitirEstadoResultados(db, clienteId, null)
    }
  }
  void executar().catch(registrarFalhaMascarada('resultados busca'))
  return promessa
}

function montarConector(conector: ConectorWindsor, ids: string[], l: LinhaCache | undefined): ResultadoConector {
  const mesmas = !!l && l.contas === JSON.stringify(ids)
  const dados = mesmas && l!.dados ? JSON.parse(l!.dados) as DadosConector : null
  const estado: ResultadoConector['estado'] = (mesmas ? l!.erro : null) ?? (dados?.vazio ? 'sem_dados' : 'ok')
  const base = { contas: ids, estado, buscadoEm: mesmas ? l!.buscado_em : null, kpis: dados?.kpis ?? null, serie: dados?.serie ?? [] }
  if (conector === 'facebook') {
    return { ...base, conector, campanhas: (dados as DadosMeta | null)?.campanhas ?? [] } as ResultadoMeta
  }
  if (conector === 'google_ads') {
    return { ...base, conector, campanhas: (dados as DadosGoogleAds | null)?.campanhas ?? [] } as ResultadoGoogleAds
  }
  return { ...base, conector, eventosChave: (dados as DadosGa4 | null)?.eventosChave ?? [] } as ResultadoGa4
}

function custoDe(r: ResultadoConector): ConectorParaAlertas['custo'] {
  if (!r.kpis) return null
  if (r.conector === 'facebook') return { atual: r.kpis.atual.custoPorResultado, anterior: r.kpis.anterior.custoPorResultado }
  if (r.conector === 'google_ads') return { atual: r.kpis.atual.custoPorConversao, anterior: r.kpis.anterior.custoPorConversao }
  return null
}

/**
 * GET /api/clientes/:id/resultados: o cache na hora; com `buscar`, o que estiver vencido começa a busca em segundo
 * plano (`atualizando: true`). Sem chave → sem_chave; sem contas → sem_contas (os dois sem chamar a Windsor).
 */
export function lerResultados(db: Db, clienteId: Id, periodo: PeriodoResultados, opcoes: { buscar: PodeBuscarResultados }): ResultadosCliente {
  const hoje = hojeSP(agoraData())
  const d = periodoDe(periodo, hoje)
  const contas = contasLigadas(db, clienteId)
  const vazio = { clienteId, ...d, contas, atualizando: false, meta: null, googleAds: null, ga4: null, alertas: [] }
  if (!temChave()) return { ...vazio, estado: 'sem_chave' }
  if (contas.length === 0) return { ...vazio, estado: 'sem_contas' }
  const ids = idsPorConector(contas)
  const linhas = new Map<ConectorWindsor, LinhaCache | undefined>()
  for (const conector of ids.keys()) linhas.set(conector, linhaCache(db, clienteId, conector, d))
  const vencidos = [...ids.keys()].filter((c) => vencido(linhas.get(c), ids.get(c)!, d.ate, hoje))
  // a função do MCP só é chamada quando a busca vai mesmo acontecer (cache fresco ou busca já em andamento: não gasta)
  if (vencidos.length > 0 && !memoria(db).buscas.has(chaveBusca(clienteId, d)) && vaiBuscar(opcoes.buscar)) {
    void iniciarBusca(db, clienteId, d, vencidos, null)
  }
  const porConector = new Map<ConectorWindsor, ResultadoConector>()
  for (const [conector, contasIds] of ids) porConector.set(conector, montarConector(conector, contasIds, linhas.get(conector)))
  const alertas = alertasResultados([...porConector.values()].map((r) => ({
    conector: r.conector, estado: r.estado, custo: custoDe(r), ate: d.ate,
    contas: contas.filter((c) => c.conector === r.conector).map((c) => ({ contaId: c.contaId, nome: c.nome })),
    gastoRecente: r.kpis ? gastoDoCache(linhas.get(r.conector)) : null,
  })), hoje)
  return {
    ...vazio, estado: 'ok', atualizando: memoria(db).buscas.has(chaveBusca(clienteId, d)),
    meta: (porConector.get('facebook') as ResultadoMeta | undefined) ?? null,
    googleAds: (porConector.get('google_ads') as ResultadoGoogleAds | undefined) ?? null,
    ga4: (porConector.get('googleanalytics4') as ResultadoGa4 | undefined) ?? null,
    alertas,
  }
}

function gastoDoCache(l: LinhaCache | undefined): GastoRecente | null {
  if (!l?.dados) return null
  return (JSON.parse(l.dados) as Partial<DadosMeta>).gastoRecente ?? null
}

/** Os resultados esperando a busca até `esperarMs` (o provedor do MCP). Passou do tempo: o que houver, `atualizando`. */
export async function resultadosEsperando(db: Db, clienteId: Id, periodo: PeriodoResultados, esperarMs: number,
  buscar: PodeBuscarResultados): Promise<ResultadosCliente> {
  const r = lerResultados(db, clienteId, periodo, { buscar })
  if (!r.atualizando) return r
  const p = memoria(db).buscas.get(chaveBusca(clienteId, periodoDe(periodo, hojeSP(agoraData()))))
  if (p) await esperarAte(p, esperarMs)
  return lerResultados(db, clienteId, periodo, { buscar: false })
}

/**
 * POST /api/clientes/:id/resultados/atualizar: força a busca de todos os conectores (ignora a validade). 1 por cliente
 * a cada 5 min (qualquer período) → 429. Sem chave ou sem contas, nada a buscar.
 */
export function atualizarAgora(db: Db, clienteId: Id, periodo: PeriodoResultados, ator: Ator): { atualizando: boolean } {
  if (!temChave() || contasLigadas(db, clienteId).length === 0) return { atualizando: false }
  const m = memoria(db)
  const agoraMs = Date.parse(agora())
  const ultima = m.atualizadoAgora.get(clienteId)
  if (ultima !== undefined && agoraMs - ultima < ATUALIZAR_A_CADA_MS) {
    const espera = Math.max(1, Math.ceil((ultima + ATUALIZAR_A_CADA_MS - agoraMs) / 1000))
    throw new ErroHttp(429, 'muitas_tentativas', 'Os resultados deste cliente foram atualizados há pouco. Espere um pouco e tente de novo.',
      { tenteEmSegundos: espera })
  }
  m.atualizadoAgora.set(clienteId, agoraMs)
  const d = periodoDe(periodo, hojeSP(agoraData()))
  void iniciarBusca(db, clienteId, d, [...CONECTORES_WINDSOR], ator)
  return { atualizando: true }
}

// ─────────────────────────────── carteira ───────────────────────────────

function linhaPanorama(db: Db, conector: ConectorWindsor, d: DatasPeriodo): LinhaCache | undefined {
  return um<LinhaCache>(db, `SELECT contas, dados, buscado_em, tentado_em, erro FROM resultado_panorama_cache
    WHERE conector = ? AND de = ? AND ate = ? AND de_anterior = ? AND ate_anterior = ?`, conector, d.de, d.ate, d.deAnterior, d.ateAnterior)
}

function gravarPanorama(db: Db, conector: ConectorWindsor, d: DatasPeriodo, contas: readonly string[],
  r: { dados: DadosPanorama } | { erro: ErroWindsor }): void {
  const instante = agora()
  if ('dados' in r) {
    rodar(db, `INSERT INTO resultado_panorama_cache (conector, de, ate, de_anterior, ate_anterior, contas, dados, buscado_em, tentado_em, erro)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
               ON CONFLICT (conector, de, ate, de_anterior, ate_anterior) DO UPDATE SET contas = excluded.contas, dados = excluded.dados,
                 buscado_em = excluded.buscado_em, tentado_em = excluded.tentado_em, erro = NULL`,
    conector, d.de, d.ate, d.deAnterior, d.ateAnterior, JSON.stringify(contas), JSON.stringify(r.dados), instante, instante)
  } else {
    rodar(db, `INSERT INTO resultado_panorama_cache (conector, de, ate, de_anterior, ate_anterior, contas, dados, buscado_em, tentado_em, erro)
               VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
               ON CONFLICT (conector, de, ate, de_anterior, ate_anterior) DO UPDATE SET contas = excluded.contas,
                 dados = CASE WHEN resultado_panorama_cache.contas = excluded.contas THEN resultado_panorama_cache.dados END,
                 buscado_em = CASE WHEN resultado_panorama_cache.contas = excluded.contas THEN resultado_panorama_cache.buscado_em END,
                 tentado_em = excluded.tentado_em, erro = excluded.erro`,
    conector, d.de, d.ate, d.deAnterior, d.ateAnterior, JSON.stringify(contas), instante, r.erro)
  }
}

/** As duas chamadas da carteira para um conector (A com `date` em Meta e Google Ads, para o "parou de gastar"). */
async function buscarPanoramaConector(db: Db, conector: ConectorWindsor, contas: readonly string[], d: DatasPeriodo): Promise<DadosPanorama> {
  const inicioA = [d.de, somarDias(d.ate, -7)].sort()[0]!
  const chamar = (campos: readonly string[], de: DataLocal, ate: DataLocal) => chamarDados(db, pedido(conector, campos, de, ate, contas))
  if (conector === 'googleanalytics4') {
    const [a, b] = await todas<[LinhaWindsor[], LinhaWindsor[]]>([chamar(CAMPOS.panoramaGa4, d.de, d.ate), chamar(CAMPOS.panoramaGa4, d.deAnterior, d.ateAnterior)])
    return { atual: somasPorConta(conector, a), anterior: somasPorConta(conector, b), gastoRecente: {} }
  }
  const [camposA, camposB] = conector === 'facebook'
    ? [CAMPOS.panoramaMetaA, CAMPOS.panoramaMetaB] : [CAMPOS.panoramaGoogleA, CAMPOS.panoramaGoogleB]
  const [a, b] = await todas<[LinhaWindsor[], LinhaWindsor[]]>([chamar(camposA, inicioA, d.ate), chamar(camposB, d.deAnterior, d.ateAnterior)])
  return {
    atual: somasPorConta(conector, linhasEntre(a, d.de, d.ate)), anterior: somasPorConta(conector, b),
    gastoRecente: gastoRecente(a, d.ate),
  }
}

interface LigacaoComSigla { cliente_id: string; sigla: string; conector: ConectorWindsor; conta_id: string; nome: string }

function iniciarPanorama(db: Db, d: DatasPeriodo, conectores: ConectorWindsor[], ids: Map<ConectorWindsor, string[]>): Promise<void> {
  const m = memoria(db)
  const chave = chaveDatas(d)
  const existente = m.panoramas.get(chave)
  if (existente) return existente
  let pronta!: () => void
  const promessa = new Promise<void>((ok) => { pronta = ok })
  m.panoramas.set(chave, promessa)
  const executar = async () => {
    try {
      await Promise.all(conectores.map(async (conector) => {
        const contas = ids.get(conector)!
        try {
          const dados = await buscarPanoramaConector(db, conector, contas, d)
          tx(db, () => gravarPanorama(db, conector, d, contas, { dados }))
        } catch (e) {
          const erro = erroDe(e, `resultados carteira ${conector}`)
          tx(db, () => gravarPanorama(db, conector, d, contas, { erro }))
        }
      }))
    } finally {
      m.panoramas.delete(chave)
      pronta()
    }
  }
  void executar().catch(registrarFalhaMascarada('resultados carteira'))
  return promessa
}

const ZEROS: { [C in ConectorWindsor]: SomasPorConector[C] } = {
  facebook: { investimento: 0, impressoes: 0, cliques: 0, leads: 0, conversas: 0 },
  google_ads: { investimento: 0, impressoes: 0, cliques: 0, conversoes: 0, valorConversoes: 0 },
  googleanalytics4: { usuarios: 0, sessoes: 0, sessoesEngajadas: 0, eventosChave: 0 },
}

/** GET /api/resultados/panorama: uma linha por cliente com conta ligada, por sigla. Mesmas regras de cache da aba. */
export function lerPanorama(db: Db, periodo: PeriodoResultados, opcoes: { buscar: PodeBuscarResultados }): PanoramaResultados {
  const hoje = hojeSP(agoraData())
  const d = periodoDe(periodo, hoje)
  const base = { ...d, atualizando: false, buscadoEm: null, linhas: [] as LinhaPanorama[] }
  if (!temChave()) return { ...base, estado: 'sem_chave' }
  const ligacoes = todos<LigacaoComSigla>(db, `SELECT r.cliente_id, c.sigla, r.conector, r.conta_id, r.nome
    FROM cliente_conta_resultados r JOIN cliente c ON c.id = r.cliente_id ORDER BY c.sigla, r.conector, r.conta_id`)
  const ids = idsPorConector(ligacoes.map((l) => ({ conector: l.conector, contaId: l.conta_id })))
  const linhasCache = new Map<ConectorWindsor, LinhaCache | undefined>()
  for (const c of ids.keys()) linhasCache.set(c, linhaPanorama(db, c, d))
  const vencidos = [...ids.keys()].filter((c) => vencido(linhasCache.get(c), ids.get(c)!, d.ate, hoje))
  if (vencidos.length > 0 && !memoria(db).panoramas.has(chaveDatas(d)) && vaiBuscar(opcoes.buscar)) {
    void iniciarPanorama(db, d, vencidos, ids)
  }

  const dadosPor = new Map<ConectorWindsor, { l: LinhaCache | undefined; dados: DadosPanorama | null }>()
  for (const [c, contas] of ids) {
    const l = linhasCache.get(c)
    const mesmas = !!l && l.contas === JSON.stringify(contas)
    dadosPor.set(c, { l: mesmas ? l : undefined, dados: mesmas && l!.dados ? JSON.parse(l!.dados) as DadosPanorama : null })
  }

  const porCliente = new Map<string, LigacaoComSigla[]>()
  for (const l of ligacoes) porCliente.set(l.cliente_id, [...(porCliente.get(l.cliente_id) ?? []), l])
  const linhas: LinhaPanorama[] = []
  for (const [clienteId, ls] of porCliente) {
    const conectores: LinhaPanorama['conectores'] = []
    const paraAlertas: ConectorParaAlertas[] = []
    for (const conector of CONECTORES_WINDSOR) {
      const doConector = ls.filter((l) => l.conector === conector)
      if (doConector.length === 0) continue
      const contas = [...new Set(doConector.map((l) => l.conta_id))]
      const { l, dados } = dadosPor.get(conector)!
      let estado: ResultadoConector['estado'] = l?.erro ?? 'ok'
      let atual = principaisDeSomas(conector, null)
      let anterior = principaisDeSomas(conector, null)
      if (dados) {
        const a = somarContas(dados.atual as Record<string, SomasPorConector[typeof conector]>, contas)
        const b = somarContas(dados.anterior as Record<string, SomasPorConector[typeof conector]>, contas)
        if (a || b) {
          atual = principaisDeSomas(conector, a ?? ZEROS[conector])
          anterior = principaisDeSomas(conector, b ?? ZEROS[conector])
        } else if (!l?.erro) estado = 'sem_dados'
      }
      conectores.push({ conector, estado, atual, anterior })
      const chaveCusto = conector === 'facebook' ? 'custoPorResultado' : conector === 'google_ads' ? 'custoPorConversao' : null
      paraAlertas.push({
        conector, estado, ate: d.ate, contas: doConector.map((x) => ({ contaId: x.conta_id, nome: x.nome })),
        custo: chaveCusto && dados ? { atual: atual[chaveCusto] ?? null, anterior: anterior[chaveCusto] ?? null } : null,
        gastoRecente: dados?.gastoRecente ?? null,
      })
    }
    linhas.push({ clienteId, sigla: ls[0]!.sigla, conectores, alertas: alertasResultados(paraAlertas, hoje) as AlertaResultado[] })
  }
  const buscados = [...dadosPor.values()].map((x) => x.l?.buscado_em ?? null).filter((x): x is string => !!x).sort()
  return {
    ...base, estado: 'ok', atualizando: memoria(db).panoramas.has(chaveDatas(d)), buscadoEm: buscados[0] ?? null, linhas,
  }
}

/** A carteira esperando a busca até `esperarMs` (o provedor do MCP). */
export async function panoramaEsperando(db: Db, periodo: PeriodoResultados, esperarMs: number,
  buscar: PodeBuscarResultados): Promise<PanoramaResultados> {
  const r = lerPanorama(db, periodo, { buscar })
  if (!r.atualizando) return r
  const p = memoria(db).panoramas.get(chaveDatas(periodoDe(periodo, hojeSP(agoraData()))))
  if (p) await esperarAte(p, esperarMs)
  return lerPanorama(db, periodo, { buscar: false })
}

// ─────────────────────────────── poda ───────────────────────────────

/** Tarefa resultados-poda: cache sem tentativa há 7 dias e o uso de mais de 90 dias. */
export function podarResultados(db: Db): { cache: number; uso: number } {
  const seteDias = new Date(agoraData().getTime() - 7 * 86_400_000).toISOString()
  const noventa = somarDias(hojeSP(agoraData()), -90)
  return tx(db, () => ({
    cache: rodar(db, 'DELETE FROM resultado_cache WHERE tentado_em < ?', seteDias).changes
      + rodar(db, 'DELETE FROM resultado_panorama_cache WHERE tentado_em < ?', seteDias).changes,
    uso: rodar(db, 'DELETE FROM windsor_uso WHERE dia < ?', noventa).changes,
  }))
}
