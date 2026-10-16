/**
 * NÚCLEO-WEB: lógica pura dos filtros do quadro (shared/logica/filtros.ts, testes mínimos de cada campo, PLANO §2) e
 * do sinal do card (shared/logica/sinal.ts).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarFiltros, codificarFiltros, contarFiltros, decodificarFiltros, normalizarFiltros, temFiltros, type ContextoFiltros,
} from '../../shared/logica/filtros.ts'
import { sinalDoCard, textoSinal } from '../../shared/logica/sinal.ts'
import type { Coluna, Demanda, FiltrosQuadro, PapelColuna } from '../../shared/tipos/index.ts'

const AGORA = new Date('2026-10-14T13:00:00.000Z') // quarta, 10h em São Paulo
const FERIADOS = new Set(['2026-10-12'])

function demanda(extra: Partial<Demanda> = {}): Demanda {
  return {
    id: 'd1', numero: 12, quadroId: 'q1', colunaId: 'c-normal', posicao: 1024, titulo: 'Carrossel do Outubro Rosa',
    clienteId: null, atendimentoId: null, modeloId: null, membroIds: [], etiquetaIds: [], prioridade: 'media',
    inicio: null, inicioHora: null, prazo: null, prazoHora: null, publicacaoData: null, publicacaoHora: null,
    estimativaMin: null, minutosRegistrados: 0, repetir: 'nenhuma', capaCor: null, capaAnexoId: null, capaUrl: null,
    concluidaEm: null, concluidaPor: null, statusDesde: '2026-10-14T12:00:00.000Z', envioPendenteEm: null, retornoEm: null,
    rodadaAtual: 1, rodadasInclusas: 2, aprovadaEm: null, aprovadaVersaoId: null, versaoAtualId: null, versaoEnviadaId: null,
    nVersoes: 0, nAnexos: 0, nCheckTotal: 0, nCheckFeitos: 0, nComentarios: 0, origem: 'manual', origemDemandaId: null,
    descricaoAtualizadaEm: null, criadoPor: 'u-am', arquivadoEm: null, rev: 1, criadoEm: '2026-10-01T12:00:00.000Z',
    atualizadoEm: '2026-10-01T12:00:00.000Z', ...extra,
  }
}

const COLUNAS = new Map<string, Pick<Coluna, 'papel'>>([
  ['c-normal', { papel: 'normal' }], ['c-cliente', { papel: 'aguardando_cliente' }], ['c-feito', { papel: 'concluida' }],
])
const CTX: ContextoFiltros = {
  euId: 'u-eu', agora: AGORA, colunas: COLUNAS,
  clientes: new Map([['cli-he', { sigla: 'HE', nome: 'Hospital Evangélico' }], ['cli-icc', { sigla: 'ICC', nome: 'Instituto do Câncer' }]]),
}

/** Números das demandas que passam no filtro. */
const passam = (lista: Demanda[], f: FiltrosQuadro) => aplicarFiltros(lista, f, CTX).map((d) => d.numero)

describe('filtros do quadro: cada campo', () => {
  test('sem filtro devolve todas, na ordem', () => {
    const lista = [demanda({ numero: 2 }), demanda({ numero: 1 })]
    assert.deepEqual(passam(lista, {}), [2, 1])
  })

  test('soMinhas: membro ou AM', () => {
    const lista = [
      demanda({ numero: 1, membroIds: ['u-eu'] }), demanda({ numero: 2, atendimentoId: 'u-eu' }),
      demanda({ numero: 3, membroIds: ['u-outro'], atendimentoId: 'u-outro' }),
    ]
    assert.deepEqual(passam(lista, { soMinhas: true }), [1, 2])
  })

  test('clientes: OU entre os da lista; sem cliente não passa', () => {
    const lista = [demanda({ numero: 1, clienteId: 'cli-he' }), demanda({ numero: 2, clienteId: 'cli-icc' }), demanda({ numero: 3 })]
    assert.deepEqual(passam(lista, { clientes: ['cli-he'] }), [1])
    assert.deepEqual(passam(lista, { clientes: ['cli-he', 'cli-icc'] }), [1, 2])
  })

  test("membros: OU, e 'nenhum' = sem membros", () => {
    const lista = [demanda({ numero: 1, membroIds: ['u-rafa'] }), demanda({ numero: 2, membroIds: ['u-bia', 'u-rafa'] }), demanda({ numero: 3 })]
    assert.deepEqual(passam(lista, { membros: ['u-bia'] }), [2])
    assert.deepEqual(passam(lista, { membros: ['nenhum'] }), [3])
    assert.deepEqual(passam(lista, { membros: ['nenhum', 'u-bia'] }), [2, 3])
  })

  test("etiquetas: OU, e 'nenhuma' = sem etiquetas", () => {
    const lista = [demanda({ numero: 1, etiquetaIds: ['e-urgente'] }), demanda({ numero: 2, etiquetaIds: ['e-alt'] }), demanda({ numero: 3 })]
    assert.deepEqual(passam(lista, { etiquetas: ['e-urgente', 'e-alt'] }), [1, 2])
    assert.deepEqual(passam(lista, { etiquetas: ['nenhuma'] }), [3])
  })

  test('prazo: atrasado (com o cliente nunca), hoje, semana até domingo, sem prazo; concluídas ficam de fora', () => {
    const lista = [
      demanda({ numero: 1, prazo: '2026-10-13' }),                                   // atrasada
      demanda({ numero: 2, prazo: '2026-10-13', colunaId: 'c-cliente' }),            // com o cliente: pausado
      demanda({ numero: 3, prazo: '2026-10-14' }),                                   // hoje (18h)
      demanda({ numero: 4, prazo: '2026-10-18' }),                                   // domingo desta semana
      demanda({ numero: 5, prazo: '2026-10-19' }),                                   // segunda que vem
      demanda({ numero: 6 }),                                                         // sem prazo
      demanda({ numero: 7, prazo: '2026-10-13', concluidaEm: '2026-10-13T20:00:00.000Z' }),
      demanda({ numero: 8, envioPendenteEm: '2026-10-10T12:00:00.000Z', prazo: '2026-10-12' }), // envio pendente
    ]
    assert.deepEqual(passam(lista, { prazo: 'atrasado' }), [1])
    assert.deepEqual(passam(lista, { prazo: 'hoje' }), [3])
    assert.deepEqual(passam(lista, { prazo: 'semana' }), [3, 4])
    assert.deepEqual(passam(lista, { prazo: 'sem_prazo' }), [6])
  })

  test('prioridades: OU', () => {
    const lista = [demanda({ numero: 1, prioridade: 'urgente' }), demanda({ numero: 2, prioridade: 'alta' }), demanda({ numero: 3 })]
    assert.deepEqual(passam(lista, { prioridades: ['urgente', 'alta'] }), [1, 2])
  })

  test('comCliente: coluna aguardando o cliente sem decisão, ou envio pendente', () => {
    const lista = [
      demanda({ numero: 1, colunaId: 'c-cliente' }),
      demanda({ numero: 2, colunaId: 'c-cliente', retornoEm: '2026-10-14T12:30:00.000Z' }), // o cliente já decidiu
      demanda({ numero: 3, envioPendenteEm: '2026-10-13T12:00:00.000Z' }),
      demanda({ numero: 4 }),
    ]
    assert.deepEqual(passam(lista, { comCliente: true }), [1, 3])
  })

  test("concluidas: mostrar (padrão), esconder e 'so'", () => {
    const lista = [demanda({ numero: 1 }), demanda({ numero: 2, concluidaEm: '2026-10-13T20:00:00.000Z', colunaId: 'c-feito' })]
    assert.deepEqual(passam(lista, { concluidas: 'mostrar' }), [1, 2])
    assert.deepEqual(passam(lista, { concluidas: 'esconder' }), [1])
    assert.deepEqual(passam(lista, { concluidas: 'so' }), [2])
  })

  test('texto: título sem acento e sem caixa, número (#12 ou 12) e cliente (sigla ou nome); todas as palavras', () => {
    const lista = [
      demanda({ numero: 12, titulo: 'Ação de Natal', clienteId: 'cli-he' }),
      demanda({ numero: 120, titulo: 'Banner', clienteId: 'cli-icc' }),
      demanda({ numero: 7, titulo: 'Reels de bastidores' }),
    ]
    assert.deepEqual(passam(lista, { texto: 'acao' }), [12])
    assert.deepEqual(passam(lista, { texto: 'NATAL' }), [12])
    assert.deepEqual(passam(lista, { texto: '#12' }), [12, 120])
    assert.deepEqual(passam(lista, { texto: '7' }), [7])
    assert.deepEqual(passam(lista, { texto: 'he natal' }), [12])
    assert.deepEqual(passam(lista, { texto: 'cancer' }), [120])
    assert.deepEqual(passam(lista, { texto: 'he banner' }), [])
  })

  test('campos são E entre si', () => {
    const lista = [
      demanda({ numero: 1, clienteId: 'cli-he', membroIds: ['u-eu'] }),
      demanda({ numero: 2, clienteId: 'cli-he' }),
      demanda({ numero: 3, membroIds: ['u-eu'] }),
    ]
    assert.deepEqual(passam(lista, { clientes: ['cli-he'], soMinhas: true }), [1])
  })
})

describe('filtros do quadro: URL', () => {
  test('codificar e decodificar vão e voltam (com acento e todos os campos)', () => {
    const f: FiltrosQuadro = {
      soMinhas: true, clientes: ['cli-he'], membros: ['nenhum', 'u-1'], etiquetas: ['nenhuma'], prazo: 'semana',
      prioridades: ['urgente', 'alta'], comCliente: true, concluidas: 'so', texto: 'ação de março',
    }
    const s = codificarFiltros(f)
    assert.match(s, /^[A-Za-z0-9_-]+$/)
    assert.deepEqual(decodificarFiltros(s), { ...f, prioridades: ['alta', 'urgente'] })
  })

  test('filtro vazio ou só com padrões não vai para a URL', () => {
    assert.equal(codificarFiltros({}), '')
    assert.equal(codificarFiltros({ soMinhas: false, concluidas: 'mostrar', texto: '  ', membros: [] }), '')
    assert.equal(temFiltros({ concluidas: 'mostrar' }), false)
    assert.equal(contarFiltros({ soMinhas: true, prazo: 'hoje', texto: 'x' }), 3)
  })

  test('JSON inválido, base64 quebrado e lixo viram filtro vazio', () => {
    assert.deepEqual(decodificarFiltros(null), {})
    assert.deepEqual(decodificarFiltros(''), {})
    assert.deepEqual(decodificarFiltros('%%%'), {})
    assert.deepEqual(decodificarFiltros('abc'), {})                                // base64 de lixo
    assert.deepEqual(decodificarFiltros(btoa('{"soMinhas":').replace(/=+$/, '')), {})  // JSON cortado
    assert.deepEqual(decodificarFiltros(btoa('[1,2]').replace(/=+$/, '')), {})
  })

  test('valores fora das listas fechadas caem só aquele campo', () => {
    const s = btoa(JSON.stringify({ prazo: 'ontem', prioridades: ['urgente', 'x'], concluidas: 'talvez', soMinhas: 'sim', clientes: [1, 'cli-he'] }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    assert.deepEqual(decodificarFiltros(s), { prioridades: ['urgente'], clientes: ['cli-he'] })
    assert.deepEqual(normalizarFiltros('texto'), {})
  })
})

describe('sinal do card', () => {
  const col = (papel: PapelColuna) => ({ papel })
  const limites = { paradoLimiteDiasUteis: 2 }
  const sinal = (d: Partial<Demanda>, papel: PapelColuna = 'normal') => sinalDoCard(demanda(d), col(papel), AGORA, FERIADOS, limites)

  test('atrasada vence tudo; dias corridos desde o prazo', () => {
    const s = sinal({ prazo: '2026-10-12', statusDesde: '2026-10-01T12:00:00.000Z', rodadaAtual: 3 })
    assert.deepEqual(s, { tipo: 'atrasada', dias: 2 })
    assert.equal(textoSinal(s!), 'Atrasada há 2 dias')
    assert.equal(textoSinal({ tipo: 'atrasada', dias: 1 }), 'Atrasada há 1 dia')
    // prazo hoje às 9h, agora 10h: venceu hoje
    assert.equal(textoSinal(sinal({ prazo: '2026-10-14', prazoHora: '09:00' })!), 'Venceu hoje')
  })

  test('com o cliente há N dias úteis (nunca atrasada), desde o envio', () => {
    const s = sinal({ prazo: '2026-10-09', envioPendenteEm: '2026-10-09T15:00:00.000Z' })
    // 9/10 (sex) → 14/10 (qua): seg 12 é feriado; conta ter 13 e qua 14
    assert.deepEqual(s, { tipo: 'cliente', dias: 2 })
    assert.equal(textoSinal(s!), 'com o cliente há 2 dias úteis')
    assert.equal(sinal({ envioPendenteEm: '2026-10-14T12:00:00.000Z' }), null)
  })

  test('parado só acima do limite', () => {
    assert.equal(sinal({ statusDesde: '2026-10-09T12:00:00.000Z' }), null)          // 2 dias úteis: no limite
    const s = sinal({ statusDesde: '2026-10-08T12:00:00.000Z' })                     // 3 dias úteis
    assert.deepEqual(s, { tipo: 'parado', dias: 3 })
    assert.equal(textoSinal(s!), 'parado há 3 dias úteis')
  })

  test('rodada extra por último; concluída não tem sinal', () => {
    const s = sinal({ rodadaAtual: 3, rodadasInclusas: 2 })
    assert.deepEqual(s, { tipo: 'extra', rodada: 3, inclusas: 2 })
    assert.equal(textoSinal(s!), 'R3/2 · extra')
    assert.equal(sinal({ rodadaAtual: 3, concluidaEm: '2026-10-13T12:00:00.000Z', prazo: '2026-10-01' }), null)
    // parado vence a rodada extra
    assert.equal(sinal({ rodadaAtual: 3, statusDesde: '2026-10-01T12:00:00.000Z' })?.tipo, 'parado')
  })
})
