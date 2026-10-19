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
    [{ acao: 'editar', quadro: 'criacao', etiqueta: 'Prioridade', cor: 'azul' }, /^Nenhum etiqueta "Prioridade"\. Opções: Urgente, Alteração\. Use listar\.$/],
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
