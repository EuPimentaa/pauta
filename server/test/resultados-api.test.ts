/**
 * Resultados da Windsor (F8), as rotas contra o servidor falso: lista e ligação de contas com as permissões (API §F.7),
 * os estados (sem chave, sem contas, sem dados, erro), os valores esperados das fixtures pela API, o cache (3 h, 24 h,
 * contas mudaram, erro mantém os dados, uma busca por vez), "Atualizar agora", o SSE e a carteira.
 */
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ContaLigada, ListarContasWindsorSaida, PanoramaResultados, ResultadosCliente } from '../../shared/tipos/index.ts'
import { KPIS_PRINCIPAIS, linhaKpi } from '../../shared/logica/resultados-formato.ts'
import { configurar, config } from '../src/config.ts'
import { tx, todos } from '../src/db.ts'
import { criarCliente } from '../src/servicos/clientes.ts'
import { esperarBuscas } from '../src/servicos/resultados.ts'
import { definirBuscaWindsor, definirEnderecosWindsor, FalhaWindsor } from '../src/servicos/resultados-windsor.ts'
import { ambiente, eventos, ultimoSeq, type Ambiente } from './ajuda.ts'
import {
  capturarLog, CHAVE_BOA, CONTA_NAO_CONECTADA, CONTA_NORONHA, CONTA_SEM_DADOS, CONTAS_FIXTURE, windsorFalsa, type WindsorFalsa,
} from './resultados-ajuda.ts'

let falsa: WindsorFalsa
let env: Ambiente
const chaveAntes = config.windsorApiKey
const HOJE = '2026-10-19T13:00:00.000Z'

before(async () => { falsa = await windsorFalsa() })
afterEach(async () => { await capturarLog(() => esperarBuscas(env.db)) })
after(async () => {
  definirEnderecosWindsor()
  definirBuscaWindsor()
  configurar({ windsorApiKey: chaveAntes })
  await falsa.fechar()
})
beforeEach(async () => {
  env = await ambiente()
  env.relogio(HOJE)
  configurar({ windsorApiKey: CHAVE_BOA })
  definirEnderecosWindsor({ dados: falsa.dados, contas: falsa.contas, limiteMs: 400 })
  definirBuscaWindsor()
  falsa.pedidos.length = 0
  falsa.contasVazias = false
})

const dadosDaWindsor = () => falsa.pedidos.filter((p) => !p.conector.startsWith('ds-accounts'))
const mais = (ms: number) => env.relogio(new Date(Date.parse(HOJE) + ms).toISOString())
const HORA = 3_600_000

/** Liga as contas das fixtures ao HE (como o AM dele). */
async function ligarFixtures(clienteId = env.clientes.he.id, quem = env.pessoas.am): Promise<void> {
  const nomes = { facebook: 'Cliente Exemplo', google_ads: 'Cliente Exemplo - Google', googleanalytics4: 'exemplo.com.br – GA4' }
  for (const [conector, contaId] of Object.entries(CONTAS_FIXTURE)) {
    const r = await env.como(quem).post(`/api/clientes/${clienteId}/resultados/contas`, { conector, contaId, nome: nomes[conector as 'facebook'] })
    assert.equal(r.status, 201, r.texto)
  }
}

async function resultados(periodo = '7d', clienteId = env.clientes.he.id, quem = env.pessoas.design): Promise<ResultadosCliente> {
  const r = await env.como(quem).get(`/api/clientes/${clienteId}/resultados?periodo=${periodo}`)
  assert.equal(r.status, 200, r.texto)
  return r.corpo
}

/** GET, espera a busca e lê de novo. */
async function resultadosProntos(periodo = '7d', clienteId = env.clientes.he.id): Promise<ResultadosCliente> {
  await resultados(periodo, clienteId)
  await esperarBuscas(env.db)
  return resultados(periodo, clienteId)
}

describe('contas da Windsor e ligação ao cliente', () => {
  test('lista: admin e atendimento veem (com o uso de hoje); a equipe não; recarregar só o admin, 1 a cada 10 min', async () => {
    assert.equal((await env.como(env.pessoas.design).get('/api/resultados/contas')).status, 403)
    const r = await env.como(env.pessoas.am).get('/api/resultados/contas')
    assert.equal(r.status, 200)
    const lista: ListarContasWindsorSaida = r.corpo
    assert.equal(lista.estado, 'ok')
    assert.equal(lista.uso.tetoDia, 8000)
    assert.equal(lista.uso.hoje, 3, 'um ds-accounts por conector')
    assert.ok(lista.atualizadaEm)
    assert.deepEqual(lista.contas.map((c) => `${c.conector}:${c.contaId}`),
      ['facebook:1000000000000001', 'facebook:1000000000000777', 'google_ads:000-000-0001', 'googleanalytics4:100000001'])
    assert.ok(!JSON.stringify(lista).includes('‮'), 'nome sem marca de direção')
    const segunda = await env.como(env.pessoas.am).get('/api/resultados/contas')
    assert.equal(segunda.corpo.uso.hoje, 3, 'cache de 24 h: nada de novo')
    assert.equal((await env.como(env.pessoas.am).get('/api/resultados/contas?recarregar=1')).status, 403)
    assert.equal((await env.como(env.pessoas.admin).get('/api/resultados/contas?recarregar=1')).corpo.uso.hoje, 6)
    const cedo = await env.como(env.pessoas.admin).get('/api/resultados/contas?recarregar=1')
    assert.equal(cedo.status, 429)
    assert.equal(cedo.corpo.erro.codigo, 'muitas_tentativas')
    assert.ok(cedo.corpo.erro.detalhes.tenteEmSegundos > 0)
    mais(25 * HORA)
    assert.equal((await env.como(env.pessoas.am).get('/api/resultados/contas')).corpo.uso.hoje, 3, 'outro dia, lista vencida')
  })

  test('ds-accounts vazio: cai para o endpoint de dados com os campos de conta dos últimos 90 dias', async () => {
    falsa.contasVazias = true
    const lista: ListarContasWindsorSaida = (await env.como(env.pessoas.admin).get('/api/resultados/contas')).corpo
    assert.ok(lista.contas.some((c) => c.conector === 'google_ads' && c.contaId === '000-000-0001' && c.nome === 'Cliente Exemplo - Google'))
    const dados = dadosDaWindsor()
    assert.equal(dados.length, 3)
    for (const p of dados) {
      assert.equal(p.params.fields, 'account_id,account_name')
      assert.equal(p.params.date_from, '2026-07-21')
      assert.equal(p.params.date_to, '2026-10-18')
      assert.equal(p.params.select_accounts, undefined)
    }
  })

  test('sem chave: estado sem_chave e a lista vazia, sem chamar a Windsor', async () => {
    configurar({ windsorApiKey: null })
    const lista = (await env.como(env.pessoas.admin).get('/api/resultados/contas')).corpo
    assert.equal(lista.estado, 'sem_chave')
    assert.deepEqual(lista.contas, [])
    assert.equal(falsa.pedidos.length, 0)
  })

  test('ligar: act_ some, nome da lista, 409 repetida, conta fora da lista exige o nome, Google de 10 dígitos ganha os hífens', async () => {
    await env.como(env.pessoas.am).get('/api/resultados/contas')
    const he = env.clientes.he.id
    const seq = ultimoSeq(env.db)
    const r = await env.como(env.pessoas.am).post(`/api/clientes/${he}/resultados/contas`, { conector: 'facebook', contaId: 'act_1000000000000001' })
    assert.equal(r.status, 201, r.texto)
    const c: ContaLigada = r.corpo
    assert.equal(c.contaId, '1000000000000001')
    assert.equal(c.nome, 'Cliente Exemplo')
    assert.equal(c.ligadaPor, env.pessoas.am.id)
    const evs = eventos(env.db, seq)
    assert.deepEqual(evs.map((e) => e.entidade), ['resultado_cliente'])
    assert.equal(evs[0]!.ator_id, env.pessoas.am.id)
    assert.equal((evs[0]!.patch as { contas: ContaLigada[] }).contas.length, 1)
    const atividade = todos<{ tipo: string; dados: string }>(env.db, "SELECT tipo, dados FROM atividade WHERE cliente_id = ? AND tipo = 'cliente.editado'", he)
    assert.deepEqual(JSON.parse(atividade.at(-1)!.dados), { clienteId: he, campos: ['contasResultados'] })

    const dup = await env.como(env.pessoas.admin).post(`/api/clientes/${he}/resultados/contas`, { conector: 'facebook', contaId: '1000000000000001' })
    assert.equal(dup.status, 409)
    const semNome = await env.como(env.pessoas.am).post(`/api/clientes/${he}/resultados/contas`, { conector: 'google_ads', contaId: '123-456-7890' })
    assert.equal(semNome.status, 400)
    assert.ok(semNome.corpo.erro.detalhes.campos.nome)
    const ruim = await env.como(env.pessoas.am).post(`/api/clientes/${he}/resultados/contas`, { conector: 'facebook', contaId: '../x', nome: 'X' })
    assert.equal(ruim.status, 400)
    const g = await env.como(env.pessoas.am).post(`/api/clientes/${he}/resultados/contas`, { conector: 'google_ads', contaId: '1234567890', nome: 'Digitada' })
    assert.equal(g.status, 201)
    assert.equal(g.corpo.contaId, '123-456-7890')
    const lista = (await env.como(env.pessoas.design).get(`/api/clientes/${he}/resultados/contas`)).corpo as ContaLigada[]
    assert.deepEqual(lista.map((x) => `${x.conector}:${x.nome}`), ['facebook:Cliente Exemplo', 'google_ads:Digitada'])
    const daWindsor: ListarContasWindsorSaida = (await env.como(env.pessoas.am).get('/api/resultados/contas')).corpo
    assert.deepEqual(daWindsor.contas.find((x) => x.contaId === '1000000000000001')!.clientes, [{ clienteId: he, sigla: 'HE' }])
    assert.ok(daWindsor.contas.some((x) => x.contaId === '123-456-7890' && x.clientes.length === 1), 'a digitada também aparece')
  })

  test('permissões: a equipe não liga; o atendimento de outra carteira não liga nem desliga; a equipe vê', async () => {
    const he = env.clientes.he.id
    const corpo = { conector: 'facebook', contaId: '1000000000000001', nome: 'X' }
    assert.equal((await env.como(env.pessoas.design).post(`/api/clientes/${he}/resultados/contas`, corpo)).status, 403)
    assert.equal((await env.como(env.pessoas.am2).post(`/api/clientes/${he}/resultados/contas`, corpo)).status, 403)
    const ok = await env.como(env.pessoas.am).post(`/api/clientes/${he}/resultados/contas`, corpo)
    assert.equal(ok.status, 201)
    assert.equal((await env.como(env.pessoas.am2).del(`/api/clientes/${he}/resultados/contas/${ok.corpo.id}`)).status, 403)
    assert.equal((await env.como(env.pessoas.design).del(`/api/clientes/${he}/resultados/contas/${ok.corpo.id}`)).status, 403)
    assert.equal((await env.como(env.pessoas.design).get(`/api/clientes/${he}/resultados/contas`)).status, 200)
    assert.equal((await env.como(env.pessoas.design).get(`/api/clientes/${he}/resultados`)).status, 200)
    assert.equal((await env.como(env.pessoas.design).get('/api/clientes/nao-existe/resultados')).status, 404)
  })

  test('desligar: 404 de outra ligação; 204, atividade e SSE', async () => {
    const he = env.clientes.he.id
    const ok = await env.como(env.pessoas.am).post(`/api/clientes/${he}/resultados/contas`, { conector: 'facebook', contaId: '1', nome: 'Um' })
    assert.equal((await env.como(env.pessoas.am).del(`/api/clientes/${he}/resultados/contas/outra`)).status, 404)
    assert.equal((await env.como(env.pessoas.am2).del(`/api/clientes/${env.clientes.icc.id}/resultados/contas/${ok.corpo.id}`)).status, 404)
    const seq = ultimoSeq(env.db)
    assert.equal((await env.como(env.pessoas.admin).del(`/api/clientes/${he}/resultados/contas/${ok.corpo.id}`)).status, 204)
    const [ev] = eventos(env.db, seq)
    assert.equal(ev!.entidade, 'resultado_cliente')
    assert.deepEqual((ev!.patch as { contas: unknown[] }).contas, [])
  })
})

describe('resultados do cliente', () => {
  test('sem chave → sem_chave; sem contas → sem_contas; nenhum dos dois chama a Windsor', async () => {
    assert.equal((await resultados()).estado, 'sem_contas')
    await ligarFixtures()
    configurar({ windsorApiKey: '' })
    const r = await resultados()
    assert.equal(r.estado, 'sem_chave')
    assert.equal(r.meta, null)
    assert.equal(falsa.pedidos.length, 0)
  })

  test('período: padrão 30d; outro valor → 400; no dia 1, este_mes responde como mes_passado', async () => {
    const r = await resultados('')
    assert.equal(r.periodo, '30d')
    assert.equal(r.de, '2026-09-19')
    const ruim = await env.como(env.pessoas.design).get(`/api/clientes/${env.clientes.he.id}/resultados?periodo=semana`)
    assert.equal(ruim.status, 400)
    env.relogio('2026-11-01T13:00:00.000Z')
    const dia1 = await resultados('este_mes')
    assert.equal(dia1.periodo, 'mes_passado')
    assert.equal(dia1.de, '2026-10-01')
    assert.equal(dia1.ateAnterior, '2026-09-30')
  })

  test('valores das fixtures pela API (12–18/10), 8 chamadas, SSE no começo e no fim', async () => {
    await ligarFixtures()
    const seq = ultimoSeq(env.db)
    const primeira = await resultados()
    assert.equal(primeira.estado, 'ok')
    assert.equal(primeira.atualizando, true)
    assert.equal(primeira.meta!.kpis, null, 'sem cache: nada ainda')
    await esperarBuscas(env.db)
    const r = await resultados()
    assert.equal(r.atualizando, false)
    assert.equal(dadosDaWindsor().length, 8, 'Meta 3, Google Ads 1, GA4 4')
    for (const p of dadosDaWindsor()) {
      assert.ok(p.params.date_from && p.params.date_to && !('date_preset' in p.params))
      assert.ok(p.params.select_accounts)
    }
    const m = r.meta!
    assert.equal(m.estado, 'ok')
    assert.ok(m.buscadoEm)
    assert.deepEqual(m.contas, [CONTAS_FIXTURE.facebook])
    assert.equal(linhaKpi('facebook', 'investimento', m.kpis!.atual.investimento, m.kpis!.anterior.investimento), 'Investimento R$ 246,83 (novo)')
    assert.equal(m.kpis!.atual.alcance, 62268)
    assert.equal(m.kpis!.atual.cliques, 758)
    assert.equal(m.kpis!.atual.resultados, 1)
    assert.equal(m.serie.length, 14)
    assert.equal(m.campanhas.length, 4)
    const g = r.googleAds!
    assert.equal(linhaKpi('google_ads', 'conversoes', g.kpis!.atual.conversoes, g.kpis!.anterior.conversoes), 'Conversões 128,5 (novo)')
    assert.equal(linhaKpi('google_ads', 'custoPorConversao', g.kpis!.atual.custoPorConversao, null), 'Custo por conversão R$ 12,95 (—)')
    const a = r.ga4!
    assert.equal(a.kpis!.atual.usuarios, 1124)
    assert.equal(a.kpis!.atual.sessoes, 1597)
    assert.deepEqual(a.eventosChave, [{ nome: 'click_wpp', quantidade: 134 }, { nome: 'Lead_chatbot', quantidade: 18 }])
    assert.deepEqual(r.alertas, [])
    const evs = eventos(env.db, seq).filter((e) => e.entidade === 'resultado_cliente')
    assert.deepEqual(evs.map((e) => (e.patch as { atualizando: boolean }).atualizando), [true, false])
    assert.equal(evs[1]!.ator_id, null)
    assert.equal(evs[1]!.trace_id, null)
    assert.ok((evs[1]!.patch as { atualizadoEm: string }).atualizadoEm)
  })

  test('cache: 2ª leitura em 3 h → 0 chamadas; depois de 3 h busca de novo; período fechado há mais de 3 dias vale 24 h', async () => {
    await ligarFixtures()
    await resultadosProntos()
    const depois = dadosDaWindsor().length
    mais(3 * HORA - 60_000)
    assert.equal((await resultados()).atualizando, false)
    assert.equal(dadosDaWindsor().length, depois)
    mais(3 * HORA + 60_000)
    assert.equal((await resultados()).atualizando, true)
    await esperarBuscas(env.db)
    assert.equal(dadosDaWindsor().length, depois + 8)

    env.relogio(HOJE)
    await resultadosProntos('mes_passado')
    const n = dadosDaWindsor().length
    mais(20 * HORA)
    assert.equal((await resultados('mes_passado')).atualizando, false, 'setembro terminou há 19 dias: 24 h')
    assert.equal(dadosDaWindsor().length, n)
  })

  test('ligar uma conta → o próximo GET busca de novo só o conector que mudou; desligar tira o bloco', async () => {
    await ligarFixtures()
    await resultadosProntos()
    const n = dadosDaWindsor().length
    const extra = await env.como(env.pessoas.am).post(`/api/clientes/${env.clientes.he.id}/resultados/contas`,
      { conector: 'facebook', contaId: CONTA_SEM_DADOS, nome: 'Parada' })
    const r = await resultados()
    assert.equal(r.atualizando, true)
    assert.equal(r.meta!.kpis, null, 'os dados de antes eram de outras contas')
    await esperarBuscas(env.db)
    assert.equal(dadosDaWindsor().length, n + 3)
    assert.deepEqual((await resultados()).meta!.contas, [CONTAS_FIXTURE.facebook, CONTA_SEM_DADOS].sort())
    const google = (await env.como(env.pessoas.am).get(`/api/clientes/${env.clientes.he.id}/resultados/contas`)).corpo
      .find((c: ContaLigada) => c.conector === 'google_ads')
    await env.como(env.pessoas.am).del(`/api/clientes/${env.clientes.he.id}/resultados/contas/${google.id}`)
    assert.equal((await resultados()).googleAds, null)
    assert.ok(extra.corpo.id)
  })

  test('erro mantém os dados e o buscadoEm antigos; tenta de novo só depois de 10 min', async () => {
    await ligarFixtures()
    const boa = await resultadosProntos()
    mais(4 * HORA)
    definirBuscaWindsor({ dados: async () => { throw new FalhaWindsor('fora_do_ar', 503, 'server_error') }, contas: async () => [] })
    await capturarLog(async () => {
      await resultados()
      await esperarBuscas(env.db)
    })
    const r = await resultados()
    assert.equal(r.meta!.estado, 'fora_do_ar')
    assert.equal(r.meta!.buscadoEm, boa.meta!.buscadoEm)
    assert.deepEqual(r.meta!.kpis, boa.meta!.kpis)
    assert.equal(r.atualizando, false, 'tentou há pouco: não insiste')
    mais(4 * HORA + 11 * 60_000)
    await capturarLog(async () => {
      assert.equal((await resultados()).atualizando, true)
      await esperarBuscas(env.db)
    })
  })

  test('erro com os dados bons ainda na validade: 10 min depois do erro a leitura automática busca de novo', async () => {
    // dados de 09:58, "Atualizar agora" às 10:00 com a Windsor fora do ar, a Windsor volta: às 10:11 a aba busca sozinha
    // (antes ficava com o erro até os dados de 09:58 vencerem, 3 h depois)
    await ligarFixtures()
    await resultadosProntos()
    mais(2 * 60_000)
    definirBuscaWindsor({ dados: async () => { throw new FalhaWindsor('fora_do_ar', 503, 'server_error') }, contas: async () => [] })
    await capturarLog(async () => {
      const r = await env.como(env.pessoas.design).post(`/api/clientes/${env.clientes.he.id}/resultados/atualizar`, { periodo: '7d' })
      assert.equal(r.status, 202, r.texto)
      await esperarBuscas(env.db)
    })
    assert.equal((await resultados()).meta!.estado, 'fora_do_ar')
    definirBuscaWindsor()
    const n = dadosDaWindsor().length
    mais(2 * 60_000 + 9 * 60_000)
    assert.equal((await resultados()).atualizando, false, '9 min depois do erro: ainda espera')
    assert.equal(dadosDaWindsor().length, n)
    mais(2 * 60_000 + 11 * 60_000)
    assert.equal((await resultados()).atualizando, true, '11 min depois do erro: busca, mesmo com os dados de 2 min antes do erro')
    await esperarBuscas(env.db)
    const r = await resultados()
    assert.equal(r.meta!.estado, 'ok')
    assert.equal(r.googleAds!.estado, 'ok')
    assert.equal(dadosDaWindsor().length, n + 8)
  })

  test('duas leituras ao mesmo tempo → uma busca', async () => {
    await ligarFixtures()
    const [a, b] = await Promise.all([resultados(), resultados('7d', env.clientes.he.id, env.pessoas.am)])
    assert.equal(a.atualizando && b.atualizando, true)
    await esperarBuscas(env.db)
    assert.equal(dadosDaWindsor().length, 8)
  })

  test('"Atualizar agora": 202, força a busca (≤ 8 chamadas), 2× em 5 min → 429, qualquer pessoa', async () => {
    await ligarFixtures()
    await resultadosProntos()
    const n = dadosDaWindsor().length
    const seq = ultimoSeq(env.db)
    const r = await env.como(env.pessoas.design).post(`/api/clientes/${env.clientes.he.id}/resultados/atualizar`, { periodo: '7d' })
    assert.equal(r.status, 202)
    assert.deepEqual(r.corpo, { atualizando: true })
    const [comeco] = eventos(env.db, seq)
    assert.equal(comeco!.ator_id, env.pessoas.design.id, 'o começo sai com quem pediu (a janela dela ignora o eco)')
    const denovo = await env.como(env.pessoas.am).post(`/api/clientes/${env.clientes.he.id}/resultados/atualizar`, { periodo: '30d' })
    assert.equal(denovo.status, 429)
    assert.ok(denovo.corpo.erro.detalhes.tenteEmSegundos > 0)
    await esperarBuscas(env.db)
    assert.ok(dadosDaWindsor().length - n <= 8)
    assert.equal(dadosDaWindsor().length - n, 8)
    assert.equal((await env.como(env.pessoas.am).post(`/api/clientes/${env.clientes.he.id}/resultados/atualizar`, { periodo: 'x' })).status, 400)
    mais(5 * 60_000 + 1000)
    assert.equal((await env.como(env.pessoas.am).post(`/api/clientes/${env.clientes.he.id}/resultados/atualizar`, { periodo: '30d' })).status, 202)
    await esperarBuscas(env.db)
  })

  test('conta sem dados → sem_dados; conta não conectada → o estado e o alerta', async () => {
    const icc = env.clientes.icc.id
    await env.como(env.pessoas.am2).post(`/api/clientes/${icc}/resultados/contas`, { conector: 'facebook', contaId: CONTA_SEM_DADOS, nome: 'Parada' })
    await env.como(env.pessoas.am2).post(`/api/clientes/${icc}/resultados/contas`, { conector: 'google_ads', contaId: CONTA_NAO_CONECTADA, nome: 'Desconectada' })
    const { valor: r } = await capturarLog(() => resultadosProntos('7d', icc))
    assert.equal(r.meta!.estado, 'sem_dados')
    assert.equal(r.meta!.kpis!.atual.investimento, 0)
    assert.equal(r.googleAds!.estado, 'conta_nao_conectada')
    assert.deepEqual(r.alertas, [{ tipo: 'conta_nao_conectada', conector: 'google_ads', contaId: CONTA_NAO_CONECTADA,
      texto: 'Google Ads: a conta Desconectada não está conectada na Windsor. Avise o admin.' }])
  })

  test('conta noutro fuso (Noronha): o dia fora do pedido fica de fora das somas e da série', async () => {
    const icc = env.clientes.icc.id
    await env.como(env.pessoas.am2).post(`/api/clientes/${icc}/resultados/contas`, { conector: 'facebook', contaId: CONTA_NORONHA, nome: 'Noronha' })
    const r = await resultadosProntos('7d', icc)
    const fixture = await resultadosDoHe()
    const ultimoDia = fixture.meta!.serie.at(-1)!
    assert.equal(r.meta!.serie.at(-1)!.data, '2026-10-18')
    assert.ok(Math.abs(r.meta!.kpis!.atual.investimento - (fixture.meta!.kpis!.atual.investimento - ultimoDia.investimento)) < 1e-6)
  })

  test('o relógio do servidor noutro fuso não muda os dias: 23h30 de 19/10 em São Paulo ainda é 19/10', async () => {
    env.relogio('2026-10-20T02:30:00.000Z')
    const r = await resultados('7d')
    assert.equal(r.ate, '2026-10-18')
    assert.equal(r.de, '2026-10-12')
  })
})

/** Os resultados das fixtures num cliente novo (para comparar). */
async function resultadosDoHe(): Promise<ResultadosCliente> {
  await ligarFixtures()
  return resultadosProntos()
}

describe('carteira (panorama)', () => {
  test('3 clientes nos três conectores → até 6 chamadas; 2ª leitura em 3 h → 0; os números da CLA iguais aos da aba', async () => {
    const terceiro = tx(env.db, () => criarCliente(env.db, { sigla: 'CLA', nome: 'Clínica Aurora' }, env.ator(env.pessoas.admin))).id
    await ligarFixtures()
    const icc = env.clientes.icc.id
    await env.como(env.pessoas.am2).post(`/api/clientes/${icc}/resultados/contas`, { conector: 'facebook', contaId: CONTA_SEM_DADOS, nome: 'Parada' })
    await env.como(env.pessoas.am2).post(`/api/clientes/${icc}/resultados/contas`, { conector: 'googleanalytics4', contaId: CONTAS_FIXTURE.googleanalytics4, nome: 'GA4 do grupo' })
    await env.como(env.pessoas.admin).post(`/api/clientes/${terceiro}/resultados/contas`, { conector: 'google_ads', contaId: CONTAS_FIXTURE.google_ads, nome: 'Google' })

    const primeira: PanoramaResultados = (await env.como(env.pessoas.design).get('/api/resultados/panorama?periodo=7d')).corpo
    assert.equal(primeira.atualizando, true)
    await esperarBuscas(env.db)
    const n = dadosDaWindsor().length
    assert.ok(n <= 6, `${n} chamadas`)
    const p: PanoramaResultados = (await env.como(env.pessoas.design).get('/api/resultados/panorama?periodo=7d')).corpo
    assert.equal(p.atualizando, false)
    assert.equal(dadosDaWindsor().length, n)
    mais(2 * HORA)
    await env.como(env.pessoas.design).get('/api/resultados/panorama?periodo=7d')
    assert.equal(dadosDaWindsor().length, n, '2ª leitura em 3 h: 0 chamadas')
    assert.deepEqual(p.linhas.map((l) => l.sigla), ['CLA', 'HE', 'ICC'])
    assert.ok(p.buscadoEm)

    const aba = await resultadosProntos()
    const he = p.linhas.find((l) => l.sigla === 'HE')!
    const pares: [string, Record<string, number | null>, Record<string, number | null>, { atual: Record<string, unknown>; anterior: Record<string, unknown> }][] = [
      ['facebook', he.conectores[0]!.atual, he.conectores[0]!.anterior, aba.meta!.kpis as never],
      ['google_ads', he.conectores[1]!.atual, he.conectores[1]!.anterior, aba.googleAds!.kpis as never],
      ['googleanalytics4', he.conectores[2]!.atual, he.conectores[2]!.anterior, aba.ga4!.kpis as never],
    ]
    for (const [conector, atual, anterior, kpis] of pares) {
      for (const k of KPIS_PRINCIPAIS[conector as 'facebook']) {
        assert.equal(linhaKpi(conector as 'facebook', k, atual[k] ?? null, anterior[k] ?? null),
          linhaKpi(conector as 'facebook', k, kpis.atual[k] as number | null, kpis.anterior[k] as number | null), `${conector}.${k}`)
      }
    }
    const iccLinha = p.linhas.find((l) => l.sigla === 'ICC')!
    assert.deepEqual(iccLinha.conectores.map((c) => `${c.conector}:${c.estado}`), ['facebook:sem_dados', 'googleanalytics4:ok'])
  })

  test('a busca da carteira falhou: o cliente com o cache da aba sai com os números da aba; o sem cache, com o erro', async () => {
    // revisão visual, achado 8: a carteira esvaziava a linha de todos os clientes do conector, inclusive de quem a aba
    // mostrava normalmente
    await ligarFixtures()
    const icc = env.clientes.icc.id
    await env.como(env.pessoas.am2).post(`/api/clientes/${icc}/resultados/contas`, { conector: 'facebook', contaId: CONTA_SEM_DADOS, nome: 'Parada' })
    const aba = await resultadosProntos()
    definirBuscaWindsor({ dados: async () => { throw new FalhaWindsor('fora_do_ar', 500, 'server_error') }, contas: async () => [] })
    await capturarLog(async () => {
      await env.como(env.pessoas.design).get('/api/resultados/panorama?periodo=7d')
      await esperarBuscas(env.db)
    })
    const n = dadosDaWindsor().length
    const p: PanoramaResultados = (await env.como(env.pessoas.design).get('/api/resultados/panorama?periodo=7d')).corpo
    assert.equal(dadosDaWindsor().length, n, 'a reserva não chama a Windsor')
    const he = p.linhas.find((l) => l.sigla === 'HE')!
    assert.deepEqual(he.conectores.map((c) => `${c.conector}:${c.estado}`), ['facebook:ok', 'google_ads:ok', 'googleanalytics4:ok'])
    for (const [c, kpis] of [[he.conectores[0]!, aba.meta!.kpis], [he.conectores[1]!, aba.googleAds!.kpis], [he.conectores[2]!, aba.ga4!.kpis]] as const) {
      for (const k of KPIS_PRINCIPAIS[c.conector as 'facebook']) {
        assert.equal(linhaKpi(c.conector as 'facebook', k, c.atual[k] ?? null, c.anterior[k] ?? null),
          linhaKpi(c.conector as 'facebook', k, (kpis!.atual as never)[k], (kpis!.anterior as never)[k]), `${c.conector}.${k}`)
      }
    }
    assert.equal(p.buscadoEm, aba.meta!.buscadoEm, 'a hora dos dados é a do cache da aba')
    const semAba = p.linhas.find((l) => l.sigla === 'ICC')!
    assert.deepEqual(semAba.conectores.map((c) => `${c.conector}:${c.estado}`), ['facebook:fora_do_ar'])
  })

  test('sem chave → sem_chave; sem nenhuma conta ligada → sem linhas e sem chamar', async () => {
    const vazia: PanoramaResultados = (await env.como(env.pessoas.design).get('/api/resultados/panorama')).corpo
    assert.equal(vazia.estado, 'ok')
    assert.deepEqual(vazia.linhas, [])
    assert.equal(vazia.periodo, '30d')
    configurar({ windsorApiKey: null })
    assert.equal((await env.como(env.pessoas.design).get('/api/resultados/panorama')).corpo.estado, 'sem_chave')
    assert.equal(falsa.pedidos.length, 0)
    assert.equal((await env.como(env.pessoas.design).get('/api/resultados/panorama?periodo=ano')).status, 400)
  })
})
