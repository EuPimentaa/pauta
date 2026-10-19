/**
 * Agendas externas pela API (F9; API.md §F.9, §F.7, §F.10, §F.11): permissões, validação do endereço (anti-SSRF), o
 * endereço que nunca volta, os eventos por período, pausar, trocar o endereço, excluir, "Atualizar agora", o tempo
 * real, o provedor do MCP, a tarefa de 15 min e o segredo injetado num erro.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AgendaExterna, EventosAgendaSaida } from '../../shared/tipos/index.ts'
import { rodar, um } from '../src/db.ts'
import { ErroHttp } from '../src/erros.ts'
import { carregarTarefas, executarTarefa, tarefasDevidas, type Tarefa } from '../src/tarefas.ts'
import { cifrar } from '../src/servicos/cripto.ts'
import { buscarAgenda, definirBuscaAgenda, esperarBuscasAgenda } from '../src/servicos/agenda-busca.ts'
import { provedor } from '../src/provedores/agenda.ts'
import { eventos, ultimoSeq } from './ajuda.ts'
import { ambienteAgenda, capturarLog, criarAgendaTeste, fixture, horaSP, ical, URL_OUTRA, URL_TESTE } from './agenda-ajuda.ts'

const ocorrencias = (db: Parameters<typeof um>[0], id: string) =>
  um<{ n: number }>(db, 'SELECT count(*) AS n FROM agenda_ocorrencia WHERE agenda_id = ?', id)!.n

describe('permissões (API §F.7: config para o cadastro; todos leem)', () => {
  test('equipe e atendimento não criam, editam, excluem nem atualizam; todos leem a lista e os eventos', async () => {
    const a = await ambienteAgenda()
    const ag = await criarAgendaTeste(a)
    for (const p of [a.pessoas.design, a.pessoas.am]) {
      const c = a.como(p)
      assert.equal((await c.post('/api/agendas-externas', { nome: 'X', url: URL_OUTRA })).status, 403)
      assert.equal((await c.patch(`/api/agendas-externas/${ag.id}`, { nome: 'Y' })).status, 403)
      assert.equal((await c.del(`/api/agendas-externas/${ag.id}`)).status, 403)
      assert.equal((await c.post(`/api/agendas-externas/${ag.id}/atualizar`)).status, 403)
      const lista = await c.get('/api/agendas-externas')
      assert.equal(lista.status, 200)
      assert.deepEqual((lista.corpo as AgendaExterna[]).map((x) => x.nome), ['Melt'])
      assert.equal((await c.get('/api/agendas-externas/eventos?de=2026-10-19&ate=2026-10-25')).status, 200)
    }
    const r = await a.como(a.pessoas.design).post('/api/agendas-externas', { nome: 'X', url: URL_OUTRA })
    assert.equal(r.corpo.erro.codigo, 'sem_permissao')
    assert.equal((await a.como(a.pessoas.admin).post('/api/agendas-externas', { nome: 'X', url: URL_OUTRA }, { semCsrf: true })).status, 403)
  })

  test('sem sessão: 401', async () => {
    const a = await ambienteAgenda()
    assert.equal((await a.app.request('/api/agendas-externas')).status, 401)
    assert.equal((await a.app.request('/api/agendas-externas/eventos?de=2026-10-19&ate=2026-10-25')).status, 401)
  })
})

describe('POST: o endereço secreto (anti-SSRF) e o que volta', () => {
  test('http e outro host → 400; webcal:// válido → 201 normalizado, cifrado e sem o endereço na resposta', async () => {
    const a = await ambienteAgenda()
    const admin = a.como(a.pessoas.admin)
    const http = await admin.post('/api/agendas-externas', { nome: 'A', url: URL_TESTE.replace('https://', 'http://') })
    assert.equal(http.status, 400)
    assert.equal(http.corpo.erro.mensagem, 'Cole o Endereço secreto no formato iCal do Google Agenda.')
    assert.equal((await admin.post('/api/agendas-externas', { nome: 'A', url: URL_TESTE.replace('calendar.google.com', 'evil.example') })).status, 400)
    const webcal = await admin.post('/api/agendas-externas', { nome: 'Melt', url: URL_TESTE.replace('https://', 'webcal://') })
    assert.equal(webcal.status, 201)
    await esperarBuscasAgenda()
    const ag = webcal.corpo as AgendaExterna
    assert.deepEqual(Object.keys(ag).sort(), ['ativa', 'buscadaEm', 'contagens', 'cor', 'criadaEm', 'erro', 'id', 'nome', 'ocorrenciasEm', 'okEm', 'urlDica'])
    assert.equal(ag.urlDica, 'calendar.google.com · agencia@melt.test · …cdef')
    assert.equal(ag.cor, 'azul')
    assert.ok(!webcal.texto.includes('private-'))
    const linha = um<{ url_cifrada: string; url_hash: string }>(a.db, 'SELECT url_cifrada, url_hash FROM agenda_externa WHERE id = ?', ag.id)!
    assert.ok(!linha.url_cifrada.includes('private-') && !linha.url_cifrada.includes('calendar'))
    // o mesmo endereço (colado como https) já está cadastrado
    const repetido = await admin.post('/api/agendas-externas', { nome: 'Outra', url: URL_TESTE })
    assert.equal(repetido.status, 409)
    assert.equal(repetido.corpo.erro.codigo, 'conflito')
  })

  test(':8443, u:p@, ?x=1, #y e CALENDAR.google.com.evil.example → 400 sem ecoar o endereço', async () => {
    const a = await ambienteAgenda()
    const admin = a.como(a.pessoas.admin)
    for (const url of [
      URL_TESTE.replace('calendar.google.com', 'calendar.google.com:8443'), URL_TESTE.replace('https://', 'https://u:p@'),
      `${URL_TESTE}?x=1`, `${URL_TESTE}#y`, URL_TESTE.replace('calendar.google.com', 'CALENDAR.google.com.evil.example'),
    ]) {
      const r = await admin.post('/api/agendas-externas', { nome: 'A', url })
      assert.equal(r.status, 400, url)
      assert.ok(!r.texto.includes('private-'), r.texto)
    }
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM agenda_externa')!.n, 0)
  })

  test('nome vazio, cor fora da paleta (laranja) e campo desconhecido → 400', async () => {
    const a = await ambienteAgenda()
    const admin = a.como(a.pessoas.admin)
    assert.equal((await admin.post('/api/agendas-externas', { nome: '  ', url: URL_TESTE })).status, 400)
    assert.equal((await admin.post('/api/agendas-externas', { nome: 'A', cor: 'laranja', url: URL_TESTE })).status, 400)
    assert.equal((await admin.post('/api/agendas-externas', { nome: 'A', url: URL_TESTE, extra: 1 })).status, 400)
    assert.equal((await admin.post('/api/agendas-externas', { nome: 'A', url: 123 })).status, 400)
  })

  test('a primeira busca roda em segundo plano: estado, contagens e ocorrências; SSE do cadastro (admin) e da busca (sistema)', async () => {
    const a = await ambienteAgenda()
    const antes = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.admin).post('/api/agendas-externas', { nome: 'Melt', cor: 'roxo', url: URL_TESTE })
    assert.equal(r.status, 201)
    assert.equal((r.corpo as AgendaExterna).okEm, null)
    await esperarBuscasAgenda()
    const [ag] = (await a.como(a.pessoas.design).get('/api/agendas-externas')).corpo as AgendaExterna[]
    assert.equal(ag!.erro, null)
    assert.equal(ag!.okEm, '2026-10-19T13:00:00.000Z')
    assert.equal(ag!.buscadaEm, '2026-10-19T13:00:00.000Z')
    assert.equal(ag!.ocorrenciasEm, '2026-10-19T13:00:00.000Z')
    assert.equal(ag!.contagens!.eventos, 44)
    assert.equal(ag!.contagens!.bytes, fixture('google-2026.ics').byteLength)
    assert.equal(ocorrencias(a.db, ag!.id), ag!.contagens!.ocorrencias)
    const evs = eventos(a.db, antes).filter((e) => e.entidade === 'agenda_externa')
    assert.equal(evs.length, 2)
    assert.equal(evs[0]!.ator_id, a.pessoas.admin.id)
    assert.ok(evs[0]!.trace_id)
    assert.deepEqual([evs[1]!.ator_id, evs[1]!.trace_id, evs[1]!.publico], [null, null, 'interno'])
    assert.equal((evs[1]!.patch as unknown as AgendaExterna).okEm, '2026-10-19T13:00:00.000Z')
    assert.ok(!JSON.stringify(evs).includes('private-'))
  })
})

describe('GET /api/agendas-externas/eventos', () => {
  test('período: eventos das ativas, dia inteiro primeiro, privado "Ocupado"; o JSON nunca tem private-', async () => {
    const a = await ambienteAgenda()
    const ag = await criarAgendaTeste(a)
    const r = await a.como(a.pessoas.design).get('/api/agendas-externas/eventos?de=2026-10-19&ate=2026-10-25')
    assert.equal(r.status, 200)
    assert.ok(!r.texto.includes('private-'))
    const s = r.corpo as EventosAgendaSaida
    assert.deepEqual([s.de, s.ate, s.agendas.map((x) => x.id)], ['2026-10-19', '2026-10-25', [ag.id]])
    const dia19 = s.eventos.filter((e) => e.diaInicio === '2026-10-19')
    assert.equal(dia19[0]!.titulo, 'C4 Plantão das segundas')               // dia inteiro primeiro
    assert.ok(dia19.slice(1).every((e, i, l) => i === 0 || l[i - 1]!.inicio! <= e.inicio!))
    assert.ok(s.eventos.every((e) => e.id.startsWith(`${ag.id}:`) && e.agendaId === ag.id))
    const b1 = s.eventos.find((e) => e.titulo === 'B1 Reunião de pauta')!
    assert.deepEqual([b1.inicio, b1.local, horaSP(b1.inicio!)], ['2026-10-20T13:00:00.000Z', 'Sala 2, 3º andar; fundos', '10:00'])
    const outubro = (await a.como(a.pessoas.design).get('/api/agendas-externas/eventos?de=2026-10-26&ate=2026-11-01')).corpo as EventosAgendaSaida
    const privado = outubro.eventos.find((e) => e.privado)!
    assert.deepEqual([privado.titulo, privado.local, privado.descricao, privado.linkReuniao], ['Ocupado', null, null, null])
    assert.ok(!JSON.stringify(outubro).includes('Clínica'))
  })

  test('evento de vários dias aparece em todo período que ele cruza (dia_inicio <= ate AND dia_fim >= de)', async () => {
    const a = await ambienteAgenda()
    await criarAgendaTeste(a)
    const r = (await a.como(a.pessoas.am).get('/api/agendas-externas/eventos?de=2026-11-11&ate=2026-11-11')).corpo as EventosAgendaSaida
    assert.ok(r.eventos.some((e) => e.titulo === 'C2 Evento de 3 dias' && e.diaInicio === '2026-11-10' && e.diaFim === '2026-11-12'))
  })

  test('mais de 62 dias, fim antes do começo, data inválida → 400', async () => {
    const a = await ambienteAgenda()
    const c = a.como(a.pessoas.design)
    assert.equal((await c.get('/api/agendas-externas/eventos?de=2026-10-01&ate=2026-12-15')).status, 400)
    assert.equal((await c.get('/api/agendas-externas/eventos?de=2026-10-01&ate=2026-12-01')).status, 200)    // 62 dias
    assert.equal((await c.get('/api/agendas-externas/eventos?de=2026-10-01&ate=2026-12-02')).status, 400)    // 63
    assert.equal((await c.get('/api/agendas-externas/eventos?de=2026-10-10&ate=2026-10-01')).status, 400)
    assert.equal((await c.get('/api/agendas-externas/eventos?de=2026-02-30&ate=2026-03-01')).status, 400)
    assert.equal((await c.get('/api/agendas-externas/eventos?de=2026-10-01')).status, 400)
  })

  test('agendaIds repetido ou com vírgula; as agendas da resposta são todas as ativas', async () => {
    const a = await ambienteAgenda()
    const m = await criarAgendaTeste(a)
    definirBuscaAgenda(async () => ({ ok: true, corpo: ical(['UID:x@y', 'DTSTART:20261020T150000Z', 'SUMMARY:Da outra']) }))
    const o = await criarAgendaTeste(a, { nome: 'Outra', url: URL_OUTRA, cor: 'verde' })
    const c = a.como(a.pessoas.design)
    const base = '/api/agendas-externas/eventos?de=2026-10-20&ate=2026-10-20'
    const so = (await c.get(`${base}&agendaIds=${o.id}`)).corpo as EventosAgendaSaida
    assert.deepEqual(so.eventos.map((e) => e.titulo), ['Da outra'])
    assert.deepEqual(so.agendas.map((x) => x.id), [m.id, o.id])
    const duas = (await c.get(`${base}&agendaIds=${m.id},${o.id}`)).corpo as EventosAgendaSaida
    const repetido = (await c.get(`${base}&agendaIds=${m.id}&agendaIds=${o.id}`)).corpo as EventosAgendaSaida
    assert.deepEqual(duas.eventos, repetido.eventos)
    assert.ok(duas.eventos.length > 1)
    assert.deepEqual(((await c.get(`${base}&agendaIds=desconhecida`)).corpo as EventosAgendaSaida).eventos, [])
  })
})

describe('PATCH, DELETE e "Atualizar agora"', () => {
  test('pausar tira da Agenda e não busca; retomar busca de novo; nome e cor publicam o objeto inteiro', async () => {
    const a = await ambienteAgenda()
    const ag = await criarAgendaTeste(a)
    const admin = a.como(a.pessoas.admin)
    const antes = ultimoSeq(a.db)
    const p = await admin.patch(`/api/agendas-externas/${ag.id}`, { ativa: false, nome: 'Agência', cor: 'verde' })
    assert.equal(p.status, 200)
    assert.deepEqual([p.corpo.ativa, p.corpo.nome, p.corpo.cor], [false, 'Agência', 'verde'])
    const evs = eventos(a.db, antes)
    assert.equal(evs.length, 1)
    assert.deepEqual([evs[0]!.entidade, evs[0]!.entidade_id, (evs[0]!.patch as { cor: string }).cor], ['agenda_externa', ag.id, 'verde'])
    const sem = (await a.como(a.pessoas.design).get('/api/agendas-externas/eventos?de=2026-10-19&ate=2026-10-25')).corpo as EventosAgendaSaida
    assert.deepEqual([sem.agendas, sem.eventos], [[], []])
    assert.equal((await admin.post(`/api/agendas-externas/${ag.id}/atualizar`)).status, 422)
    // pausada não busca nem pela rodada
    let chamadas = 0
    definirBuscaAgenda(async () => { chamadas++; return { ok: true, corpo: fixture('google-2026.ics') } })
    await buscarAgenda(a.db, ag.id)
    assert.equal(chamadas, 0)
    assert.ok(ocorrencias(a.db, ag.id) > 0)                        // pausar não apaga as ocorrências
    await admin.patch(`/api/agendas-externas/${ag.id}`, { ativa: true })
    await esperarBuscasAgenda()
    assert.equal(chamadas, 1)
  })

  test('trocar o endereço: valida, cifra de novo, zera o hash e busca; o endereço de outra agenda → 409', async () => {
    const a = await ambienteAgenda()
    const ag = await criarAgendaTeste(a)
    const outra = await criarAgendaTeste(a, { nome: 'Outra', url: URL_OUTRA })
    const admin = a.como(a.pessoas.admin)
    assert.equal((await admin.patch(`/api/agendas-externas/${ag.id}`, { url: URL_OUTRA })).status, 409)
    assert.equal((await admin.patch(`/api/agendas-externas/${ag.id}`, { url: 'https://evil.example/x' })).status, 400)
    const nova = URL_TESTE.replace('private-0123456789abcdef0123456789abcdef', 'private-99999999aaaa')
    const urls: string[] = []
    let liberar: () => void = () => {}
    const segura = new Promise<void>((ok) => { liberar = ok })
    definirBuscaAgenda(async (url) => { urls.push(url); await segura; return { ok: true, corpo: fixture('google-2026.ics') } })
    const r = await admin.patch(`/api/agendas-externas/${ag.id}`, { url: nova })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.urlDica, 'calendar.google.com · agencia@melt.test · …aaaa')
    assert.ok(!r.texto.includes('private-'))
    assert.equal(um<{ h: string | null }>(a.db, 'SELECT hash_conteudo AS h FROM agenda_externa WHERE id = ?', ag.id)!.h, null)
    liberar()
    await esperarBuscasAgenda()
    assert.deepEqual(urls, [nova])                                 // buscou o endereço novo (o mesmo corpo regrava o hash)
    assert.ok(um<{ h: string | null }>(a.db, 'SELECT hash_conteudo AS h FROM agenda_externa WHERE id = ?', ag.id)!.h)
    assert.notEqual(outra.id, ag.id)
  })

  test('reordenar pela posição relativa', async () => {
    const a = await ambienteAgenda()
    const m = await criarAgendaTeste(a)
    const o = await criarAgendaTeste(a, { nome: 'Outra', url: URL_OUTRA })
    const admin = a.como(a.pessoas.admin)
    assert.equal((await admin.patch(`/api/agendas-externas/${o.id}`, { posicao: { depoisDeId: null } })).status, 200)
    assert.deepEqual(((await admin.get('/api/agendas-externas')).corpo as AgendaExterna[]).map((x) => x.nome), ['Outra', 'Melt'])
    await admin.patch(`/api/agendas-externas/${o.id}`, { posicao: { depoisDeId: m.id } })
    assert.deepEqual(((await admin.get('/api/agendas-externas')).corpo as AgendaExterna[]).map((x) => x.nome), ['Melt', 'Outra'])
    assert.equal((await admin.patch(`/api/agendas-externas/${o.id}`, { posicao: { depoisDeId: 'nao-existe' } })).status, 400)
  })

  test('excluir leva as ocorrências (cascade) e publica o delete; 404 depois', async () => {
    const a = await ambienteAgenda()
    const ag = await criarAgendaTeste(a)
    assert.ok(ocorrencias(a.db, ag.id) > 100)
    const antes = ultimoSeq(a.db)
    const admin = a.como(a.pessoas.admin)
    assert.equal((await admin.del(`/api/agendas-externas/${ag.id}`)).status, 204)
    assert.equal(ocorrencias(a.db, ag.id), 0)
    assert.deepEqual(eventos(a.db, antes).map((e) => [e.entidade, e.op, e.entidade_id]), [['agenda_externa', 'delete', ag.id]])
    assert.equal((await admin.del(`/api/agendas-externas/${ag.id}`)).status, 404)
    assert.equal((await admin.patch(`/api/agendas-externas/${ag.id}`, { nome: 'x' })).status, 404)
    assert.equal((await admin.post(`/api/agendas-externas/${ag.id}/atualizar`)).status, 404)
  })

  test('"Atualizar agora": 202 e busca em segundo plano; 1 por agenda por minuto (429 com tenteEmSegundos)', async () => {
    const a = await ambienteAgenda()
    const ag = await criarAgendaTeste(a)
    const admin = a.como(a.pessoas.admin)
    let chamadas = 0
    definirBuscaAgenda(async () => { chamadas++; return { ok: true, corpo: fixture('google-2026.ics') } })
    const r = await admin.post(`/api/agendas-externas/${ag.id}/atualizar`)
    assert.equal(r.status, 202)
    assert.equal(r.corpo.id, ag.id)
    await esperarBuscasAgenda()
    assert.equal(chamadas, 1)
    a.relogio('2026-10-19T13:00:40.000Z')
    const deNovo = await admin.post(`/api/agendas-externas/${ag.id}/atualizar`)
    assert.equal(deNovo.status, 429)
    assert.equal(deNovo.corpo.erro.codigo, 'muitas_tentativas')
    assert.equal(deNovo.corpo.erro.detalhes.tenteEmSegundos, 20)
    a.relogio('2026-10-19T13:01:01.000Z')
    assert.equal((await admin.post(`/api/agendas-externas/${ag.id}/atualizar`)).status, 202)
    await esperarBuscasAgenda()
    assert.equal(chamadas, 2)
  })
})

describe('provedor do MCP (FASE2-PLANO §5)', () => {
  test('tipo agenda; os mesmos eventos da rota; período acima de 62 dias lança o 400 da rota', async () => {
    const a = await ambienteAgenda()
    await criarAgendaTeste(a)
    assert.equal(provedor.tipo, 'agenda')
    const pelaRota = (await a.como(a.pessoas.design).get('/api/agendas-externas/eventos?de=2026-10-19&ate=2026-10-25')).corpo
    assert.deepEqual(provedor.eventos(a.db, { de: '2026-10-19', ate: '2026-10-25' }), pelaRota)
    assert.throws(() => provedor.eventos(a.db, { de: '2026-10-01', ate: '2026-12-31' }), (e) => e instanceof ErroHttp && e.status === 400)
  })
})

describe('tarefa agenda-busca (aCadaMin)', () => {
  test('tarefa com intervalo: devida sem execução, de novo só depois de aCadaMin; as diárias não mudam', async (t) => {
    capturarLog(t)
    const a = await ambienteAgenda()
    const feitas: string[] = []
    const intervalo: Tarefa = { nome: 'teste-intervalo', horario: '23:59', aCadaMin: 15, executar: () => { feitas.push('i') } }
    const diaria: Tarefa = { nome: 'teste-diaria', horario: '03:00', executar: () => { feitas.push('d') } }
    assert.deepEqual(tarefasDevidas(a.db, [intervalo, diaria]).map((x) => x.nome), ['teste-intervalo', 'teste-diaria'])
    await executarTarefa(a.db, intervalo)
    await executarTarefa(a.db, diaria)
    a.relogio('2026-10-19T13:14:59.000Z')
    assert.deepEqual(tarefasDevidas(a.db, [intervalo, diaria]), [])
    a.relogio('2026-10-19T13:15:00.000Z')
    assert.deepEqual(tarefasDevidas(a.db, [intervalo, diaria]).map((x) => x.nome), ['teste-intervalo'])
    a.relogio('2026-10-20T06:00:00.000Z')                          // 03:00 do dia seguinte em SP
    assert.deepEqual(tarefasDevidas(a.db, [intervalo, diaria]).map((x) => x.nome), ['teste-intervalo', 'teste-diaria'])
    assert.deepEqual(feitas, ['i', 'd'])
  })

  test('a tarefa é descoberta com aCadaMin 15; busca só as ativas cuja última tentativa passou de 15 min', async () => {
    const a = await ambienteAgenda()
    const tarefa = (await carregarTarefas()).find((x) => x.nome === 'agenda-busca')!
    assert.equal(tarefa.aCadaMin, 15)
    const m = await criarAgendaTeste(a)
    const o = await criarAgendaTeste(a, { nome: 'Outra', url: URL_OUTRA })
    const p = await criarAgendaTeste(a, { nome: 'Pausada', url: URL_TESTE.replace('agencia%40melt.test', 'outra%40melt.test') })
    await a.como(a.pessoas.admin).patch(`/api/agendas-externas/${p.id}`, { ativa: false })
    const buscadas: string[] = []
    definirBuscaAgenda(async (url) => { buscadas.push(url); return { ok: true, corpo: fixture('google-2026.ics') } })
    a.relogio('2026-10-19T13:10:00.000Z')
    rodar(a.db, 'UPDATE agenda_externa SET buscada_em = ? WHERE id = ?', '2026-10-19T12:50:00.000Z', o.id)
    assert.equal(await executarTarefa(a.db, tarefa), true)
    assert.deepEqual(buscadas, [URL_OUTRA])                        // a Melt buscou às 13:00 (10 min); a pausada nunca
    a.relogio('2026-10-19T13:15:00.000Z')
    await executarTarefa(a.db, tarefa)
    assert.deepEqual(buscadas, [URL_OUTRA, URL_TESTE])
    assert.equal(um<{ ok: number; detalhe: string | null }>(a.db, "SELECT ok, detalhe FROM tarefa_execucao WHERE nome = 'agenda-busca'")!.ok, 1)
    assert.notEqual(m.id, o.id)
  })
})

describe('segredo nunca escapa (FASE2-PLANO §0 regra 6; API §F.1)', () => {
  const SEGREDO = 'falhou: https://calendar.google.com/calendar/ical/x%40y.test/private-abc123def/basic.ics?api_key=KEY123456789 pauta_at_tokensecreto'

  test('Error com api_key, private-… e pauta_at_ na busca: a agenda fica fora_do_ar, a próxima agenda segue, o log e tarefa_execucao saem mascarados', async (t) => {
    const log = capturarLog(t)
    const a = await ambienteAgenda()
    const m = await criarAgendaTeste(a)
    const o = await criarAgendaTeste(a, { nome: 'Outra', url: URL_OUTRA })
    const buscadas: string[] = []
    definirBuscaAgenda(async (url) => {
      buscadas.push(url)
      if (url === URL_TESTE) throw new Error(`${SEGREDO} ${url}`)
      return { ok: true, corpo: fixture('google-2026.ics') }
    })
    a.relogio('2026-10-19T13:20:00.000Z')
    const tarefa = (await carregarTarefas()).find((x) => x.nome === 'agenda-busca')!
    assert.equal(await executarTarefa(a.db, tarefa), false)
    assert.equal(buscadas.length, 2)                               // a falha de uma não impediu a outra
    const reg = um<{ ok: number; detalhe: string }>(a.db, "SELECT ok, detalhe FROM tarefa_execucao WHERE nome = 'agenda-busca'")!
    assert.equal(reg.ok, 0)
    assert.match(reg.detalhe, /^1 de 2 agendas falharam: agenda /)
    const agendas = ((await a.como(a.pessoas.admin).get('/api/agendas-externas')).corpo as AgendaExterna[])
    assert.deepEqual(agendas.map((x) => [x.id, x.erro]), [[m.id, 'fora_do_ar'], [o.id, null]])
    const tudo = [reg.detalhe, ...log].join('\n')
    for (const proibido of ['private-abc123def', 'KEY123456789', 'pauta_at_tokensecreto', 'private-0123456789abcdef', URL_TESTE]) {
      assert.ok(!tudo.includes(proibido), `vazou ${proibido}`)
    }
    assert.ok(log.some((l) => l.includes('private-***')))
  })

  test('erro inesperado na busca do "Atualizar agora": o .catch registra mascarado e a resposta já foi 202', async (t) => {
    const log = capturarLog(t)
    const a = await ambienteAgenda()
    const ag = await criarAgendaTeste(a)
    definirBuscaAgenda(async (url) => { throw new Error(`${SEGREDO} ${url}`) })
    const r = await a.como(a.pessoas.admin).post(`/api/agendas-externas/${ag.id}/atualizar`)
    assert.equal(r.status, 202)
    await esperarBuscasAgenda()
    await new Promise((ok) => setImmediate(ok))
    const tudo = log.join('\n')
    assert.ok(tudo.includes('agenda busca'), tudo)
    for (const proibido of ['private-abc123def', 'KEY123456789', 'pauta_at_tokensecreto', 'private-0123456789abcdef']) assert.ok(!tudo.includes(proibido), proibido)
  })

  test('endereço decifrado fora do formato (gravado à mão) → endereco_invalido sem chamar a busca; ilegível → endereco_ilegivel', async () => {
    const a = await ambienteAgenda()
    const ag = await criarAgendaTeste(a)
    let chamadas = 0
    definirBuscaAgenda(async () => { chamadas++; return { ok: true, corpo: fixture('google-2026.ics') } })
    rodar(a.db, 'UPDATE agenda_externa SET url_cifrada = ? WHERE id = ?', cifrar('http://169.254.169.254/latest/private-abc/basic.ics', 'agenda_ical'), ag.id)
    await buscarAgenda(a.db, ag.id)
    assert.equal(chamadas, 0)
    assert.equal(um<{ erro: string }>(a.db, 'SELECT erro FROM agenda_externa WHERE id = ?', ag.id)!.erro, 'endereco_invalido')
    rodar(a.db, 'UPDATE agenda_externa SET url_cifrada = ? WHERE id = ?', cifrar(URL_TESTE, 'outra_finalidade'), ag.id)
    await buscarAgenda(a.db, ag.id)
    assert.equal(chamadas, 0)
    assert.equal(um<{ erro: string }>(a.db, 'SELECT erro FROM agenda_externa WHERE id = ?', ag.id)!.erro, 'endereco_ilegivel')
    assert.ok(ocorrencias(a.db, ag.id) > 0)                        // as da última busca boa continuam
  })

  test('H7: o fluxo inteiro (cadastrar, listar, eventos, editar, atualizar, erros) nunca devolve nem registra o endereço', async (t) => {
    const log = capturarLog(t)
    const a = await ambienteAgenda()
    const admin = a.como(a.pessoas.admin)
    const respostas: string[] = []
    const guardar = (r: { texto: string }) => { respostas.push(r.texto); return r }
    const ag = guardar(await admin.post('/api/agendas-externas', { nome: 'Melt', url: URL_TESTE })) as unknown as { corpo: AgendaExterna }
    await esperarBuscasAgenda()
    guardar(await admin.post('/api/agendas-externas', { nome: 'Melt', url: URL_TESTE }))                  // 409
    guardar(await admin.post('/api/agendas-externas', { nome: 'Melt', url: `${URL_TESTE}?x=1` }))         // 400
    guardar(await admin.get('/api/agendas-externas'))
    guardar(await admin.get('/api/agendas-externas/eventos?de=2026-10-19&ate=2026-11-30'))
    guardar(await admin.patch(`/api/agendas-externas/${ag.corpo.id}`, { url: URL_OUTRA }))
    guardar(await admin.post(`/api/agendas-externas/${ag.corpo.id}/atualizar`))
    guardar(await admin.post(`/api/agendas-externas/${ag.corpo.id}/atualizar`))                           // 429
    await esperarBuscasAgenda()
    guardar(await admin.get('/api/bootstrap'))
    const tudo = [...respostas, ...log, JSON.stringify(eventos(a.db))].join('\n')
    assert.ok(!tudo.includes('private-'), 'o endereço apareceu')
  })
})
