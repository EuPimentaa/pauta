/**
 * Resultados da Windsor (F8), segredos (FASE2-PLANO §0 regra 6; API.md §F.1 e §F.8): a chave da Windsor (em claro e
 * codificada) e um erro com `api_key=K… private-abc… pauta_at_x` injetado na busca, no provedor do MCP, na rota e na
 * tarefa nunca aparecem no resultado, no log capturado, no banco nem em `tarefa_execucao`.
 */
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { configurar, config } from '../src/config.ts'
import { todos, type Db } from '../src/db.ts'
import { provedor } from '../src/provedores/resultados.ts'
import { esperarBuscas } from '../src/servicos/resultados.ts'
import { definirBuscaWindsor, definirEnderecosWindsor } from '../src/servicos/resultados-windsor.ts'
import { executarTarefa } from '../src/tarefas.ts'
import { definirPodaResultados, tarefa } from '../src/tarefas/resultados-poda.ts'
import { ambiente, type Ambiente } from './ajuda.ts'
import { capturarLog, CHAVE_BOA, CHAVE_ERRADA, CONTAS_FIXTURE, semSegredo, windsorFalsa, type WindsorFalsa } from './resultados-ajuda.ts'

const SEGREDOS = ['K123456789', 'private-abcdef0123', 'pauta_at_segredoX', 'abcdef0123', 'segredoX']
const ERRO_INJETADO = () => new Error('falhou: https://connectors.windsor.ai/facebook?api_key=K123456789&x=1 '
  + 'https://calendar.google.com/calendar/ical/a%40b/private-abcdef0123/basic.ics pauta_at_segredoX')

let falsa: WindsorFalsa
let env: Ambiente
const chaveAntes = config.windsorApiKey

before(async () => { falsa = await windsorFalsa() })
after(async () => {
  definirEnderecosWindsor()
  definirBuscaWindsor()
  definirPodaResultados()
  configurar({ windsorApiKey: chaveAntes })
  await falsa.fechar()
})
beforeEach(async () => {
  env = await ambiente()
  env.relogio('2026-10-19T13:00:00.000Z')
  configurar({ windsorApiKey: CHAVE_BOA })
  definirEnderecosWindsor({ dados: falsa.dados, contas: falsa.contas, limiteMs: 400 })
  definirBuscaWindsor()
  for (const [conector, contaId] of Object.entries(CONTAS_FIXTURE)) {
    const r = await env.como(env.pessoas.am).post(`/api/clientes/${env.clientes.he.id}/resultados/contas`, { conector, contaId, nome: `Conta ${conector}` })
    assert.equal(r.status, 201)
  }
})
afterEach(async () => {
  await capturarLog(() => esperarBuscas(env.db))
  definirBuscaWindsor()
  definirPodaResultados()
})

/** Tudo o que o banco guardou (para conferir que nenhum segredo ficou lá). */
function bancoInteiro(db: Db): string {
  return ['resultado_cache', 'windsor_uso', 'windsor_conta', 'windsor_lista', 'evento', 'atividade', 'tarefa_execucao']
    .map((t) => JSON.stringify(todos(db, `SELECT * FROM ${t}`))).join('\n')
}

describe('segredos nos resultados', () => {
  test('a chave errada que a Windsor ecoa: nem na resposta, nem no log, nem no banco (em claro e codificada)', async () => {
    configurar({ windsorApiKey: CHAVE_ERRADA })
    const { valor, linhas } = await capturarLog(async () => {
      await env.como(env.pessoas.design).get(`/api/clientes/${env.clientes.he.id}/resultados?periodo=7d`)
      await esperarBuscas(env.db)
      const r = await env.como(env.pessoas.design).get(`/api/clientes/${env.clientes.he.id}/resultados?periodo=7d`)
      const lista = await env.como(env.pessoas.admin).get('/api/resultados/contas')
      const p = await provedor.resultados(env.db, { clienteId: env.clientes.he.id, periodo: '7d', esperarMs: 1000, buscar: true })
      return [r.texto, lista.texto, JSON.stringify(p)]
    })
    const resposta = JSON.parse(valor[0]!)
    assert.equal(resposta.meta.estado, 'chave_invalida')
    assert.equal(resposta.googleAds.estado, 'chave_invalida')
    assert.ok(linhas.length > 0 && linhas.every((l) => /^windsor (facebook|google_ads|googleanalytics4) http=400 code=user_error$/.test(l)), linhas.join('\n'))
    assert.equal(semSegredo([...valor, ...linhas, bancoInteiro(env.db)].join('\n'), [CHAVE_ERRADA]), null)
    assert.ok(!linhas.join('\n').toLowerCase().includes('api_key'), 'o log nem fala de api_key')
  })

  test('erro injetado na busca: o estado vira fora_do_ar e nada do texto sai', async () => {
    definirBuscaWindsor({ dados: async () => { throw ERRO_INJETADO() }, contas: async () => { throw ERRO_INJETADO() } })
    const { valor, linhas } = await capturarLog(async () => {
      await env.como(env.pessoas.design).get(`/api/clientes/${env.clientes.he.id}/resultados?periodo=30d`)
      await esperarBuscas(env.db)
      const r = await env.como(env.pessoas.design).get(`/api/clientes/${env.clientes.he.id}/resultados?periodo=30d`)
      const lista = await env.como(env.pessoas.admin).get('/api/resultados/contas')
      const carteira = await provedor.panorama(env.db, { periodo: '30d', esperarMs: 1000, buscar: true })
      return [r.texto, lista.texto, JSON.stringify(carteira)]
    })
    assert.equal(JSON.parse(valor[0]!).meta.estado, 'fora_do_ar')
    assert.equal(JSON.parse(valor[1]!).estado, 'fora_do_ar')
    assert.equal(semSegredo([...valor, ...linhas, bancoInteiro(env.db)].join('\n'), SEGREDOS), null)
  })

  test('exceção inesperada no provedor (e na rota): o provedor não lança e devolve o período certo; a rota dá 500 sem o texto', async () => {
    const original = env.db.prepare.bind(env.db)
    env.db.prepare = ((sql: string) => {
      if (sql.includes('FROM resultado_cache') || sql.includes('FROM resultado_panorama_cache')) throw ERRO_INJETADO()
      return original(sql)
    }) as typeof env.db.prepare
    const { valor, linhas } = await capturarLog(async () => {
      const p = await provedor.resultados(env.db, { clienteId: env.clientes.he.id, periodo: '7d', esperarMs: 50, buscar: true })
      const c = await provedor.panorama(env.db, { periodo: '7d', esperarMs: 50, buscar: true })
      const r = await env.como(env.pessoas.design).get(`/api/clientes/${env.clientes.he.id}/resultados?periodo=7d`)
      const pan = await env.como(env.pessoas.design).get('/api/resultados/panorama?periodo=7d')
      return { p, c, r, pan }
    })
    env.db.prepare = original
    assert.equal(valor.p.de, '2026-10-12')
    assert.equal(valor.p.clienteId, env.clientes.he.id)
    assert.equal(valor.c.ate, '2026-10-18')
    assert.equal(valor.r.status, 500)
    assert.equal(valor.r.corpo.erro.codigo, 'interno')
    assert.equal(valor.pan.status, 500)
    assert.ok(linhas.some((l) => l.startsWith('resultados provedor')), linhas.join('\n'))
    assert.ok(linhas.some((l) => l.startsWith('resultados resultados: Error: falhou')), linhas.join('\n'))
    assert.equal(semSegredo([JSON.stringify(valor), ...linhas].join('\n'), SEGREDOS), null)
  })

  test('erro injetado na tarefa: tarefa_execucao.detalhe e o log mascarados', async () => {
    definirPodaResultados(() => { throw ERRO_INJETADO() })
    const { valor: ok, linhas } = await capturarLog(() => executarTarefa(env.db, tarefa))
    assert.equal(ok, false)
    const [exec] = todos<{ nome: string; ok: number; detalhe: string }>(env.db, "SELECT nome, ok, detalhe FROM tarefa_execucao WHERE nome = 'resultados-poda'")
    assert.equal(exec!.ok, 0)
    assert.match(exec!.detalhe, /api_key=\*\*\*/)
    assert.match(exec!.detalhe, /private-\*\*\*/)
    assert.equal(semSegredo([exec!.detalhe, ...linhas].join('\n'), SEGREDOS), null)
  })
})
