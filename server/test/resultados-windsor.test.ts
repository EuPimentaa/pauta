/**
 * Resultados da Windsor (F8), o cliente HTTP contra um servidor falso local (as fixtures, os erros medidos e
 * documentados): a URL (chave só na query, datas explícitas, select_accounts, filter), a classificação dos erros, a
 * chave nunca fora do arquivo (em claro e codificada), o 302 sem seguir, o tempo esgotado, a cota e o teto do dia.
 */
import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { configurar, config } from '../src/config.ts'
import { abrir, fixarRelogio, migrar, rodar, um, type Db } from '../src/db.ts'
import {
  chamarContas, chamarDados, definirBuscaWindsor, definirEnderecosWindsor, FalhaWindsor, lerContas, TETO_DIA, usoHoje,
  type PedidoDados,
} from '../src/servicos/resultados-windsor.ts'
import {
  capturarLog, CHAVE_BOA, CHAVE_ERRADA, CONTA_302, CONTA_429, CONTA_500, CONTA_INVALIDA, CONTA_LENTA, CONTA_NAO_CONECTADA,
  CONTA_SEM_DADOS, CONTAS_FIXTURE, semSegredo, windsorFalsa, type WindsorFalsa,
} from './resultados-ajuda.ts'

let falsa: WindsorFalsa
let db: Db
const chaveAntes = config.windsorApiKey

before(async () => {
  falsa = await windsorFalsa()
})
after(async () => {
  definirEnderecosWindsor()
  definirBuscaWindsor()
  configurar({ windsorApiKey: chaveAntes })
  fixarRelogio(null)
  await falsa.fechar()
})
beforeEach(() => {
  fixarRelogio('2026-10-19T13:00:00.000Z')
  db = abrir(':memory:')
  migrar(db)
  configurar({ windsorApiKey: CHAVE_BOA })
  definirEnderecosWindsor({ dados: falsa.dados, contas: falsa.contas, limiteMs: 400 })
  definirBuscaWindsor()
  falsa.pedidos.length = 0
})

const meta = (contas: string[], extra: Partial<PedidoDados> = {}): PedidoDados => ({
  conector: 'facebook', campos: ['date', 'account_id', 'spend', 'impressions'], de: '2026-10-12', ate: '2026-10-18', contas, ...extra,
})

async function falha(p: Promise<unknown>): Promise<FalhaWindsor> {
  try {
    await p
  } catch (e) {
    assert.ok(e instanceof FalhaWindsor, `esperava FalhaWindsor, veio ${String(e)}`)
    return e
  }
  assert.fail('esperava falha')
}

describe('cliente HTTP da Windsor', () => {
  test('URL: chave só na query, campos, datas explícitas (nunca date_preset), select_accounts e filter', async () => {
    const linhas = await chamarDados(db, meta([CONTAS_FIXTURE.facebook], { filtro: [['spend', 'gt', 0]] }))
    assert.equal(linhas.length, 7, 'uma linha por dia (agregada por date + account_id)')
    const [p] = falsa.pedidos
    assert.equal(p!.conector, 'facebook')
    assert.equal(p!.chave, CHAVE_BOA, 'a chave chega decodificada: URLSearchParams codificou certo')
    assert.deepEqual(p!.params, {
      fields: 'date,account_id,spend,impressions', date_from: '2026-10-12', date_to: '2026-10-18',
      select_accounts: CONTAS_FIXTURE.facebook, filter: '[["spend","gt",0]]',
    })
    assert.equal(p!.headers.authorization, undefined)
    assert.equal(p!.headers.cookie, undefined)
    assert.equal(usoHoje(db), 1, 'cada chamada soma em windsor_uso')
    for (const l of linhas) assert.deepEqual(Object.keys(l), ['date', 'account_id', 'spend', 'impressions'], 'só os campos pedidos')
  })

  test('conta sem dados → data: [] (não é erro)', async () => {
    assert.deepEqual(await chamarDados(db, meta([CONTA_SEM_DADOS])), [])
  })

  test('chave inválida (a Windsor ecoa a chave no texto) → chave_invalida, sem a chave no erro nem no log', async () => {
    configurar({ windsorApiKey: CHAVE_ERRADA })
    const { valor: f, linhas } = await capturarLog(() => falha(chamarDados(db, meta([CONTAS_FIXTURE.facebook]))))
    assert.equal(f.erro, 'chave_invalida')
    assert.equal(f.http, 400)
    assert.equal(f.code, 'user_error')
    assert.deepEqual(linhas, ['windsor facebook http=400 code=user_error'], 'o log é fixo')
    const tudo = [f.message, f.stack ?? '', JSON.stringify(f), String(f), ...linhas].join('\n')
    assert.equal(semSegredo(tudo, [CHAVE_ERRADA]), null)
    const uso = um<{ erros: number; ultimo_erro: string }>(db, 'SELECT erros, ultimo_erro FROM windsor_uso')!
    assert.deepEqual({ ...uso }, { erros: 1, ultimo_erro: 'chave_invalida' })
  })

  test('chave vazia no servidor: chave_invalida sem chamar a Windsor', async () => {
    configurar({ windsorApiKey: '' })
    const { valor: f } = await capturarLog(() => falha(chamarDados(db, meta([CONTAS_FIXTURE.facebook]))))
    assert.equal(f.erro, 'chave_invalida')
    assert.equal(falsa.pedidos.length, 0)
  })

  test('429 → limite; 500 → fora_do_ar; conta não conectada → conta_nao_conectada; corpo fora do formato → resposta_invalida', async () => {
    const casos: [string, string, number | null][] = [
      [CONTA_429, 'limite', 429], [CONTA_500, 'fora_do_ar', 500], [CONTA_NAO_CONECTADA, 'conta_nao_conectada', 400],
      [CONTA_INVALIDA, 'resposta_invalida', 200],
    ]
    const { linhas } = await capturarLog(async () => {
      for (const [conta, erro, http] of casos) {
        const f = await falha(chamarDados(db, meta([conta])))
        assert.equal(f.erro, erro, conta)
        assert.equal(f.http, http, conta)
      }
    })
    assert.deepEqual(linhas, ['windsor facebook http=429 code=rate_limit_exceeded', 'windsor facebook http=500 code=server_error',
      'windsor facebook http=400 code=user_error', 'windsor facebook http=200 code=corpo'])
    assert.equal(semSegredo(linhas.join('\n'), [CHAVE_BOA]), null)
  })

  test('302 → fora_do_ar sem seguir (a chave iria junto); tempo esgotado → fora_do_ar', async () => {
    const { linhas } = await capturarLog(async () => {
      const f = await falha(chamarDados(db, meta([CONTA_302])))
      assert.equal(f.erro, 'fora_do_ar')
      assert.equal(f.code, 'redirecionamento')
      const t = await falha(chamarDados(db, meta([CONTA_LENTA])))
      assert.equal(t.erro, 'fora_do_ar')
      assert.equal(t.code, 'tempo')
    })
    assert.equal(falsa.seguiuRedirecionamento, 0)
    assert.deepEqual(linhas, ['windsor facebook http=- code=redirecionamento', 'windsor facebook http=- code=tempo'])
  })

  test('rede fora (porta fechada) → fora_do_ar, sem a URL (com a chave) no erro', async () => {
    definirEnderecosWindsor({ dados: 'http://127.0.0.1:1', contas: falsa.contas, limiteMs: 400 })
    const { valor: f, linhas } = await capturarLog(() => falha(chamarDados(db, meta([CONTAS_FIXTURE.facebook]))))
    assert.equal(f.erro, 'fora_do_ar')
    assert.equal(semSegredo([f.message, f.stack, ...linhas].join('\n'), [CHAVE_BOA]), null)
    assert.ok(!/127\.0\.0\.1/.test([f.message, ...linhas].join('\n')), 'nem o endereço')
  })

  test('exceção qualquer da busca trocada vira fora_do_ar, sem o texto dela', async () => {
    definirBuscaWindsor({
      dados: async () => { throw new Error(`Failed to parse URL from https://connectors.windsor.ai/facebook?api_key=${CHAVE_BOA}`) },
      contas: async () => [],
    })
    const { valor: f, linhas } = await capturarLog(() => falha(chamarDados(db, meta([CONTAS_FIXTURE.facebook]))))
    assert.equal(f.erro, 'fora_do_ar')
    assert.equal(f.code, 'excecao')
    assert.equal(semSegredo([f.message, ...linhas].join('\n'), [CHAVE_BOA]), null)
  })

  test('teto do dia: com 8.000 chamadas, limite sem chamar a Windsor nem contar', async () => {
    rodar(db, "INSERT INTO windsor_uso (dia, chamadas) VALUES ('2026-10-19', ?)", TETO_DIA)
    const f = await capturarLog(() => falha(chamarDados(db, meta([CONTAS_FIXTURE.facebook]))))
    assert.equal(f.valor.erro, 'limite')
    assert.equal(falsa.pedidos.length, 0)
    assert.equal(usoHoje(db), TETO_DIA)
    fixarRelogio('2026-10-20T03:30:00.000Z')
    await chamarDados(db, meta([CONTAS_FIXTURE.facebook]))
    assert.equal(usoHoje(db), 1, 'o dia é o de São Paulo: 00:30 de 20/10 já é outro dia')
  })

  test('lista de contas (ds-accounts): por conector, act_ some, id fora do formato fica de fora, nome sem controles', async () => {
    const contas = await chamarContas(db, 'facebook')
    assert.deepEqual(contas, [
      { contaId: CONTAS_FIXTURE.facebook, nome: 'Cliente Exemplo', status: 'active' },
      { contaId: '1000000000000777', nome: 'Com act', status: 'active' },
    ])
    assert.equal(falsa.pedidos[0]!.params.datasource, 'facebook')
    assert.equal(falsa.pedidos[0]!.chave, CHAVE_BOA)
    assert.throws(() => lerContas({ nada: 1 }, 'facebook'), FalhaWindsor)
  })
})
