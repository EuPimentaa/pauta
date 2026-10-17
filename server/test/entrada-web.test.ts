/**
 * Entrada (F4), lógica pura do front: a análise da criação rápida (shared/logica/rapida.ts, a mesma da prévia ao
 * vivo), os chips do campo (web/.../rapida-chips.ts), as regras da Nova demanda (formulario.ts) e a lista do "?".
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClienteResumo, Coluna, ModeloDemanda, Quadro } from '../../shared/tipos/index.ts'
import { analisarRapida, montarContextoRapida, nomeCurto } from '../../shared/logica/rapida.ts'
import { agruparAtalhos } from '../../web/src/funcionalidades/entrada/atalhos.ts'
import {
  colunaInicial, descricaoAutomatica, entradaDaNovaDemanda, membroSugerido, minutosDeTexto, modelosDoQuadro, motivoParaNaoCriar,
  prazoSugerido, quadroInicial, textoDeMinutos, type EstadoNovaDemanda,
} from '../../web/src/funcionalidades/entrada/formulario.ts'
import { quadroAtualDaUrl } from '../../web/src/funcionalidades/entrada/lugar.ts'
import { formularioSujo, paraGuardar, rascunhoValido } from '../../web/src/funcionalidades/entrada/rascunho.ts'
import {
  clientesEmAndamento, comporLinha, linhasColadas, marcadorDaPessoa, mencaoEmAndamento, reconhecerAoDigitarEspaco, tirarMarcador,
} from '../../web/src/funcionalidades/entrada/rapida-chips.ts'

const CLIENTES = [
  { id: 'c-he', sigla: 'HE', nome: 'Hospital Evangélico', apelidos: ['he', 'hospital evangelico'] },
  { id: 'c-cla', sigla: 'CLA', nome: 'Clínica Aurora', apelidos: ['cla', 'aurora', 'clinica aurora'] },
]
const PESSOAS = [
  { id: 'u-rafa', nome: 'Rafael Lima', apelido: 'Rafa', ativo: true },
  { id: 'u-ana', nome: 'Ana Paula Souza', apelido: 'Ana Paula', ativo: true },
  { id: 'u-leo', nome: 'Leonardo Martins', apelido: 'Léo', ativo: true },
  { id: 'u-bruno1', nome: 'Bruno Alves', apelido: null, ativo: true },
  { id: 'u-bruno2', nome: 'Bruno Dias', apelido: null, ativo: true },
  { id: 'u-marta', nome: 'Marta Nunes', apelido: null, ativo: true },
  { id: 'u-velho', nome: 'Velho Saiu', apelido: 'Velho', ativo: false },
]
const ctx = montarContextoRapida(CLIENTES, PESSOAS)

describe('análise da criação rápida (puro)', () => {
  test('marcadores com as posições no texto e a prévia', () => {
    const a = analisarRapida('HE: Carrossel @rafa @Léo', ctx, { coluna: { nome: 'Fila', responsavelId: null } })
    assert.equal(a.titulo, 'Carrossel')
    assert.equal(a.clienteId, 'c-he')
    assert.deepEqual(a.membroIds, ['u-rafa', 'u-leo'])
    assert.deepEqual(a.marcadores.map((m) => [m.tipo, m.texto, m.inicio, m.fim]),
      [['cliente', 'HE:', 0, 3], ['membro', '@rafa', 14, 19], ['membro', '@Léo', 20, 24]])
    assert.equal(a.previa, 'HE · Rafa · Léo · Fila')
  })

  test('@leo sem acento, apelido com espaço sem os espaços, primeiro nome só sem apelido e sem repetição', () => {
    assert.deepEqual(analisarRapida('x @leo', ctx).membroIds, ['u-leo'])
    assert.deepEqual(analisarRapida('x @anapaula', ctx).membroIds, ['u-ana'])
    assert.deepEqual(analisarRapida('x @marta @bruno @velho @rafael', ctx).membroIds, ['u-marta'])
    assert.equal(analisarRapida('x @rafa, @rafa.', ctx).membroIds.length, 1)
    assert.equal(nomeCurto(PESSOAS[3]!), 'Bruno')
  })

  test('a pessoa da coluna entra na prévia; o cliente do contexto e a sigla nova', () => {
    const a = analisarRapida('Post', ctx, { clienteIdContexto: 'c-cla', coluna: { nome: 'Rafa', responsavelId: 'u-rafa' } })
    assert.deepEqual(a.membroIds, ['u-rafa'])
    assert.equal(a.previa, 'CLA · Rafa · Rafa')
    const nova = analisarRapida('[XYZ] Banner', ctx)
    assert.equal(nova.siglaNova, 'XYZ')
    assert.equal(nova.titulo, '[XYZ] Banner')
    assert.equal(analisarRapida('Reunião às 15:30', ctx).siglaNova, null)
  })
})

describe('chips do campo (puro)', () => {
  test('o espaço digitado depois do marcador vira chip; antes dele, não', () => {
    assert.equal(reconhecerAoDigitarEspaco('@ra', 3, ctx, false), null, 'sem espaço ainda')
    const p = reconhecerAoDigitarEspaco('Post @rafa ', 11, ctx, false)!
    assert.deepEqual(p.chip, { tipo: 'membro', id: 'u-rafa', marcador: '@rafa' })
    assert.equal(p.texto, 'Post ')
    assert.equal(p.cursor, 5)
    const c = reconhecerAoDigitarEspaco('he: Post', 4, ctx, false)!
    assert.deepEqual(c.chip, { tipo: 'cliente', id: 'c-he', marcador: 'HE:' })
    assert.equal(c.texto, 'Post')
    assert.equal(reconhecerAoDigitarEspaco('he: ', 4, ctx, true), null, 'já tem cliente')
    assert.equal(reconhecerAoDigitarEspaco('Post he: ', 9, ctx, false), null, 'cliente só no começo')
    const col = reconhecerAoDigitarEspaco('Banner [aurora] ', 16, ctx, false)!
    assert.equal(col.chip.id, 'c-cla')
    assert.equal(col.texto, 'Banner ')
    assert.equal(reconhecerAoDigitarEspaco('Post @ninguem ', 14, ctx, false), null)
  })

  test('a linha remontada casa de novo no servidor', () => {
    const linha = comporLinha([{ tipo: 'membro', id: 'u-ana', marcador: marcadorDaPessoa(ctx, 'u-ana')! },
      { tipo: 'cliente', id: 'c-he', marcador: 'HE:' }], ' Carrossel ')
    assert.equal(linha, 'HE: Carrossel @anapaula')
    const a = analisarRapida(linha, ctx)
    assert.deepEqual([a.clienteId, a.membroIds, a.titulo], ['c-he', ['u-ana'], 'Carrossel'])
    assert.equal(marcadorDaPessoa(ctx, 'u-bruno1'), null, 'chave repetida: fica fora da lista do @')
  })

  test('menção em andamento, cliente em andamento e linhas coladas', () => {
    assert.deepEqual(mencaoEmAndamento('Post @ra', 8), { inicio: 5, termo: 'ra' })
    assert.deepEqual(mencaoEmAndamento('Post @', 6), { inicio: 5, termo: '' })
    assert.equal(mencaoEmAndamento('e-mail@x', 8), null)
    assert.deepEqual(clientesEmAndamento('aur', 3, CLIENTES).map((c) => c.id), ['c-cla'])
    assert.deepEqual(clientesEmAndamento('aur post', 3, CLIENTES), [], 'só antes do primeiro espaço')
    assert.deepEqual(linhasColadas('- Post A\n\n2. Post B\n• Post C\n'), ['Post A', 'Post B', 'Post C'])
  })
})

const quadro = (id: string, extra: Partial<Quadro> = {}): Quadro => ({
  id, nome: id, slug: id, descricao: '', cor: 'azul', fundo: 'liso', equipeId: null, modeloQuadroId: null, colunaPorMembro: false,
  pos: 1, arquivadoEm: null, criadoPor: null, criadoEm: '2026-01-01T00:00:00.000Z', ...extra,
})
const coluna = (id: string, quadroId: string, extra: Partial<Coluna> = {}): Coluna => ({
  id, quadroId, nome: id, cor: null, papel: 'normal', responsavelId: null, limiteWip: null, pos: 1, arquivadaEm: null, ...extra,
})
const modelo = (id: string, extra: Partial<ModeloDemanda> = {}): ModeloDemanda => ({
  id, quadroId: null, nome: id, descricao: '', icone: null, briefingMd: `## ${id}`, prazoDiasUteis: null, prioridade: null,
  estimativaMin: null, rodadasInclusas: null, ativo: true, pos: 1, itens: [], etiquetas: [], atualizadoEm: '2026-01-01T00:00:00.000Z', ...extra,
})

describe('Nova demanda (puro)', () => {
  test('quadro e coluna de partida', () => {
    const qs = [quadro('a', { pos: 2 }), quadro('b', { pos: 1 }), quadro('arq', { arquivadoEm: '2026-01-02T00:00:00.000Z' })]
    assert.equal(quadroInicial(qs, { pedido: 'a', aberto: 'b' })!.id, 'a')
    assert.equal(quadroInicial(qs, { pedido: 'arq', aberto: 'b' })!.id, 'b')
    assert.equal(quadroInicial(qs, { ultimo: 'a' })!.id, 'a')
    assert.equal(quadroInicial(qs, { favoritos: ['x', 'a'] })!.id, 'a')
    assert.equal(quadroInicial(qs, {})!.id, 'b', 'o primeiro do menu')
    const cs = [coluna('aguarda', 'a', { papel: 'aguardando_cliente', pos: 0 }), coluna('fila', 'a', { pos: 1 }), coluna('outra', 'b')]
    assert.equal(colunaInicial(cs, 'a')!.id, 'fila', 'a coluna de entrada é a primeira normal')
    assert.equal(colunaInicial(cs, 'a', 'aguarda')!.id, 'aguarda')
    assert.equal(colunaInicial(cs, 'a', 'outra')!.id, 'fila', 'coluna de outro quadro não vale')
  })

  test('modelos do quadro, membro sugerido, prazo do modelo e estimativa', () => {
    const ms = [modelo('q', { quadroId: 'a', pos: 0 }), modelo('g2', { pos: 2 }), modelo('g1', { pos: 1 }), modelo('off', { ativo: false }), modelo('b', { quadroId: 'b' })]
    assert.deepEqual(modelosDoQuadro(ms, 'a').map((m) => m.id), ['g1', 'g2', 'q'])
    const cliente = { responsaveis: [{ equipeId: 'eq-criacao', usuarioId: 'u-rafa' }] } as Pick<ClienteResumo, 'responsaveis'>
    assert.equal(membroSugerido(cliente, { equipeId: 'eq-criacao' }, new Set(['u-rafa'])), 'u-rafa')
    assert.equal(membroSugerido(cliente, { equipeId: 'eq-social' }, new Set(['u-rafa'])), null)
    assert.equal(membroSugerido(cliente, { equipeId: 'eq-criacao' }, new Set()), null, 'desativado não')
    assert.equal(prazoSugerido({ prazoDiasUteis: 2 }, '2026-10-09', new Set(['2026-10-12'])), '2026-10-14', 'sexta + 2 úteis pulando o feriado')
    assert.equal(prazoSugerido(null, '2026-10-09', new Set()), null)
    for (const [t, m] of [['1h30', 90], ['1:30', 90], ['90', 90], ['45min', 45], ['2h', 120], ['1,5h', 90], ['', null], ['abc', undefined], ['1h75', undefined]] as const) {
      assert.equal(minutosDeTexto(t), m, t)
    }
    assert.deepEqual([textoDeMinutos(90), textoDeMinutos(45), textoDeMinutos(120), textoDeMinutos(null)], ['1h30', '45 min', '2h', ''])
  })

  test('descrição automática e o corpo de POST /api/demandas', () => {
    assert.equal(descricaoAutomatica(modelo('m'), '## Pedido pelo WhatsApp\n> oi'), '## m\n\n## Pedido pelo WhatsApp\n> oi')
    assert.equal(descricaoAutomatica(null, ''), '')
    const e: EstadoNovaDemanda = {
      quadroId: 'a', colunaId: 'c', titulo: '  Banner  ', modeloId: null, clienteId: 'c-he', membroIds: ['u-rafa', 'u-col'],
      etiquetaIds: null, descricaoMd: 'x', prioridade: 'alta', inicio: null, prazo: null, prazoHora: '10:00', publicacaoData: null,
      publicacaoHora: '09:00', estimativaMin: 30, repetir: 'semanal', origemTexto: '[14/10 10:00] A: b', atendimentoId: 'u-am',
    }
    const corpo = entradaDaNovaDemanda(e, { podeAm: false, responsavelDaColuna: 'u-col' })
    assert.equal(corpo.titulo, 'Banner')
    assert.deepEqual(corpo.membroIds, ['u-rafa'], 'a pessoa da coluna o servidor põe')
    assert.equal(corpo.prazoHora, null, 'hora sem data não vai')
    assert.equal(corpo.publicacaoHora, null)
    assert.equal(corpo.repetir, 'nenhuma', 'repetir sem prazo não vai')
    assert.ok(!('etiquetaIds' in corpo), 'sem mexer: as etiquetas do modelo')
    assert.ok(!('atendimentoId' in corpo), 'a equipe não manda AM')
    assert.equal(corpo.origem, 'whatsapp')
    const am = entradaDaNovaDemanda({ ...e, etiquetaIds: [], prazo: '2026-10-20' }, { podeAm: true, responsavelDaColuna: null })
    assert.equal(am.atendimentoId, 'u-am')
    assert.deepEqual(am.etiquetaIds, [])
    assert.equal(am.repetir, 'semanal')
    assert.equal(motivoParaNaoCriar({ ...e, titulo: ' ' }), 'Escreva um título.')
    assert.equal(motivoParaNaoCriar({ ...e, colunaId: '' }), 'Este quadro ainda não tem colunas.')
    assert.equal(motivoParaNaoCriar({ ...e, inicio: '2026-10-21', prazo: '2026-10-20' }), 'O início vem depois do prazo.')
    assert.equal(motivoParaNaoCriar(e), null)
  })

  test('o quadro aberto pela URL (fontes da paleta)', () => {
    const b = { quadros: [quadro('q1', { slug: 'criacao' })], demandas: [{ numero: 12, quadroId: 'q1' }] } as never
    assert.equal(quadroAtualDaUrl(b, '/q/criacao'), 'q1')
    assert.equal(quadroAtualDaUrl(b, '/d/12'), 'q1')
    assert.equal(quadroAtualDaUrl(b, '/inicio'), null)
  })
})

describe('lista do "?" (puro)', () => {
  test('agrupa por grupo, junta as teclas da mesma ação e filtra sem acento', () => {
    const atalhos = [
      { id: 'a', teclas: 'j', descricao: 'Próximo card', escopo: 'quadro', grupo: 'quadro' },
      { id: 'b', teclas: 'arrowdown', descricao: 'Próximo card', escopo: 'quadro', grupo: 'quadro' },
      { id: 'c', teclas: 'shift+n', descricao: 'Nova demanda', escopo: 'global', grupo: 'geral' },
      { id: 'd', teclas: 'space', descricao: 'Entrar ou sair', escopo: 'card', grupo: 'demanda' },
      { id: 'e', teclas: 'space', descricao: 'Entrar ou sair', escopo: 'modal', grupo: 'demanda' },
    ] as const
    const g = agruparAtalhos(atalhos)
    assert.deepEqual(g.map((x) => x.grupo), ['geral', 'quadro', 'demanda'])
    assert.deepEqual(g[1]!.itens[0]!.teclas, ['j', 'arrowdown'])
    assert.equal(g[2]!.itens.length, 1, 'a mesma tecla fazendo o mesmo em dois lugares vira uma linha')
    assert.deepEqual(g[2]!.itens[0]!.escopos, ['card', 'modal'])
    const outra = agruparAtalhos([...atalhos, { id: 'f', teclas: 'enter', descricao: 'Entrar ou sair', escopo: 'quadro', grupo: 'demanda' }])
    assert.deepEqual(outra.at(-1)!.itens.map((i) => i.escopos), [['card', 'modal'], ['quadro']], 'outra tecla, outra linha')
    assert.deepEqual(agruparAtalhos(atalhos, 'proximo').map((x) => x.grupo), ['quadro'])
    assert.deepEqual(agruparAtalhos(atalhos, 'nada'), [])
  })
})

describe('rascunho da Nova demanda (integração 3A)', () => {
  const base = {
    titulo: '', descricaoMd: '## Objetivo', descricaoAuto: '## Objetivo', colagem: null, etiquetaIds: null,
    mexidos: new Set<string>(), quadroId: 'q1', colunaId: 'c1',
  }
  const ctx = {
    quadroAtivo: (id: string) => id === 'q1',
    colunaAtiva: (id: string) => id === 'c1',
    colunaDeEntrada: () => 'c-entrada',
  }

  test('sujo: título, conversa colada ou no campo, descrição mexida, etiquetas ou qualquer campo tocado; o briefing do modelo não conta', () => {
    assert.equal(formularioSujo(base, ''), false)
    assert.equal(formularioSujo(base, '   '), false)
    assert.equal(formularioSujo({ ...base, titulo: 'Banner' }, ''), true)
    assert.equal(formularioSujo(base, '[14/10 15:32] Ana: oi'), true)
    assert.equal(formularioSujo({ ...base, colagem: { texto: 'x' } }, ''), true)
    assert.equal(formularioSujo({ ...base, descricaoMd: '## Objetivo\nMais' }, ''), true)
    assert.equal(formularioSujo({ ...base, etiquetaIds: [] }, ''), true)
    assert.equal(formularioSujo({ ...base, mexidos: new Set(['prazo']) }, ''), true)
  })

  test('guardar e voltar: mexidos como lista; vence em 3 dias; quadro arquivado descarta; coluna arquivada vai para a de entrada', () => {
    const agora = new Date('2026-10-16T12:00:00.000Z')
    const g = paraGuardar({ ...base, titulo: 'Banner', mexidos: new Set(['titulo']) }, 'conversa', agora)
    const ida = JSON.parse(JSON.stringify(g))
    assert.deepEqual(ida.estado.mexidos, ['titulo'])
    const volta = rascunhoValido(ida, new Date('2026-10-17T12:00:00.000Z'), ctx)!
    assert.equal(volta.estado.titulo, 'Banner')
    assert.ok(volta.estado.mexidos instanceof Set && volta.estado.mexidos.has('titulo'))
    assert.equal(volta.textoColar, 'conversa')
    assert.equal(rascunhoValido(ida, new Date('2026-10-19T12:00:01.000Z'), ctx), null, 'passou de 3 dias')
    assert.equal(rascunhoValido({ ...ida, estado: { ...ida.estado, quadroId: 'q-arquivado' } }, agora, ctx), null)
    assert.equal(rascunhoValido({ ...ida, estado: { ...ida.estado, colunaId: 'c-arquivada' } }, agora, ctx)!.estado.colunaId, 'c-entrada')
    assert.equal(rascunhoValido(null, agora, ctx), null)
    assert.equal(rascunhoValido({ lixo: 1 } as never, agora, ctx), null)
  })
})

describe('criação rápida: sigla nova (integração 3A)', () => {
  test('tirarMarcador tira "XYZ:", "[XYZ]" e "XYZ -" do começo, sem caixa; o resto fica', () => {
    assert.equal(tirarMarcador('XYZ: Banner da feira', 'XYZ'), 'Banner da feira')
    assert.equal(tirarMarcador('  xyz : Banner', 'XYZ'), 'Banner')
    assert.equal(tirarMarcador('[XYZ] Banner', 'XYZ'), 'Banner')
    assert.equal(tirarMarcador('XYZ – Banner', 'XYZ'), 'Banner')
    assert.equal(tirarMarcador('Banner XYZ: feira', 'XYZ'), 'Banner XYZ: feira', 'só no começo')
    assert.equal(tirarMarcador('XYZW: Banner', 'XYZ'), 'XYZW: Banner')
  })
})
