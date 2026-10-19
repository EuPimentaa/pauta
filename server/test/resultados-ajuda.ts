/**
 * Ajuda dos testes dos resultados (F8): um servidor falso da Windsor (node:http em 127.0.0.1) que serve as fixtures da
 * pesquisa como a REST serviria, os casos de erro medidos e documentados, e a captura do log.
 *
 * Contas especiais (em select_accounts) e o comportamento de cada uma:
 * | conta | resposta |
 * |---|---|
 * | as das fixtures (CONTAS_FIXTURE) | as linhas da fixture com data no intervalo, agregadas pelos campos pedidos |
 * | CONTA_SEM_DADOS | `{"data":[]}` |
 * | CONTA_429 | 429 rate_limit_exceeded (com cabeçalhos de cota) |
 * | CONTA_500 | 500 server_error |
 * | CONTA_302 | 302 para outro endereço do servidor falso (que conta se alguém seguiu) |
 * | CONTA_LENTA | responde depois de 2 s (o teste encurta o limite) |
 * | CONTA_NAO_CONECTADA | 400 user_error "None of the selected accounts are connected…" (o formato não foi medido) |
 * | CONTA_INVALIDA | 200 com um corpo fora do formato |
 * | CONTA_NORONHA | as linhas da Meta de um dia depois (conta noutro fuso devolvendo um dia fora do pedido) |
 * Chave CHAVE_ERRADA: 400 user_error com a chave em claro no texto (o caso medido).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ConectorWindsor } from '../../shared/tipos/index.ts'
import type { LinhaWindsor } from '../../shared/tipos/ext/resultados.ts'
import { somarDias } from '../../shared/logica/datas.ts'
import { agregar, CONTAS_FIXTURE, lerFixture } from '../src/servicos/resultados-fixtures.ts'

export { CONTAS_FIXTURE }
/** Uma chave com caracteres que mudam ao codificar (para conferir as duas formas). */
export const CHAVE_BOA = 'Kx9+Windsor/Teste=2026abc'
export const CHAVE_ERRADA = 'Errada+Chave/Vazada=777xyz'
export const CONTA_SEM_DADOS = '1000000000000888'
export const CONTA_429 = '1000000000000429'
export const CONTA_500 = '1000000000000500'
export const CONTA_302 = '1000000000000302'
export const CONTA_LENTA = '1000000000000777'
export const CONTA_NAO_CONECTADA = '1000000000000999'
export const CONTA_INVALIDA = '1000000000000111'
export const CONTA_NORONHA = '1000000000000002'

const ARQUIVO_DIARIO: Record<ConectorWindsor, string> = {
  facebook: 'meta-diario-campanha.json', google_ads: 'google-ads-diario-campanha.json', googleanalytics4: 'ga4-diario.json',
}
const DEDUPLICADOS = new Set(['reach', 'active_users', 'newusers', 'totalusers'])

export interface PedidoFalso {
  conector: string
  /** Query sem a chave. */
  params: Record<string, string>
  /** A chave que veio (para conferir que ela vai só na query). */
  chave: string | null
  headers: Record<string, string | string[] | undefined>
}

export interface WindsorFalsa {
  /** Base para definirEnderecosWindsor({ dados, contas }). */
  dados: string
  contas: string
  pedidos: PedidoFalso[]
  /** Quantas vezes alguém foi ao destino do 302. */
  seguiuRedirecionamento: number
  /** ds-accounts devolve [] (força o caminho do endpoint de dados). */
  contasVazias: boolean
  fechar(): Promise<void>
}

function responder(res: ServerResponse, status: number, corpo: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
}

/** As linhas da fixture do conector para as contas, no intervalo, agregadas pelos campos pedidos. */
function linhasFixture(conector: ConectorWindsor, campos: string[], de: string, ate: string, contas: string[]): LinhaWindsor[] {
  const base = lerFixture<{ data: LinhaWindsor[] }>(ARQUIVO_DIARIO[conector]).data
  let linhas: LinhaWindsor[] = []
  if (contas.length === 0 || contas.includes(CONTAS_FIXTURE[conector])) linhas.push(...base)
  if (campos.includes('event_name')) {
    if (!contas.includes(CONTAS_FIXTURE.googleanalytics4) || de !== '2026-10-12' || ate !== '2026-10-18') return []
    return agregar(lerFixture<{ data: LinhaWindsor[] }>('ga4-eventos-chave.json').data, campos)
  }
  const comData = campos.includes('date')
  linhas = linhas.filter((l) => String(l.date) >= de && String(l.date) <= ate)
  // a conta noutro fuso devolve os dias da fixture um dia depois, inclusive um dia fora do pedido (não filtra)
  if (conector === 'facebook' && contas.includes(CONTA_NORONHA) && comData) {
    linhas.push(...base.filter((l) => String(l.date) >= somarDias(de, -1) && String(l.date) < ate)
      .map((l) => ({ ...l, account_id: CONTA_NORONHA, account_name: 'Conta em Noronha', date: somarDias(String(l.date), 1) })))
    linhas.push(...base.filter((l) => l.date === ate)
      .map((l) => ({ ...l, account_id: CONTA_NORONHA, account_name: 'Conta em Noronha', date: somarDias(ate, 1) })))
  }
  if (comData) return agregar(linhas, campos)
  // sem date: somas exatas por conta e os deduplicados do total da fixture (só no período dela)
  const porConta = agregar(linhas, ['account_id', ...campos.filter((c) => c !== 'account_id')])
  const total = conector === 'facebook' ? lerFixture<{ data: LinhaWindsor[] }>('meta-total-periodo.json').data[0]
    : conector === 'googleanalytics4' ? lerFixture<{ data: LinhaWindsor[] }>('ga4-total-periodo.json').data[0] : undefined
  for (const l of porConta) {
    for (const c of campos) {
      if (!DEDUPLICADOS.has(c)) continue
      l[c] = total && l.account_id === CONTAS_FIXTURE[conector] && de === '2026-10-12' && ate === '2026-10-18' && typeof total[c] === 'number'
        ? total[c] as number : null
    }
  }
  return agregar(porConta, campos)
}

export async function windsorFalsa(): Promise<WindsorFalsa> {
  const estado = { pedidos: [] as PedidoFalso[], seguiu: 0, contasVazias: false }
  const servidor = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/destino-do-302') {
      estado.seguiu++
      responder(res, 200, { data: [] })
      return
    }
    const chave = url.searchParams.get('api_key')
    const params = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'api_key'))
    if (url.pathname === '/api/common/ds-accounts') {
      estado.pedidos.push({ conector: `ds-accounts:${params.datasource}`, params, chave, headers: req.headers })
      if (chave !== CHAVE_BOA || estado.contasVazias) { responder(res, 200, []); return }
      const todas = lerFixture<{ datasource: string; account_id: string; account_name: string; status: string }[]>('contas-ds-accounts.json')
      responder(res, 200, [
        ...todas.filter((c) => c.datasource === params.datasource),
        ...(params.datasource === 'facebook' ? [
          { datasource: 'facebook', account_name: 'Com act‮', account_id: 'act_1000000000000777', status: 'active' },
          { datasource: 'facebook', account_name: 'Id estranho', account_id: '../../x', status: 'active' },
        ] : []),
      ])
      return
    }
    const conector = url.pathname.replace(/^\//, '') as ConectorWindsor
    estado.pedidos.push({ conector, params, chave, headers: req.headers })
    if (!chave) { responder(res, 400, { code: 'unauthorized', error: 'Not authorized' }); return }
    if (chave !== CHAVE_BOA) { responder(res, 400, { error: `Please check the API key used: ${chave}`, code: 'user_error' }); return }
    const contas = (params.select_accounts ?? '').split(',').filter(Boolean)
    if (contas.includes(CONTA_429)) {
      responder(res, 429, { error: { code: 'rate_limit_exceeded', message: `limite da chave ${chave}` } }, { 'X-RateLimit-Remaining': '0' })
      return
    }
    if (contas.includes(CONTA_500)) { responder(res, 500, { error: { code: 'server_error', message: `falhou ${req.url}` } }); return }
    if (contas.includes(CONTA_302)) {
      res.writeHead(302, { Location: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/destino-do-302?api_key=${chave}` })
      res.end()
      return
    }
    if (contas.includes(CONTA_NAO_CONECTADA)) {
      responder(res, 400, { error: `None of the selected accounts are connected. Connected accounts: ${CONTAS_FIXTURE.facebook}`, code: 'user_error' })
      return
    }
    if (contas.includes(CONTA_INVALIDA)) { responder(res, 200, { data: [{ spend: 'muito', date: '2026-10-12' }] }); return }
    if (contas.includes(CONTA_LENTA)) {
      const t = setTimeout(() => responder(res, 200, { data: [] }), 2000)
      res.on('close', () => clearTimeout(t))
      return
    }
    if (contas.includes(CONTA_SEM_DADOS) && contas.length === 1) { responder(res, 200, { data: [] }); return }
    const campos = (params.fields ?? '').split(',').filter(Boolean)
    let linhas = linhasFixture(conector, campos, params.date_from ?? '', params.date_to ?? '', contas)
    if (params.filter) {
      const filtro = JSON.parse(params.filter) as [string, string, number][]
      linhas = linhas.filter((l) => filtro.every(([c, op, v]) => op !== 'gt' || (typeof l[c] === 'number' && (l[c] as number) > v)))
    }
    responder(res, 200, { data: linhas })
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  const porta = (servidor.address() as AddressInfo).port
  const falsa: WindsorFalsa = {
    dados: `http://127.0.0.1:${porta}`,
    contas: `http://127.0.0.1:${porta}/api/common/ds-accounts`,
    get pedidos() { return estado.pedidos },
    get seguiuRedirecionamento() { return estado.seguiu },
    get contasVazias() { return estado.contasVazias },
    set contasVazias(v: boolean) { estado.contasVazias = v },
    fechar: () => new Promise<void>((ok) => { servidor.closeAllConnections(); servidor.close(() => ok()) }),
  }
  return falsa
}

// ─────────────────────────────── log ───────────────────────────────

/** Captura console.log/warn/error enquanto `fn` roda (e devolve as linhas). */
export async function capturarLog<T>(fn: () => Promise<T> | T): Promise<{ valor: T; linhas: string[] }> {
  const linhas: string[] = []
  const originais = { log: console.log, warn: console.warn, error: console.error }
  const guardar = (...a: unknown[]) => { linhas.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}\n${x.stack ?? ''}` : String(x))).join(' ')) }
  console.log = guardar
  console.warn = guardar
  console.error = guardar
  try {
    return { valor: await fn(), linhas }
  } finally {
    Object.assign(console, originais)
  }
}

/** As formas de um segredo que não podem aparecer (em claro, codificada e em outra caixa). */
export function formasDe(segredo: string): string[] {
  return [...new Set([segredo, encodeURIComponent(segredo), segredo.toUpperCase(), segredo.toLowerCase(),
    encodeURIComponent(segredo).toLowerCase()])]
}

/** Falha o teste se algum dos segredos aparecer no texto. */
export function semSegredo(texto: string, segredos: readonly string[]): string | null {
  const t = texto.toLowerCase()
  for (const s of segredos) for (const f of formasDe(s)) if (t.includes(f.toLowerCase())) return f
  return null
}
