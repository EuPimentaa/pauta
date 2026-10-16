/** Configuração do F5 (API.md §4.11): feriados e parâmetros da aplicação. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { FAIXAS_CONFIG } from '../../shared/tipos/index.ts'
import { um } from '../src/db.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'

describe('feriados', () => {
  test('feriado novo não muda prazos gravados e entra no próximo prazo de modelo', async () => {
    const a = await ambiente()
    // quarta, 14/10: o Post (2 dias úteis) vence na sexta, 16/10
    const antes = await a.criarDemanda({ modeloId: 'md-post' })
    assert.equal(antes.prazo, '2026-10-16')
    const r = await a.como(a.pessoas.admin).post('/api/config/feriados', { data: '2026-10-15', nome: 'Aniversário da cidade', tipo: 'municipal' })
    assert.equal(r.status, 201)
    assert.deepEqual(r.corpo, { data: '2026-10-15', nome: 'Aniversário da cidade', tipo: 'municipal' })
    const gravada = await a.como(a.pessoas.am).get(`/api/demandas/${antes.numero}`)
    assert.equal(gravada.corpo.demanda.prazo, '2026-10-16')
    // a quinta deixou de ser útil: sexta é o 1º dia útil e segunda, 19/10, o 2º
    const depois = await a.criarDemanda({ modeloId: 'md-post' })
    assert.equal(depois.prazo, '2026-10-19')
  })

  test('listar por ano (qualquer papel); criar e excluir só o admin, com evento; data repetida → 409', async () => {
    const a = await ambiente()
    const equipe = a.como(a.pessoas.design)
    const lista = await equipe.get('/api/config/feriados?ano=2026')
    assert.equal(lista.status, 200)
    assert.ok(lista.corpo.some((f: { data: string; nome: string }) => f.data === '2026-10-12'))
    assert.ok(lista.corpo.every((f: { data: string }) => f.data.startsWith('2026-')))
    assert.deepEqual(lista.corpo.map((f: { data: string }) => f.data), [...lista.corpo.map((f: { data: string }) => f.data)].sort())
    const padrao = await equipe.get('/api/config/feriados')
    assert.deepEqual(padrao.corpo, lista.corpo, 'sem ano: o ano corrente (2026 pelo relógio do teste)')
    assert.equal((await equipe.get('/api/config/feriados?ano=abc')).status, 400)

    assert.equal((await equipe.post('/api/config/feriados', { data: '2026-11-20', nome: 'Consciência Negra' })).status, 403)
    assert.equal((await a.como(a.pessoas.am).post('/api/config/feriados', { data: '2026-11-21', nome: 'X' })).status, 403)

    const admin = a.como(a.pessoas.admin)
    const seq = ultimoSeq(a.db)
    const novo = await admin.post('/api/config/feriados', { data: '2026-12-08', nome: '  Padroeira da cidade ' })
    assert.equal(novo.status, 201)
    assert.equal(novo.corpo.nome, 'Padroeira da cidade')
    assert.equal(novo.corpo.tipo, 'nacional', 'sem tipo: o padrão do banco')
    const ev = eventos(a.db, seq).filter((e) => e.entidade === 'feriado')
    assert.deepEqual(ev.map((e) => [e.entidade_id, e.op, e.publico]), [['2026-12-08', 'upsert', 'interno']])
    assert.equal(ev[0]!.patch!.nome, 'Padroeira da cidade')

    const repetido = await admin.post('/api/config/feriados', { data: '2026-12-08', nome: 'Outro' })
    assert.equal(repetido.status, 409)
    assert.match(repetido.corpo.erro.mensagem, /08\/12: Padroeira da cidade/)
    assert.equal((await admin.post('/api/config/feriados', { data: '2026-13-01', nome: 'X' })).status, 400)
    assert.equal((await admin.post('/api/config/feriados', { data: '2026-12-09', nome: '' })).status, 400)
    assert.equal((await admin.post('/api/config/feriados', { data: '2026-12-09', nome: 'X', tipo: 'religioso' })).status, 400)

    assert.equal((await equipe.del('/api/config/feriados/2026-12-08')).status, 403)
    const seq2 = ultimoSeq(a.db)
    assert.equal((await admin.del('/api/config/feriados/2026-12-08')).status, 204)
    assert.deepEqual(eventos(a.db, seq2).map((e) => [e.entidade, e.entidade_id, e.op]), [['feriado', '2026-12-08', 'delete']])
    assert.equal(um(a.db, "SELECT 1 FROM feriado WHERE data = '2026-12-08'"), undefined)
    assert.equal((await admin.del('/api/config/feriados/2026-12-08')).status, 404)
    assert.equal((await admin.del('/api/config/feriados/amanha')).status, 400)
  })
})

describe('configuração da aplicação', () => {
  test('GET para todos com a info do app; equipe e atendimento no PATCH → 403', async () => {
    const a = await ambiente()
    const r = await a.como(a.pessoas.design).get('/api/config/app')
    assert.equal(r.status, 200)
    assert.equal(r.corpo.config.conviteValidadeDias, 7)
    assert.equal(r.corpo.config.prazoHoraPadrao, '18:00')
    assert.equal(r.corpo.config.modelosRevisadosEm, null)
    assert.equal(typeof r.corpo.info.nome, 'string')
    assert.equal(typeof r.corpo.info.versao, 'string')
    for (const p of [a.pessoas.design, a.pessoas.am]) {
      const n = await a.como(p).patch('/api/config/app', { paradoLimiteDiasUteis: 3 })
      assert.equal(n.status, 403)
      assert.equal(n.corpo.erro.codigo, 'sem_permissao')
    }
    assert.equal((await a.como(a.pessoas.admin).get('/api/config/app')).corpo.config.paradoLimiteDiasUteis, 2)
  })

  test('fora das faixas → 400: conviteValidadeDias 365, uploadLimiteBytes acima de 10 MB, hora inválida', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const convite = await admin.patch('/api/config/app', { conviteValidadeDias: 365 })
    assert.equal(convite.status, 400)
    assert.equal(convite.corpo.erro.codigo, 'validacao')
    assert.ok(convite.corpo.erro.detalhes.campos.conviteValidadeDias)
    const upload = await admin.patch('/api/config/app', { uploadLimiteBytes: 10_485_761 })
    assert.equal(upload.status, 400)
    assert.ok(upload.corpo.erro.detalhes.campos.uploadLimiteBytes)
    assert.equal((await admin.patch('/api/config/app', { prazoHoraPadrao: '25:00' })).status, 400)
    assert.equal((await admin.patch('/api/config/app', { quadroConcluidasDias: 2.5 })).status, 400)
    assert.equal((await admin.patch('/api/config/app', { ajustePrazoDiasUteis: '1' })).status, 400)
    // um campo inválido no meio não grava os outros
    assert.equal((await admin.patch('/api/config/app', { paradoLimiteDiasUteis: 5, eventoRetencaoDias: 1 })).status, 400)
    assert.equal((await admin.get('/api/config/app')).corpo.config.paradoLimiteDiasUteis, 2)
    for (const [campo, [min, max]] of Object.entries(FAIXAS_CONFIG)) {
      if (campo === 'demandaNumeroInicial') continue
      assert.equal((await admin.patch('/api/config/app', { [campo]: max + 1 })).status, 400, `${campo} acima de ${max}`)
      assert.equal((await admin.patch('/api/config/app', { [campo]: min - 1 })).status, 400, `${campo} abaixo de ${min}`)
    }
  })

  test('admin muda os parâmetros: grava, devolve a configuração e vale nos serviços (convite de 3 dias)', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const r = await admin.patch('/api/config/app', {
      conviteValidadeDias: 3, prazoHoraPadrao: '17:30', uploadLimiteBytes: 10_485_760, quadroConcluidasDias: 14,
      modelosRevisadosEm: '2026-10-14T13:00:00.000Z',
    })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.config.conviteValidadeDias, 3)
    assert.equal(r.corpo.config.prazoHoraPadrao, '17:30')
    assert.equal(r.corpo.config.quadroConcluidasDias, 14)
    assert.equal(r.corpo.config.modelosRevisadosEm, null, '"Revisei os modelos" é a rota própria do F4, não este PATCH')
    const linha = um<{ valor: string; atualizado_por: string }>(a.db, "SELECT valor, atualizado_por FROM configuracao WHERE chave = 'convite.validade_dias'")
    assert.deepEqual({ ...linha }, { valor: '3', atualizado_por: a.pessoas.admin.id })
    const convite = await admin.post('/api/pessoas', { nome: 'Nova Pessoa', email: 'nova@melt.test', papel: 'equipe' })
    assert.equal(convite.status, 201)
    assert.equal(convite.corpo.convite.expiraEm, '2026-10-17T13:00:00.000Z')
  })

  test('mudança emite a entidade config (objeto inteiro, público interno); nada mudado não emite', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const seq = ultimoSeq(a.db)
    assert.equal((await admin.patch('/api/config/app', { quadroConcluidasDias: 10 })).status, 200)
    const ev = eventos(a.db, seq)
    assert.deepEqual(ev.map((e) => [e.entidade, e.entidade_id, e.op, e.publico, e.campos]), [['config', 'app', 'upsert', 'interno', null]])
    assert.equal(ev[0]!.patch!.quadroConcluidasDias, 10)
    assert.equal(ev[0]!.patch!.prazoHoraPadrao, '18:00', 'o objeto inteiro')
    const seq2 = ultimoSeq(a.db)
    assert.equal((await admin.patch('/api/config/app', { quadroConcluidasDias: 10 })).status, 200)
    assert.deepEqual(eventos(a.db, seq2), [], 'o mesmo valor não é mudança')
  })

  test('demandaNumeroInicial menor que o maior número → 400; o mesmo valor não muda nada; maior vale na próxima demanda', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    await a.criarDemanda()
    const ultima = await a.criarDemanda()
    assert.equal(ultima.numero, 2)
    const menor = await admin.patch('/api/config/app', { demandaNumeroInicial: 2 })
    assert.equal(menor.status, 400)
    assert.match(menor.corpo.erro.mensagem, /#2/)
    assert.ok(menor.corpo.erro.detalhes.campos.demandaNumeroInicial)
    // o formulário manda a configuração inteira: o valor atual (1) não é mudança
    const igual = await admin.patch('/api/config/app', { demandaNumeroInicial: 1, paradoLimiteDiasUteis: 4 })
    assert.equal(igual.status, 200)
    assert.equal(igual.corpo.config.paradoLimiteDiasUteis, 4)
    const maior = await admin.patch('/api/config/app', { demandaNumeroInicial: 4500 })
    assert.equal(maior.status, 200)
    assert.equal(maior.corpo.config.demandaNumeroInicial, 4500)
    assert.equal((await a.criarDemanda()).numero, 4500)
    assert.equal((await a.criarDemanda()).numero, 4501)
    assert.equal((await admin.patch('/api/config/app', { demandaNumeroInicial: 4501 })).status, 400)
  })
})
