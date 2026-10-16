/**
 * NÚCLEO-WEB: o cache do bootstrap (web/src/api/cache.ts), os tratadores do núcleo (web/src/tempo-real/tratar.ts) e o
 * cliente SSE (web/src/tempo-real/conexao.ts) com um EventSource de mentira e relógio simulado.
 */
import { afterEach, beforeEach, describe, mock, test } from 'node:test'
import { QueryObserver } from '@tanstack/query-core'
import assert from 'node:assert/strict'
import type { EventoDe, EventoTempoReal, SyncSaida } from '../../shared/tipos/index.ts'
import { aplicarDemandaDoServidor, aplicarNoBootstrap, aplicarPatchDemanda, inserirDemanda, inserirOuAtualizar, removerDemanda } from '../../web/src/api/cache.ts'
import { conectarTempoReal, esperaDaTentativa, SILENCIO_MAX, type EstadoLigacao, type Tratador } from '../../web/src/tempo-real/conexao.ts'
import { pausarEntrega, recebidoEm } from '../../web/src/tempo-real/estado.ts'
import { ecoIgnorado, tratarCadastros, tratarDemanda, tratarQuadros } from '../../web/src/tempo-real/tratar.ts'
import { EU, bootDe, bootstrap, cacheCom, coluna, demanda, etiqueta, evento, quadro } from './nucleo-web-ajuda.ts'

const semEu = { buscarEu: () => Promise.reject(new Error('sem rede')) }

describe('cache do bootstrap', () => {
  test('inserirOuAtualizar mantém a lista quando o objeto é o mesmo', () => {
    const a = { id: 1 }, b = { id: 2 }
    const lista = [a, b]
    assert.equal(inserirOuAtualizar(lista, a), lista)
    assert.deepEqual(inserirOuAtualizar(lista, { id: 2, x: 1 } as { id: number }), [a, { id: 2, x: 1 }])
    assert.deepEqual(inserirOuAtualizar(lista, { id: 3 }), [a, b, { id: 3 }])
  })

  test('patch muda só a demanda certa e guarda a identidade das outras; arquivar tira do bootstrap', () => {
    const d1 = demanda(), d2 = demanda({ id: 'd2', numero: 2 })
    const qc = cacheCom(bootstrap({ demandas: [d1, d2] }))
    assert.equal(aplicarPatchDemanda(qc, 'd1', { titulo: 'Novo' }), true)
    assert.equal(bootDe(qc).demandas[0].titulo, 'Novo')
    assert.equal(bootDe(qc).demandas[1], d2)
    const antes = bootDe(qc)
    aplicarPatchDemanda(qc, 'd1', { titulo: 'Novo' })
    assert.equal(bootDe(qc), antes, 'patch repetido não troca o bootstrap')
    assert.equal(aplicarPatchDemanda(qc, 'x', { titulo: 'y' }), false)
    aplicarPatchDemanda(qc, 'd1', { arquivadoEm: '2026-10-14T13:00:00.000Z' })
    assert.deepEqual(bootDe(qc).demandas.map((d) => d.id), ['d2'])
  })

  test('inserir não põe de volta o que não pertence (arquivada, quadro fora do bootstrap); remover tira', () => {
    const qc = cacheCom(bootstrap())
    inserirDemanda(qc, demanda({ arquivadoEm: '2026-10-14T13:00:00.000Z' }))
    inserirDemanda(qc, demanda({ id: 'd2', quadroId: 'q-arquivado' }))
    assert.equal(bootDe(qc).demandas.length, 0)
    inserirDemanda(qc, demanda())
    assert.equal(bootDe(qc).demandas.length, 1)
    removerDemanda(qc, 'd1')
    assert.equal(bootDe(qc).demandas.length, 0)
  })

  test('o detalhe aberto acompanha a demanda, mesmo fora do bootstrap', () => {
    const qc = cacheCom(bootstrap())
    const d = demanda({ arquivadoEm: '2026-10-10T12:00:00.000Z' })
    qc.setQueryData(['demanda', 1], { demanda: d })
    assert.equal(aplicarPatchDemanda(qc, 'd1', { titulo: 'Só leitura' }), false)
    assert.equal(qc.getQueryData<{ demanda: { titulo: string } }>(['demanda', 1])!.demanda.titulo, 'Só leitura')
  })

  test('resposta do servidor mais velha que o cache só corrige o que a mutação mexeu e ninguém tocou depois', () => {
    // p1 move (previsão: posição 1536); o servidor grava em 1600; depois p2 muda o título e o evento chega antes da resposta
    const qc = cacheCom(bootstrap({ demandas: [demanda()] }))
    aplicarPatchDemanda(qc, 'd1', { colunaId: 'c-bia', posicao: 1536 })
    const naTela = bootDe(qc).demandas[0]
    tratarDemanda(evento({ e: 'demanda', id: 'd1', d: 'd1', t: 'p2', a: 'u-rafa', op: 'upsert', c: ['titulo', 'rev', 'atualizadoEm'],
      p: { titulo: 'Mudado por outra pessoa', rev: 2, atualizadoEm: '2026-10-14T13:00:02.000Z' } }), qc)
    aplicarDemandaDoServidor(qc, demanda({ colunaId: 'c-bia', posicao: 1600, atualizadoEm: '2026-10-14T13:00:01.000Z' }),
      { campos: ['colunaId', 'posicao'], naTela })
    const d = bootDe(qc).demandas[0]
    assert.equal(d.titulo, 'Mudado por outra pessoa')
    assert.equal(d.colunaId, 'c-bia')
    assert.equal(d.posicao, 1600)
    assert.equal(d.rev, 2)
    assert.equal(d.atualizadoEm, '2026-10-14T13:00:02.000Z')
  })

  describe('corrida: o evento de p2 chega antes da resposta de p1 (o servidor gravou p1 primeiro)', () => {
    const T1 = '2026-10-14T13:00:01.000Z', T2 = '2026-10-14T13:00:02.000Z'
    const deP2 = (p: Partial<ReturnType<typeof demanda>>) =>
      evento<EventoDe<'demanda'>>({ e: 'demanda', id: 'd1', d: 'd1', t: 'p2', a: 'u-caio', op: 'upsert', c: Object.keys(p) as never, p })

    test('mover: p1 aperta "." (Rafa) e p2 leva para a Bia: fica na Bia', () => {
      const qc = cacheCom(bootstrap({ demandas: [demanda()] }))
      aplicarPatchDemanda(qc, 'd1', { colunaId: 'c-rafa', membroIds: ['u-rafa'], statusDesde: T1 })
      const naTela = bootDe(qc).demandas[0]
      tratarDemanda(deP2({ colunaId: 'c-bia', membroIds: ['u-bia'], posicao: 1024, statusDesde: T2, atualizadoEm: T2 }), qc)
      aplicarDemandaDoServidor(qc, demanda({ colunaId: 'c-rafa', membroIds: ['u-rafa'], statusDesde: T1, atualizadoEm: T1 }),
        { campos: ['colunaId', 'quadroId', 'posicao', 'statusDesde', 'membroIds', 'etiquetaIds', 'concluidaEm', 'concluidaPor'], naTela })
      const d = bootDe(qc).demandas[0]
      assert.equal(d.colunaId, 'c-bia')
      assert.deepEqual(d.membroIds, ['u-bia'])
      assert.equal(d.statusDesde, T2)
    })

    test('título: p1 grava o dele e p2 grava outro por cima: fica o de p2 e o rev não desce', () => {
      const qc = cacheCom(bootstrap({ demandas: [demanda({ titulo: 'Antes', rev: 1 })] }))
      aplicarPatchDemanda(qc, 'd1', { titulo: 'Título de p1' })
      const naTela = bootDe(qc).demandas[0]
      tratarDemanda(deP2({ titulo: 'Título de p2', rev: 3, atualizadoEm: T2 }), qc)
      aplicarDemandaDoServidor(qc, demanda({ titulo: 'Título de p1', rev: 2, atualizadoEm: T1 }),
        { campos: ['titulo', 'descricaoAtualizadaEm', 'prazo', 'prazoHora'], naTela })
      const d = bootDe(qc).demandas[0]
      assert.equal(d.titulo, 'Título de p2')
      assert.equal(d.rev, 3)
    })

    test('título de p1 e p2 só move: fica o título de p1, o lugar de p2 e o rev novo da resposta', () => {
      const qc = cacheCom(bootstrap({ demandas: [demanda({ titulo: 'Antes', rev: 1 })] }))
      aplicarPatchDemanda(qc, 'd1', { titulo: 'Título de p1' })
      const naTela = bootDe(qc).demandas[0]
      tratarDemanda(deP2({ colunaId: 'c-bia', posicao: 1024, atualizadoEm: T2 }), qc)
      aplicarDemandaDoServidor(qc, demanda({ titulo: 'Título de p1', rev: 2, atualizadoEm: T1 }),
        { campos: ['titulo', 'descricaoAtualizadaEm', 'prazo', 'prazoHora'], naTela })
      const d = bootDe(qc).demandas[0]
      assert.equal(d.titulo, 'Título de p1')
      assert.equal(d.colunaId, 'c-bia')
      assert.equal(d.rev, 2, 'o próximo If-Match de p1 vai com o rev da gravação dele')
    })

    test('membros: p1 entra (Espaço) e p2 entra também: os dois ficam', () => {
      const qc = cacheCom(bootstrap({ demandas: [demanda()] }))
      aplicarPatchDemanda(qc, 'd1', { membroIds: [EU] })
      const naTela = bootDe(qc).demandas[0]
      tratarDemanda(deP2({ membroIds: [EU, 'u-caio'], atualizadoEm: T2 }), qc)
      aplicarDemandaDoServidor(qc, demanda({ membroIds: [EU], atualizadoEm: T1 }), { campos: ['membroIds'], naTela })
      assert.deepEqual(bootDe(qc).demandas[0].membroIds, [EU, 'u-caio'])
    })

    test('sem a mutação (resposta de interceptador, arquivar), o cache mais novo fica como está', () => {
      const qc = cacheCom(bootstrap({ demandas: [demanda({ titulo: 'Novo', atualizadoEm: T2 })] }))
      aplicarDemandaDoServidor(qc, demanda({ titulo: 'Velho', atualizadoEm: T1 }))
      assert.equal(bootDe(qc).demandas[0].titulo, 'Novo')
    })
  })

  test('aplicarNoBootstrap: upsert e delete por id', () => {
    const qc = cacheCom(bootstrap())
    aplicarNoBootstrap(qc, 'colunas', 'upsert', coluna({ id: 'c-nova', nome: 'Nova' }))
    aplicarNoBootstrap(qc, 'colunas', 'upsert', coluna({ id: 'c-fila', nome: 'Entrada' }))
    aplicarNoBootstrap(qc, 'etiquetas', 'delete', { id: 'e-urgente' })
    assert.equal(bootDe(qc).colunas.find((c) => c.id === 'c-nova')?.nome, 'Nova')
    assert.equal(bootDe(qc).colunas.find((c) => c.id === 'c-fila')?.nome, 'Entrada')
    assert.equal(bootDe(qc).etiquetas.some((e) => e.id === 'e-urgente'), false)
  })
})

describe('eco do próprio trace', () => {
  const meu = (t: string | null) => t === 'meu'
  test('o meu patch é ignorado; o de outra pessoa não', () => {
    const qc = cacheCom(bootstrap({ demandas: [demanda()] }))
    const ev = evento<EventoDe<'demanda'>>({ e: 'demanda', id: 'd1', d: 'd1', t: 'meu', a: EU, op: 'upsert', p: { titulo: 'x' }, c: ['titulo'] })
    assert.equal(ecoIgnorado(qc, ev, meu), true)
    assert.equal(ecoIgnorado(qc, { ...ev, t: 'outro' }, meu), false)
  })

  test('objeto inteiro meu de algo que o cache não tem é aplicado (etiqueta criada no destino); o que já tem, não', () => {
    const qc = cacheCom(bootstrap())
    const nova = evento<EventoDe<'etiqueta'>>({ e: 'etiqueta', id: 'e-nova', d: null, t: 'meu', a: EU, op: 'upsert', p: etiqueta({ id: 'e-nova' }), c: null })
    assert.equal(ecoIgnorado(qc, nova, meu), false)
    assert.equal(ecoIgnorado(qc, { ...nova, id: 'e-urgente' }, meu), true)
    // fora do bootstrap (checklist do modal): sempre ignorado, como diz o contrato
    const ck = evento<EventoTempoReal>({ e: 'checklist', id: 'ck1', d: 'd1', t: 'meu', a: EU, op: 'upsert', p: {}, c: null } as never)
    assert.equal(ecoIgnorado(qc, ck, meu), true)
  })
})

describe('tratadores do núcleo', () => {
  test('demanda: patch, chegada de outra pessoa pisca, objeto inteiro entra, delete sai', () => {
    const qc = cacheCom(bootstrap({ demandas: [demanda()] }))
    tratarDemanda(evento({ e: 'demanda', id: 'd1', d: 'd1', t: 'x', a: 'u-rafa', op: 'upsert', p: { colunaId: 'c-rafa', posicao: 1 }, c: ['colunaId', 'posicao'] }), qc)
    assert.equal(bootDe(qc).demandas[0].colunaId, 'c-rafa')
    assert.ok(recebidoEm('d1') > 0, 'card movido por outra pessoa pisca')
    tratarDemanda(evento({ e: 'demanda', id: 'd9', d: 'd9', t: 'x', a: 'u-rafa', op: 'upsert', p: { titulo: 'x' }, c: ['titulo'] }), qc)
    assert.equal(bootDe(qc).demandas.length, 1, 'patch de id desconhecido é ignorado')
    tratarDemanda(evento({ e: 'demanda', id: 'd2', d: 'd2', t: 'x', a: EU, op: 'upsert', p: demanda({ id: 'd2', numero: 2 }), c: null }), qc)
    assert.equal(bootDe(qc).demandas.length, 2)
    assert.equal(recebidoEm('d2'), 0, 'o que eu criei em outra janela não pisca')
    tratarDemanda(evento({ e: 'demanda', id: 'd1', d: 'd1', t: 'x', a: 'u-rafa', op: 'delete', p: null, c: null }), qc)
    assert.deepEqual(bootDe(qc).demandas.map((d) => d.id), ['d2'])
  })

  test('demanda: descrição nova recarrega o detalhe aberto', async () => {
    const qc = cacheCom(bootstrap({ demandas: [demanda()] }))
    let buscas = 0
    // o modal aberto: um observador ativo do detalhe
    const modal = new QueryObserver(qc, {
      queryKey: ['demanda', 1], queryFn: async () => { buscas++; return { demanda: demanda(), descricaoMd: `v${buscas}` } },
    })
    const parar = modal.subscribe(() => {})
    await new Promise((r) => setTimeout(r, 5))
    assert.equal(buscas, 1)
    tratarDemanda(evento({ e: 'demanda', id: 'd1', d: 'd1', t: 'x', a: 'u-rafa', op: 'upsert', p: { descricaoAtualizadaEm: 'agora' }, c: ['descricaoAtualizadaEm'] }), qc)
    await new Promise((r) => setTimeout(r, 5))
    parar()
    assert.equal(buscas, 2, 'buscou a descrição nova')
  })

  test('quadro arquivado leva colunas, etiquetas e demandas dele; coluna arquivada sai', () => {
    const qc = cacheCom(bootstrap({ demandas: [demanda(), demanda({ id: 'd2', quadroId: 'q-social', colunaId: 'c-agendar' })] }))
    tratarQuadros(evento({ e: 'coluna', id: 'c-bia', d: null, t: 'x', a: 'u-rafa', op: 'upsert', p: coluna({ id: 'c-bia', arquivadaEm: 'agora' }), c: null }), qc, semEu)
    assert.equal(bootDe(qc).colunas.some((c) => c.id === 'c-bia'), false)
    tratarQuadros(evento({ e: 'quadro', id: 'q-criacao', d: null, t: 'x', a: 'u-rafa', op: 'upsert', p: quadro({ arquivadoEm: 'agora' }), c: null }), qc, semEu)
    const b = bootDe(qc)
    assert.deepEqual(b.quadros.map((q) => q.id), ['q-social'])
    assert.equal(b.colunas.some((c) => c.quadroId === 'q-criacao'), false)
    assert.equal(b.etiquetas.some((e) => e.quadroId === 'q-criacao'), false)
    assert.deepEqual(b.demandas.map((d) => d.id), ['d2'])
  })

  test('quadro restaurado (desconhecido e ativo) entra e pede o bootstrap de novo', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      const qc = cacheCom(bootstrap())
      let recargas = 0
      const original = qc.invalidateQueries.bind(qc)
      qc.invalidateQueries = ((f?: { queryKey?: readonly unknown[] }) => { if (f?.queryKey?.[0] === 'bootstrap') recargas++; return original(f) }) as typeof qc.invalidateQueries
      tratarQuadros(evento({ e: 'quadro', id: 'q-volta', d: null, t: 'x', a: 'u-rafa', op: 'upsert', p: quadro({ id: 'q-volta', slug: 'volta' }), c: null }), qc, semEu)
      assert.ok(bootDe(qc).quadros.some((q) => q.id === 'q-volta'))
      mock.timers.tick(400)
      assert.equal(recargas, 1)
    } finally {
      mock.timers.reset()
    }
  })

  test('cadastros: usuário (inclusive eu), feriado e cliente', () => {
    const qc = cacheCom(bootstrap())
    tratarCadastros(evento({ e: 'usuario', id: EU, d: null, t: 'x', a: 'u-admin', op: 'upsert', p: { ...bootDe(qc).usuarios[0], apelido: 'Mesma' }, c: null }), qc)
    assert.equal(bootDe(qc).eu.usuario.apelido, 'Mesma')
    tratarCadastros(evento({ e: 'feriado', id: '2026-11-20', d: null, t: 'x', a: 'u-admin', op: 'upsert', p: { data: '2026-11-20', nome: 'Consciência Negra', tipo: 'nacional' }, c: null }), qc)
    tratarCadastros(evento({ e: 'feriado', id: '2026-11-02', d: null, t: 'x', a: 'u-admin', op: 'upsert', p: { data: '2026-11-02', nome: 'Finados', tipo: 'nacional' }, c: null }), qc)
    assert.deepEqual(bootDe(qc).feriados.map((f) => f.data), ['2026-11-02', '2026-11-20'])
    tratarCadastros(evento({ e: 'feriado', id: '2026-11-02', d: null, t: 'x', a: 'u-admin', op: 'delete', p: null, c: null }), qc)
    assert.deepEqual(bootDe(qc).feriados.map((f) => f.data), ['2026-11-20'])
    const he = bootDe(qc).clientes[0]
    qc.setQueryData(['cliente', 'HE'], { ...he, contatos: [], links: [] })
    tratarCadastros(evento({ e: 'cliente', id: he.id, d: null, t: 'x', a: 'u-am', op: 'upsert', p: { ...he, nome: 'HE Novo' }, c: null }), qc)
    assert.equal(bootDe(qc).clientes[0].nome, 'HE Novo')
    assert.equal(qc.getQueryData<{ nome: string }>(['cliente', 'HE'])!.nome, 'HE Novo')
  })

  test('config: o objeto inteiro troca a configuração do bootstrap (outra janela salvou)', () => {
    const qc = cacheCom(bootstrap())
    const config = { ...bootDe(qc).config, quadroConcluidasDias: 12, modelosRevisadosEm: '2026-10-14T13:00:00.000Z' }
    tratarCadastros(evento({ e: 'config', id: 'app', d: null, t: 'x', a: 'u-admin', op: 'upsert', p: config, c: null }), qc)
    assert.equal(bootDe(qc).config.quadroConcluidasDias, 12)
    assert.equal(bootDe(qc).config.modelosRevisadosEm, '2026-10-14T13:00:00.000Z')
  })
})

// ─────────────────────────────── cliente SSE ───────────────────────────────

class FluxoFalso {
  static abertos: FluxoFalso[] = []
  readyState = 0
  fechado = false
  private ouvintes = new Map<string, ((m: { data: string }) => void)[]>()
  readonly url: string
  constructor(url: string) { this.url = url; FluxoFalso.abertos.push(this) }
  addEventListener(tipo: string, f: (m: { data: string }) => void) {
    this.ouvintes.set(tipo, [...(this.ouvintes.get(tipo) ?? []), f])
  }
  close() { this.fechado = true; this.readyState = 2 }
  emitir(tipo: string, dado?: unknown) {
    if (tipo === 'open') this.readyState = 1
    for (const f of this.ouvintes.get(tipo) ?? []) f({ data: dado === undefined ? '' : JSON.stringify(dado) })
  }
  falhar(estado: 0 | 2 = 2) { this.readyState = estado; this.emitir('error') }
}

describe('cliente SSE', () => {
  let estados: EstadoLigacao[]
  let entregues: EventoTempoReal[]
  let syncs: number[]
  let respostaSync: SyncSaida
  const tratadores: Tratador[] = [
    { id: 'b-segundo', entidades: ['demanda'], tratar: (ev) => entregues.push({ ...ev, id: `b:${ev.id}` }) },
    { id: 'a-primeiro', entidades: ['demanda', 'coluna'], tratar: (ev) => entregues.push(ev) },
  ]
  const ultimo = () => FluxoFalso.abertos.at(-1)!
  let parar: () => void = () => {}

  beforeEach(() => {
    FluxoFalso.abertos = []
    estados = []
    entregues = []
    syncs = []
    respostaSync = { resync: false, seq: 0, eventos: [] }
    mock.timers.enable({ apis: ['setTimeout'] })
  })
  afterEach(() => {
    parar()
    mock.timers.reset()
  })

  function ligar(qc = cacheCom(bootstrap({ demandas: [demanda()] })), seq = 100) {
    // ordem de id, como o registro entrega
    const ordenados = [...tratadores].sort((a, b) => a.id.localeCompare(b.id))
    parar = conectarTempoReal({
      qc, tratadores: () => ordenados, meuTrace: (t) => t === 'meu', definirEstado: (e) => estados.push(e),
      sync: async (desde) => { syncs.push(desde); return respostaSync },
      abrirFluxo: (url) => new FluxoFalso(url) as unknown as EventSource,
    }, seq)
    return qc
  }

  const ev = (s: number, extra: Partial<EventoDe<'demanda'>> = {}) =>
    evento<EventoDe<'demanda'>>({ s, e: 'demanda', id: 'd1', d: 'd1', t: 'outro', a: 'u-rafa', op: 'upsert', p: { posicao: s }, c: ['posicao'], ...extra })

  test('abre com o seq do bootstrap e entrega em ordem, aos tratadores em ordem de id, sem repetir nem o eco', () => {
    ligar()
    assert.equal(ultimo().url, '/api/eventos?desde=100')
    ultimo().emitir('open')
    assert.deepEqual(estados, ['online'])
    ultimo().emitir('d', ev(101))
    ultimo().emitir('d', ev(101))                  // repetido (retomada)
    ultimo().emitir('d', ev(102, { t: 'meu' }))   // eco
    ultimo().emitir('d', ev(103))
    assert.deepEqual(entregues.map((e) => `${e.s}:${e.id}`), ['101:d1', '101:b:d1', '103:d1', '103:b:d1'])
  })

  test('segura os eventos durante o arraste e entrega na ordem ao soltar', () => {
    ligar()
    ultimo().emitir('open')
    const soltar = pausarEntrega()
    ultimo().emitir('d', ev(101))
    ultimo().emitir('d', ev(102))
    assert.equal(entregues.length, 0)
    soltar()
    assert.deepEqual(entregues.filter((e) => e.id === 'd1').map((e) => e.s), [101, 102])
  })

  test('primeira queda: o navegador reconecta; depois assume com espera crescente e ?desde= do último seq', () => {
    ligar()
    const primeiro = ultimo()
    primeiro.emitir('open')
    primeiro.emitir('d', ev(105))
    primeiro.falhar(0)                              // o navegador vai tentar sozinho
    assert.equal(primeiro.fechado, false)
    assert.equal(estados.at(-1), 'reconectando')
    primeiro.falhar(0)                              // falhou de novo: fecha e agenda
    assert.equal(primeiro.fechado, true)
    assert.equal(FluxoFalso.abertos.length, 1)
    mock.timers.tick(esperaDaTentativa(1, false) * 1.2)
    assert.equal(FluxoFalso.abertos.length, 2)
    assert.equal(ultimo().url, '/api/eventos?desde=105')
    ultimo().emitir('open')
    assert.equal(estados.at(-1), 'online')
  })

  test('ping avança o seq; resync recarrega o bootstrap e reaplica o que chegou depois dele', async () => {
    const qc = ligar()
    ultimo().emitir('open')
    ultimo().emitir('ping', { seq: 150 })
    ultimo().emitir('d', ev(140))                  // velho: ignorado
    assert.equal(entregues.length, 0)
    ultimo().emitir('d', ev(151))
    ultimo().emitir('d', ev(152))
    entregues = []
    // o bootstrap novo foi lido no seq 151: só o 152 volta a ser aplicado
    qc.setQueryDefaults(['bootstrap'], { queryFn: () => bootstrap({ seq: 151, demandas: [demanda()] }) })
    await qc.fetchQuery({ queryKey: ['bootstrap'], staleTime: 0 })
    assert.deepEqual(entregues.filter((e) => e.id === 'd1').map((e) => e.s), [152])
  })

  test('fluxo aberto e calado (proxy que segurou a ligação): fecha, mostra a faixa e reabre do último seq', () => {
    ligar()
    const primeiro = ultimo()
    primeiro.emitir('open')
    primeiro.emitir('d', ev(104))
    mock.timers.tick(SILENCIO_MAX - 1000)
    primeiro.emitir('ping', { seq: 104 })          // o ping rearma a vigia
    mock.timers.tick(SILENCIO_MAX - 1000)
    assert.equal(primeiro.fechado, false)
    assert.equal(estados.at(-1), 'online')
    mock.timers.tick(1000)
    assert.equal(primeiro.fechado, true)
    assert.equal(estados.at(-1), 'reconectando')
    assert.equal(FluxoFalso.abertos.length, 2)
    assert.equal(ultimo().url, '/api/eventos?desde=104')
    ultimo().emitir('open')
    assert.equal(estados.at(-1), 'online')
  })

  test('cache de voltar/avançar: pagehide fecha o fluxo; pageshow persistido reabre do último seq', () => {
    const g = globalThis as unknown as { window?: EventTarget; document?: EventTarget & { visibilityState: string } }
    const antes = { window: g.window, document: g.document }
    g.window = new EventTarget()
    g.document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    try {
      ligar()
      const primeiro = ultimo()
      primeiro.emitir('open')
      primeiro.emitir('d', ev(107))
      g.window.dispatchEvent(new Event('pagehide'))
      assert.equal(primeiro.fechado, true)
      mock.timers.tick(SILENCIO_MAX * 2)
      assert.equal(FluxoFalso.abertos.length, 1, 'congelada: nada de reabrir nem de vigia')
      g.window.dispatchEvent(new Event('pageshow'))                 // carga normal: nada a fazer
      assert.equal(FluxoFalso.abertos.length, 1)
      g.window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
      assert.equal(FluxoFalso.abertos.length, 2)
      assert.equal(ultimo().url, '/api/eventos?desde=107')
      ultimo().emitir('open')
      assert.equal(estados.at(-1), 'online')
    } finally {
      parar()
      parar = () => {}
      g.window = antes.window
      g.document = antes.document
    }
  })

  test('três falhas seguidas: consulta /api/sync até o SSE voltar', async () => {
    ligar()
    ultimo().falhar(2)
    mock.timers.tick(esperaDaTentativa(1, false) * 1.2)
    ultimo().falhar(2)
    mock.timers.tick(esperaDaTentativa(2, false) * 1.2)
    respostaSync = { resync: false, seq: 130, eventos: [ev(120)] }
    ultimo().falhar(2)                              // terceira: liga o sync
    mock.timers.tick(5000)
    await new Promise((r) => setImmediate(r))
    assert.deepEqual(syncs, [100])
    assert.equal(entregues.find((e) => e.id === 'd1')?.s, 120)
    assert.equal(estados.at(-1), 'online', 'o sync respondendo conta como conectado')
  })
})
