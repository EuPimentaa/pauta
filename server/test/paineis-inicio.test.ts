/** GET /api/inicio (F3, API.md §4.18): minhas por prazo, com o cliente parado, menções e primeiros passos. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSOS_INICIAIS } from '../../shared/tipos/index.ts'
import { completarAte, pedirAjustePorSql } from '../scripts/ciclo-sql.ts'
import { rodar, tx } from '../src/db.ts'
import { criarQuadro } from '../src/servicos/quadros.ts'
import { ambiente } from './ajuda.ts'
import { arquivar, arquivarQuadro, inicioDe } from './paineis-ajuda.ts'

describe('GET /api/inicio · minhas', () => {
  test('"Minhas" inclui membro e AM; não inclui de quadro arquivado, arquivada nem concluída', async () => {
    const a = await ambiente()
    const { design, design2, am, am2, admin } = a.pessoas
    const comoMembro = await a.criarDemanda({ titulo: 'Membro', clienteId: a.clientes.icc.id, membroIds: [design.id], como: admin })
    const comoAm = await a.criarDemanda({ titulo: 'Só AM' })                         // HE: AM = am, sem membros
    const deOutro = await a.criarDemanda({ titulo: 'Do Design2', clienteId: a.clientes.icc.id, membroIds: [design2.id], como: admin })
    const arquivada = await a.criarDemanda({ titulo: 'Arquivada', membroIds: [design.id] })
    arquivar(a, arquivada)
    const concluida = await a.criarDemanda({ titulo: 'Concluída', membroIds: [design.id] })
    rodar(a.db, 'UPDATE demanda SET concluida_em = ?, concluida_por = ? WHERE id = ?', '2026-10-14T12:00:00.000Z', am.id, concluida.id)
    const extra = tx(a.db, () => criarQuadro(a.db, { nome: 'Extra', cor: 'azul', colunas: [{ nome: 'A fazer' }] }, a.ator(admin)))
    const noQuadroArquivado = await a.criarDemanda({ titulo: 'Quadro arquivado', quadroId: extra.quadro.id, membroIds: [design.id], como: admin })
    arquivarQuadro(a.db, extra.quadro.id)

    const doDesign = await inicioDe(a, design)
    assert.deepEqual(doDesign.minhas.semPrazo, [comoMembro.id])
    const todasDoDesign = Object.values(doDesign.minhas).flat()
    for (const fora of [deOutro, arquivada, concluida, noQuadroArquivado, comoAm]) assert.ok(!todasDoDesign.includes(fora.id), fora.titulo)

    const doAm = await inicioDe(a, am)
    assert.deepEqual(doAm.minhas.semPrazo, [comoAm.id])                              // a arquivada e a concluída do HE não
    const doAm2 = await inicioDe(a, am2)                                              // AM do ICC
    assert.deepEqual(doAm2.minhas.semPrazo.sort(), [comoMembro.id, deOutro.id].sort())
    assert.deepEqual(doDesign.extras, [])
  })

  test('agrupa por estadoPrazo: atrasadas, hoje, esta semana até domingo, depois e sem prazo, na ordem do prazo', async () => {
    const a = await ambiente()                                                        // quarta, 14/10, 10h
    const { design } = a.pessoas
    const nova = (titulo: string, extra: Record<string, unknown> = {}) => a.criarDemanda({ titulo, membroIds: [design.id], ...extra })
    const ontem = await nova('Ontem', { prazo: '2026-10-13' })
    const hojeCedo = await nova('Hoje 9h', { prazo: '2026-10-14', prazoHora: '09:00' })   // já passou: atrasada
    const hojeTarde = await nova('Hoje 18h', { prazo: '2026-10-14' })
    const hojeUrgente = await nova('Hoje 18h urgente', { prazo: '2026-10-14', prioridade: 'urgente' })
    const hoje15 = await nova('Hoje 15h', { prazo: '2026-10-14', prazoHora: '15:00' })
    const sexta = await nova('Sexta', { prazo: '2026-10-16' })
    const domingo = await nova('Domingo', { prazo: '2026-10-18' })
    const segunda = await nova('Segunda', { prazo: '2026-10-19' })
    const semPrazo = await nova('Sem prazo')

    const { minhas, resumo } = await inicioDe(a, design)
    assert.deepEqual(minhas.atrasadas, [ontem.id, hojeCedo.id])
    assert.deepEqual(minhas.hoje, [hoje15.id, hojeUrgente.id, hojeTarde.id])           // hora, depois prioridade
    assert.deepEqual(minhas.semana, [sexta.id, domingo.id])                           // "esta semana" vai até domingo
    assert.deepEqual(minhas.depois, [segunda.id])
    assert.deepEqual(minhas.semPrazo, [semPrazo.id])
    assert.deepEqual(resumo, { atrasadas: 2, hoje: 3, comCliente: 0 })

    // no domingo, "esta semana" acabou: segunda é "depois"
    a.relogio('2026-10-18T13:00:00.000Z')
    const noDomingo = await inicioDe(a, design)
    assert.deepEqual(noDomingo.minhas.hoje, [domingo.id])
    assert.deepEqual(noDomingo.minhas.semana, [])
    assert.deepEqual(noDomingo.minhas.depois, [segunda.id])
  })

  test('com o cliente nunca entra em Atrasadas: tem o grupo dele (as enviadas há mais tempo primeiro) e conta em comCliente', async () => {
    const a = await ambiente()
    const { am } = a.pessoas
    const enviadaVencida = await a.criarDemanda({ titulo: 'Enviada vencida', prazo: '2026-10-09', ate: 'enviada' })
    const enviadaSemPrazo = await a.criarDemanda({ titulo: 'Enviada sem prazo', ate: 'enviada' })
    const naColuna = await a.criarDemanda({ titulo: 'Na coluna do cliente', prazo: '2026-10-13', quadroId: a.quadros.atendimento.quadro.id,
      colunaId: a.coluna('atendimento', 'Com o cliente').id })
    const atrasadaDeVerdade = await a.criarDemanda({ titulo: 'Atrasada', prazo: '2026-10-13' })

    const { minhas, resumo } = await inicioDe(a, am)
    assert.deepEqual(minhas.atrasadas, [atrasadaDeVerdade.id])
    assert.deepEqual(minhas.comCliente, [enviadaVencida.id, enviadaSemPrazo.id, naColuna.id])
    assert.deepEqual(minhas.depois, [])
    assert.deepEqual(minhas.semPrazo, [])
    assert.deepEqual(resumo, { atrasadas: 1, hoje: 0, comCliente: 3 })
  })
})

describe('GET /api/inicio · com o cliente há mais de 2 dias úteis', () => {
  test('conta só dias úteis (o feriado de 12/10 não conta) e conta desde o envio', async () => {
    const a = await ambiente()
    const { am, design } = a.pessoas
    a.relogio('2026-10-09T13:00:00.000Z')                                             // sexta, 9/10
    const desdeSexta = await a.criarDemanda({ titulo: 'Enviada na sexta', ate: 'enviada' })
    a.relogio('2026-10-01T13:00:00.000Z')                                             // parada na coluna desde 1/10…
    const antiga = await a.criarDemanda({ titulo: 'Enviada ontem' })
    a.relogio('2026-10-13T13:00:00.000Z')                                             // …mas enviada só na terça
    tx(a.db, () => completarAte(a.db, antiga.id, 'enviada', { autorId: design.id, atendimentoId: am.id }))

    // quarta, 14/10: depois de sexta só terça e quarta são úteis (sábado, domingo e o feriado de segunda não contam)
    a.relogio('2026-10-14T13:00:00.000Z')
    assert.deepEqual((await inicioDe(a, am)).comClienteParado, [])
    // quinta, 15/10: 3 dias úteis desde o envio de sexta; a de terça tem 2 (desde o envio, não desde 1/10)
    a.relogio('2026-10-15T13:00:00.000Z')
    assert.deepEqual((await inicioDe(a, am)).comClienteParado, [desdeSexta.id])
    a.relogio('2026-10-16T13:00:00.000Z')
    assert.deepEqual((await inicioDe(a, am)).comClienteParado, [desdeSexta.id, antiga.id])   // mais antiga primeiro
  })

  test('só do meu atendimento; a equipe não recebe o bloco; o admin vê as que são dele como AM', async () => {
    const a = await ambiente()
    const { am, am2, design, admin } = a.pessoas
    a.relogio('2026-10-05T13:00:00.000Z')
    const doAm = await a.criarDemanda({ titulo: 'Do AM', membroIds: [design.id], ate: 'enviada' })
    const doAdmin = await a.criarDemanda({ titulo: 'Do admin', atendimentoId: admin.id, como: admin, ate: 'enviada' })
    a.relogio('2026-10-14T13:00:00.000Z')
    assert.deepEqual((await inicioDe(a, am)).comClienteParado, [doAm.id])
    assert.deepEqual((await inicioDe(a, am2)).comClienteParado, [])
    assert.deepEqual((await inicioDe(a, design)).comClienteParado, [])                 // membro, mas é da equipe
    assert.deepEqual((await inicioDe(a, admin)).comClienteParado, [doAdmin.id])
  })

  test('decisão registrada sem automação numa coluna aguardando_cliente sai do bloco e o prazo da R2 entra em Atrasadas quando vence', async () => {
    const a = await ambiente()
    const { am, design } = a.pessoas
    a.relogio('2026-10-06T13:00:00.000Z')
    const d = await a.criarDemanda({ titulo: 'Esperando o cliente', membroIds: [design.id], prazo: '2026-10-07',
      quadroId: a.quadros.atendimento.quadro.id, colunaId: a.coluna('atendimento', 'Com o cliente').id, ate: 'enviada' })
    a.relogio('2026-10-14T13:00:00.000Z')
    let doAm = await inicioDe(a, am)
    assert.deepEqual(doAm.comClienteParado, [d.id])
    assert.deepEqual(doAm.minhas.atrasadas, [])                                       // com o cliente: pausado

    // o cliente pede ajuste (registrado pelo AM, sem automação): a demanda continua em "Com o cliente"
    tx(a.db, () => pedirAjustePorSql(a.db, d.id, { ator: a.ator(am), linhas: ['Trocar a foto'], prazo: '2026-10-15' }))
    doAm = await inicioDe(a, am)
    assert.deepEqual(doAm.comClienteParado, [])
    assert.deepEqual(doAm.minhas.semana, [d.id])                                      // R2 para quinta
    a.relogio('2026-10-16T13:00:00.000Z')
    assert.deepEqual((await inicioDe(a, design)).minhas.atrasadas, [d.id])
    assert.deepEqual((await inicioDe(a, am)).minhas.atrasadas, [d.id])
  })
})

describe('GET /api/inicio · menções e primeiros passos', () => {
  test('menções: as 10 últimas `mencao`, lidas ou não, mais novas primeiro, com o número da demanda', async () => {
    const a = await ambiente()
    const { am, design } = a.pessoas
    const d = await a.criarDemanda({ titulo: 'Com menções' })
    for (let i = 1; i <= 12; i++) {
      const r = await a.como(am).post(`/api/demandas/${d.id}/comentarios`, { corpoMd: `Recado ${i} @[Design](mencao:${design.id})` })
      assert.equal(r.status, 201, r.texto)
    }
    await a.como(design).post('/api/notificacoes/lidas', {})
    const { mencoes } = await inicioDe(a, design)
    assert.equal(mencoes.length, 10)
    assert.ok(mencoes.every((m) => m.tipo === 'mencao' && m.demandaNumero === d.numero && m.lidaEm !== null))
    assert.match(mencoes[0]!.resumo, /Recado 12/)
    assert.ok(mencoes[0]!.id > mencoes[9]!.id)
    assert.deepEqual((await inicioDe(a, am)).mencoes, [])
  })

  test('primeiros passos: só o admin; cada passo vira feito pelo critério, na ordem de PASSOS_INICIAIS, e o bloco some no fim', async () => {
    const a = await ambiente()
    const { admin, am } = a.pessoas
    // como num banco novo: só o admin ativo, nenhum quadro ativo, nenhum cliente, modelos não revisados
    rodar(a.db, 'UPDATE usuario SET ativo = 0 WHERE id <> ?', admin.id)
    rodar(a.db, "UPDATE quadro SET arquivado_em = '2026-10-14T12:00:00.000Z'")
    rodar(a.db, "UPDATE cliente SET status = 'ex'")
    const passos = async () => (await inicioDe(a, admin)).primeirosPassos
    const feitos = async () => (await passos())!.itens.map((i) => i.feito)

    const p = await passos()
    assert.deepEqual(p!.itens.map((i) => i.id), [...PASSOS_INICIAIS])
    assert.deepEqual(p!.itens.map((i) => i.caminho), ['/config/pessoas', '/quadros/novo?equipes=1', '/clientes', '/config/modelos'])
    assert.equal(p!.concluido, false)
    assert.deepEqual(await feitos(), [false, false, false, false])

    rodar(a.db, 'UPDATE usuario SET ativo = 1 WHERE id = ?', am.id)                   // 2 pessoas ativas
    assert.deepEqual(await feitos(), [true, false, false, false])
    rodar(a.db, 'UPDATE quadro SET arquivado_em = NULL WHERE id = ?', a.quadros.social.quadro.id)
    assert.deepEqual(await feitos(), [true, true, false, false])
    // cliente ativo sem AM ainda não conta
    rodar(a.db, "UPDATE cliente SET status = 'recorrente', atendimento_id = NULL WHERE id = ?", a.clientes.icc.id)
    assert.deepEqual(await feitos(), [true, true, false, false])
    rodar(a.db, 'UPDATE cliente SET atendimento_id = ? WHERE id = ?', am.id, a.clientes.icc.id)
    assert.deepEqual(await feitos(), [true, true, true, false])
    rodar(a.db, `INSERT INTO configuracao (chave, valor, atualizado_em) VALUES ('passos.modelos_revisados_em', '"2026-10-14T13:00:00.000Z"', ?)
      ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`, '2026-10-14T13:00:00.000Z')
    assert.equal(await passos(), null)
    assert.equal((await inicioDe(a, am)).primeirosPassos, null)                       // nunca para quem não é admin
  })
})

describe('GET /api/inicio · acesso', () => {
  test('sem sessão → 401', async () => {
    const a = await ambiente()
    const r = await a.app.request('/api/inicio')
    assert.equal(r.status, 401)
  })
})
