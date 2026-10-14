/** Clientes (API.md §4.10, menos a trilha). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rodar, um } from '../src/db.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'

describe('clientes', () => {
  test('equipe cria com sigla e nome → 201 com a pendência sem_am; mandando atendimentoId → 403 campo_nao_permitido', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const r = await eu.post('/api/clientes', { sigla: 'xyz', nome: 'Xis Ípsilon Zê' })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.sigla, 'XYZ')
    assert.equal(r.corpo.atendimentoId, null)
    assert.deepEqual(r.corpo.pendencias, ['sem_am', 'sem_contato_padrao'])
    assert.deepEqual(r.corpo.apelidos, ['xyz'])
    const n = await eu.post('/api/clientes', { sigla: 'ABC', nome: 'A', atendimentoId: a.pessoas.am.id })
    assert.equal(n.status, 403)
    assert.equal(n.corpo.erro.codigo, 'campo_nao_permitido')
    assert.equal(n.corpo.erro.detalhes.campo, 'atendimentoId')
    assert.equal((await eu.patch(`/api/clientes/${r.corpo.id}`, { nome: 'Outro' })).status, 403)
  })

  test('atendimento cria: AM padrão = ele; apelidos normalizados; sigla ou apelido de outro → 409 com clienteId', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am2)
    const seq = ultimoSeq(a.db)
    const r = await eu.post('/api/clientes', { sigla: 'BV', nome: 'Bosque Vida', apelidos: ['Bosque  Vída', 'bv'], rodadasInclusas: 3 })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.atendimentoId, a.pessoas.am2.id)
    assert.deepEqual(r.corpo.apelidos, ['bv', 'bosque vida'])
    assert.equal(r.corpo.rodadasInclusas, 3)
    assert.ok(eventos(a.db, seq).some((e) => e.entidade === 'cliente' && e.entidade_id === r.corpo.id))
    assert.ok(um(a.db, "SELECT 1 FROM atividade WHERE tipo = 'cliente.criado' AND cliente_id = ?", r.corpo.id))
    const s = await eu.post('/api/clientes', { sigla: 'HE', nome: 'Outro' })
    assert.equal(s.status, 409)
    assert.equal(s.corpo.erro.detalhes.clienteId, a.clientes.he.id)
    const ap = await eu.post('/api/clientes', { sigla: 'HEV', nome: 'Outro', apelidos: ['Hospital Evangélico'] })
    assert.equal(ap.status, 409)
    assert.equal(ap.corpo.erro.detalhes.clienteId, a.clientes.he.id)
    assert.equal((await eu.post('/api/clientes', { sigla: 'MUITOLONGO1234', nome: 'X' })).status, 400)
    assert.equal((await eu.post('/api/clientes', { sigla: 'A-B', nome: 'X' })).status, 400)
  })

  test('listar com contadores e detalhe pela sigla (contatos, links, pendências)', async () => {
    const a = await ambiente()
    await a.criarDemanda({ prazo: '2026-10-13' })
    await a.criarDemanda({ ate: 'enviada', prazo: '2026-10-13' })
    await a.criarDemanda({ colunaId: a.coluna('atendimento', 'Com o cliente').id, quadroId: a.quadros.atendimento.quadro.id })
    const lista = await a.como(a.pessoas.web).get('/api/clientes')
    assert.equal(lista.status, 200)
    const he = lista.corpo.find((c: { sigla: string }) => c.sigla === 'HE')
    assert.deepEqual(he.contadores, { abertas: 3, comCliente: 2, atrasadas: 1 })
    const det = await a.como(a.pessoas.web).get('/api/clientes/he')
    assert.equal(det.status, 200)
    assert.equal(det.corpo.contatos[0].nome, 'Fulana')
    assert.equal(det.corpo.contatos[0].padrao, true)
    assert.deepEqual(det.corpo.responsaveis.map((r: { equipeId: string }) => r.equipeId), ['eq-criacao', 'eq-social'])
    assert.equal((await a.como(a.pessoas.web).get('/api/clientes/NAO')).status, 404)
  })

  test('PATCH: só o atendimento da carteira (ou sem AM) e o admin; trocar a sigla troca o apelido da sigla', async () => {
    const a = await ambiente()
    assert.equal((await a.como(a.pessoas.am2).patch(`/api/clientes/${a.clientes.he.id}`, { nome: 'X' })).status, 403)
    const r = await a.como(a.pessoas.am).patch(`/api/clientes/${a.clientes.he.id}`, { sigla: 'hev', pastaSaida: 'M:\\CLIENTES\\HEV\\SAÍDA' })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.sigla, 'HEV')
    assert.deepEqual(r.corpo.apelidos.sort(), ['hev', 'hospital evangelico'])
    assert.ok(um(a.db, "SELECT 1 FROM atividade WHERE tipo = 'cliente.editado' AND cliente_id = ?", a.clientes.he.id))
    const admin = await a.como(a.pessoas.admin).patch(`/api/clientes/${a.clientes.he.id}`, { atendimentoId: a.pessoas.am2.id })
    assert.equal(admin.corpo.atendimentoId, a.pessoas.am2.id)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/clientes/${a.clientes.he.id}`, { nome: 'Y' })).status, 403)
    assert.equal((await a.como(a.pessoas.admin).patch(`/api/clientes/${a.clientes.he.id}`, { sigla: 'ICC' })).status, 409)
    assert.equal((await a.como(a.pessoas.admin).patch(`/api/clientes/${a.clientes.he.id}`, { paiId: a.clientes.he.id })).status, 400)
    assert.equal((await a.como(a.pessoas.admin).patch(`/api/clientes/${a.clientes.he.id}`, { logoArquivoId: 'nada' })).status, 400)
    // sem AM: qualquer atendimento edita
    rodar(a.db, 'UPDATE cliente SET atendimento_id = NULL WHERE id = ?', a.clientes.icc.id)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/clientes/${a.clientes.icc.id}`, { nivel: 2 })).status, 200)
  })

  test('mudar o AM do cliente não muda o AM das demandas existentes', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    await a.como(a.pessoas.admin).patch(`/api/clientes/${a.clientes.he.id}`, { atendimentoId: a.pessoas.am2.id })
    assert.equal(um<{ a: string }>(a.db, 'SELECT atendimento_id AS a FROM demanda WHERE id = ?', d.id)!.a, a.pessoas.am.id)
  })

  test('apelidos e responsáveis substituem; responsável repetido por equipe ou inativo → 400', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const r = await eu.put(`/api/clientes/${a.clientes.he.id}/apelidos`, { apelidos: ['HE Curitiba', 'he'] })
    assert.deepEqual(r.corpo.apelidos, ['he', 'he curitiba'])
    assert.equal((await eu.put(`/api/clientes/${a.clientes.he.id}/apelidos`, { apelidos: ['icc'] })).status, 409)
    const resp = await eu.put(`/api/clientes/${a.clientes.he.id}/responsaveis`, { responsaveis: [{ equipeId: 'eq-criacao', usuarioId: a.pessoas.design2.id }] })
    assert.deepEqual(resp.corpo.responsaveis, [{ equipeId: 'eq-criacao', usuarioId: a.pessoas.design2.id }])
    const dup = [{ equipeId: 'eq-criacao', usuarioId: a.pessoas.design.id }, { equipeId: 'eq-criacao', usuarioId: a.pessoas.design2.id }]
    assert.equal((await eu.put(`/api/clientes/${a.clientes.he.id}/responsaveis`, { responsaveis: dup })).status, 400)
    await a.como(a.pessoas.admin).patch(`/api/pessoas/${a.pessoas.web.id}`, { ativo: false })
    assert.equal((await eu.put(`/api/clientes/${a.clientes.he.id}/responsaveis`, { responsaveis: [{ equipeId: 'eq-web', usuarioId: a.pessoas.web.id }] })).status, 400)
    assert.equal((await a.como(a.pessoas.design).put(`/api/clientes/${a.clientes.he.id}/apelidos`, { apelidos: [] })).status, 403)
  })

  test('contatos: padrão desmarca o anterior; desativar o padrão tira a pendência; contato de outro cliente → 404', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const he = a.clientes.he.id
    const seq = ultimoSeq(a.db)
    const r = await eu.post(`/api/clientes/${he}/contatos`, { nome: 'Sicrana', cargo: 'Marketing', padrao: true, email: 'S@HE.org' })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.email, 's@he.org')
    const det = (await eu.get('/api/clientes/HE')).corpo
    assert.equal(det.contatos.filter((c: { padrao: boolean }) => c.padrao).length, 1)
    assert.equal(det.contatos.find((c: { padrao: boolean }) => c.padrao).nome, 'Sicrana')
    assert.ok(eventos(a.db, seq).some((e) => e.entidade === 'cliente_contato'))
    const off = await eu.patch(`/api/clientes/${he}/contatos/${r.corpo.id}`, { ativo: false })
    assert.equal(off.corpo.padrao, false)
    assert.deepEqual((await eu.get('/api/clientes/HE')).corpo.pendencias, ['sem_contato_padrao'])
    assert.equal((await eu.post(`/api/clientes/${he}/contatos`, { nome: 'N', aprova: false, padrao: true })).status, 400)
    const fulana = det.contatos.find((c: { nome: string }) => c.nome === 'Fulana').id
    assert.equal((await a.como(a.pessoas.am2).patch(`/api/clientes/${a.clientes.icc.id}/contatos/${fulana}`, { nome: 'X' })).status, 404)
  })

  test('links: só https; editar e ordenar; DELETE apaga', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const he = a.clientes.he.id
    assert.equal((await eu.post(`/api/clientes/${he}/links`, { tipo: 'site', rotulo: 'Site', url: 'http://he.org' })).status, 400)
    assert.equal((await eu.post(`/api/clientes/${he}/links`, { tipo: 'site', rotulo: 'Site', url: 'javascript:alert(1)' })).status, 400)
    const l1 = await eu.post(`/api/clientes/${he}/links`, { tipo: 'site', rotulo: 'Site', url: 'https://he.org' })
    const l2 = await eu.post(`/api/clientes/${he}/links`, { tipo: 'acessos', rotulo: 'Cofre', url: 'https://cofre.example/he' })
    assert.equal(l1.status, 201)
    const e = await eu.patch(`/api/clientes/${he}/links/${l2.corpo.id}`, { rotulo: 'Acessos', posicao: { depoisDeId: null } })
    assert.ok(e.corpo.pos < l1.corpo.pos)
    assert.equal((await eu.del(`/api/clientes/${he}/links/${l1.corpo.id}`)).status, 204)
    assert.equal((await eu.del(`/api/clientes/${he}/links/${l1.corpo.id}`)).status, 404)
    assert.deepEqual((await eu.get('/api/clientes/HE')).corpo.links.map((x: { rotulo: string }) => x.rotulo), ['Acessos'])
  })
})
