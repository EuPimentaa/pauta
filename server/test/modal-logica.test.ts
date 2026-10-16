/**
 * Lógica pura do modal (F1) que roda sem navegador: duração digitada, menções inválidas, frase do histórico e o cache
 * do detalhe, dos comentários e do meu cronômetro (o mesmo código dos tratadores do tempo real).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/query-core'
import type { Apontamento, Atividade, ChecklistComItens, ChecklistItem, Comentario, DemandaDetalhe } from '../../shared/tipos/index.ts'
import { formatarCorrendo, formatarDuracao, lerDuracao, limparMencoes } from '../../shared/logica/modal-texto.ts'
import { fraseAtividade, juntar, type NomesAtividade } from '../../shared/logica/modal-atividade.ts'
import {
  comAnexo, comCamposDoItem, comChecklist, comComentario, comItem, contadoresDoDetalhe, cronometroDepois, mudarDetalhe, semChecklist,
  semItem, vivos,
} from '../../web/src/funcionalidades/modal/cache.ts'
import { demanda, bootstrap } from './nucleo-web-ajuda.ts'

describe('texto do modal', () => {
  test('lerDuracao aceita minutos, horas e h:mm; recusa fora de 1 a 1440', () => {
    const casos: [string, number | null][] = [
      ['45', 45], ['45m', 45], ['45 min', 45], ['1h', 60], ['1h30', 90], ['1h 30min', 90], ['1:30', 90], ['1,5h', 90],
      ['2 horas', 120], ['0', null], ['24:01', null], ['1:75', null], ['abc', null], ['', null], ['1441', null], ['24h', 1440],
    ]
    for (const [texto, esperado] of casos) assert.equal(lerDuracao(texto), esperado, texto)
  })

  test('formatarDuracao e formatarCorrendo', () => {
    assert.equal(formatarDuracao(45), '45 min')
    assert.equal(formatarDuracao(60), '1h')
    assert.equal(formatarDuracao(95), '1h35')
    assert.equal(formatarDuracao(605), '10h05')
    assert.equal(formatarCorrendo(42 * 60_000 + 59_000), '0:42')
    assert.equal(formatarCorrendo(125 * 60_000), '2:05')
  })

  test('limparMencoes deixa as válidas e põe as outras em texto', () => {
    const md = 'Oi @[Rafa](mencao:u1) e @[Fantasma](mencao:u9), [link](https://x.com)'
    assert.equal(limparMencoes(md, new Set(['u1'])), 'Oi @[Rafa](mencao:u1) e @Fantasma, [link](https://x.com)')
  })
})

describe('frase do histórico', () => {
  const nomes: NomesAtividade = {
    pessoa: (id) => ({ u1: 'Rafa', u2: 'Bia' } as Record<string, string>)[id] ?? null,
    coluna: (id) => ({ c1: 'Fazendo', c2: 'Revisão', c3: 'Agendar' } as Record<string, string>)[id] ?? null,
    quadro: (id) => ({ q1: 'Criação', q2: 'Social' } as Record<string, string>)[id] ?? null,
    data: (d) => `[${d}]`,
    eu: 'u2',
  }
  const a = (tipo: Atividade['tipo'], dados: unknown, extra: Partial<Atividade> = {}): Atividade =>
    ({ id: 1, demandaId: 'd', clienteId: null, atorId: 'u1', atorTipo: 'usuario', tipo, dados, antes: null, criadoEm: '', ...extra }) as Atividade

  test('mover na mesma coluna, entre quadros e por automação', () => {
    assert.deepEqual(fraseAtividade(a('demanda.movida', { de: { quadroId: 'q1', colunaId: 'c1' }, para: { quadroId: 'q1', colunaId: 'c2' }, via: 'manual' }), nomes),
      { ator: 'Rafa', texto: 'moveu de Fazendo para Revisão', grupo: 'movimento' })
    const outro = fraseAtividade(a('demanda.movida', {
      de: { quadroId: 'q1', colunaId: 'c2' }, para: { quadroId: 'q2', colunaId: 'c3' }, via: 'automacao', etiquetasDeixadas: ['Urgente'],
    }, { atorTipo: 'sistema', atorId: null }), nomes)
    assert.equal(outro.ator, 'Automação')
    assert.equal(outro.texto, 'moveu de Criação › Revisão para Social › Agendar · Urgente ficou no quadro de origem')
    assert.equal(fraseAtividade(a('demanda.movida', { de: { quadroId: 'q1', colunaId: 'x' }, para: { quadroId: 'q1', colunaId: 'c1' }, via: 'manual' }), nomes).texto,
      'moveu de uma coluna arquivada para Fazendo')
  })

  test('eu, membros, edição com o prazo antigo, tempo e cliente', () => {
    assert.equal(fraseAtividade(a('demanda.membro_adicionado', { usuarioId: 'u2' }), nomes).texto, 'pôs você na demanda')
    assert.equal(fraseAtividade(a('demanda.membro_adicionado', { usuarioId: 'u1' }), nomes).texto, 'entrou na demanda')
    assert.equal(fraseAtividade(a('demanda.editada', { campos: ['prazo'] }, { antes: { prazo: '2026-10-16' } }), nomes).texto, 'mudou o prazo (era [2026-10-16])')
    assert.equal(fraseAtividade(a('demanda.editada', { campos: ['titulo', 'prioridade', 'capaCor'] }), nomes).texto, 'mudou o título, a prioridade e a capa')
    assert.equal(fraseAtividade(a('tempo.lancado', { minutos: 90, origem: 'cronometro', apontamentoId: 'x' }, { atorId: 'u2' }), nomes).ator, 'Você')
    assert.equal(fraseAtividade(a('tempo.lancado', { minutos: 90, origem: 'cronometro', apontamentoId: 'x' }), nomes).texto, 'registrou 1h30 no cronômetro')
    assert.deepEqual(fraseAtividade(a('retorno.registrado', { decisao: 'ajuste', via: 'link', versaoNumero: 2, quem: 'Fulana', aprovacaoId: 'x' },
      { atorTipo: 'cliente', atorId: null }), nomes), { ator: 'Fulana', texto: 'pediu ajuste na V2 pelo link', grupo: 'ciclo' })
    assert.equal(juntar(['a', 'b', 'b', 'c']), 'a, b e c')
  })
})

// ─────────────────────────────── cache ───────────────────────────────

const item = (id: string, checklistId: string, pos: number, feito = false): ChecklistItem =>
  ({ id, checklistId, demandaId: 'd1', texto: id, feitoEm: feito ? '2026-10-14T12:00:00.000Z' : null, feitoPor: feito ? 'u' : null, pos })
const checklist = (id: string, pos: number, itens: ChecklistItem[]): ChecklistComItens =>
  ({ id, demandaId: 'd1', titulo: id, rodadaId: null, pos, criadoEm: '', itens })

function detalhe(extra: Partial<DemandaDetalhe> = {}): DemandaDetalhe {
  return {
    demanda: demanda(), quadro: {} as DemandaDetalhe['quadro'], coluna: {} as DemandaDetalhe['coluna'], descricaoMd: '', origemTexto: null,
    mencoes: [], checklists: [], anexos: [], rodadas: [], versoes: [], envios: [], aprovacoes: [], linksPublicos: [], movimentos: [],
    tempo: { totalMin: 0, meusMin: 0 }, ...extra,
  }
}

describe('cache do modal', () => {
  test('checklists e itens: inserir em ordem, evento sem itens mantém os itens, mover entre checklists, apagar', () => {
    let det = detalhe({ checklists: [checklist('a', 1024, [item('i1', 'a', 1024)])] })
    det = comChecklist(det, checklist('b', 512, [item('i3', 'b', 2048), item('i2', 'b', 1024, true)]))
    assert.deepEqual(det.checklists.map((c) => c.id), ['b', 'a'])
    assert.deepEqual(det.checklists[0]!.itens.map((i) => i.id), ['i2', 'i3'])
    // o evento do checklist vem sem itens: mantém os que o cache tem
    det = comChecklist(det, { id: 'b', demandaId: 'd1', titulo: 'Bê', rodadaId: null, pos: 512, criadoEm: '' })
    assert.equal(det.checklists[0]!.titulo, 'Bê')
    assert.equal(det.checklists[0]!.itens.length, 2)
    det = comItem(det, item('i4', 'a', 512))
    assert.deepEqual(det.checklists[1]!.itens.map((i) => i.id), ['i4', 'i1'])
    det = comCamposDoItem(det, 'i1', { pos: 100 })
    assert.deepEqual(det.checklists[1]!.itens.map((i) => i.id), ['i1', 'i4'])
    assert.deepEqual(contadoresDoDetalhe(det), { nCheckTotal: 4, nCheckFeitos: 1, nAnexos: 0 })
    const igual = comCamposDoItem(det, 'nao-existe', { pos: 1 })
    assert.equal(igual, det)
    det = semItem(det, 'i2')
    det = semChecklist(det, 'a')
    assert.deepEqual(contadoresDoDetalhe(det), { nCheckTotal: 1, nCheckFeitos: 0, nAnexos: 0 })
    // item de checklist que o detalhe não conhece: nada
    assert.equal(comItem(det, item('x', 'z', 1)), det)
  })

  test('anexos e comentários: idempotente e em ordem', () => {
    const anexo = { id: 'a1', demandaId: 'd1', tipo: 'link', nome: 'x', url: 'https://x', caminho: null, arquivo: null, provedor: 'outro',
      driveStatus: null, driveTestadoEm: null, pos: 2048, comentarioId: null, finalidade: 'referencia', enviadoPor: null, criadoEm: '' } as const
    let det = comAnexo(detalhe(), { ...anexo })
    det = comAnexo(det, { ...anexo, id: 'a0', pos: 1024 })
    det = comAnexo(det, { ...anexo, nome: 'renomeado' })
    assert.deepEqual(det.anexos.map((a) => [a.id, a.nome]), [['a0', 'x'], ['a1', 'renomeado']])
    const c = (id: string, criadoEm: string, excluido = false): Comentario => ({ id, demandaId: 'd1', autorId: 'u', autorExterno: null, linkId: null,
      versaoId: null, corpoMd: id, visivelCliente: false, mencoes: [], anexos: [], editadoEm: null, excluidoEm: excluido ? criadoEm : null, criadoEm })
    let lista = comComentario([], c('b', '2026-10-14T12:00:02.000Z'))
    lista = comComentario(lista, c('a', '2026-10-14T12:00:01.000Z'))
    lista = comComentario(lista, c('b', '2026-10-14T12:00:02.000Z', true))
    assert.deepEqual(lista.map((x) => x.id), ['a', 'b'])
    assert.equal(vivos(lista), 1)
  })

  test('meu cronômetro: ligar, parar, de outra pessoa e excluído', () => {
    const ap = (extra: Partial<Apontamento>): Apontamento => ({ id: 'ap1', usuarioId: 'eu', demandaId: 'd1', clienteId: null, data: '2026-10-14',
      minutos: null, iniciadoEm: '2026-10-14T12:00:00.000Z', paradoEm: null, origem: 'cronometro', nota: null, criadoEm: '', ...extra })
    const ligado = cronometroDepois(null, ap({}), 'eu')
    assert.equal(ligado?.id, 'ap1')
    assert.equal(cronometroDepois(ligado, ap({ usuarioId: 'outra', id: 'ap2' }), 'eu'), ligado)
    assert.equal(cronometroDepois(ligado, ap({ minutos: 30, paradoEm: '2026-10-14T12:30:00.000Z' }), 'eu'), null)
    // parar o anterior (outro id) não apaga o atual
    const outro = cronometroDepois(ligado, ap({ id: 'ap0', minutos: 5, paradoEm: '2026-10-14T12:00:00.000Z' }), 'eu')
    assert.equal(outro, ligado)
    assert.equal(cronometroDepois(ligado, { id: 'ap1', excluido: true }, 'eu'), null)
    assert.equal(cronometroDepois(null, ap({ origem: 'manual', minutos: 30 }), 'eu'), null)
  })

  test('mudarDetalhe acerta os contadores do card no bootstrap', () => {
    const qc = new QueryClient()
    const d = demanda({ id: 'd1', numero: 7 })
    qc.setQueryData(['bootstrap'], bootstrap({ demandas: [d] }))
    qc.setQueryData(['demanda', 7], detalhe({ demanda: d }))
    mudarDetalhe(qc as never, 'd1', (det) => comChecklist(det, checklist('a', 1, [item('i1', 'a', 1, true), item('i2', 'a', 2)])))
    const b = qc.getQueryData<{ demandas: { nCheckTotal: number; nCheckFeitos: number }[] }>(['bootstrap'])!
    assert.deepEqual([b.demandas[0]!.nCheckTotal, b.demandas[0]!.nCheckFeitos], [2, 1])
  })
})
