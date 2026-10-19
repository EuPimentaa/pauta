/**
 * Resultados da Windsor (F8): o provedor do MCP (FASE2-PLANO §5: espera até `esperarMs`, `buscar: false` = só o cache,
 * o texto dos alertas igual ao da API), a poda diária e as regras da migração 120.
 */
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { configurar, config } from '../src/config.ts'
import { rodar, todos, um } from '../src/db.ts'
import { provedor } from '../src/provedores/resultados.ts'
import { esperarBuscas, podarResultados } from '../src/servicos/resultados.ts'
import { definirBuscaWindsor, definirEnderecosWindsor, type BuscaWindsor } from '../src/servicos/resultados-windsor.ts'
import { buscaFixtures } from '../src/servicos/resultados-fixtures.ts'
import { executarTarefa } from '../src/tarefas.ts'
import { tarefa } from '../src/tarefas/resultados-poda.ts'
import { ambiente, type Ambiente } from './ajuda.ts'
import { capturarLog, CHAVE_BOA, CONTA_NAO_CONECTADA, CONTAS_FIXTURE, windsorFalsa, type WindsorFalsa } from './resultados-ajuda.ts'

let falsa: WindsorFalsa
let env: Ambiente
const chaveAntes = config.windsorApiKey

before(async () => { falsa = await windsorFalsa() })
after(async () => {
  definirEnderecosWindsor()
  definirBuscaWindsor()
  configurar({ windsorApiKey: chaveAntes })
  await falsa.fechar()
})
beforeEach(async () => {
  env = await ambiente()
  env.relogio('2026-10-19T13:00:00.000Z')
  configurar({ windsorApiKey: CHAVE_BOA })
  definirEnderecosWindsor({ dados: falsa.dados, contas: falsa.contas, limiteMs: 400 })
  definirBuscaWindsor()
  falsa.pedidos.length = 0
})
afterEach(async () => {
  await capturarLog(() => esperarBuscas(env.db))
  definirBuscaWindsor()
})

async function ligar(conector: string, contaId: string, nome = 'Conta'): Promise<void> {
  const r = await env.como(env.pessoas.am).post(`/api/clientes/${env.clientes.he.id}/resultados/contas`, { conector, contaId, nome })
  assert.equal(r.status, 201, r.texto)
}

/** A busca do servidor falso, atrasada. */
function lenta(ms: number): BuscaWindsor {
  return {
    dados: async (p) => { await new Promise((ok) => setTimeout(ok, ms)); return buscaFixtures.dados(p) },
    contas: async () => [],
  }
}

describe('provedor de resultados do MCP', () => {
  test('tipo e espera: com cache vazio, busca e devolve os números na mesma chamada', async () => {
    assert.equal(provedor.tipo, 'resultados')
    for (const [conector, contaId] of Object.entries(CONTAS_FIXTURE)) await ligar(conector, contaId)
    const r = await provedor.resultados(env.db, { clienteId: env.clientes.he.id, periodo: '7d', esperarMs: 5000, buscar: true })
    assert.equal(r.atualizando, false)
    assert.equal(r.meta!.kpis!.atual.alcance, 62268)
    assert.equal(r.ga4!.kpis!.atual.usuarios, 1124)
    const c = await provedor.panorama(env.db, { periodo: '7d', esperarMs: 5000, buscar: true })
    assert.equal(c.atualizando, false)
    assert.equal(c.linhas[0]!.sigla, 'HE')
    assert.equal(c.linhas[0]!.conectores[0]!.atual.investimento !== null, true)
  })

  test('passou do tempo: devolve o que houver com atualizando: true; a busca termina depois', async () => {
    await ligar('facebook', CONTAS_FIXTURE.facebook)
    definirBuscaWindsor(lenta(300))
    const r = await provedor.resultados(env.db, { clienteId: env.clientes.he.id, periodo: '7d', esperarMs: 20, buscar: true })
    assert.equal(r.atualizando, true)
    assert.equal(r.meta!.kpis, null)
    await esperarBuscas(env.db)
    const depois = await provedor.resultados(env.db, { clienteId: env.clientes.he.id, periodo: '7d', esperarMs: 20, buscar: true })
    assert.equal(depois.atualizando, false)
    assert.ok(depois.meta!.kpis)
  })

  test('buscar: false → só o cache, sem chamar a Windsor', async () => {
    await ligar('facebook', CONTAS_FIXTURE.facebook)
    const r = await provedor.resultados(env.db, { clienteId: env.clientes.he.id, periodo: '30d', esperarMs: 1000, buscar: false })
    assert.equal(r.atualizando, false)
    assert.equal(r.meta!.kpis, null)
    const c = await provedor.panorama(env.db, { periodo: '30d', esperarMs: 1000, buscar: false })
    assert.equal(c.atualizando, false)
    assert.equal(falsa.pedidos.length, 0)
  })

  test('o texto dos alertas é o mesmo na API e no provedor', async () => {
    await ligar('google_ads', CONTA_NAO_CONECTADA, 'Desconectada')
    const { valor } = await capturarLog(async () => {
      const p = await provedor.resultados(env.db, { clienteId: env.clientes.he.id, periodo: '7d', esperarMs: 5000, buscar: true })
      const api = (await env.como(env.pessoas.design).get(`/api/clientes/${env.clientes.he.id}/resultados?periodo=7d`)).corpo
      const carteira = await provedor.panorama(env.db, { periodo: '7d', esperarMs: 5000, buscar: true })
      return { p, api, carteira }
    })
    assert.equal(valor.p.alertas.length, 1)
    assert.deepEqual(valor.api.alertas, valor.p.alertas)
    assert.deepEqual(valor.carteira.linhas[0]!.alertas, valor.p.alertas)
  })
})

describe('poda e migração 120', () => {
  test('resultados-poda (03:40): cache sem tentativa há 7 dias e uso de mais de 90 dias', async () => {
    assert.equal(tarefa.nome, 'resultados-poda')
    assert.equal(tarefa.horario, '03:40')
    const he = env.clientes.he.id
    const cache = `INSERT INTO resultado_cache (cliente_id, conector, de, ate, de_anterior, ate_anterior, contas, tentado_em)
                   VALUES (?, 'facebook', ?, '2026-10-18', '2026-10-01', '2026-10-01', '[]', ?)`
    rodar(env.db, cache, he, '2026-10-12', '2026-10-11T12:00:00.000Z')
    rodar(env.db, cache, he, '2026-10-13', '2026-10-13T12:00:00.000Z')
    rodar(env.db, `INSERT INTO resultado_panorama_cache (conector, de, ate, de_anterior, ate_anterior, contas, tentado_em)
                   VALUES ('google_ads', '2026-10-12', '2026-10-18', '2026-10-05', '2026-10-11', '[]', '2026-10-01T00:00:00.000Z')`)
    rodar(env.db, "INSERT INTO windsor_uso (dia, chamadas) VALUES ('2026-07-20', 5), ('2026-07-21', 5)")
    assert.equal(await capturarLog(() => executarTarefa(env.db, tarefa)).then((x) => x.valor), true)
    assert.deepEqual(todos<{ de: string }>(env.db, 'SELECT de FROM resultado_cache').map((l) => l.de), ['2026-10-13'])
    assert.equal(um<{ n: number }>(env.db, 'SELECT count(*) n FROM resultado_panorama_cache')!.n, 0)
    assert.deepEqual(todos<{ dia: string }>(env.db, 'SELECT dia FROM windsor_uso').map((l) => l.dia), ['2026-07-21'])
    assert.deepEqual(podarResultados(env.db), { cache: 0, uso: 0 })
  })

  test('as regras das tabelas novas (CHECK)', () => {
    const falha = (sql: string, ...p: unknown[]) => assert.throws(() => rodar(env.db, sql, ...p), /CHECK constraint failed/, sql)
    falha(`INSERT INTO resultado_panorama_cache (conector, de, ate, de_anterior, ate_anterior, contas, tentado_em)
           VALUES ('tiktok', '2026-10-12', '2026-10-18', '2026-10-05', '2026-10-11', '[]', 'x')`)
    falha(`INSERT INTO resultado_panorama_cache (conector, de, ate, de_anterior, ate_anterior, contas, tentado_em)
           VALUES ('facebook', '2026-10-12', '2026-10-18', '2026-10-05', '2026-10-12', '[]', 'x')`)
    falha(`INSERT INTO resultado_panorama_cache (conector, de, ate, de_anterior, ate_anterior, contas, dados, tentado_em)
           VALUES ('facebook', '2026-10-12', '2026-10-18', '2026-10-05', '2026-10-11', '[]', '{}', 'x')`)
    falha(`INSERT INTO resultado_panorama_cache (conector, de, ate, de_anterior, ate_anterior, contas, tentado_em, erro)
           VALUES ('facebook', '2026-10-12', '2026-10-18', '2026-10-05', '2026-10-11', '[]', 'x', 'outro')`)
    falha("INSERT INTO windsor_lista (conector, origem, tentada_em) VALUES ('facebook', 'ds_accounts', 'x')")
    falha("INSERT INTO windsor_lista (conector, tentada_em, erro) VALUES ('facebook', 'x', 'qualquer')")
    rodar(env.db, "INSERT INTO windsor_lista (conector, origem, buscada_em, tentada_em) VALUES ('facebook', 'dados', 'x', 'x')")
  })
})
