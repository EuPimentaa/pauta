/**
 * F6 (lista): regras puras da Lista e do Calendário do quadro (web/src/funcionalidades/lista/logica.ts): ordenar pelo
 * cabeçalho, agrupar (com o total sem filtro), as linhas da tabela virtualizada e a janela visível, onde o card cai ao
 * soltar entre os grupos de coluna, os itens do Calendário, ordem e agrupamento na URL e os chips dos filtros.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClienteResumo, Coluna, Demanda, Etiqueta, UsuarioResumo } from '../../shared/tipos/index.ts'
import {
  agruparDemandas, alternarNaLista, chipsDosFiltros, contarNoPainel, deslocamentos, destinoAoSoltar, escreverOrdem, faixaDePrazo,
  itensDoCalendario, janelaVisivel, juntarNomes, lerAgrupamento, lerOrdem, linhasDaLista, ordenarDemandas, proximaOrdem, semCampo,
  semPrazo, type ContextoLista, type GrupoLista,
} from '../../web/src/funcionalidades/lista/logica.ts'

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

const coluna = (id: string, nome: string, pos: number, papel: Coluna['papel'] = 'normal'): Coluna =>
  ({ id, quadroId: 'q1', nome, cor: 'azul', papel, responsavelId: null, limiteWip: null, pos, arquivadaEm: null })
const COLUNAS = [coluna('c-fila', 'Fila', 1), coluna('c-bia', 'Bia', 2), coluna('c-cliente', 'Com o cliente', 3, 'aguardando_cliente'), coluna('c-feito', 'Concluído', 4, 'concluida')]
const ETIQUETAS: Etiqueta[] = [
  { id: 'e-urg', quadroId: 'q1', nome: 'Urgente', cor: 'rosa', pos: 1 },
  { id: 'e-alt', quadroId: 'q1', nome: 'Alteração', cor: 'ambar', pos: 2 },
]
const usuario = (id: string, nome: string, apelido: string | null): Pick<UsuarioResumo, 'nome' | 'apelido' | 'cor' | 'ativo'> =>
  ({ nome, apelido, cor: 'roxo', ativo: true })
const CTX: ContextoLista = {
  colunas: COLUNAS,
  etiquetas: ETIQUETAS,
  clientes: new Map<string, Pick<ClienteResumo, 'sigla' | 'nome' | 'cor'>>([
    ['cli-he', { sigla: 'HE', nome: 'Hospital Evangélico', cor: 'verde' }], ['cli-cla', { sigla: 'CLA', nome: 'Clínica Aurora', cor: 'azul' }],
  ]),
  usuarios: new Map([['u-bia', usuario('u-bia', 'Beatriz Nunes', 'Bia')], ['u-leo', usuario('u-leo', 'Leonardo Martins', 'Léo')], ['u-ana', usuario('u-ana', 'Ana Souza', null)]]),
  agora: AGORA,
}
const numeros = (l: readonly Demanda[]) => l.map((d) => d.numero)

describe('F6 · Lista: ordenar', () => {
  const lista = [
    demanda({ numero: 5, colunaId: 'c-bia', posicao: 10, prazo: '2026-10-20', prioridade: 'baixa', titulo: 'banner', clienteId: 'cli-he' }),
    demanda({ numero: 3, colunaId: 'c-fila', posicao: 20, prazo: '2026-10-15', prazoHora: '09:00', prioridade: 'urgente', titulo: 'Ação' }),
    demanda({ numero: 9, colunaId: 'c-fila', posicao: 10, prioridade: 'alta', titulo: 'carrossel', clienteId: 'cli-cla', membroIds: ['u-leo'] }),
    demanda({ numero: 1, colunaId: 'c-bia', posicao: 5, prazo: '2026-10-15', prioridade: 'media', titulo: 'Árvore', membroIds: ['u-bia', 'u-leo'] }),
  ]

  test('ordem do quadro: coluna, posição, número (e invertida)', () => {
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'posicao', direcao: 'asc' }, CTX)), [9, 3, 1, 5])
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'posicao', direcao: 'desc' }, CTX)), [5, 1, 3, 9])
  })

  test('prazo: mais cedo primeiro; sem hora vale 18h; sem prazo no fim nas duas direções', () => {
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'prazo', direcao: 'asc' }, CTX)), [3, 1, 5, 9])
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'prazo', direcao: 'desc' }, CTX)), [5, 1, 3, 9])
  })

  test('prioridade: urgente primeiro; título sem acento e sem caixa; cliente pela sigla (sem cliente no fim)', () => {
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'prioridade', direcao: 'asc' }, CTX)), [3, 9, 1, 5])
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'titulo', direcao: 'asc' }, CTX)), [3, 1, 5, 9])
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'cliente', direcao: 'asc' }, CTX)), [9, 5, 3, 1])
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'cliente', direcao: 'desc' }, CTX)), [5, 9, 3, 1])
  })

  test('membros pelo primeiro nome curto; empates seguem a ordem do quadro; número', () => {
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'membros', direcao: 'asc' }, CTX)), [1, 9, 3, 5])
    assert.deepEqual(numeros(ordenarDemandas(lista, { campo: 'numero', direcao: 'desc' }, CTX)), [9, 5, 3, 1])
  })

  test('não muda a lista de entrada', () => {
    const copia = [...lista]
    ordenarDemandas(lista, { campo: 'prazo', direcao: 'asc' }, CTX)
    assert.deepEqual(lista, copia)
  })
})

describe('F6 · Lista: agrupar', () => {
  const todas = [
    demanda({ numero: 1, colunaId: 'c-fila', membroIds: ['u-bia'], clienteId: 'cli-he', prioridade: 'urgente' }),
    demanda({ numero: 2, colunaId: 'c-fila', membroIds: ['u-bia', 'u-leo'], clienteId: 'cli-cla' }),
    demanda({ numero: 3, colunaId: 'c-bia' }),
    demanda({ numero: 4, colunaId: 'c-bia', membroIds: ['u-leo'], clienteId: 'cli-he', prioridade: 'baixa' }),
  ]
  const visiveis = todas.filter((d) => d.numero !== 4)
  const resumo = (g: GrupoLista[]) => g.map((x) => [x.rotulo, numeros(x.demandas), x.total])

  test('por coluna: todas as colunas, vazias inclusive, com o total sem filtro', () => {
    assert.deepEqual(resumo(agruparDemandas(visiveis, todas, 'coluna', CTX)),
      [['Fila', [1, 2], 2], ['Bia', [3], 2], ['Com o cliente', [], 0], ['Concluído', [], 0]])
    assert.equal(agruparDemandas(visiveis, todas, 'coluna', CTX)[1].colunaId, 'c-bia')
  })

  test('por membro: "Sem membros" primeiro, a demanda aparece em cada pessoa; grupo sem visível some', () => {
    assert.deepEqual(resumo(agruparDemandas(visiveis, todas, 'membro', CTX)),
      [['Sem membros', [3], 1], ['Bia', [1, 2], 2], ['Léo', [2], 2]])
  })

  test('por cliente: pela sigla, "Sem cliente" no fim; por prioridade: urgente → baixa', () => {
    assert.deepEqual(resumo(agruparDemandas(visiveis, todas, 'cliente', CTX)),
      [['CLA · Clínica Aurora', [2], 1], ['HE · Hospital Evangélico', [1], 2], ['Sem cliente', [3], 1]])
    assert.deepEqual(resumo(agruparDemandas(todas, todas, 'prioridade', CTX)).map((g) => g[0]), ['Urgente', 'Média', 'Baixa'])
  })

  test('por prazo: atrasadas, hoje, esta semana, depois, sem prazo, com o cliente, concluídas', () => {
    const lista = [
      demanda({ numero: 1, prazo: '2026-10-13' }), demanda({ numero: 2, prazo: '2026-10-14' }), demanda({ numero: 3, prazo: '2026-10-18' }),
      demanda({ numero: 4, prazo: '2026-10-19' }), demanda({ numero: 5 }), demanda({ numero: 6, prazo: '2026-10-01', colunaId: 'c-cliente' }),
      demanda({ numero: 7, concluidaEm: '2026-10-13T12:00:00.000Z', colunaId: 'c-feito' }),
    ]
    assert.deepEqual(resumo(agruparDemandas(lista, lista, 'prazo', CTX)).map((g) => [g[0], g[1]]), [
      ['Atrasadas', [1]], ['Hoje', [2]], ['Esta semana', [3]], ['Depois', [4]], ['Sem prazo', [5]], ['Com o cliente', [6]], ['Concluídas', [7]],
    ])
    assert.equal(faixaDePrazo(demanda({ prazo: '2026-10-14', prazoHora: '08:00' }), { papel: 'normal' }, AGORA), 'atrasadas')
  })

  test('sem agrupar: um grupo só, com todas', () => {
    assert.deepEqual(resumo(agruparDemandas(visiveis, todas, 'nenhum', CTX)), [['Todas', [1, 2, 3], 4]])
  })
})

describe('F6 · Lista: linhas da tabela e janela', () => {
  const todas = [demanda({ numero: 1 }), demanda({ numero: 2 }), demanda({ numero: 3, colunaId: 'c-bia' })]
  const grupos = agruparDemandas(todas, todas, 'coluna', CTX)

  test('cabeçalho por grupo; grupo de coluna vazio ganha a vaga de soltar; recolhido não tem linhas', () => {
    const linhas = linhasDaLista(grupos, new Set(['coluna:c-bia']), 'coluna')
    assert.deepEqual(linhas.map((l) => l.tipo), ['grupo', 'demanda', 'demanda', 'grupo', 'grupo', 'vazio', 'grupo', 'vazio'])
    assert.equal(linhas[3].tipo === 'grupo' && linhas[3].recolhido, true)
    assert.equal(new Set(linhas.map((l) => l.chave)).size, linhas.length)
  })

  test('por membro a mesma demanda vira duas linhas com chaves diferentes; sem agrupar não há cabeçalho', () => {
    const d = [demanda({ numero: 1, membroIds: ['u-bia', 'u-leo'] })]
    const linhas = linhasDaLista(agruparDemandas(d, d, 'membro', CTX), new Set(), 'membro')
    assert.deepEqual(linhas.filter((l) => l.tipo === 'demanda').map((l) => l.chave), ['membro:u-bia|d1', 'membro:u-leo|d1'])
    assert.deepEqual(linhasDaLista(agruparDemandas(d, d, 'nenhum', CTX), new Set(['todas']), 'nenhum').map((l) => l.tipo), ['demanda'])
  })

  test('topo de cada linha e a janela visível com folga, sem passar das pontas', () => {
    const linhas = linhasDaLista(grupos, new Set(), 'coluna')
    const { topos, total } = deslocamentos(linhas, { grupo: 40, demanda: 50, vazio: 30 })
    assert.deepEqual(topos.slice(0, 4), [0, 40, 90, 140])
    assert.equal(total, 40 + 50 + 50 + 40 + 50 + 40 + 30 + 40 + 30)
    assert.deepEqual(janelaVisivel(topos, total, 0, 100, 0), [0, 3])
    assert.deepEqual(janelaVisivel(topos, total, 95, 50, 1), [1, 5])
    assert.deepEqual(janelaVisivel(topos, total, 10_000, 500, 2), [6, 9])
    assert.deepEqual(janelaVisivel([], 0, 0, 500), [0, 0])
  })

  test('10 mil linhas: a janela sai por busca binária e é pequena', () => {
    const topos = Array.from({ length: 10_000 }, (_, i) => i * 44)
    const [ini, fim] = janelaVisivel(topos, 440_000, 220_000, 880)
    assert.ok(ini >= 4980 && fim <= 5030 && fim - ini < 40, `${ini}-${fim}`)
  })
})

describe('F6 · Lista: soltar entre os grupos de coluna', () => {
  const fila = [demanda({ numero: 1, id: 'a' }), demanda({ numero: 2, id: 'b' }), demanda({ numero: 3, id: 'c' })]
  const d = demanda({ numero: 9, id: 'x', colunaId: 'c-bia' })

  test('na ordem do quadro cai antes ou depois da linha indicada; no cabeçalho, no topo', () => {
    assert.deepEqual(destinoAoSoltar(d, { colunaId: 'c-fila', referenciaId: 'b', lado: 'antes' }, true, fila), { colunaId: 'c-fila', posicao: { antesDeId: 'b' } })
    assert.deepEqual(destinoAoSoltar(d, { colunaId: 'c-fila', referenciaId: 'b', lado: 'depois' }, true, fila), { colunaId: 'c-fila', posicao: { depoisDeId: 'b' } })
    assert.deepEqual(destinoAoSoltar(d, { colunaId: 'c-fila', referenciaId: null, lado: 'antes' }, true, fila), { colunaId: 'c-fila', posicao: { depoisDeId: null } })
  })

  test('com outra ordem (prazo, título…) vai para o topo da coluna; na mesma coluna não muda nada', () => {
    assert.deepEqual(destinoAoSoltar(d, { colunaId: 'c-fila', referenciaId: 'b', lado: 'depois' }, false, fila), { colunaId: 'c-fila', posicao: { depoisDeId: null } })
    assert.equal(destinoAoSoltar(fila[2], { colunaId: 'c-fila', referenciaId: 'a', lado: 'antes' }, false, fila), null)
  })

  test('soltar sobre si mesmo ou no lugar onde já está não move', () => {
    assert.equal(destinoAoSoltar(fila[1], { colunaId: 'c-fila', referenciaId: 'b', lado: 'antes' }, true, fila), null)
    assert.equal(destinoAoSoltar(fila[1], { colunaId: 'c-fila', referenciaId: 'c', lado: 'antes' }, true, fila), null)
    assert.equal(destinoAoSoltar(fila[1], { colunaId: 'c-fila', referenciaId: 'a', lado: 'depois' }, true, fila), null)
    assert.equal(destinoAoSoltar(fila[0], { colunaId: 'c-fila', referenciaId: null, lado: 'antes' }, true, fila), null)
    assert.deepEqual(destinoAoSoltar(fila[0], { colunaId: 'c-fila', referenciaId: 'c', lado: 'depois' }, true, fila), { colunaId: 'c-fila', posicao: { depoisDeId: 'c' } })
    assert.deepEqual(destinoAoSoltar(fila[2], { colunaId: 'c-fila', referenciaId: null, lado: 'antes' }, true, fila), { colunaId: 'c-fila', posicao: { depoisDeId: null } })
  })

  test('referência que saiu da coluna (outra pessoa a moveu): topo', () => {
    assert.deepEqual(destinoAoSoltar(d, { colunaId: 'c-fila', referenciaId: 'sumiu', lado: 'antes' }, true, fila), { colunaId: 'c-fila', posicao: { depoisDeId: null } })
  })
})

describe('F6 · Calendário do quadro', () => {
  const lista = [
    demanda({ numero: 1, prazo: '2026-10-16', prazoHora: '14:00', inicio: '2026-10-12', publicacaoData: '2026-10-20', publicacaoHora: '09:00' }),
    demanda({ numero: 2, colunaId: 'c-bia', posicao: 5 }),
    demanda({ numero: 3, posicao: 9 }),
    demanda({ numero: 4, concluidaEm: '2026-10-13T12:00:00.000Z' }),
  ]

  test('um item por campo pedido que a demanda tem, com a hora de cada um', () => {
    assert.deepEqual(itensDoCalendario(lista, ['prazo']).map((i) => [i.demanda.numero, i.campo, i.data, i.hora]), [[1, 'prazo', '2026-10-16', '14:00']])
    assert.deepEqual(itensDoCalendario(lista, ['prazo', 'inicio', 'publicacao']).map((i) => [i.campo, i.data, i.hora]), [
      ['prazo', '2026-10-16', '14:00'], ['inicio', '2026-10-12', null], ['publicacao', '2026-10-20', '09:00'],
    ])
  })

  test('"Sem prazo": as abertas sem prazo, na ordem do quadro (concluída fica de fora)', () => {
    assert.deepEqual(numeros(semPrazo(lista, COLUNAS)), [3, 2])
  })
})

describe('F6 · ordem e agrupamento na URL', () => {
  test('ler e escrever a ordem (o "-" é decrescente); inválido vira null', () => {
    assert.deepEqual(lerOrdem('-prazo'), { campo: 'prazo', direcao: 'desc' })
    assert.deepEqual(lerOrdem('titulo'), { campo: 'titulo', direcao: 'asc' })
    assert.equal(escreverOrdem({ campo: 'prioridade', direcao: 'desc' }), '-prioridade')
    for (const lixo of [null, '', '-', 'altura', '--prazo']) assert.equal(lerOrdem(lixo), null)
    assert.equal(lerAgrupamento('membro'), 'membro')
    assert.equal(lerAgrupamento('equipe'), null)
  })

  test('clicar no cabeçalho: crescente, decrescente e de volta à ordem do quadro', () => {
    let o = proximaOrdem({ campo: 'posicao', direcao: 'asc' }, 'prazo')
    assert.deepEqual(o, { campo: 'prazo', direcao: 'asc' })
    o = proximaOrdem(o, 'prazo')
    assert.deepEqual(o, { campo: 'prazo', direcao: 'desc' })
    assert.deepEqual(proximaOrdem(o, 'prazo'), { campo: 'posicao', direcao: 'asc' })
    assert.deepEqual(proximaOrdem(o, 'titulo'), { campo: 'titulo', direcao: 'asc' })
  })
})

describe('F6 · chips dos filtros', () => {
  const ctx = {
    clientes: new Map([['cli-he', { sigla: 'HE' }], ['cli-cla', { sigla: 'CLA' }], ['cli-icc', { sigla: 'ICC' }]]),
    usuarios: new Map([['u-bia', { nome: 'Beatriz Nunes', apelido: 'Bia' }], ['u-ana', { nome: 'Ana Souza', apelido: null }]]),
    etiquetas: new Map([['e-urg', { nome: 'Urgente', cor: 'rosa' as const }], ['e-cor', { nome: '', cor: 'azul' as const }]]),
  }
  const todos = new Set(['clientes', 'membros', 'etiquetas', 'prazo', 'prioridades', 'comCliente', 'concluidas', 'texto', 'soMinhas'] as const)

  test('um chip por campo, na ordem do painel, com nomes legíveis', () => {
    const chips = chipsDosFiltros({
      texto: ' carrossel ', soMinhas: true, clientes: ['cli-he', 'cli-cla', 'cli-icc'], membros: ['nenhum', 'u-ana'], etiquetas: ['e-urg', 'e-cor'],
      prazo: 'atrasado', prioridades: ['baixa', 'urgente'], comCliente: true, concluidas: 'so',
    }, ctx, todos)
    assert.deepEqual(chips.map((c) => c.rotulo), [
      '“carrossel”', 'Só as minhas', 'Clientes: HE, CLA e mais 1', 'Membros: sem membros e Ana', 'Etiquetas: Urgente e sem nome',
      'Prazo: atrasadas', 'Prioridade: urgente e baixa', 'Com o cliente', 'Só as concluídas',
    ])
    assert.ok(chips.every((c) => c.tirar.startsWith('Tirar')))
  })

  test('só as sentinelas, ids que sumiram e campos fora da lista de inclusão', () => {
    const chips = chipsDosFiltros({ membros: ['nenhum'], etiquetas: ['nenhuma'], clientes: ['cli-he', 'cli-velho'], texto: 'x', concluidas: 'esconder' },
      ctx, new Set(['membros', 'etiquetas', 'clientes', 'concluidas']))
    assert.deepEqual(chips.map((c) => c.rotulo), ['Clientes: HE e 1 removido', 'Sem membros', 'Sem etiquetas', 'Sem as concluídas'])
  })

  test('tirar um campo, contar o que o painel liga e alternar valores numa lista', () => {
    assert.deepEqual(semCampo({ prazo: 'hoje', texto: 'a' }, 'prazo'), { texto: 'a' })
    assert.equal(contarNoPainel({ texto: 'a', soMinhas: true, concluidas: 'mostrar', prazo: 'hoje', membros: ['nenhum'] }), 2)
    assert.deepEqual(alternarNaLista(['a'], 'b'), ['a', 'b'])
    assert.equal(alternarNaLista(['a'], 'a'), undefined)
    assert.deepEqual(alternarNaLista(undefined, 'a'), ['a'])
    assert.equal(juntarNomes([]), '')
    assert.equal(juntarNomes(['A']), 'A')
    assert.equal(juntarNomes(['A', 'B', 'C', 'D'], 3), 'A, B, C e mais 1')
  })
})
