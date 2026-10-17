/**
 * Retorno do cliente (F2, API.md §4.16, §5.4, §5.5 e §5.7): o vaivém com as automações da fixture (Criação →
 * Atendimento › Com o cliente → Criação › Fila → Social › Agendar), a bola com o cliente, anular, ajuste interno e
 * rodada extra.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Demanda, PaginaAprovacao, RegistrarRetornoSaida } from '../../shared/tipos/index.ts'
import { comQuemEsta } from '../../shared/logica/quadro.ts'
import { estadoPrazo } from '../../shared/logica/prazo.ts'
import { todos, um } from '../src/db.ts'
import { eventos, notificacoesDe, ultimoSeq } from './ajuda.ts'
import { ambiente, enviarAoCliente, enviarPng, entregar, publico, tokenDe } from './ciclo-ajuda.ts'

const nomesEtiquetas = (a: Awaited<ReturnType<typeof ambiente>>, d: Demanda) =>
  d.etiquetaIds.map((id) => um<{ nome: string }>(a.db, 'SELECT nome FROM etiqueta WHERE id = ?', id)!.nome).sort()

describe('vaivém com as automações da Criação', () => {
  test('enviar → Atendimento › Com o cliente; ajuste pelo link → Criação › Fila; V2 aprovada → Social › Agendar só com o social', async () => {
    const a = await ambiente()
    const urgente = a.quadros.criacao.etiquetas.find((e) => e.nome === 'Urgente')!
    const alteracao = a.quadros.criacao.etiquetas.find((e) => e.nome === 'Alteração')!
    const d0 = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id, etiquetaIds: [urgente.id, alteracao.id] })
    assert.deepEqual(d0.membroIds, [a.pessoas.design.id])

    // V1: entregar não muda a coluna e avisa o AM
    const v1 = await entregar(a, d0)
    assert.equal(v1.demanda.colunaId, a.coluna('criacao', 'Design').id)
    assert.equal(v1.versao.numero, 1)
    assert.ok(notificacoesDe(a.db, a.pessoas.am.id).some((n) => n.tipo === 'versao_entregue' && n.resumo.includes('V1')))

    // enviar por link: o envio guarda o quadro de antes da automação e a demanda vai sozinha ao Atendimento
    const env = await enviarAoCliente(a, v1.demanda)
    assert.equal(env.automacao, true)
    assert.equal(env.envio.quadroId, a.quadros.criacao.quadro.id)
    assert.equal(env.demanda.colunaId, a.coluna('atendimento', 'Com o cliente').id)
    assert.equal(env.demanda.quadroId, a.quadros.atendimento.quadro.id)
    assert.ok(env.demanda.envioPendenteEm)
    assert.equal(comQuemEsta(env.demanda, { papel: 'aguardando_cliente' }), 'cliente')
    assert.match(env.textoWhatsapp, /^Olá, Fulana\. Segue Post de outubro \(V1\) para aprovação: http.+\/a\/.+ Prazo para retorno: sex, 16\/10, 18h\.$/)
    // "Urgente" não tem par no Atendimento: fica guardada na Criação
    assert.deepEqual(env.demanda.etiquetaIds, [])

    // o cliente pede ajuste com 3 linhas pelo link: volta para Criação › Fila (automação do quadro DO ENVIO)
    const token = tokenDe(env.link!.url)
    const pag = (await publico(a).pagina(token)).corpo as PaginaAprovacao
    const r = await publico(a).decidir(token, {
      demandaId: d0.id, versaoId: pag.itens[0]!.versao!.id, decisao: 'ajuste', contatoId: pag.contato!.id,
      linhas: ['- Trocar a foto', '• Aumentar o logo', '', '1. Corrigir a data'],
    })
    assert.equal(r.status, 200, r.texto)
    assert.match(r.corpo.mensagem, /A equipe prepara a V2 até qui, 15\/10/)
    const depoisAjuste = (await a.como(a.pessoas.am).get(`/api/demandas/${d0.numero}`)).corpo
    assert.equal(depoisAjuste.demanda.colunaId, a.coluna('criacao', 'Fila').id)
    assert.equal(depoisAjuste.demanda.rodadaAtual, 2)
    assert.equal(depoisAjuste.demanda.prazo, '2026-10-15')
    assert.equal(depoisAjuste.demanda.envioPendenteEm, null)
    assert.deepEqual(nomesEtiquetas(a, depoisAjuste.demanda), ['Alteração', 'Urgente'])
    const ajustes = depoisAjuste.checklists.find((c: { titulo: string }) => c.titulo === 'Ajustes R2')
    assert.deepEqual(ajustes.itens.map((i: { texto: string }) => i.texto), ['Trocar a foto', 'Aumentar o logo', 'Corrigir a data'])
    assert.ok(notificacoesDe(a.db, a.pessoas.design.id).some((n) => n.tipo === 'ajuste_pedido'))
    const ap = depoisAjuste.aprovacoes[0]
    assert.equal(ap.via, 'link')
    assert.equal(ap.quadroAntesId, a.quadros.atendimento.quadro.id)
    assert.equal(um<{ ator_tipo: string }>(a.db, `SELECT ator_tipo FROM atividade WHERE tipo = 'retorno.registrado'`)!.ator_tipo, 'cliente')

    // V2 entregue, enviada e aprovada: Social › Agendar com o social como único membro, sem `chegou`
    const v2 = await entregar(a, depoisAjuste.demanda)
    const env2 = await enviarAoCliente(a, v2.demanda)
    assert.equal(env2.link!.id, env.link!.id, 'reaproveita o link ativo do mesmo contato')
    const pag2 = (await publico(a).pagina(token)).corpo as PaginaAprovacao
    assert.equal(pag2.itens[0]!.versao!.numero, 2)
    assert.deepEqual(pag2.itens[0]!.anteriores.map((x) => [x.numero, x.decisao]), [[1, 'ajuste']])
    const seq = ultimoSeq(a.db)
    const ok = await publico(a).decidir(token, { demandaId: d0.id, versaoId: pag2.itens[0]!.versao!.id, decisao: 'aprovado', contatoId: pag.contato!.id })
    assert.equal(ok.status, 200, ok.texto)
    assert.match(ok.corpo.mensagem, /Aprovação registrada\. Obrigado, Fulana\./)
    const final = (await a.como(a.pessoas.am).get(`/api/demandas/${d0.numero}`)).corpo.demanda as Demanda
    assert.equal(final.quadroId, a.quadros.social.quadro.id)
    assert.equal(final.colunaId, a.coluna('social', 'Agendar').id)
    assert.deepEqual(final.membroIds, [a.pessoas.social.id])
    // aprovada estando no Atendimento (sem etiquetas): as guardadas na Criação (o quadro do envio) casam por nome com
    // o Social ("Alteração"); "Urgente" não tem par lá e continua guardada na Criação
    assert.deepEqual(nomesEtiquetas(a, final), ['Alteração'])
    const urgenteGuardada = um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM demanda_etiqueta WHERE demanda_id = ? AND etiqueta_id = ?',
      d0.id, urgente.id)!.n
    assert.equal(urgenteGuardada, 1)
    assert.ok(final.aprovadaEm)
    assert.equal(final.aprovadaVersaoId, v2.versao.id)
    assert.ok(notificacoesDe(a.db, a.pessoas.social.id).some((n) => n.tipo === 'membro'))
    assert.ok(!notificacoesDe(a.db, a.pessoas.social.id).some((n) => n.tipo === 'chegou'))
    assert.ok(notificacoesDe(a.db, a.pessoas.design.id).some((n) => n.tipo === 'aprovada'), 'quem fez a peça sabe da aprovação')
    // o evento da demanda vai a todos sem ator (cliente pelo link)
    const evs = eventos(a.db, seq).filter((e) => e.entidade === 'demanda')
    assert.ok(evs.length > 0 && evs.every((e) => e.ator_id === null))

    // e a volta para a Criação traz a "Urgente" guardada
    const volta = await a.como(a.pessoas.am).post(`/api/demandas/${d0.id}/mover`, { colunaId: a.coluna('criacao', 'Fila').id })
    assert.deepEqual(nomesEtiquetas(a, volta.corpo.demanda), ['Alteração', 'Urgente'])
  })
})

describe('bola com o cliente e decisão sem automação', () => {
  test('numa coluna aguardando_cliente sem automação, a decisão grava retornoEm, a bola volta e o prazo da R2 pode atrasar', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ quadroId: a.quadros.atendimento.quadro.id, colunaId: a.coluna('atendimento', 'Com o cliente').id })
    // o Atendimento tem "enviado → Com o cliente" (já está lá) e "ajuste → Fazendo": tira a de ajuste
    assert.equal((await a.como(a.pessoas.admin).del(`/api/quadros/${a.quadros.atendimento.quadro.id}/automacoes/ajuste_pedido`)).status, 204)
    const v1 = await entregar(a, d, { como: a.pessoas.am })
    const env = await enviarAoCliente(a, v1.demanda, { via: 'fora' })
    assert.equal(env.automacao, false, 'a demanda já está na coluna de destino')
    assert.equal(comQuemEsta(env.demanda, { papel: 'aguardando_cliente' }), 'cliente')
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['Trocar a cor'] })
    assert.equal(r.status, 200, r.texto)
    const s = r.corpo as RegistrarRetornoSaida
    assert.equal(s.automacao, false)
    assert.equal(s.demanda.colunaId, a.coluna('atendimento', 'Com o cliente').id)
    assert.ok(s.demanda.retornoEm)
    assert.equal(comQuemEsta(s.demanda, { papel: 'aguardando_cliente' }), 'equipe')
    // o prazo da R2 (qui, 15/10, 18h) atrasa no dia seguinte mesmo com o card em "Com o cliente"
    assert.equal(estadoPrazo(s.demanda, { papel: 'aguardando_cliente' }, new Date('2026-10-16T13:00:00.000Z')), 'atrasada')
    assert.equal(s.sugerirExtra, false)
  })

  test('sem envio pendente → 409; versão antiga → 409 versao_desatualizada; contato de outro cliente → 400; ajuste sem linhas → 400', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue' })
    const am = a.como(a.pessoas.am)
    assert.equal((await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'aprovado' })).corpo.erro.codigo, 'conflito')
    const env = await enviarAoCliente(a, d, { via: 'fora' })
    const contatoIcc = a.clientes.icc.contatos[0]!.id
    const outro = await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'aprovado', contatoId: contatoIcc })
    assert.equal(outro.status, 400)
    const vazio = await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['', '-  '] })
    assert.equal(vazio.status, 400)
    const velha = await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'aprovado', versaoId: 'nao-e-esta' })
    assert.equal(velha.status, 409)
    assert.equal(velha.corpo.erro.codigo, 'versao_desatualizada')
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/retorno`, { decisao: 'aprovado' })).status, 403)
    assert.equal(env.demanda.versaoEnviadaId, d.versaoAtualId)
  })
})

describe('ajuste: rodada nova, prazo em dias úteis e extra', () => {
  test('ajuste numa sexta antes de Finados: prazo pula o feriado; rodada 3 com 2 inclusas sugere extra; marcar extra', async () => {
    const a = await ambiente()
    a.relogio('2026-10-30T13:00:00.000Z') // sexta; segunda, 2/11, é Finados
    const d = await a.criarDemanda({ ate: 'enviada' })
    const am = a.como(a.pessoas.am)
    const r2 = (await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['A', 'B'], motivo: 'erro_execucao' })).corpo as RegistrarRetornoSaida
    assert.equal(r2.rodada!.numero, 2)
    assert.equal(r2.rodada!.prazo, '2026-11-03')
    assert.equal(r2.rodada!.motivo, 'erro_execucao')
    assert.equal(r2.checklist!.titulo, 'Ajustes R2')
    assert.equal(r2.sugerirExtra, false)
    assert.equal(r2.automacao, false, 'ajuste_pedido da Criação → Criação › Fila: a demanda já estava na Fila')

    const v2 = await entregar(a, r2.demanda, { como: a.pessoas.am })
    await enviarAoCliente(a, v2.demanda, { via: 'fora' })
    const r3 = (await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['C'], prazo: '2026-11-05' })).corpo as RegistrarRetornoSaida
    assert.equal(r3.rodada!.numero, 3)
    assert.equal(r3.rodada!.prazo, '2026-11-05')
    assert.equal(r3.rodada!.inclusa, false)
    assert.equal(r3.sugerirExtra, true)

    const extra = await am.post(`/api/rodadas/${r3.rodada!.id}/extra`, { extra: true })
    assert.equal(extra.status, 200)
    assert.equal(extra.corpo.extra, true)
    assert.equal((await am.post(`/api/rodadas/${r3.rodada!.id}/extra`, { extra: false })).corpo.extra, false)
    const r1 = um<{ id: string }>(a.db, 'SELECT id FROM rodada WHERE demanda_id = ? AND numero = 1', d.id)!.id
    assert.equal((await am.post(`/api/rodadas/${r1}/extra`, { extra: true })).status, 422)
    assert.equal((await a.como(a.pessoas.design).post(`/api/rodadas/${r3.rodada!.id}/extra`, { extra: true })).status, 403)
    const tipos = todos<{ tipo: string }>(a.db, `SELECT tipo FROM atividade WHERE demanda_id = ? AND tipo LIKE 'rodada.extra%' ORDER BY id`, d.id).map((l) => l.tipo)
    assert.deepEqual(tipos, ['rodada.extra_marcada', 'rodada.extra_desmarcada'])
  })

  test('ajuste interno: rodada interna sem mover; com envio pendente → 409; sem entrega na rodada → 422; equipe → 403', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const am = a.como(a.pessoas.am)
    assert.equal((await am.post(`/api/demandas/${d.id}/ajuste-interno`, { linhas: ['x'], motivo: 'erro_execucao' })).status, 422)
    const v1 = await entregar(a, d)
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/ajuste-interno`, { linhas: ['x'], motivo: 'erro_execucao' })).status, 403)
    const r = await am.post(`/api/demandas/${d.id}/ajuste-interno`, { linhas: ['Fonte errada', 'Margem'], motivo: 'erro_execucao' })
    assert.equal(r.status, 200, r.texto)
    assert.equal(r.corpo.rodada.origem, 'interna')
    assert.equal(r.corpo.demanda.colunaId, v1.demanda.colunaId)
    assert.equal(r.corpo.checklist.itens.length, 2)
    assert.ok(notificacoesDe(a.db, a.pessoas.design.id).some((n) => n.tipo === 'ajuste_pedido' && n.resumo.includes('R2')))
    const v2 = await entregar(a, r.corpo.demanda)
    await enviarAoCliente(a, v2.demanda, { via: 'fora' })
    assert.equal((await am.post(`/api/demandas/${d.id}/ajuste-interno`, { linhas: ['x'], motivo: 'outro' })).status, 409)
  })
})

describe('Aprovado pelo WhatsApp e anular', () => {
  test('aprovado pelo WhatsApp leva ao Social; anular limpa retornoEm, devolve à coluna de antes com os membros de antes', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id })
    const v1 = await entregar(a, d)
    await enviarAoCliente(a, v1.demanda, { via: 'fora' })
    // de volta à Criação (alguém trouxe da coluna do Atendimento): a decisão sai daqui
    const am = a.como(a.pessoas.am)
    await am.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Pronto').id })
    const ok = await am.post(`/api/demandas/${d.id}/aprovado-whatsapp`, {})
    assert.equal(ok.status, 200, ok.texto)
    assert.equal(ok.corpo.aprovacao.canal, 'whatsapp')
    assert.equal(ok.corpo.aprovacao.contatoId, a.clientes.he.contatos[0]!.id)
    assert.equal(ok.corpo.demanda.colunaId, a.coluna('social', 'Agendar').id)
    assert.deepEqual(ok.corpo.demanda.membroIds, [a.pessoas.social.id])
    assert.ok(ok.corpo.demanda.retornoEm)

    const anular = await am.post(`/api/aprovacoes/${ok.corpo.aprovacao.id}/anular`, {})
    assert.equal(anular.status, 200, anular.texto)
    assert.equal(anular.corpo.voltou, true)
    const dd = anular.corpo.demanda as Demanda
    assert.equal(dd.colunaId, a.coluna('criacao', 'Pronto').id)
    assert.deepEqual(dd.membroIds, [a.pessoas.design.id])
    assert.equal(dd.retornoEm, null)
    assert.equal(dd.aprovadaEm, null)
    assert.ok(dd.envioPendenteEm)
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM rodada WHERE demanda_id = ? AND fechada_em IS NULL', d.id)!.n, 1)
    // anular de novo → 409
    assert.equal((await am.post(`/api/aprovacoes/${ok.corpo.aprovacao.id}/anular`, {})).status, 409)
  })

  test('anular não devolve a demanda se alguém a moveu depois da decisão; o ajuste não se anula', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'enviada' })
    const am = a.como(a.pessoas.am)
    const ok = await am.post(`/api/demandas/${d.id}/aprovado-whatsapp`, {})
    assert.equal(ok.corpo.demanda.colunaId, a.coluna('social', 'Agendar').id)
    await a.como(a.pessoas.social).post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('social', 'Fila').id })
    const anular = await am.post(`/api/aprovacoes/${ok.corpo.aprovacao.id}/anular`, {})
    assert.equal(anular.status, 200)
    assert.equal(anular.corpo.voltou, false)
    assert.equal(anular.corpo.demanda.colunaId, a.coluna('social', 'Fila').id)

    const ajuste = await am.post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['x'] })
    assert.equal((await am.post(`/api/aprovacoes/${ajuste.corpo.aprovacao.id}/anular`, {})).status, 409)
  })

  test('print colado vira anexo de evidência ligado à aprovação; arquivo que não é imagem → 400', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'enviada' })
    const print = enviarPng(a, a.pessoas.am)
    const r = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/retorno`, { decisao: 'aprovado', evidenciaArquivoId: print, canal: 'email' })
    assert.equal(r.status, 200, r.texto)
    const anexo = um<{ finalidade: string; nome: string }>(a.db, 'SELECT finalidade, nome FROM anexo WHERE id = ?', r.corpo.aprovacao.evidenciaAnexoId)!
    assert.equal(anexo.finalidade, 'evidencia')
    assert.equal(anexo.nome, 'Print do retorno da V1')
    assert.equal(r.corpo.aprovacao.canal, 'email')
    assert.equal(r.corpo.demanda.nAnexos, 1)
  })
})

describe('página pública e o retorno manual se enxergam', () => {
  test('aprovação manual deixa o link só leitura com o selo', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue' })
    const env = await enviarAoCliente(a, d)
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/aprovado-whatsapp`, {})
    const pag = (await publico(a).pagina(tokenDe(env.link!.url))).corpo as PaginaAprovacao
    assert.equal(pag.itens[0]!.decisao!.decisao, 'aprovado')
    assert.equal(pag.itens[0]!.decisao!.nome, 'Fulana')
    assert.match(pag.itens[0]!.proximoPasso!, /^Aprovado V1 por Fulana em 14\/10 às 10:00$/)
  })
})

describe('cliente sem AM (criado pela equipe, só com sigla e nome)', () => {
  test('a entrega avisa o atendimento; quem envia vira o AM e recebe a decisão do cliente', async () => {
    const a = await ambiente()
    const cli = await a.como(a.pessoas.design).post('/api/clientes', { sigla: 'PDV', nome: 'Padaria do Vale' })
    assert.equal(cli.status, 201, cli.texto)
    assert.equal(cli.corpo.atendimentoId ?? null, null)
    const d0 = await a.criarDemanda({ como: a.pessoas.design, clienteId: cli.corpo.id, colunaId: a.coluna('criacao', 'Design').id })
    assert.equal(d0.atendimentoId, null)

    // sem AM, a entrega vai ao atendimento inteiro (não ao admin, que só recebe sem atendimento ativo)
    const v1 = await entregar(a, d0)
    for (const p of [a.pessoas.am, a.pessoas.am2]) {
      assert.ok(notificacoesDe(a.db, p.id).some((n) => n.tipo === 'versao_entregue' && n.resumo.endsWith('· sem atendimento')), p.nome)
    }
    assert.ok(!notificacoesDe(a.db, a.pessoas.admin.id).some((n) => n.tipo === 'versao_entregue'))

    // quem envia passa a ser o AM (com a atividade de quem era: ninguém)
    const env = await enviarAoCliente(a, v1.demanda, { contatoId: null })
    assert.equal(env.demanda.atendimentoId, a.pessoas.am.id)
    const editada = um<{ dados: string; antes: string }>(a.db, `SELECT dados, antes FROM atividade WHERE demanda_id = ? AND tipo = 'demanda.editada'`, d0.id)!
    assert.deepEqual(JSON.parse(editada.dados), { campos: ['atendimentoId'] })
    assert.deepEqual(JSON.parse(editada.antes), { atendimentoId: null })

    // a decisão do cliente chega a quem enviou
    const token = tokenDe(env.link!.url)
    const pag = (await publico(a).pagina(token)).corpo as PaginaAprovacao
    const r = await publico(a).decidir(token, { demandaId: d0.id, versaoId: pag.itens[0]!.versao!.id, decisao: 'aprovado', nomeInformado: 'Seu Joaquim' })
    assert.equal(r.status, 200, r.texto)
    assert.ok(notificacoesDe(a.db, a.pessoas.am.id).some((n) => n.tipo === 'aprovada' && n.demanda_id === d0.id))
  })

  test('sem ninguém no atendimento, a entrega sem AM avisa os admins', async () => {
    const a = await ambiente()
    for (const p of [a.pessoas.am, a.pessoas.am2]) {
      assert.equal((await a.como(a.pessoas.admin).patch(`/api/pessoas/${p.id}`, { ativo: false })).status, 200)
    }
    const cli = await a.como(a.pessoas.design).post('/api/clientes', { sigla: 'PDV', nome: 'Padaria do Vale' })
    const d0 = await a.criarDemanda({ como: a.pessoas.design, clienteId: cli.corpo.id, colunaId: a.coluna('criacao', 'Design').id })
    await entregar(a, d0)
    assert.ok(notificacoesDe(a.db, a.pessoas.admin.id).some((n) => n.tipo === 'versao_entregue'))
  })

  test('o retorno avisa quem enviou mesmo quando o AM é outra pessoa', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue' })
    await enviarAoCliente(a, d, { como: a.pessoas.am2, via: 'fora' })
    const r = await a.como(a.pessoas.admin).post(`/api/demandas/${d.id}/retorno`, { decisao: 'ajuste', linhas: ['Trocar a cor'] })
    assert.equal(r.status, 200, r.texto)
    assert.ok(notificacoesDe(a.db, a.pessoas.am.id).some((n) => n.tipo === 'ajuste_pedido'), 'o AM')
    assert.ok(notificacoesDe(a.db, a.pessoas.am2.id).some((n) => n.tipo === 'ajuste_pedido'), 'quem enviou')
  })
})

describe('prazo da peça aprovada que a automação leva a outro quadro', () => {
  test('sem publicação fica sem prazo (a rodada guarda o dela); anular devolve o prazo de antes', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id, prazo: '2026-10-16', prazoHora: '15:00' })
    const v1 = await entregar(a, d)
    await enviarAoCliente(a, v1.demanda, { via: 'fora' })
    const am = a.como(a.pessoas.am)
    const ok = await am.post(`/api/demandas/${d.id}/aprovado-whatsapp`, {})
    assert.equal(ok.status, 200, ok.texto)
    const s = ok.corpo.demanda as Demanda
    assert.equal(s.colunaId, a.coluna('social', 'Agendar').id)
    assert.equal(s.prazo, null)
    assert.equal(s.prazoHora, null)
    // no Social ela não vira atrasada depois do prazo da rodada já cumprida
    assert.equal(estadoPrazo(s, { papel: 'normal' }, new Date('2026-10-19T22:00:00.000Z')), 'sem_prazo')
    assert.equal(um<{ prazo: string }>(a.db, 'SELECT prazo FROM rodada WHERE demanda_id = ? AND numero = 1', d.id)!.prazo, '2026-10-16')

    const anular = await am.post(`/api/aprovacoes/${ok.corpo.aprovacao.id}/anular`, {})
    assert.equal(anular.corpo.voltou, true)
    assert.equal(anular.corpo.demanda.prazo, '2026-10-16')
    assert.equal(anular.corpo.demanda.prazoHora, '15:00')
  })

  test('com publicação o prazo vira a publicação; automação para o próprio quadro do envio não mexe no prazo', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id, prazo: '2026-10-16', publicacaoData: '2026-10-21',
      publicacaoHora: '10:00' })
    const v1 = await entregar(a, d)
    await enviarAoCliente(a, v1.demanda, { via: 'fora' })
    const ok = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/aprovado-whatsapp`, {})
    assert.equal(ok.corpo.demanda.prazo, '2026-10-21')
    assert.equal(ok.corpo.demanda.prazoHora, '10:00')

    const criacao = a.quadros.criacao.quadro.id
    const put = await a.como(a.pessoas.admin).put(`/api/quadros/${criacao}/automacoes/aprovado`, { destinoColunaId: a.coluna('criacao', 'Pronto').id })
    assert.equal(put.status, 200, put.texto)
    const d2 = await a.criarDemanda({ colunaId: a.coluna('criacao', 'Design').id, prazo: '2026-10-16' })
    const v = await entregar(a, d2)
    await enviarAoCliente(a, v.demanda, { via: 'fora' })
    const ok2 = await a.como(a.pessoas.am).post(`/api/demandas/${d2.id}/aprovado-whatsapp`, {})
    assert.equal(ok2.corpo.demanda.colunaId, a.coluna('criacao', 'Pronto').id)
    assert.equal(ok2.corpo.demanda.prazo, '2026-10-16')
  })
})
