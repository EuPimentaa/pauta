/**
 * Fase 2 (F8), só desenvolvimento: `WINDSOR_API_KEY=fixtures` (ignorado com NODE_ENV=production) faz a busca da Windsor
 * ler as fixtures da pesquisa (server/test/fixtures/resultados/, cópias de docs/fase2/fixtures-windsor/) em vez da rede,
 * para o roteiro de navegador sem a chave real (FASE2-PLANO §1).
 *
 * Os 7 dias das fixtures (12/10 a 18/10/2026) se repetem por qualquer período pedido, com um fator suave por dia (para o
 * período anterior não sair igual ao atual) e um fator por conta (as contas de contas-demo.json reaproveitam os números
 * da conta da fixture). As linhas são agregadas pelas dimensões pedidas, como a Windsor faz: sem `date`, alcance e
 * usuários saem deduplicados (menores que a soma dos dias). Conta com status "paused" não tem dados (`data: []`).
 * `agregar` também serve ao servidor falso dos testes.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ConectorWindsor, DataLocal } from '../../../shared/tipos/index.ts'
import type { LinhaWindsor } from '../../../shared/tipos/ext/resultados.ts'
import { diasEntre, somarDias } from '../../../shared/logica/datas.ts'
import { diasDe } from '../../../shared/logica/resultados-periodo.ts'
import type { BuscaWindsor, ContaDaLista, PedidoDados } from './resultados-windsor.ts'

export const PASTA_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'resultados')

/** As contas das fixtures da pesquisa (uma por conector). */
export const CONTAS_FIXTURE: Record<ConectorWindsor, string> = {
  facebook: '1000000000000001', google_ads: '000-000-0001', googleanalytics4: '100000001',
}
const DIA_BASE: DataLocal = '2026-10-12'

/** Dimensões (texto); o resto é número. */
const DIMENSOES = new Set(['date', 'account_id', 'account_name', 'account_currency', 'currency', 'campaign_id', 'campaign',
  'objective', 'advertising_channel_type', 'campaign_status', 'event_name'])
const DEDUPLICADOS = new Set(['reach', 'active_users', 'newusers', 'totalusers'])
/** Números que não se somam nem se escalam (médias e razões). */
const MEDIAS = new Set(['average_session_duration', 'ctr', 'cpc', 'engagement_rate', 'frequency', 'cost_per_conversion', 'roas',
  'conversions_value_per_cost', 'purchase_roas_omni_purchase'])
const DECIMAIS = new Set(['spend', 'conversions_value', 'action_values_omni_purchase'])

const cache = new Map<string, unknown>()
export function lerFixture<T>(nome: string): T {
  if (!cache.has(nome)) cache.set(nome, JSON.parse(readFileSync(join(PASTA_FIXTURES, nome), 'utf8')) as unknown)
  return cache.get(nome) as T
}

const dadosDe = (nome: string) => lerFixture<{ data: LinhaWindsor[] }>(nome).data

/**
 * Agrega linhas pelas dimensões pedidas (as de `campos` que são texto), somando os números pedidos (null + null = null;
 * null conta 0 com um número), como a Windsor faz com os campos numéricos.
 */
export function agregar(linhas: readonly LinhaWindsor[], campos: readonly string[]): LinhaWindsor[] {
  const dims = campos.filter((c) => DIMENSOES.has(c))
  const grupos = new Map<string, LinhaWindsor>()
  for (const l of linhas) {
    const chave = JSON.stringify(dims.map((d) => l[d] ?? null))
    let g = grupos.get(chave)
    if (!g) {
      g = {}
      for (const c of campos) g[c] = DIMENSOES.has(c) ? (l[c] ?? null) : null
      grupos.set(chave, g)
    }
    for (const c of campos) {
      if (DIMENSOES.has(c)) continue
      const v = l[c]
      if (typeof v !== 'number') continue
      g[c] = MEDIAS.has(c) && typeof g[c] === 'number' ? g[c] : Math.round(((g[c] as number | null) ?? 0) * 1e4 + v * 1e4) / 1e4
    }
  }
  return [...grupos.values()]
}

// ─────────────────────────────── contas ───────────────────────────────

interface ContaFixture { datasource: string; account_name: string; account_id: string; status: string }

function todasAsContas(): ContaFixture[] {
  return [...lerFixture<ContaFixture[]>('contas-ds-accounts.json'), ...lerFixture<ContaFixture[]>('contas-demo.json')]
}

function contaFixture(conector: ConectorWindsor, id: string): ContaFixture | undefined {
  return todasAsContas().find((c) => c.datasource === conector && c.account_id === id)
}

function fatorConta(conector: ConectorWindsor, id: string): number {
  if (id === CONTAS_FIXTURE[conector]) return 1
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 1000
  return 0.35 + (h % 100) / 55
}

function fatorDia(d: DataLocal): number {
  const k = diasEntre('2026-01-01', d)
  return 1 + 0.2 * Math.sin((2 * Math.PI * k) / 35) + 0.07 * Math.sin((2 * Math.PI * k) / 9)
}

// ─────────────────────────────── linhas por dia ───────────────────────────────

const ARQUIVO_DIARIO: Record<ConectorWindsor, string> = {
  facebook: 'meta-diario-campanha.json', google_ads: 'google-ads-diario-campanha.json', googleanalytics4: 'ga4-diario.json',
}

function escalar(campo: string, v: number, f: number, conector: ConectorWindsor): number {
  if (MEDIAS.has(campo)) return v
  if (DECIMAIS.has(campo) || (campo === 'conversions' && conector === 'google_ads')) return Math.round(v * f * 1e4) / 1e4
  return Math.round(v * f)
}

/** As linhas diárias (por campanha, quando houver) de uma conta entre `de` e `ate`. */
function linhasDaConta(conector: ConectorWindsor, conta: string, de: DataLocal, ate: DataLocal): LinhaWindsor[] {
  const info = contaFixture(conector, conta)
  if (info?.status === 'paused') return []
  const base = dadosDe(ARQUIVO_DIARIO[conector])
  const fConta = fatorConta(conector, conta)
  const saida: LinhaWindsor[] = []
  for (const d of diasDe(de, ate)) {
    const i = ((diasEntre(DIA_BASE, d) % 7) + 7) % 7
    const origem = somarDias(DIA_BASE, i)
    const f = fatorDia(d) * fConta
    for (const l of base) {
      if (l.date !== origem) continue
      const nova: LinhaWindsor = { ...l, date: d, account_id: conta, account_name: info?.account_name ?? `Conta ${conta}` }
      for (const [k, v] of Object.entries(l)) if (typeof v === 'number') nova[k] = escalar(k, v, f, conector)
      saida.push(nova)
    }
  }
  return saida
}

/** Total deduplicado de um campo (alcance, usuários) a partir da soma dos dias: a razão da fixture, menor em períodos longos. */
function razaoDedup(conector: ConectorWindsor, campo: string, dias: number): number {
  const total = conector === 'facebook' ? dadosDe('meta-total-periodo.json')[0] : dadosDe('ga4-total-periodo.json')[0]
  const soma = dadosDe(ARQUIVO_DIARIO[conector]).reduce((s, l) => s + (typeof l[campo] === 'number' ? (l[campo] as number) : 0), 0)
  const r7 = typeof total?.[campo] === 'number' && soma > 0 ? (total[campo] as number) / soma : 0.9
  return Math.max(0.3, Math.min(1, r7 * (7 / Math.max(1, dias)) ** 0.12))
}

function aplicarFiltro(linhas: LinhaWindsor[], filtro: unknown): LinhaWindsor[] {
  if (!Array.isArray(filtro)) return linhas
  return linhas.filter((l) => filtro.every((c) => {
    if (!Array.isArray(c) || c.length !== 3) return true
    const [campo, op, valor] = c as [string, string, number]
    const v = l[campo]
    return op !== 'gt' || (typeof v === 'number' && v > valor)
  }))
}

function contasDoPedido(p: PedidoDados): string[] {
  if (p.contas.length > 0) return [...p.contas]
  return todasAsContas().filter((c) => c.datasource === p.conector).map((c) => c.account_id)
}

export const buscaFixtures: BuscaWindsor = {
  async dados(p) {
    const contas = contasDoPedido(p)
    const dias = diasEntre(p.de, p.ate) + 1
    if (p.campos.includes('event_name')) {
      const linhas: LinhaWindsor[] = []
      const baseConv = dadosDe('ga4-diario.json').reduce((s, l) => s + (typeof l.conversions === 'number' ? l.conversions : 0), 0)
      for (const conta of contas) {
        const doPeriodo = linhasDaConta(p.conector, conta, p.de, p.ate).reduce((s, l) => s + (typeof l.conversions === 'number' ? l.conversions : 0), 0)
        for (const e of dadosDe('ga4-eventos-chave.json')) {
          linhas.push({ event_name: e.event_name, conversions: Math.round((e.conversions as number) * (doPeriodo / baseConv)) })
        }
      }
      return aplicarFiltro(agregar(linhas, p.campos), p.filtro)
    }
    const porConta = contas.map((conta) => ({ conta, linhas: linhasDaConta(p.conector, conta, p.de, p.ate) }))
    if (!p.campos.includes('date')) {
      // sem date: uma linha por conta (deduplicados pela razão da fixture), depois as dimensões pedidas
      const linhas: LinhaWindsor[] = []
      for (const { conta, linhas: ls } of porConta) {
        if (ls.length === 0) continue
        const [soma] = agregar(ls, ['account_id', 'account_name', ...p.campos.filter((c) => !DIMENSOES.has(c))])
        for (const c of p.campos) if (DEDUPLICADOS.has(c) && typeof soma![c] === 'number') soma![c] = Math.round((soma![c] as number) * razaoDedup(p.conector, c, dias))
        linhas.push({ ...soma!, account_id: conta })
      }
      return aplicarFiltro(agregar(linhas, p.campos), p.filtro)
    }
    return aplicarFiltro(agregar(porConta.flatMap((x) => x.linhas), p.campos), p.filtro)
  },
  async contas(conector) {
    return todasAsContas().filter((c) => c.datasource === conector)
      .map((c): ContaDaLista => ({ contaId: c.account_id, nome: c.account_name, status: c.status }))
  },
}
