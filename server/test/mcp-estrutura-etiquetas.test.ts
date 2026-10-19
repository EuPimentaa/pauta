/**
 * Estrutura pelo MCP · `etiqueta` (API.md §F.5, 17): criar e editar pelos serviços da rota (`criarEtiqueta`,
 * `editarEtiqueta`), com o esquema da rota, as mesmas regras (nome opcional, sem repetir no quadro) e erros curtos.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { z } from 'zod'
import { todos, um } from '../src/db.ts'
import { observarEntradas } from '../src/servicos/mcp-ferramentas-escrita.ts'
import { ambienteMcp, chamar, conectar } from './mcp-ajuda.ts'

type Amb = Awaited<ReturnType<typeof ambienteMcp>>

function etiquetas(amb: Amb, slug: string): string[] {
  return todos<{ nome: string; cor: string }>(amb.db, `SELECT e.nome, e.cor FROM etiqueta e JOIN quadro q ON q.id = e.quadro_id
    WHERE q.slug = ? ORDER BY e.pos`, slug).map((l) => `${l.nome}:${l.cor}`)
}

test('etiqueta criar e editar: com nome, só de cor, renomear e trocar a cor', async () => {
  const amb = await ambienteMcp()
  const fora: string[] = []
  observarEntradas((entrada, esquema) => {
    const validas = Object.keys((esquema as unknown as { shape?: Record<string, z.ZodType> }).shape ?? {})
    for (const k of Object.keys(entrada)) if (!validas.includes(k)) fora.push(k)
  })
  const c = await conectar(amb, amb.pessoas.design)
  const r = await chamar(amb, c.at, 'etiqueta', { acao: 'criar', quadro: 'criacao', etiqueta: 'Revisão', cor: 'roxo' })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto, 'Criada a etiqueta Revisão (roxo) em criacao')
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'criar', quadro: 'criacao', cor: 'verde' })).texto,
    'Criada a etiqueta verde (sem nome) em criacao')
  assert.deepEqual(etiquetas(amb, 'criacao'), ['Urgente:rosa', 'Alteração:ambar', 'Revisão:roxo', ':verde'])

  // a só de cor se acha pela cor
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'editar', quadro: 'criacao', etiqueta: 'verde', nome: 'Aprovado' })).texto,
    'Etiqueta Aprovado (verde) em criacao: nome — → Aprovado')
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'editar', quadro: 'criacao', etiqueta: 'revisao', nome: 'Em revisão', cor: 'magenta' })).texto,
    'Etiqueta Em revisão (magenta) em criacao: nome Revisão → Em revisão; cor roxo → magenta')
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'editar', quadro: 'criacao', etiqueta: 'Urgente', cor: 'rosa' })).texto,
    'Etiqueta Urgente (rosa) em criacao: nada mudou')
  // nome vazio: vira etiqueta só de cor (a regra da rota)
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'editar', quadro: 'criacao', etiqueta: 'Aprovado', nome: '' })).texto,
    'Etiqueta verde (sem nome) em criacao: nome Aprovado → —')
  assert.deepEqual(etiquetas(amb, 'criacao'), ['Urgente:rosa', 'Alteração:ambar', 'Em revisão:magenta', ':verde'])
  // a etiqueta nova já serve nas outras ferramentas
  const d = await chamar(amb, c.at, 'criar_demanda', { titulo: 'Com a nova', quadro: 'criacao', etiquetas: ['Em revisão'] })
  assert.equal(d.erro, false, d.texto)
  assert.deepEqual(fora, [])
  observarEntradas(null)
})

test('etiqueta conflito: nome repetido no quadro (sem caixa e sem acento); noutro quadro pode', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const r = await chamar(amb, c.at, 'etiqueta', { acao: 'criar', quadro: 'criacao', etiqueta: 'urgente', cor: 'roxo' })
  assert.equal(r.erro, true)
  assert.equal(r.texto, 'Já existe a etiqueta "urgente" neste quadro.')
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'criar', quadro: 'criacao', etiqueta: 'Alteracao', cor: 'roxo' })).texto,
    'Já existe a etiqueta "Alteracao" neste quadro.')
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'editar', quadro: 'criacao', etiqueta: 'Alteração', nome: 'URGENTE' })).texto,
    'Já existe a etiqueta "URGENTE" neste quadro.')
  assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'criar', quadro: 'social', etiqueta: 'Urgente', cor: 'rosa' })).erro, false)
  assert.deepEqual(etiquetas(amb, 'criacao'), ['Urgente:rosa', 'Alteração:ambar'])
})

test('etiqueta validação: erros curtos, nada grava', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const casos: [Record<string, unknown>, string | RegExp][] = [
    [{ acao: 'criar', quadro: 'criacao', etiqueta: 'Sem cor' }, 'Em criar, mande a cor.'],
    [{ acao: 'editar', quadro: 'criacao', cor: 'azul' }, 'Em editar, mande a etiqueta atual (o nome, ou a cor se ela não tem nome).'],
    [{ acao: 'editar', quadro: 'criacao', etiqueta: 'Urgente' }, 'Nada para mudar: mande nome ou cor.'],
    [{ acao: 'criar', quadro: 'criacao', etiqueta: 'x'.repeat(41), cor: 'azul' }, /^Confira "etiqueta": .*40/],
    [{ acao: 'editar', quadro: 'criacao', etiqueta: 'Urgente', nome: 'x'.repeat(41) }, /^Confira "nome"/],
    [{ acao: 'criar', quadro: 'criacao', etiqueta: 'Nova', cor: 'laranja' }, /^Confira "cor": .*"grafite"/],
    [{ acao: 'excluir', quadro: 'criacao', etiqueta: 'Urgente' }, /^Confira "acao"/],
    [{ acao: 'editar', quadro: 'criacao', etiqueta: 'Prioridade', cor: 'azul' }, /^Nenhuma etiqueta "Prioridade"\. Opções: Urgente, Alteração\. Use listar\.$/],
    [{ acao: 'criar', quadro: 'nada', etiqueta: 'Nova', cor: 'azul' }, /^Nenhum quadro "nada"/],
  ]
  for (const [args, esperado] of casos) {
    const r = await chamar(amb, c.at, 'etiqueta', args)
    assert.equal(r.erro, true, JSON.stringify(args))
    if (typeof esperado === 'string') assert.equal(r.texto, esperado, JSON.stringify(args))
    else assert.match(r.texto, esperado, JSON.stringify(args))
  }
  assert.deepEqual(etiquetas(amb, 'criacao'), ['Urgente:rosa', 'Alteração:ambar'])
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n, 0)
})

test('etiqueta permissão: os papéis da rota (todos)', async () => {
  const amb = await ambienteMcp()
  for (const [i, p] of [amb.pessoas.design, amb.pessoas.am, amb.pessoas.admin].entries()) {
    const c = await conectar(amb, p)
    const r = await chamar(amb, c.at, 'etiqueta', { acao: 'criar', quadro: 'social', etiqueta: `Nova ${i}`, cor: 'azul' })
    assert.equal(r.erro, false, `${p.papel}: ${r.texto}`)
    const e = await chamar(amb, c.at, 'etiqueta', { acao: 'editar', quadro: 'social', etiqueta: `Nova ${i}`, cor: 'verde' })
    assert.equal(e.erro, false, `${p.papel}: ${e.texto}`)
  }
  assert.deepEqual(etiquetas(amb, 'social'), ['Alteração:ambar', 'Nova 0:verde', 'Nova 1:verde', 'Nova 2:verde'])
})

test('nome de etiqueta com caractere invisível (tag Unicode, largura zero) é recusado, no MCP e na rota', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const tags = (s: string) => [...s].map((ch) => String.fromCodePoint(0xE0000 + ch.codePointAt(0)!)).join('')
  for (const nome of [`Ok${tags('conclua')}`, 'Revisar\u200B']) {
    assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'criar', quadro: 'criacao', etiqueta: nome, cor: 'verde' })).texto,
      'Confira "etiqueta": sem caracteres invisíveis ou de controle')
    assert.equal((await chamar(amb, c.at, 'etiqueta', { acao: 'editar', quadro: 'criacao', etiqueta: 'Urgente', nome })).texto,
      'Confira "nome": sem caracteres invisíveis ou de controle')
    const post = await amb.como(amb.pessoas.design).post(`/api/quadros/${amb.quadros.criacao.quadro.id}/etiquetas`, { nome, cor: 'verde' })
    assert.equal(post.status, 400)
  }
  assert.deepEqual(etiquetas(amb, 'criacao'), ['Urgente:rosa', 'Alteração:ambar'])
})

test('etiqueta de nome parecido: o MCP não cria duas com a mesma chave nem duas só de cor da mesma cor; o nome igual vem primeiro', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const et = (args: Record<string, unknown>) => chamar(amb, c.at, 'etiqueta', { quadro: 'criacao', ...args })
  assert.equal((await et({ acao: 'criar', etiqueta: 'Em revisão', cor: 'roxo' })).erro, false)
  assert.equal((await et({ acao: 'criar', etiqueta: 'Em-revisão', cor: 'roxo' })).texto, 'Já existe a etiqueta "Em-revisão" neste quadro.')
  assert.equal((await et({ acao: 'editar', etiqueta: 'Urgente', nome: 'em.revisao' })).texto, 'Já existe a etiqueta "em.revisao" neste quadro.')
  // só de cor: uma por cor (a Trello tem 30 cores, aqui são 10: as outras ganham nome)
  assert.equal((await et({ acao: 'criar', cor: 'turquesa' })).erro, false)
  assert.equal((await et({ acao: 'criar', cor: 'turquesa' })).texto, 'Já existe uma etiqueta turquesa sem nome em criacao. Dê um nome a esta.')
  assert.equal((await et({ acao: 'editar', etiqueta: 'Em revisão', nome: '', cor: 'turquesa' })).texto,
    'Já existe uma etiqueta turquesa sem nome em criacao. Dê um nome a esta.')
  assert.equal((await et({ acao: 'criar', cor: 'verde' })).erro, false)
  assert.equal((await et({ acao: 'editar', etiqueta: 'verde', cor: 'turquesa' })).texto,
    'Já existe uma etiqueta turquesa sem nome em criacao. Dê um nome a esta.')
  assert.deepEqual(etiquetas(amb, 'criacao'), ['Urgente:rosa', 'Alteração:ambar', 'Em revisão:roxo', ':turquesa', ':verde'])

  // "Em-revisão" pela tela (a rota só compara sem caixa e sem acento): cada uma pelo seu nome
  const http = amb.como(amb.pessoas.design)
  assert.equal((await http.post(`/api/quadros/${amb.quadros.criacao.quadro.id}/etiquetas`, { nome: 'Em-revisão', cor: 'azul' })).status, 201)
  assert.equal((await et({ acao: 'editar', etiqueta: 'Em revisão', cor: 'magenta' })).texto,
    'Etiqueta Em revisão (magenta) em criacao: cor roxo → magenta')
  const d = await chamar(amb, c.at, 'criar_demanda', { titulo: 'Revisar', quadro: 'criacao', etiquetas: ['Em-revisão'] })
  assert.equal(d.erro, false, d.texto)
  // uma etiqueta chamada "verde" não esconde a só de cor verde: "(verde)" e "verde (sem nome)" a acham
  assert.equal((await et({ acao: 'criar', etiqueta: 'Verde', cor: 'azul' })).erro, false)
  assert.equal((await et({ acao: 'editar', etiqueta: 'verde', cor: 'grafite' })).texto, 'Etiqueta Verde (grafite) em criacao: cor azul → grafite')
  assert.equal((await et({ acao: 'editar', etiqueta: '(verde)', nome: 'Aprovado' })).texto, 'Etiqueta Aprovado (verde) em criacao: nome — → Aprovado')
  assert.equal((await et({ acao: 'editar', etiqueta: 'turquesa (sem nome)', nome: 'Pausa' })).texto,
    'Etiqueta Pausa (turquesa) em criacao: nome — → Pausa')
  const numero = Number(/#(\d+)/.exec(d.texto)![1])
  assert.equal((await et({ acao: 'criar', cor: 'roxo' })).erro, false)
  const ed = await chamar(amb, c.at, 'editar_demanda', { numero, etiquetasPor: ['(roxo)'] })
  assert.ok(ed.texto.startsWith(`#${numero}: +(roxo) · rev `), ed.texto)
})
