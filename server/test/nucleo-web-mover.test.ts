/**
 * NÚCLEO-WEB: a previsão local do mover (web/src/api/previsao.ts), que o card usa antes da resposta, e a mescla do
 * 409 de rev (web/src/demanda/mesclar.ts).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cardsDaColuna, depoisDe, lugarAtual, posicaoNoIndice, posicaoPorChave, posicaoPrevista, posicaoValida, preverMovimento,
} from '../../web/src/api/previsao.ts'
import { mesclarEdicao, mesclarTexto } from '../../web/src/demanda/mesclar.ts'
import { bootstrap, demanda } from './nucleo-web-ajuda.ts'

const AGORA = new Date('2026-10-14T13:00:00.000Z')

describe('posição', () => {
  const lista = [demanda({ id: 'a', posicao: 1024 }), demanda({ id: 'b', posicao: 2048 }), demanda({ id: 'c', posicao: 3072 })]
  test('depois de, antes de, topo e fim (a mesma conta do servidor)', () => {
    assert.equal(posicaoPrevista(lista, { depoisDeId: 'a' }), 1536)
    assert.equal(posicaoPrevista(lista, { depoisDeId: 'c' }), 4096)
    assert.equal(posicaoPrevista(lista, { depoisDeId: null }), 0)
    assert.equal(posicaoPrevista(lista, { antesDeId: 'b' }), 1536)
    assert.equal(posicaoPrevista(lista, {}), 4096)
    assert.equal(posicaoPrevista([], {}), 1024)
    assert.equal(posicaoPrevista(lista, { depoisDeId: 'a', antesDeId: 'c' }), 1536, 'depoisDeId vence')
  })

  test('soltar no índice da lista visível', () => {
    const visiveis = [{ id: 'a' }, { id: 'c' }]
    assert.deepEqual(posicaoNoIndice(visiveis, 0), { antesDeId: 'a' })
    assert.deepEqual(posicaoNoIndice(visiveis, 1), { depoisDeId: 'a' })
    assert.deepEqual(posicaoNoIndice(visiveis, 2), { depoisDeId: 'c' })
    assert.deepEqual(posicaoNoIndice([], 0), {})
  })

  test('vizinho de referência que saiu da coluna: refaz pela chave de posição (o servidor recusaria com 400)', () => {
    // a lista de agora: o 'b' foi para outra coluna durante o arraste
    const agora = [lista[0], lista[2]]
    assert.deepEqual(posicaoValida(lista, { depoisDeId: 'b' }, 2560), { depoisDeId: 'b' }, 'ainda está: fica como veio')
    assert.deepEqual(posicaoValida(agora, { depoisDeId: 'b' }, 2560), { depoisDeId: 'a' }, 'logo abaixo de onde o b estava')
    assert.deepEqual(posicaoValida(agora, { antesDeId: 'b' }, 1536), { depoisDeId: 'a' })
    assert.deepEqual(posicaoValida(agora, { depoisDeId: 'b' }, 512), { depoisDeId: null }, 'nada antes: topo')
    assert.deepEqual(posicaoValida(agora, { depoisDeId: 'b' }, null), {}, 'sem chave: fim')
    assert.deepEqual(posicaoValida(agora, { depoisDeId: null }, 9999), { depoisDeId: null }, 'topo sempre vale')
    assert.deepEqual(posicaoValida(agora, {}, 9999), {}, 'fim sempre vale')
    assert.equal(posicaoValida(agora, undefined, 9999), undefined)
    assert.deepEqual(posicaoPorChave(agora, 4000), { depoisDeId: 'c' })
  })

  test('lugar atual (para o Desfazer) e cards da coluna sem o próprio', () => {
    assert.deepEqual(lugarAtual(lista, lista[1]), { colunaId: 'c-fila', posicao: { depoisDeId: 'a' } })
    assert.deepEqual(lugarAtual(lista, lista[0]), { colunaId: 'c-fila', posicao: { depoisDeId: null } })
    assert.deepEqual(cardsDaColuna(lista, 'c-fila', 'b').map((d) => d.id), ['a', 'c'])
  })

  test('status_desde sempre cresce', () => {
    assert.equal(depoisDe('2026-10-14T12:00:00.000Z', AGORA), AGORA.toISOString())
    assert.equal(depoisDe('2026-10-14T13:00:00.000Z', AGORA), '2026-10-14T13:00:00.001Z')
  })
})

describe('previsão do mover', () => {
  test('da Fila para a coluna da Rafa: Rafa entra; da Rafa para a Bia: troca', () => {
    const b = bootstrap({ demandas: [demanda({ membroIds: ['u-eu'] })] })
    const p1 = preverMovimento(b, b.demandas[0], { colunaId: 'c-rafa' }, AGORA)!
    assert.deepEqual(p1.demanda.membroIds, ['u-eu', 'u-rafa'])
    assert.equal(p1.mudaColuna, true)
    assert.equal(p1.demanda.statusDesde, AGORA.toISOString())
    const p2 = preverMovimento(b, p1.demanda, { colunaId: 'c-bia' }, AGORA)!
    assert.deepEqual(p2.demanda.membroIds, ['u-eu', 'u-bia'])
  })

  test('mesma coluna só reordena (membros e status_desde ficam)', () => {
    const b = bootstrap({ demandas: [demanda({ id: 'a', colunaId: 'c-rafa', membroIds: ['u-rafa'] }), demanda({ id: 'b', colunaId: 'c-rafa', posicao: 2048 })] })
    const p = preverMovimento(b, b.demandas[1], { colunaId: 'c-rafa', posicao: { depoisDeId: null } }, AGORA)!
    assert.equal(p.mudaColuna, false)
    assert.equal(p.demanda.posicao, 0)
    assert.equal(p.demanda.statusDesde, b.demandas[1].statusDesde)
    assert.deepEqual(p.demanda.membroIds, [])
  })

  test('outro quadro: etiquetas por nome, as sem par ficam; responsável do cliente no destino', () => {
    const b = bootstrap({ demandas: [demanda({ clienteId: 'cli-he', membroIds: ['u-rafa'], etiquetaIds: ['e-urgente', 'e-alt'] })] })
    const manter = preverMovimento(b, b.demandas[0], { colunaId: 'c-agendar' }, AGORA)!
    assert.equal(manter.mudaQuadro, true)
    assert.equal(manter.demanda.quadroId, 'q-social')
    assert.deepEqual(manter.demanda.etiquetaIds, ['e-social-alt'])
    assert.deepEqual(manter.semPar, ['Urgente'])
    assert.deepEqual(manter.demanda.membroIds, ['u-rafa'])
    const resp = preverMovimento(b, b.demandas[0], { colunaId: 'c-agendar', membros: 'responsavel_destino' }, AGORA)!
    assert.deepEqual(resp.demanda.membroIds, ['u-caio'])
    const desfazer = preverMovimento(b, resp.demanda, { colunaId: 'c-fila', etiquetaIds: ['e-urgente', 'e-alt'], membroIds: ['u-rafa'] }, AGORA)!
    assert.deepEqual(desfazer.demanda.etiquetaIds, ['e-urgente', 'e-alt'])
    assert.deepEqual(desfazer.demanda.membroIds, ['u-rafa'])
  })

  test('entrar numa coluna concluida conclui; sair reabre', () => {
    const b = bootstrap({ demandas: [demanda()] })
    const p = preverMovimento(b, b.demandas[0], { colunaId: 'c-feito' }, AGORA)!
    assert.equal(p.demanda.concluidaEm, AGORA.toISOString())
    assert.equal(p.demanda.concluidaPor, 'u-eu')
    const volta = preverMovimento(b, p.demanda, { colunaId: 'c-fila' }, AGORA)!
    assert.equal(volta.demanda.concluidaEm, null)
  })

  test('coluna desconhecida: sem previsão', () => {
    const b = bootstrap({ demandas: [demanda()] })
    assert.equal(preverMovimento(b, b.demandas[0], { colunaId: 'c-sumiu' }, AGORA), null)
  })
})

describe('mescla do 409', () => {
  test('texto: cada um mexeu num trecho, as duas mudanças entram', () => {
    const base = 'Briefing\n\nTítulo: X\nCores: azul\nPrazo: sexta'
    const meu = 'Briefing\n\nTítulo: Y\nCores: azul\nPrazo: sexta'
    const deles = 'Briefing\n\nTítulo: X\nCores: azul\nPrazo: segunda'
    assert.equal(mesclarTexto(base, meu, deles), 'Briefing\n\nTítulo: Y\nCores: azul\nPrazo: segunda')
  })

  test('texto: os dois mexeram na mesma linha de jeitos diferentes, ficam as duas (a dela primeiro)', () => {
    const base = 'a\nb\nc'
    assert.equal(mesclarTexto(base, 'a\nB meu\nc', 'a\nB dela\nc'), 'a\nB dela\nB meu\nc')
    assert.equal(mesclarTexto(base, 'a\nx\nc', 'a\nx\nc'), 'a\nx\nc')
  })

  test('texto: inserções nos dois lados em pontos diferentes, e um lado sem mudança', () => {
    const base = 'um\ndois\ntres'
    assert.equal(mesclarTexto(base, 'zero\num\ndois\ntres', 'um\ndois\ntres\nquatro'), 'zero\num\ndois\ntres\nquatro')
    assert.equal(mesclarTexto(base, base, 'um\ntres'), 'um\ntres')
    assert.equal(mesclarTexto(base, 'um\ntres', base), 'um\ntres')
  })

  test('campos: o que só eu mudei vai; o que a outra pessoa também deixou igual não vai; descrição mesclada', () => {
    const base = demanda({ titulo: 'Velho', prioridade: 'media', prazo: '2026-10-16' })
    const atual = { demanda: demanda({ titulo: 'Velho', prioridade: 'alta', prazo: '2026-10-20', rev: 3 }), descricaoMd: 'linha 1\nlinha 2 dela' }
    const mudancas = mesclarEdicao(base, 'linha 1\nlinha 2', { titulo: 'Novo', prazo: '2026-10-20', descricaoMd: 'linha 1 minha\nlinha 2' }, atual)
    assert.deepEqual(mudancas, { titulo: 'Novo', descricaoMd: 'linha 1 minha\nlinha 2 dela' })
  })

  test('campos: nada a mandar quando o servidor já tem o que eu queria', () => {
    const atual = { demanda: demanda({ titulo: 'Igual', rev: 2 }), descricaoMd: '' }
    assert.deepEqual(mesclarEdicao(demanda(), null, { titulo: 'Igual' }, atual), {})
  })
})
