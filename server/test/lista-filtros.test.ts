/**
 * F6 (lista): os filtros do quadro (shared/logica/filtros.ts, que o F6 recebe do NÚCLEO-WEB na Onda 3). Cada campo de
 * FiltrosQuadro, os casos de borda do PLANO §3 (membros 'nenhum', etiquetas 'nenhuma', concluídas 'so', "Só as minhas"
 * com o AM, atrasado nunca com o cliente), a busca por texto (início de palavra, palavra composta, número, cliente) e a
 * URL (ida e volta, lixo vira filtro vazio).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarFiltros, codificarFiltros, contarFiltros, decodificarFiltros, normalizarFiltros, temFiltros, TEXTO_FILTRO_MAX,
  type ContextoFiltros,
} from '../../shared/logica/filtros.ts'
import type { Coluna, Demanda, FiltrosQuadro } from '../../shared/tipos/index.ts'

const AGORA = new Date('2026-10-14T13:00:00.000Z') // quarta, 10h em São Paulo

function demanda(extra: Partial<Demanda> = {}): Demanda {
  return {
    id: `d${extra.numero ?? 1}`, numero: 1, quadroId: 'q1', colunaId: 'c-fila', posicao: 1024, titulo: 'Sem título',
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

const CTX: ContextoFiltros = {
  euId: 'u-eu',
  agora: AGORA,
  colunas: new Map<string, Pick<Coluna, 'papel'>>([
    ['c-fila', { papel: 'normal' }], ['c-cliente', { papel: 'aguardando_cliente' }], ['c-feito', { papel: 'concluida' }],
  ]),
  clientes: new Map([
    ['cli-he', { sigla: 'HE', nome: 'Hospital Evangélico' }],
    ['cli-cla', { sigla: 'CLA', nome: 'Clínica Aurora' }],
  ]),
}
const passam = (lista: Demanda[], f: FiltrosQuadro, ctx = CTX) => aplicarFiltros(lista, f, ctx).map((d) => d.numero)

describe('F6 · filtros: membros, etiquetas e "Só as minhas"', () => {
  test("membros: só 'nenhum' pega as sem membros; com pessoas, OU; desconhecido não pega nada", () => {
    const lista = [demanda({ numero: 1, membroIds: ['u-bia'] }), demanda({ numero: 2, membroIds: ['u-bia', 'u-leo'] }), demanda({ numero: 3 })]
    assert.deepEqual(passam(lista, { membros: ['nenhum'] }), [3])
    assert.deepEqual(passam(lista, { membros: ['u-leo'] }), [2])
    assert.deepEqual(passam(lista, { membros: ['u-leo', 'nenhum'] }), [2, 3])
    assert.deepEqual(passam(lista, { membros: ['u-saiu'] }), [])
  })

  test("etiquetas: só 'nenhuma' pega as sem etiquetas; OU entre as escolhidas", () => {
    const lista = [demanda({ numero: 1, etiquetaIds: ['e-urg'] }), demanda({ numero: 2, etiquetaIds: ['e-alt', 'e-urg'] }), demanda({ numero: 3 })]
    assert.deepEqual(passam(lista, { etiquetas: ['nenhuma'] }), [3])
    assert.deepEqual(passam(lista, { etiquetas: ['e-alt'] }), [2])
    assert.deepEqual(passam(lista, { etiquetas: ['nenhuma', 'e-alt'] }), [2, 3])
  })

  test('"Só as minhas" pega membro e AM; o AM conta mesmo sem ser membro', () => {
    const lista = [
      demanda({ numero: 1, membroIds: ['u-eu'] }),
      demanda({ numero: 2, atendimentoId: 'u-eu', membroIds: ['u-bia'] }),
      demanda({ numero: 3, atendimentoId: 'u-eu' }),
      demanda({ numero: 4, atendimentoId: 'u-am', membroIds: ['u-bia'] }),
    ]
    assert.deepEqual(passam(lista, { soMinhas: true }), [1, 2, 3])
    assert.deepEqual(passam(lista, { soMinhas: true, membros: ['nenhum'] }), [3])
  })
})

describe('F6 · filtros: prazo, prioridade, com o cliente e concluídas', () => {
  const lista = [
    demanda({ numero: 1, prazo: '2026-10-13' }),                                                // atrasada
    demanda({ numero: 2, prazo: '2026-10-10', colunaId: 'c-cliente' }),                         // com o cliente (pausada)
    demanda({ numero: 3, prazo: '2026-10-09', envioPendenteEm: '2026-10-08T12:00:00.000Z' }),   // envio sem resposta
    demanda({ numero: 4, prazo: '2026-10-14', prazoHora: '09:00' }),                            // hoje, já passou das 9h
    demanda({ numero: 5, prazo: '2026-10-14' }),                                                // hoje, 18h
    demanda({ numero: 6, prazo: '2026-10-17' }),                                                // sábado desta semana
    demanda({ numero: 7, prazo: '2026-10-20' }),                                                // semana que vem
    demanda({ numero: 8 }),                                                                     // sem prazo
    demanda({ numero: 9, prazo: '2026-10-01', concluidaEm: '2026-10-02T12:00:00.000Z', colunaId: 'c-feito' }),
    demanda({ numero: 10, colunaId: 'c-cliente', retornoEm: '2026-10-14T12:30:00.000Z', prazo: '2026-10-13' }), // cliente já decidiu
  ]

  test('atrasado: estado atrasada; com o cliente nunca é atrasada, nem por envio pendente', () => {
    assert.deepEqual(passam(lista, { prazo: 'atrasado' }), [1, 4, 10])
  })

  test('hoje, esta semana (até domingo) e sem prazo, sempre sobre as abertas', () => {
    assert.deepEqual(passam(lista, { prazo: 'hoje' }), [4, 5])
    assert.deepEqual(passam(lista, { prazo: 'semana' }), [4, 5, 6])
    assert.deepEqual(passam(lista, { prazo: 'sem_prazo' }), [8])
  })

  test('prioridade: OU entre as escolhidas', () => {
    const p = [demanda({ numero: 1, prioridade: 'baixa' }), demanda({ numero: 2, prioridade: 'urgente' }), demanda({ numero: 3, prioridade: 'alta' })]
    assert.deepEqual(passam(p, { prioridades: ['urgente', 'alta'] }), [2, 3])
    assert.deepEqual(passam(p, { prioridades: ['baixa'] }), [1])
  })

  test('com o cliente: coluna aguardando sem decisão ou envio pendente; concluída não', () => {
    assert.deepEqual(passam(lista, { comCliente: true }), [2, 3])
  })

  test("concluídas: 'so' só as concluídas, 'esconder' tira, 'mostrar' é o padrão", () => {
    assert.deepEqual(passam(lista, { concluidas: 'so' }), [9])
    assert.equal(passam(lista, { concluidas: 'esconder' }).includes(9), false)
    assert.equal(passam(lista, { concluidas: 'mostrar' }).length, lista.length)
    // concluídas 'so' com prazo: nenhuma (o prazo vale só para as abertas)
    assert.deepEqual(passam(lista, { concluidas: 'so', prazo: 'atrasado' }), [])
  })
})

describe('F6 · filtros: texto', () => {
  const lista = [
    demanda({ numero: 12, titulo: 'E-mail marketing aniversário', clienteId: 'cli-he' }),
    demanda({ numero: 31, titulo: 'Folheto pós-venda', clienteId: 'cli-cla' }),
    demanda({ numero: 120, titulo: 'Carrossel Dia das Crianças' }),
    demanda({ numero: 7, titulo: 'Post 12 anos da marca' }),
  ]

  test('começo de palavra, sem acento e sem caixa; todas as palavras precisam casar', () => {
    assert.deepEqual(passam(lista, { texto: 'carr' }), [120])
    assert.deepEqual(passam(lista, { texto: 'CRIANCAS' }), [120])
    assert.deepEqual(passam(lista, { texto: 'aniv mark' }), [12])
    assert.deepEqual(passam(lista, { texto: 'rossel' }), [])          // meio de palavra não casa
  })

  test('a sigla do cliente não casa no meio de outra palavra ("he" não pega "Folheto")', () => {
    assert.deepEqual(passam(lista, { texto: 'he' }), [12])
    assert.deepEqual(passam(lista, { texto: 'aurora' }), [31])
    assert.deepEqual(passam(lista, { texto: 'hospital evangelico' }), [12])
  })

  test('palavra composta casa junta e por partes ("email", "e-mail", "mail", "venda")', () => {
    assert.deepEqual(passam(lista, { texto: 'email' }), [12])
    assert.deepEqual(passam(lista, { texto: 'e-mail' }), [12])
    assert.deepEqual(passam(lista, { texto: 'mail' }), [12])
    assert.deepEqual(passam(lista, { texto: 'venda' }), [31])
    assert.deepEqual(passam(lista, { texto: 'posvenda' }), [31])
  })

  test('número: "#12" só pelo número; "12" pelo número ou por uma palavra do título', () => {
    assert.deepEqual(passam(lista, { texto: '#12' }), [12, 120])
    assert.deepEqual(passam(lista, { texto: '12' }), [12, 120, 7])
    assert.deepEqual(passam(lista, { texto: '#7' }), [7])
  })

  test('"#" sozinho (no meio da digitação) e pontuação não filtram nem quebram', () => {
    assert.deepEqual(passam(lista, { texto: '#' }), [12, 31, 120, 7])
    assert.deepEqual(passam(lista, { texto: 'HE: email' }), [12])
    assert.deepEqual(passam(lista, { texto: '(carrossel)' }), [120])
    assert.deepEqual(passam(lista, { texto: '.*+?[]' }), [12, 31, 120, 7])
  })

  test('sem o mapa de clientes no contexto, o texto casa só título e número', () => {
    const semClientes: ContextoFiltros = { ...CTX, clientes: undefined }
    assert.deepEqual(passam(lista, { texto: 'he' }, semClientes), [])
    assert.deepEqual(passam(lista, { texto: 'folheto' }, semClientes), [31])
  })
})

describe('F6 · filtros na URL', () => {
  test('ida e volta com todos os campos (acento, listas e as sentinelas)', () => {
    const f: FiltrosQuadro = {
      soMinhas: true, clientes: ['cli-he', 'cli-cla'], membros: ['nenhum', 'u-bia'], etiquetas: ['nenhuma', 'e-urg'],
      prazo: 'semana', prioridades: ['urgente', 'baixa'], comCliente: true, concluidas: 'so', texto: 'Ação de Natal',
    }
    const s = codificarFiltros(f)
    assert.match(s, /^[A-Za-z0-9_-]+$/)
    assert.deepEqual(decodificarFiltros(s), { ...f, prioridades: ['baixa', 'urgente'] })
    assert.equal(codificarFiltros(decodificarFiltros(s)), s)               // estável: a URL não muda à toa
  })

  test('a ordem das listas e os padrões não mudam a URL; vazio = sem o parâmetro', () => {
    assert.equal(codificarFiltros({ prioridades: ['alta', 'urgente'] }), codificarFiltros({ prioridades: ['urgente', 'alta'] }))
    assert.equal(codificarFiltros({ concluidas: 'mostrar', soMinhas: false, clientes: [], texto: '   ' }), '')
    assert.equal(temFiltros({}), false)
    assert.equal(contarFiltros({ membros: ['nenhum'], concluidas: 'so' }), 2)
  })

  test('JSON inválido, base64 quebrado, tipo errado e texto enorme viram filtro vazio', () => {
    const b64 = (t: string) => Buffer.from(t).toString('base64url')
    for (const lixo of [null, undefined, '', '!!!', 'Zm9v', b64('{"soMinhas":'), b64('null'), b64('[1]'), b64('"x"'), 'a'.repeat(9000)]) {
      assert.deepEqual(decodificarFiltros(lixo), {}, String(lixo).slice(0, 20))
    }
  })

  test('valor fora das listas fechadas cai só aquele campo; listas sem texto são ignoradas', () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    assert.deepEqual(decodificarFiltros(b64({ prazo: 'ontem', prioridades: ['altissima', 'alta'], concluidas: 'todas', membros: [1, 'u-bia', ''] })),
      { prioridades: ['alta'], membros: ['u-bia'] })
    assert.deepEqual(normalizarFiltros({ soMinhas: 'sim', comCliente: 1 }), {})
  })

  test('o texto vai cortado no máximo e listas enormes não travam', () => {
    const f = normalizarFiltros({ texto: 'x'.repeat(TEXTO_FILTRO_MAX + 50), clientes: Array.from({ length: 500 }, (_, i) => `c${i}`) })
    assert.equal(f.texto!.length, TEXTO_FILTRO_MAX)
    assert.equal(f.clientes!.length, 200)
  })
})
