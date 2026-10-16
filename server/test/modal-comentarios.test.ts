/** Comentários e histórico do modal (F1, API.md §4.15): menções, notificações, permissões e paginação. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Atividade, Comentario, Pagina } from '../../shared/tipos/index.ts'
import { tx } from '../src/db.ts'
import { lancarApontamento } from '../src/servicos/horas.ts'
import { ambiente, eventos, notificacoesDe, ultimoSeq } from './ajuda.ts'

const mencao = (nome: string, id: string) => `@[${nome}](mencao:${id})`

describe('POST /api/demandas/:id/comentarios', () => {
  test('menção notifica o mencionado e não o autor; membros e AM recebem `comentario` sem repetir o mencionado', async () => {
    const a = await ambiente()
    const { design, design2, am } = a.pessoas
    // membros: design e design2; AM do HE: am
    const d = await a.criarDemanda({ membroIds: [design.id, design2.id], como: a.pessoas.admin })
    const seq = ultimoSeq(a.db)
    const r = await a.como(design).post(`/api/demandas/${d.id}/comentarios`, {
      corpoMd: `Olha a referência, ${mencao('Design2', design2.id)} e ${mencao('Design', design.id)}`,
    })
    assert.equal(r.status, 201)
    const c: Comentario = r.corpo.comentario
    assert.deepEqual(c.mencoes, [design2.id, design.id])
    assert.equal(c.autorId, design.id)
    assert.equal(c.visivelCliente, false)

    assert.deepEqual(notificacoesDe(a.db, design2.id).map((n) => n.tipo), ['membro', 'mencao'])
    assert.match(notificacoesDe(a.db, design2.id).at(-1)!.resumo, /^Design mencionou você em #\d+ Post de outubro: “Olha a referência, @Design2/)
    // o autor nunca: nem pela menção a si mesmo, nem como membro
    assert.deepEqual(notificacoesDe(a.db, design.id).map((n) => n.tipo), ['membro'])
    assert.deepEqual(notificacoesDe(a.db, am.id).map((n) => n.tipo), ['comentario'])

    const evs = eventos(a.db, seq)
    assert.ok(evs.some((e) => e.entidade === 'comentario' && e.entidade_id === c.id && e.op === 'upsert'))
    const contador = evs.find((e) => e.entidade === 'demanda' && e.campos?.includes('nComentarios'))
    assert.equal(contador?.patch?.nComentarios, 1)
  })

  test('editar só notifica a menção nova', async () => {
    const a = await ambiente()
    const { design, design2, social } = a.pessoas
    const d = await a.criarDemanda()
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: `Oi ${mencao('Design', design.id)}` })
    const id = r.corpo.comentario.id
    const e = await a.como(a.pessoas.am).patch(`/api/comentarios/${id}`, {
      corpoMd: `Oi ${mencao('Design', design.id)} e ${mencao('Design2', design2.id)}, ${mencao('Social', social.id)}`,
    })
    assert.equal(e.status, 200)
    assert.ok(e.corpo.comentario.editadoEm)
    assert.equal(notificacoesDe(a.db, design.id).filter((n) => n.tipo === 'mencao').length, 1)
    assert.equal(notificacoesDe(a.db, design2.id).filter((n) => n.tipo === 'mencao').length, 1)
    assert.equal(notificacoesDe(a.db, social.id).filter((n) => n.tipo === 'mencao').length, 1)
    // a mesma menção de novo não repete
    await a.como(a.pessoas.am).patch(`/api/comentarios/${id}`, { corpoMd: `${mencao('Design2', design2.id)} conferido` })
    assert.equal(notificacoesDe(a.db, design2.id).filter((n) => n.tipo === 'mencao').length, 1)
  })

  test('menção de pessoa inexistente vira texto', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: `${mencao('Fantasma', 'nao-existe')} veja` })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.comentario.corpoMd, '@Fantasma veja')
    assert.deepEqual(r.corpo.comentario.mencoes, [])
  })

  test('equipe com visivelCliente: true no POST e no PATCH → 403 campo_nao_permitido; atendimento pode', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const r = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Para o cliente', visivelCliente: true })
    assert.equal(r.status, 403)
    assert.equal(r.corpo.erro.codigo, 'campo_nao_permitido')
    assert.equal(r.corpo.erro.detalhes.campo, 'visivelCliente')
    const meu = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Interno' })
    const p = await a.como(a.pessoas.design).patch(`/api/comentarios/${meu.corpo.comentario.id}`, { visivelCliente: true })
    assert.equal(p.status, 403)
    assert.equal(p.corpo.erro.codigo, 'campo_nao_permitido')
    const am = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Para o cliente', visivelCliente: true })
    assert.equal(am.status, 201)
    assert.equal(am.corpo.comentario.visivelCliente, true)
  })

  test('anexoIds de outra demanda → 400; da mesma, o anexo fica preso ao comentário', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const outra = await a.criarDemanda({ titulo: 'Outra' })
    const anexo = await a.como(a.pessoas.am).post(`/api/demandas/${outra.id}/anexos`, { tipo: 'link', url: 'https://figma.com/file/x' })
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Com anexo', anexoIds: [anexo.corpo.id] })
    assert.equal(r.status, 400)
    assert.equal(r.corpo.erro.codigo, 'validacao')
    const daMesma = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/anexos`, { tipo: 'link', url: 'https://figma.com/file/y' })
    const ok = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Com anexo', anexoIds: [daMesma.corpo.id] })
    assert.equal(ok.status, 201)
    assert.deepEqual(ok.corpo.comentario.anexos.map((x: { id: string }) => x.id), [daMesma.corpo.id])
    // o mesmo anexo não serve a dois comentários
    const de2 = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'De novo', anexoIds: [daMesma.corpo.id] })
    assert.equal(de2.status, 400)
  })

  test('vazio → 400; demanda arquivada → 422; demanda inexistente → 404; senha no texto avisa', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: '   ' })).status, 400)
    const senha = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'login admin senha: Abc12345!' })
    assert.deepEqual(senha.corpo.avisos, ['senha_detectada'])
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/arquivar`)
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Oi' })).status, 422)
    assert.equal((await a.como(a.pessoas.am).get('/api/demandas/nao-existe/comentarios')).status, 404)
  })
})

describe('PATCH e DELETE /api/comentarios/:id', () => {
  test('editar comentário de outra pessoa → 403 (nem o admin); excluir: o autor ou o admin', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const r = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: 'Do design' })
    const id = r.corpo.comentario.id
    const outro = await a.como(a.pessoas.design2).patch(`/api/comentarios/${id}`, { corpoMd: 'Mudei' })
    assert.equal(outro.status, 403)
    assert.equal(outro.corpo.erro.codigo, 'sem_permissao')
    assert.equal((await a.como(a.pessoas.admin).patch(`/api/comentarios/${id}`, { corpoMd: 'Mudei' })).status, 403)
    assert.equal((await a.como(a.pessoas.am).del(`/api/comentarios/${id}`)).status, 403)

    const seq = ultimoSeq(a.db)
    assert.equal((await a.como(a.pessoas.admin).del(`/api/comentarios/${id}`)).status, 204)
    const lista: Comentario[] = (await a.como(a.pessoas.am).get(`/api/demandas/${d.id}/comentarios`)).corpo
    assert.equal(lista.length, 1)
    assert.equal(lista[0]!.corpoMd, '')
    assert.ok(lista[0]!.excluidoEm)
    const contador = eventos(a.db, seq).find((e) => e.entidade === 'demanda' && e.campos?.includes('nComentarios'))
    assert.equal(contador?.patch?.nComentarios, 0)
    // excluído não se edita nem se exclui de novo
    assert.equal((await a.como(a.pessoas.design).patch(`/api/comentarios/${id}`, { corpoMd: 'Volta' })).status, 404)
    assert.equal((await a.como(a.pessoas.design).del(`/api/comentarios/${id}`)).status, 404)
  })

  test('lista em ordem de criação', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    for (const t of ['um', 'dois', 'três']) await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: t })
    const lista: Comentario[] = (await a.como(a.pessoas.design).get(`/api/demandas/${d.id}/comentarios`)).corpo
    assert.deepEqual(lista.map((c) => c.corpoMd), ['um', 'dois', 'três'])
  })
})

describe('GET /api/demandas/:id/historico', () => {
  test('paginado, mais novas primeiro, sem o tempo.lancado de outra pessoa (o admin vê)', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    for (let i = 0; i < 5; i++) await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: `c${i}` })
    tx(a.db, () => lancarApontamento(a.db, { demandaId: d.id, ator: a.ator(a.pessoas.design2), entrada: { minutos: 30 } }))
    tx(a.db, () => lancarApontamento(a.db, { demandaId: d.id, ator: a.ator(a.pessoas.design), entrada: { minutos: 15 } }))

    const p1: Pagina<Atividade> = (await a.como(a.pessoas.design).get(`/api/demandas/${d.id}/historico?limite=3`)).corpo
    assert.equal(p1.itens.length, 3)
    assert.ok(p1.proximo)
    const ids = p1.itens.map((x) => x.id)
    assert.deepEqual(ids, [...ids].sort((x, y) => y - x))
    assert.equal(p1.itens[0]!.tipo, 'tempo.lancado')
    assert.equal((p1.itens[0]!.dados as { minutos: number }).minutos, 15)
    const p2: Pagina<Atividade> = (await a.como(a.pessoas.design).get(`/api/demandas/${d.id}/historico?limite=50&cursor=${p1.proximo}`)).corpo
    assert.equal(p2.proximo, null)
    assert.ok(p2.itens.every((x) => x.id < ids.at(-1)!))
    const todosDoDesign = [...p1.itens, ...p2.itens]
    // o tempo da design2 não aparece; criação + 5 comentários + o meu tempo
    assert.equal(todosDoDesign.filter((x) => x.tipo === 'tempo.lancado').length, 1)
    assert.equal(todosDoDesign.length, 7)
    assert.equal(todosDoDesign.at(-1)!.tipo, 'demanda.criada')

    const doAdmin: Pagina<Atividade> = (await a.como(a.pessoas.admin).get(`/api/demandas/${d.id}/historico`)).corpo
    assert.equal(doAdmin.itens.filter((x) => x.tipo === 'tempo.lancado').length, 2)
    assert.equal((await a.como(a.pessoas.admin).get(`/api/demandas/${d.id}/historico?cursor=@@`)).status, 400)
  })
})
