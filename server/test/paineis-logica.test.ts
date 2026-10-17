/** shared/logica/paineis.ts (F3): as funções puras do Início, da Agenda e das horas. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Demanda } from '../../shared/tipos/index.ts'
import {
  diasNoIntervalo, domingoDaSemana, formatarDuracao, itensAgenda, lerDuracao, minhasPorPrazo, porPrazo, primeirosPassos,
} from '../../shared/logica/paineis.ts'

let n = 0
function demanda(p: Partial<Demanda> = {}): Demanda {
  n++
  return {
    id: `d${n}`, numero: n, quadroId: 'q1', colunaId: 'c1', posicao: n, titulo: `D${n}`, clienteId: null, atendimentoId: null,
    modeloId: null, membroIds: ['eu'], etiquetaIds: [], prioridade: 'media', inicio: null, inicioHora: null, prazo: null,
    prazoHora: null, publicacaoData: null, publicacaoHora: null, estimativaMin: null, minutosRegistrados: 0, repetir: 'nenhuma',
    capaCor: null, capaAnexoId: null, capaUrl: null, concluidaEm: null, concluidaPor: null, statusDesde: '2026-10-01T12:00:00.000Z',
    envioPendenteEm: null, retornoEm: null, rodadaAtual: 1, rodadasInclusas: 2, aprovadaEm: null, aprovadaVersaoId: null,
    versaoAtualId: null, versaoEnviadaId: null, nVersoes: 0, nAnexos: 0, nCheckTotal: 0, nCheckFeitos: 0, nComentarios: 0,
    origem: 'manual', origemDemandaId: null, descricaoAtualizadaEm: null, criadoPor: 'eu', arquivadoEm: null, rev: 1,
    criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-01T12:00:00.000Z', ...p,
  }
}

describe('duração das horas', () => {
  test('lerDuracao entende minutos, horas, "1h30", "1:30" e decimais; fora de 1 min a 24 h é null', () => {
    const casos: [string, number | null][] = [
      ['90', 90], ['45min', 45], ['45 min', 45], ['1h', 60], ['1h30', 90], ['1h 30min', 90], ['1 hora e 15', 75], ['2 horas', 120],
      ['1:30', 90], ['0:05', 5], ['1,5h', 90], ['1.25 h', 75], ['24h', 1440], ['', null], ['0', null], ['25h', null],
      ['1h75', null], ['abc', null], ['1h30 e pouco', null],
    ]
    for (const [texto, esperado] of casos) assert.equal(lerDuracao(texto), esperado, texto)
  })

  test('formatarDuracao', () => {
    assert.deepEqual([0, 5, 59, 60, 90, 125, 600, 1445].map(formatarDuracao), ['0 min', '5 min', '59 min', '1h', '1h30', '2h05', '10h', '24h05'])
  })
})

describe('Início e Agenda', () => {
  test('domingo da semana (a semana começa na segunda) e dias do intervalo', () => {
    assert.equal(domingoDaSemana('2026-10-14'), '2026-10-18')
    assert.equal(domingoDaSemana('2026-10-12'), '2026-10-18')
    assert.equal(domingoDaSemana('2026-10-18'), '2026-10-18')
    assert.equal(diasNoIntervalo('2026-10-01', '2026-12-01'), 62)
    assert.equal(diasNoIntervalo('2026-10-01', '2026-10-01'), 1)
    assert.equal(diasNoIntervalo('2026-10-02', '2026-10-01'), 0)
  })

  test('porPrazo: prazo, hora (sem hora = 18h), prioridade (urgente primeiro), número; sem prazo por último', () => {
    const a = demanda({ prazo: '2026-10-15', prazoHora: '19:00' })
    const b = demanda({ prazo: '2026-10-15' })
    const c = demanda({ prazo: '2026-10-15', prioridade: 'urgente' })
    const d = demanda({ prazo: '2026-10-14', prioridade: 'baixa' })
    const e = demanda()
    assert.deepEqual([a, b, c, d, e].sort(porPrazo).map((x) => x.id), [d.id, c.id, b.id, a.id, e.id])
  })

  test('minhasPorPrazo usa o papel da coluna: aguardando_cliente pausa (vai para "depois")', () => {
    const agora = new Date('2026-10-14T13:00:00.000Z')
    const vencida = demanda({ prazo: '2026-10-13', colunaId: 'cliente' })
    const deOutro = demanda({ prazo: '2026-10-13', membroIds: ['outro'] })
    const minhas = minhasPorPrazo([vencida, deOutro], (id) => (id === 'cliente' ? 'aguardando_cliente' : 'normal'), 'eu', agora)
    assert.deepEqual(minhas, { atrasadas: [], hoje: [], semana: [], depois: [vencida.id], semPrazo: [] })
    // a decisão do cliente depois de entrar na coluna devolve a bola
    const decidida = { ...vencida, retornoEm: '2026-10-13T12:00:00.000Z' }
    assert.deepEqual(minhasPorPrazo([decidida], () => 'aguardando_cliente', 'eu', agora).atrasadas, [vencida.id])
  })

  test('itensAgenda: campos, intervalo inclusive, só as minhas, quadros e concluídas', () => {
    const x = demanda({ prazo: '2026-10-01', inicio: '2026-09-30', publicacaoData: '2026-10-31', publicacaoHora: '10:00' })
    const y = demanda({ prazo: '2026-10-31', quadroId: 'q2', membroIds: ['outro'], concluidaEm: '2026-10-02T12:00:00.000Z' })
    const base = { de: '2026-10-01', ate: '2026-10-31' }
    assert.deepEqual(itensAgenda([x, y], base, 'eu').map((i) => `${i.campo}:${i.demandaId}`), [`prazo:${x.id}`, `prazo:${y.id}`])
    assert.deepEqual(itensAgenda([x, y], { ...base, campos: ['inicio', 'publicacao'] }, 'eu').map((i) => `${i.campo}:${i.demandaId}:${i.hora}`),
      [`publicacao:${x.id}:10:00`])
    assert.deepEqual(itensAgenda([x, y], { ...base, soMinhas: true }, 'eu').map((i) => i.demandaId), [x.id])
    assert.deepEqual(itensAgenda([x, y], { ...base, quadroIds: ['q2'] }, 'eu').map((i) => i.demandaId), [y.id])
    assert.deepEqual(itensAgenda([x, y], { ...base, incluirConcluidas: false }, 'eu').map((i) => i.demandaId), [x.id])
    assert.deepEqual(itensAgenda([{ ...x, arquivadoEm: '2026-10-05T12:00:00.000Z' }], base, 'eu'), [])
  })

  test('primeirosPassos: null quando tudo está feito', () => {
    const tudo = { usuariosAtivos: 2, quadrosAtivos: 1, clientesAtivos: 1, clientesSemAm: 0, modelosRevisadosEm: '2026-10-14T13:00:00.000Z' }
    assert.equal(primeirosPassos(tudo), null)
    assert.deepEqual(primeirosPassos({ ...tudo, clientesSemAm: 1 })!.itens.map((i) => i.feito), [true, true, false, true])
  })
})
