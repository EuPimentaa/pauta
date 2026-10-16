/**
 * F5: lógica pura do front (web/src/funcionalidades/cadastros/logica.ts): o plano de colunas do "Novo quadro" e do
 * "Criar os quadros das equipes", o corpo do POST /api/quadros, os Primeiros passos (os critérios da API §4.18) e os
 * nomes de sigla e de cópia. O corpo montado aqui vai também ao servidor de verdade, para conferir que nasce o
 * quadro esperado (colunas das pessoas, automações do modelo pela modeloColunaId).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Equipe, ModeloQuadro, UsuarioResumo } from '../../shared/tipos/index.ts'
import {
  automacoesDoPlano, calcularPassos, entradaDoQuadro, equipesSemQuadro, errosDoPlano, limparSigla, membrosAtivos,
  nomeDaColunaDe, nomeDaCopia, planejarColunas, resumoDoPasso, temColunaPorPessoa,
} from '../../web/src/funcionalidades/cadastros/logica.ts'
import { ambiente } from './ajuda.ts'

const u = (id: string, nome: string, extra: Partial<UsuarioResumo> = {}): UsuarioResumo => ({
  id, nome, apelido: null, papel: 'equipe', cor: 'azul', ativo: true, equipeIds: ['eq-criacao'], ...extra,
})
const equipe = (membros: Equipe['membros'], extra: Partial<Equipe> = {}): Equipe => ({
  id: 'eq-criacao', nome: 'Criação', slug: 'criacao', cor: 'rosa', modeloQuadroId: 'mq-por-pessoa', ativa: true, pos: 2048, membros, ...extra,
})

const POR_PESSOA: ModeloQuadro = {
  id: 'mq-por-pessoa', nome: 'Por pessoa', descricao: '', pos: 2048, automacoes: [],
  colunas: [
    { id: 'mqc-pessoa-membros', nome: 'Uma por pessoa', cor: null, papel: 'normal', porMembro: true, pos: 2048 },
    { id: 'mqc-pessoa-fila', nome: 'Fila', cor: 'grafite', papel: 'normal', porMembro: false, pos: 1024 },
  ],
}
const KANBAN: ModeloQuadro = {
  id: 'mq-kanban', nome: 'Kanban simples', descricao: '', pos: 1024,
  colunas: [
    { id: 'mqc-kanban-a-fazer', nome: 'A fazer', cor: 'grafite', papel: 'normal', porMembro: false, pos: 1024 },
    { id: 'mqc-kanban-fazendo', nome: 'Fazendo', cor: 'azul', papel: 'normal', porMembro: false, pos: 2048 },
    { id: 'mqc-kanban-cliente', nome: 'Com o cliente', cor: 'amarelo', papel: 'aguardando_cliente', porMembro: false, pos: 4096 },
  ],
  automacoes: [
    { gatilho: 'enviado_ao_cliente', destinoColunaId: 'mqc-kanban-cliente' },
    { gatilho: 'ajuste_pedido', destinoColunaId: 'mqc-kanban-fazendo' },
  ],
}

describe('cadastros (front): plano de colunas', () => {
  test('a coluna por pessoa vira uma por membro ativo, o principal primeiro e depois por nome; inativos ficam de fora', () => {
    const usuarios = [u('u1', 'Rafaela Lima', { apelido: 'Rafa', cor: 'rosa' }), u('u2', 'Ágata Reis'), u('u3', 'Bruno Melo'), u('u4', 'Zé Inativo', { ativo: false })]
    const eq = equipe([
      { usuarioId: 'u3', funcao: null, principal: false }, { usuarioId: 'u1', funcao: null, principal: true },
      { usuarioId: 'u2', funcao: null, principal: false }, { usuarioId: 'u4', funcao: null, principal: false },
    ])
    const membros = membrosAtivos(eq, usuarios)
    assert.deepEqual(membros.map((m) => m.id), ['u1', 'u2', 'u3'])
    const plano = planejarColunas(POR_PESSOA, membros)
    assert.deepEqual(plano.map((c) => c.nome), ['Fila', 'Rafa', 'Ágata', 'Bruno'], 'ordem do modelo; nome = apelido ou primeiro nome')
    assert.deepEqual(plano.map((c) => c.responsavelId), [null, 'u1', 'u2', 'u3'])
    assert.equal(plano[1]!.cor, 'rosa', 'a cor da pessoa')
    assert.equal(plano[0]!.modeloColunaId, 'mqc-pessoa-fila')
    assert.equal(plano[1]!.modeloColunaId, null)
    assert.ok(temColunaPorPessoa(POR_PESSOA))
    assert.ok(!temColunaPorPessoa(KANBAN))
    assert.deepEqual(planejarColunas(POR_PESSOA, []).map((c) => c.nome), ['Fila'], 'equipe sem membros: só a Fila')
    assert.deepEqual(planejarColunas(null, membros), [], 'sem modelo: vazio')
    assert.equal(nomeDaColunaDe({ nome: '  Maria  Clara ', apelido: '  ' }), 'Maria')
  })

  test('automações do modelo seguem a coluna de destino; desmarcar a coluna não manda a automação', () => {
    const plano = planejarColunas(KANBAN, [])
    const auto = automacoesDoPlano(KANBAN, plano)
    assert.deepEqual([...auto.entries()], [['modelo-mqc-kanban-cliente', ['enviado_ao_cliente']], ['modelo-mqc-kanban-fazendo', ['ajuste_pedido']]])
    const desmarcado = plano.map((c) => (c.modeloColunaId === 'mqc-kanban-cliente' ? { ...c, manter: false } : { ...c, nome: c.nome === 'Fazendo' ? 'Produzindo' : c.nome }))
    const corpo = entradaDoQuadro({ nome: ' Web ', equipeId: 'eq-web', modelo: KANBAN, plano: desmarcado, cor: 'azul', fundo: 'liso', colunaPorMembro: false, membrosDaEquipeSeguem: true })
    assert.equal(corpo.nome, 'Web')
    assert.deepEqual(corpo.colunas!.map((c) => [c.nome, c.modeloColunaId]), [['A fazer', 'mqc-kanban-a-fazer'], ['Produzindo', 'mqc-kanban-fazendo']])
    assert.equal(corpo.modeloQuadroId, 'mq-kanban')
    assert.equal(corpo.membrosDaEquipeSeguem, true)
    const semEquipe = entradaDoQuadro({ nome: 'X', equipeId: null, modelo: null, plano: [], cor: 'azul', fundo: 'aurora', colunaPorMembro: false, membrosDaEquipeSeguem: true })
    assert.equal('membrosDaEquipeSeguem' in semEquipe, false, 'sem equipe não manda seguidores')
    assert.deepEqual(semEquipe.colunas, [])
  })

  test('nome vazio numa coluna mantida é erro; desmarcada não', () => {
    const plano = planejarColunas(KANBAN, []).map((c, i) => ({ ...c, nome: i === 0 ? '  ' : c.nome, manter: i !== 1 }))
    plano[1]!.nome = ''
    assert.deepEqual([...errosDoPlano(plano).keys()], ['modelo-mqc-kanban-a-fazer'])
  })

  test('o corpo montado cria no servidor o quadro esperado: pessoas com responsavelId, automação só da coluna mantida', async () => {
    const a = await ambiente()
    const b = (await a.como(a.pessoas.admin).get('/api/bootstrap')).corpo
    const modelo = b.modelosQuadro.find((m: ModeloQuadro) => m.id === 'mq-kanban')
    const plano = planejarColunas(modelo, []).map((c) => (c.modeloColunaId === 'mqc-kanban-fazendo' ? { ...c, manter: false } : c))
    plano.push({ chave: 'nova', nome: 'Aprovado', cor: 'verde', papel: 'normal', responsavelId: null, modeloColunaId: null, manter: true, nova: true })
    const r = await a.como(a.pessoas.admin).post('/api/quadros', entradaDoQuadro({
      nome: 'Tráfego', equipeId: 'eq-trafego', modelo, plano, cor: 'verde', fundo: 'cobalto', colunaPorMembro: false, membrosDaEquipeSeguem: true,
    }))
    assert.equal(r.status, 201)
    assert.deepEqual(r.corpo.colunas.map((c: { nome: string }) => c.nome), ['A fazer', 'Revisão', 'Com o cliente', 'Concluído', 'Aprovado'])
    assert.deepEqual(r.corpo.automacoes.map((x: { gatilho: string }) => x.gatilho), ['enviado_ao_cliente'], 'sem Fazendo, a do ajuste não nasce')

    const criacao = b.equipes.find((e: Equipe) => e.id === 'eq-criacao')
    const pessoas = membrosAtivos(criacao, b.usuarios)
    const porPessoa = b.modelosQuadro.find((m: ModeloQuadro) => m.id === 'mq-por-pessoa')
    const r2 = await a.como(a.pessoas.admin).post('/api/quadros', entradaDoQuadro({
      nome: 'Criação nova', equipeId: 'eq-criacao', modelo: porPessoa, plano: planejarColunas(porPessoa, pessoas), cor: 'rosa', fundo: 'liso',
      colunaPorMembro: true, membrosDaEquipeSeguem: true,
    }))
    assert.equal(r2.status, 201)
    assert.deepEqual(r2.corpo.colunas.map((c: { responsavelId: string | null }) => c.responsavelId), [null, a.pessoas.design.id, a.pessoas.design2.id])
    assert.equal(r2.corpo.quadro.colunaPorMembro, true)
  })
})

describe('cadastros (front): Primeiros passos e nomes', () => {
  test('critérios na ordem de PASSOS_INICIAIS; concluído só com todos', () => {
    const vazio = { usuarios: [{ ativo: true }], quadros: [], clientes: [], modelosRevisadosEm: null }
    const p0 = calcularPassos(vazio)
    assert.deepEqual(p0.itens.map((i) => [i.id, i.feito]), [['convidar_equipe', false], ['criar_quadros', false], ['cadastrar_clientes', false], ['revisar_modelos', false]])
    assert.deepEqual(p0.itens.map((i) => i.caminho), ['/config/pessoas', '/quadros/novo?equipes=1', '/clientes', '/config/modelos'])
    assert.equal(p0.concluido, false)
    const meio = calcularPassos({
      usuarios: [{ ativo: true }, { ativo: false }], quadros: [{ arquivadoEm: '2026-10-01T00:00:00.000Z' }],
      clientes: [{ status: 'recorrente', pendencias: ['sem_am'] }, { status: 'ex', pendencias: [] }], modelosRevisadosEm: null,
    })
    assert.deepEqual(meio.itens.map((i) => i.feito), [false, false, false, false], 'inativo não conta; quadro arquivado não conta; cliente sem AM segura o passo')
    const fim = calcularPassos({
      usuarios: [{ ativo: true }, { ativo: true }], quadros: [{ arquivadoEm: null }],
      clientes: [{ status: 'recorrente', pendencias: ['sem_contato_padrao'] }, { status: 'ex', pendencias: ['sem_am'] }],
      modelosRevisadosEm: '2026-10-14T13:00:00.000Z',
    })
    assert.deepEqual(fim.itens.map((i) => i.feito), [true, true, true, true], 'sem contato padrão não segura; ex-cliente sem AM não conta')
    assert.equal(fim.concluido, true)
    assert.equal(calcularPassos({ ...vazio, clientes: [{ status: 'ex', pendencias: [] }] }).itens[2]!.feito, false, 'só ex-clientes não conta')
  })

  test('resumo de cada passo', () => {
    const d = { usuarios: [{ ativo: true }, { ativo: true }, { ativo: true }], quadros: [], clientes: [{ status: 'recorrente' as const, pendencias: ['sem_am' as const] }], modelosRevisadosEm: null, equipesSemQuadro: 2, quadrosAtivos: 4 }
    assert.equal(resumoDoPasso('convidar_equipe', d), '3 pessoas com acesso.')
    assert.equal(resumoDoPasso('criar_quadros', d), '4 quadros; 2 equipes ainda sem quadro.')
    assert.equal(resumoDoPasso('cadastrar_clientes', d), '1 cliente; 1 sem AM.')
  })

  test('equipes ativas sem quadro ativo, na ordem', () => {
    const eqs = [equipe([], { id: 'b', pos: 2 }), equipe([], { id: 'a', pos: 1 }), equipe([], { id: 'c', pos: 3, ativa: false }), equipe([], { id: 'd', pos: 4 })]
    const sem = equipesSemQuadro(eqs, [{ equipeId: 'b', arquivadoEm: null }, { equipeId: 'd', arquivadoEm: '2026-10-01T00:00:00.000Z' }])
    assert.deepEqual(sem.map((e) => e.id), ['a', 'd'], 'a com quadro sai; a inativa sai; quadro arquivado não conta')
  })

  test('sigla limpa e nome da cópia', () => {
    assert.equal(limparSigla('hé-1 x'), 'HE1X')
    assert.equal(limparSigla('abcdefghijklmnop'), 'ABCDEFGHIJKL')
    assert.equal(nomeDaCopia('Criação', ['Criação', 'Social']), 'Criação 2')
    assert.equal(nomeDaCopia('Criação', ['Criação', 'criacao 2']), 'Criação 3', 'sem caixa e sem acento, como o servidor')
  })
})
