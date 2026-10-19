/**
 * Estrutura pelo MCP · `coluna` (API.md §F.5, 16): criar, editar, mover e arquivar pelos serviços da rota
 * (`criarColuna`, `editarColuna`, `arquivarColuna`), com o esquema da rota, as mesmas regras e erros curtos.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { z } from 'zod'
import { todos, um } from '../src/db.ts'
import { observarEntradas } from '../src/servicos/mcp-ferramentas-escrita.ts'
import { ambienteMcp, chamar, conectar } from './mcp-ajuda.ts'

type Amb = Awaited<ReturnType<typeof ambienteMcp>>

/** As colunas ativas do quadro, na ordem. */
function ordem(amb: Amb, slug: string): string[] {
  return todos<{ nome: string }>(amb.db, `SELECT c.nome FROM coluna c JOIN quadro q ON q.id = c.quadro_id
    WHERE q.slug = ? AND c.arquivada_em IS NULL ORDER BY c.pos`, slug).map((l) => l.nome)
}

function linha(amb: Amb, slug: string, nome: string): Record<string, unknown> | undefined {
  return um<Record<string, unknown>>(amb.db, `SELECT c.* FROM coluna c JOIN quadro q ON q.id = c.quadro_id
    WHERE q.slug = ? AND c.nome = ?`, slug, nome)
}

/** Toda entrada montada tem só chaves do esquema da rota (o zod da rota descartaria a mais em silêncio). */
function vigiarEntradas(): { fora: string[] } {
  const r = { fora: [] as string[] }
  observarEntradas((entrada, esquema) => {
    const validas = Object.keys((esquema as unknown as { shape?: Record<string, z.ZodType> }).shape ?? {})
    for (const k of Object.keys(entrada)) if (!validas.includes(k)) r.fora.push(k)
  })
  return r
}

test('coluna criar: no fim ou depois de outra, com cor, papel, pessoa e WIP; a resposta traz a ordem', async () => {
  const amb = await ambienteMcp()
  const vigia = vigiarEntradas()
  const c = await conectar(amb, amb.pessoas.design)
  const r = await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'criacao', coluna: 'Briefing', cor: 'azul', depoisDe: 'Fila', limiteWip: 5 })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto, 'Criada a coluna Briefing (azul, WIP 5) em criacao\nOrdem: Fila · Briefing · Design · Design2 · Pronto · Concluído')
  const b = linha(amb, 'criacao', 'Briefing')!
  assert.deepEqual([b.cor, b.papel, b.limite_wip, b.responsavel_id], ['azul', 'normal', 5, null])

  const fim = await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'Social', coluna: 'Com o cliente', papel: 'aguardando_cliente' })
  assert.equal(fim.texto, 'Criada a coluna Com o cliente (aguardando o cliente) em social\nOrdem: Fila · Agendar · Publicado · Com o cliente')
  const pessoa = await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'social', coluna: 'Web', responsavel: '@web', antesDe: 'Fila' })
  assert.equal(pessoa.texto, 'Criada a coluna Web (@web) em social\nOrdem: Web · Fila · Agendar · Publicado · Com o cliente')
  assert.equal(linha(amb, 'social', 'Web')!.responsavel_id, amb.pessoas.web.id)
  // a coluna da pessoa também se acha pelo @apelido
  const porApelido = await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'social', coluna: '@web', limiteWip: 2 })
  assert.equal(porApelido.texto, 'Coluna Web em social: WIP — → 2')
  assert.deepEqual(vigia.fora, [])
  observarEntradas(null)
})

test('coluna editar e mover: renomear, cor, papel, pessoa, WIP e a posição; virar concluída conclui as abertas', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.am)
  const r = await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'criacao', coluna: 'fila', nome: 'Entrada', cor: null, limiteWip: 3 })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto, 'Coluna Entrada em criacao: nome Fila → Entrada; cor grafite → —; WIP — → 3')
  assert.deepEqual([linha(amb, 'criacao', 'Entrada')!.cor, linha(amb, 'criacao', 'Entrada')!.limite_wip], [null, 3])
  const semWip = await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'criacao', coluna: 'Entrada', limiteWip: null, cor: 'turquesa' })
  assert.equal(semWip.texto, 'Coluna Entrada em criacao: cor — → turquesa; WIP 3 → —')

  const tira = await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'criacao', coluna: 'Design', responsavel: null })
  assert.equal(tira.texto, 'Coluna Design em criacao: pessoa @design → —')
  const poe = await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'criacao', coluna: 'Design', responsavel: 'design' })
  assert.equal(poe.texto, 'Coluna Design em criacao: pessoa — → @design')

  const antes = await chamar(amb, c.at, 'coluna', { acao: 'mover', quadro: 'criacao', coluna: 'Pronto', antesDe: 'Entrada' })
  assert.equal(antes.texto, 'Coluna Pronto em criacao: movida\nOrdem: Pronto · Entrada · Design · Design2 · Concluído')
  const depois = await chamar(amb, c.at, 'coluna', { acao: 'mover', quadro: 'criacao', coluna: 'Pronto', depoisDe: 'Concluído' })
  assert.equal(depois.texto, 'Coluna Pronto em criacao: movida\nOrdem: Entrada · Design · Design2 · Concluído · Pronto')
  assert.deepEqual(ordem(amb, 'criacao'), ['Entrada', 'Design', 'Design2', 'Concluído', 'Pronto'])

  // virar concluída: as abertas da coluna ficam concluídas (a regra da rota), e a resposta diz quais
  const pronto = amb.coluna('criacao', 'Pronto')
  const d1 = await amb.criarDemanda({ titulo: 'Um', colunaId: pronto.id })
  const d2 = await amb.criarDemanda({ titulo: 'Dois', colunaId: pronto.id })
  const papel = await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'criacao', coluna: 'Pronto', papel: 'concluida' })
  assert.equal(papel.texto, `Coluna Pronto em criacao: papel normal → concluída; 2 demandas concluídas: #${d1.numero} #${d2.numero}`)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM demanda WHERE concluida_em IS NOT NULL')!.n, 2)
  // repetir a mesma edição não muda nada
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'criacao', coluna: 'Pronto', papel: 'concluida' })).texto,
    'Coluna Pronto em criacao: nada mudou')
})

test('coluna arquivar: só vazia; desliga as automações que apontavam para ela', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  await amb.criarDemanda({ titulo: 'Na fila' })
  const cheia = await chamar(amb, c.at, 'coluna', { acao: 'arquivar', quadro: 'criacao', coluna: 'Fila' })
  assert.equal(cheia.erro, true)
  assert.equal(cheia.texto, 'Mova ou arquive os cards antes.')
  assert.equal(linha(amb, 'criacao', 'Fila')!.arquivada_em, null)

  // a automação "aprovado" da Criação leva para Social › Agendar
  const r = await chamar(amb, c.at, 'coluna', { acao: 'arquivar', quadro: 'social', coluna: 'Agendar' })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto, 'Coluna Agendar arquivada em social · automações desligadas: criacao (aprovado)\nOrdem: Fila · Publicado')
  assert.notEqual(linha(amb, 'social', 'Agendar')!.arquivada_em, null)
  assert.equal(um<{ ativa: number }>(amb.db, "SELECT ativa FROM automacao_quadro WHERE gatilho = 'aprovado'")!.ativa, 0)
  // arquivada some dos nomes: arquivar de novo não acha
  assert.match((await chamar(amb, c.at, 'coluna', { acao: 'arquivar', quadro: 'social', coluna: 'Agendar' })).texto, /^Nenhum coluna em social "Agendar"/)
  // e o nome volta a ficar livre
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'social', coluna: 'Agendar' })).erro, false)
})

test('coluna conflitos: nome repetido no quadro (sem caixa e sem acento), pessoa que já tem coluna', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const antes = um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM coluna')!.n
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'criacao', coluna: 'fila' })).texto,
    'Já existe a coluna "fila" em criacao. Escolha outro nome.')
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'criacao', coluna: 'Concluido' })).texto,
    'Já existe a coluna "Concluido" em criacao. Escolha outro nome.')
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'criacao', coluna: 'Fila', nome: 'PRONTO' })).texto,
    'Já existe a coluna "PRONTO" em criacao. Escolha outro nome.')
  // o mesmo nome noutro quadro pode; renomear para o próprio nome também
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'social', coluna: 'Pronto' })).erro, false)
  assert.equal((await chamar(amb, c.at, 'coluna', { acao: 'editar', quadro: 'criacao', coluna: 'Fila', nome: 'FILA' })).texto,
    'Coluna FILA em criacao: nome Fila → FILA')
  const pessoa = await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'criacao', coluna: 'Outra do Design', responsavel: 'design' })
  assert.equal(pessoa.erro, true)
  assert.equal(pessoa.texto, 'Esta pessoa já tem uma coluna neste quadro.')
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM coluna')!.n, antes + 1)
})

test('coluna validação: erros curtos que dizem o que mandar, e nada grava', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.design)
  const antes = um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM coluna')!.n
  const casos: [Record<string, unknown>, string | RegExp][] = [
    [{ acao: 'mover', quadro: 'criacao', coluna: 'Pronto' }, 'Para mover, mande depoisDe ou antesDe.'],
    [{ acao: 'mover', quadro: 'criacao', coluna: 'Pronto', depoisDe: 'Fila', antesDe: 'Fila' }, 'Use depoisDe ou antesDe, não os dois.'],
    [{ acao: 'mover', quadro: 'criacao', coluna: 'Pronto', depoisDe: 'pronto' }, 'Escolha outra coluna em depoisDe ou antesDe.'],
    [{ acao: 'editar', quadro: 'criacao', coluna: 'Pronto' }, 'Nada para mudar: mande nome, cor, papel, responsavel, limiteWip, depoisDe ou antesDe.'],
    [{ acao: 'criar', quadro: 'criacao', coluna: 'Nova', nome: 'Nova' }, 'Em criar, o nome vai em coluna (nome é para renomear).'],
    [{ acao: 'criar', quadro: 'criacao', coluna: 'x'.repeat(61) }, /^Confira "coluna": .*60/],
    [{ acao: 'criar', quadro: 'criacao', coluna: '   ' }, /^Confira "coluna"/],
    [{ acao: 'editar', quadro: 'criacao', coluna: 'Pronto', limiteWip: 0 }, /^Confira "limiteWip"/],
    [{ acao: 'editar', quadro: 'criacao', coluna: 'Pronto', cor: 'laranja' }, /^Confira "cor": .*"ambar"\|"amarelo"/],
    [{ acao: 'apagar', quadro: 'criacao', coluna: 'Pronto' }, /^Confira "acao"/],
    [{ acao: 'criar', quadro: 'criacao' }, /^Confira "coluna"/],
    [{ acao: 'editar', quadro: 'criacao', coluna: 'Xyz', cor: 'azul' }, /^Nenhum coluna em criacao "Xyz"\. Opções: Fila, Design, Design2, Pronto, Concluído\. Use listar\.$/],
    [{ acao: 'criar', quadro: 'trello', coluna: 'Nova' }, /^Nenhum quadro "trello"/],
    [{ acao: 'criar', quadro: 'criacao', coluna: 'Nova', responsavel: 'ninguem' }, /^Nenhum pessoa "ninguem"/],
    [{ acao: 'criar', quadro: 'social', coluna: 'Nova', responsavel: 'web', papel: 'concluida' }, 'Coluna de pessoa é sempre de papel normal.'],
    [{ acao: 'editar', quadro: 'criacao', coluna: 'Design', papel: 'aguardando_cliente' }, 'Tire a pessoa da coluna antes.'],
    [{ acao: 'criar', quadro: 'criacao', coluna: 'Nova', apagar: true }, 'Parâmetro desconhecido: apagar.'],
  ]
  for (const [args, esperado] of casos) {
    const r = await chamar(amb, c.at, 'coluna', args)
    assert.equal(r.erro, true, JSON.stringify(args))
    if (typeof esperado === 'string') assert.equal(r.texto, esperado, JSON.stringify(args))
    else assert.match(r.texto, esperado, JSON.stringify(args))
  }
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM coluna')!.n, antes)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n, 0)
})

test('coluna permissão: os papéis da rota (todos); quadro arquivado não se acha pelo nome', async () => {
  const amb = await ambienteMcp()
  for (const [i, p] of [amb.pessoas.design, amb.pessoas.am, amb.pessoas.admin].entries()) {
    const c = await conectar(amb, p)
    const r = await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'atendimento', coluna: `Nova ${i}` })
    assert.equal(r.erro, false, `${p.papel}: ${r.texto}`)
  }
  const arquivar = await amb.como(amb.pessoas.admin).post(`/api/quadros/${amb.quadros.social.quadro.id}/arquivar`)
  assert.equal(arquivar.status, 200)
  const c = await conectar(amb, amb.pessoas.design)
  const r = await chamar(amb, c.at, 'coluna', { acao: 'criar', quadro: 'social', coluna: 'Nova' })
  assert.equal(r.erro, true)
  assert.match(r.texto, /^Nenhum quadro "social"/)
})
