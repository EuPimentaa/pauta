/**
 * Cliente do tempo real (API §3; PLANO §2): EventSource em /api/eventos?desde=<seq do bootstrap>.
 *
 * - Queda curta: o próprio navegador reconecta em 1 s (o servidor manda `retry: 1000`) com o Last-Event-ID.
 *   Se falhar de novo, este cliente assume com espera crescente de 1 s a 30 s (× 4 com a aba oculta) e reabre com
 *   ?desde=<último seq visto> (o servidor trata os dois do mesmo jeito).
 * - Depois de 3 falhas seguidas do SSE, consulta /api/sync de 5 s a 60 s até o SSE voltar (proxy que segura o fluxo).
 * - `resync` (histórico podado, papel alterado, servidor reiniciado): recarrega o bootstrap. Toda recarga do bootstrap
 *   reaplica os eventos recentes com seq maior que o dele (nada se perde entre a leitura e a chegada).
 * - Ignora o próprio eco (ecoIgnorado), segura os eventos durante um arraste e entrega aos tratadores (vários por
 *   entidade, em ordem de id), cada um isolado: um tratador quebrado não para os outros.
 * - Estado para a faixa "Sem conexão · tentando de novo" em lib/conexao.ts.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { Bootstrap, Entidade, EventoPing, EventoResync, EventoTempoReal, SyncSaida } from '../../../shared/tipos/index.ts'
import { chaves } from '../api/chaves.ts'
import { entregaPausada, ouvirRetomada } from './estado.ts'
import { ecoIgnorado } from './tratar.ts'

export type EstadoLigacao = 'online' | 'reconectando' | 'offline'

/** O que o cliente precisa de um tratador (o mesmo formato de TratadorEventos, extensoes/tipos.ts). */
export interface Tratador {
  id: string
  entidades: readonly Entidade[]
  tratar(evento: EventoTempoReal, qc: QueryClient): void
}

export interface DepsConexao {
  qc: QueryClient
  tratadores(): readonly Tratador[]
  meuTrace(t: string | null): boolean
  definirEstado(e: EstadoLigacao): void
  sync(desde: number): Promise<SyncSaida>
  /** Padrão: o EventSource do navegador. */
  abrirFluxo?(url: string): EventSource
}

export const ESPERA_SSE = { min: 1000, max: 30_000, ocultaVezes: 4 } as const
export const ESPERA_SYNC = { min: 5000, max: 60_000 } as const
const FALHAS_PARA_SYNC = 3
const RECENTES_MAX = 400
// readyState do EventSource (os números do padrão; sem depender do global, que o Node não tem)
const CONECTANDO = 0
const ABERTO = 1

/** Espera da n-ésima tentativa (1, 2, 4… s até o teto), × 4 com a aba oculta. */
export function esperaDaTentativa(n: number, oculta: boolean): number {
  const base = Math.min(ESPERA_SSE.max, ESPERA_SSE.min * 2 ** Math.max(0, n - 1))
  return base * (oculta ? ESPERA_SSE.ocultaVezes : 1)
}

const abaOculta = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
const semRede = () => typeof navigator !== 'undefined' && navigator.onLine === false

export function conectarTempoReal(deps: DepsConexao, seqInicial: number): () => void {
  const { qc } = deps
  let ultimoSeq = seqInicial
  let fluxo: EventSource | null = null
  let falhas = 0
  let timerSse: ReturnType<typeof setTimeout> | null = null
  let timerSync: ReturnType<typeof setTimeout> | null = null
  let esperaSync: number = ESPERA_SYNC.min
  let consultando = false
  let parado = false
  const fila: EventoTempoReal[] = []
  const recentes: EventoTempoReal[] = []

  function entregar(ev: EventoTempoReal) {
    if (ecoIgnorado(qc, ev, deps.meuTrace)) return
    for (const t of deps.tratadores()) {
      if (!t.entidades.includes(ev.e)) continue
      try {
        t.tratar(ev, qc)
      } catch (e) {
        console.error(`[tempo real] o tratador ${t.id} falhou no evento ${ev.e} #${ev.s}`, e)
      }
    }
  }

  function receber(ev: EventoTempoReal) {
    if (ev.s <= ultimoSeq) return
    ultimoSeq = ev.s
    recentes.push(ev)
    if (recentes.length > RECENTES_MAX) recentes.splice(0, recentes.length - RECENTES_MAX)
    if (entregaPausada()) fila.push(ev)
    else entregar(ev)
  }

  const pararRetomada = ouvirRetomada(() => {
    const lote = fila.splice(0)
    for (const ev of lote) entregar(ev)
  })

  // bootstrap recarregado (resync, quadro restaurado): reaplica o que chegou depois do seq dele
  const pararCache = qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success' || e.action.manual) return
    if (e.query.queryKey[0] !== chaves.bootstrap[0] || e.query.queryKey.length !== 1) return
    const b = e.query.state.data as Bootstrap | undefined
    if (!b) return
    for (const ev of recentes) if (ev.s > b.seq) entregar(ev)
  })

  function recarregar() {
    void qc.invalidateQueries({ queryKey: chaves.bootstrap, refetchType: 'all' })
  }

  // ─────────── SSE ───────────

  function abrir() {
    if (parado) return
    timerSse = null
    const url = `/api/eventos?desde=${ultimoSeq}`
    const es = deps.abrirFluxo ? deps.abrirFluxo(url) : new EventSource(url, { withCredentials: true })
    fluxo = es
    es.addEventListener('open', () => {
      if (fluxo !== es) return
      falhas = 0
      pararSync()
      deps.definirEstado('online')
    })
    es.addEventListener('d', (m) => {
      if (fluxo !== es) return
      try { receber(JSON.parse((m as MessageEvent<string>).data) as EventoTempoReal) } catch (e) { console.error('[tempo real] evento ilegível', e) }
    })
    es.addEventListener('resync', (m) => {
      if (fluxo !== es) return
      let motivo = '?'
      try { motivo = (JSON.parse((m as MessageEvent<string>).data) as EventoResync).motivo } catch { /* sem corpo */ }
      console.info(`[tempo real] resync (${motivo}): recarregando o bootstrap`)
      recarregar()
    })
    es.addEventListener('ping', (m) => {
      if (fluxo !== es) return
      try {
        // o seq do ping é o atual do servidor: o que veio antes dele e não chegou aqui não era para esta pessoa
        const { seq } = JSON.parse((m as MessageEvent<string>).data) as EventoPing
        if (seq > ultimoSeq) ultimoSeq = seq
      } catch { /* ping sem corpo */ }
    })
    es.addEventListener('error', () => {
      if (fluxo !== es) return
      // primeira queda: o navegador tenta de novo sozinho em 1 s, mandando o Last-Event-ID
      if (es.readyState === CONECTANDO && falhas === 0) {
        falhas = 1
        deps.definirEstado(semRede() ? 'offline' : 'reconectando')
        return
      }
      es.close()
      fluxo = null
      falhas++
      deps.definirEstado(semRede() ? 'offline' : 'reconectando')
      if (falhas >= FALHAS_PARA_SYNC) iniciarSync()
      agendarSse(esperaDaTentativa(falhas - 1, abaOculta()))
    })
  }

  function agendarSse(ms: number) {
    if (parado || timerSse) return
    timerSse = setTimeout(abrir, ms * (0.85 + Math.random() * 0.3))
  }

  /** Volta já (a rede voltou, a aba apareceu): sem esperar o resto da espera. */
  function reconectarJa() {
    if (parado || fluxo) return
    if (timerSse) { clearTimeout(timerSse); timerSse = null }
    abrir()
  }

  // ─────────── polling ───────────

  function iniciarSync() {
    if (parado || timerSync || consultando) return
    esperaSync = ESPERA_SYNC.min
    timerSync = setTimeout(consultar, esperaSync)
  }

  function pararSync() {
    if (timerSync) { clearTimeout(timerSync); timerSync = null }
  }

  async function consultar() {
    timerSync = null
    if (parado || fluxo?.readyState === ABERTO) return
    consultando = true
    try {
      const r = await deps.sync(ultimoSeq)
      if (r.resync) {
        ultimoSeq = Math.max(ultimoSeq, r.seq)
        recarregar()
      } else {
        for (const ev of r.eventos) receber(ev)
        if (r.seq > ultimoSeq) ultimoSeq = r.seq
      }
      if (!fluxo || fluxo.readyState !== ABERTO) deps.definirEstado('online')
      esperaSync = r.resync || r.eventos.length ? ESPERA_SYNC.min : Math.min(ESPERA_SYNC.max, esperaSync * 1.5)
    } catch {
      deps.definirEstado(semRede() ? 'offline' : 'reconectando')
      esperaSync = Math.min(ESPERA_SYNC.max, esperaSync * 1.5)
    } finally {
      consultando = false
    }
    if (!parado && (!fluxo || fluxo.readyState !== ABERTO)) timerSync = setTimeout(consultar, esperaSync)
  }

  // ─────────── rede e aba ───────────

  const aoVoltarRede = () => reconectarJa()
  const aoMudarAba = () => { if (!abaOculta()) reconectarJa() }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', aoVoltarRede)
    document.addEventListener('visibilitychange', aoMudarAba)
  }

  abrir()

  return () => {
    parado = true
    fluxo?.close()
    fluxo = null
    if (timerSse) clearTimeout(timerSse)
    pararSync()
    pararRetomada()
    pararCache()
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', aoVoltarRede)
      document.removeEventListener('visibilitychange', aoMudarAba)
    }
  }
}
