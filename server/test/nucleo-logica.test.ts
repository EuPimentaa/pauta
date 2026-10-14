/** shared/logica (puro): datas e dias úteis, prazo e repetição, quadro, permissões, texto, senha e posição. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dataLocalDe, diaUtilAnterior, diasUteisEntre, ehDataLocal, ehDiaUtil, formatarPrazo, hojeSP, horaLocalDe, instanteSP,
  proximoDiaUtil, segundaDaSemana, somarDiasUteis,
} from '../../shared/logica/datas.ts'
import { estadoPrazo, prazoDoModelo, proximoPrazo } from '../../shared/logica/prazo.ts'
import {
  colunaDeEntrada, comQuemEsta, ehCardDaColuna, ehMinha, mapearEtiquetas, membrosAoMover, paradoHa, passouWip, slugDe,
} from '../../shared/logica/quadro.ts'
import { camposProibidos, motivoNegado, pode } from '../../shared/logica/permissoes.ts'
import { extrairMencoes, linhasParaItens, normalizarAlias } from '../../shared/logica/texto.ts'
import { detectarSenha, ehSenhaFraca } from '../../shared/logica/senha.ts'
import { entre, precisaRenormalizar } from '../../shared/logica/posicao.ts'
import type { Coluna, Demanda, Etiqueta } from '../../shared/tipos/index.ts'

const FERIADOS = new Set(['2026-10-12', '2026-11-02', '2026-11-20', '2026-12-25'])

describe('datas', () => {
  test('hoje e data local de São Paulo', () => {
    assert.equal(hojeSP(new Date('2026-10-14T13:00:00.000Z')), '2026-10-14')
    assert.equal(hojeSP(new Date('2026-10-15T02:30:00.000Z')), '2026-10-14')
    assert.equal(dataLocalDe('2026-10-15T03:00:00.000Z'), '2026-10-15')
    assert.equal(horaLocalDe('2026-10-14T21:00:00.000Z'), '18:00')
    assert.equal(instanteSP('2026-10-16', '18:00').toISOString(), '2026-10-16T21:00:00.000Z')
  })

  test('dias úteis pulam fim de semana e feriado', () => {
    assert.equal(ehDiaUtil('2026-10-12', FERIADOS), false)
    assert.equal(ehDiaUtil('2026-10-17', FERIADOS), false)
    assert.equal(somarDiasUteis('2026-10-14', 2, FERIADOS), '2026-10-16')
    assert.equal(somarDiasUteis('2026-10-16', 1, FERIADOS), '2026-10-19')
    assert.equal(somarDiasUteis('2026-10-09', 1, FERIADOS), '2026-10-13')
    assert.equal(somarDiasUteis('2026-10-14', 0, FERIADOS), '2026-10-14')
    assert.equal(proximoDiaUtil('2026-10-30', FERIADOS), '2026-11-03')
    assert.equal(diaUtilAnterior('2026-10-13', FERIADOS), '2026-10-09')
    assert.equal(diasUteisEntre('2026-10-09', '2026-10-13', FERIADOS), 1)
    assert.equal(diasUteisEntre('2026-10-14', '2026-10-14', FERIADOS), 0)
    assert.equal(diasUteisEntre('2026-10-16', '2026-10-14', FERIADOS), 0)
    assert.equal(segundaDaSemana('2026-10-18'), '2026-10-12')
    assert.equal(segundaDaSemana('2026-10-12'), '2026-10-12')
  })

  test('validação e formato do prazo', () => {
    assert.equal(ehDataLocal('2026-02-29'), false)
    assert.equal(ehDataLocal('2028-02-29'), true)
    assert.equal(ehDataLocal('2026-1-01'), false)
    assert.equal(formatarPrazo('2026-10-16', '18:00'), 'sex, 16/10, 18h')
    assert.equal(formatarPrazo('2026-10-15', '09:30'), 'qui, 15/10, 9h30')
    assert.equal(formatarPrazo('2026-10-24', null), 'sáb, 24/10')
  })
})

const base = { concluidaEm: null, envioPendenteEm: null, retornoEm: null, statusDesde: '2026-10-13T12:00:00.000Z' }

describe('prazo e repetição', () => {
  const agora = new Date('2026-10-14T13:00:00.000Z')
  test('estado do prazo', () => {
    const normal = { papel: 'normal' } as const
    assert.equal(estadoPrazo({ ...base, prazo: null, prazoHora: null }, normal, agora), 'sem_prazo')
    assert.equal(estadoPrazo({ ...base, prazo: '2026-10-13', prazoHora: null }, normal, agora), 'atrasada')
    assert.equal(estadoPrazo({ ...base, prazo: '2026-10-14', prazoHora: null }, normal, agora), 'hoje')
    assert.equal(estadoPrazo({ ...base, prazo: '2026-10-14', prazoHora: '09:00' }, normal, agora), 'atrasada')
    assert.equal(estadoPrazo({ ...base, prazo: '2026-10-20', prazoHora: null }, normal, agora), 'em_dia')
    assert.equal(estadoPrazo({ ...base, prazo: '2026-10-01', prazoHora: null, concluidaEm: '2026-10-02T10:00:00.000Z' }, normal, agora), 'concluida')
    assert.equal(estadoPrazo({ ...base, prazo: '2026-10-01', prazoHora: null, envioPendenteEm: '2026-10-02T10:00:00.000Z' }, normal, agora), 'pausado')
    assert.equal(estadoPrazo({ ...base, prazo: '2026-10-01', prazoHora: null }, { papel: 'aguardando_cliente' }, agora), 'pausado')
  })

  test('próximo prazo: diário, semanal e mensal com feriado e dia 31', () => {
    assert.equal(proximoPrazo('2026-10-09', 'diaria', FERIADOS), '2026-10-13')
    assert.equal(proximoPrazo('2026-10-05', 'semanal', FERIADOS), '2026-10-13')
    assert.equal(proximoPrazo('2026-10-15', 'semanal', FERIADOS), '2026-10-22')
    assert.equal(proximoPrazo('2026-03-31', 'mensal', FERIADOS), '2026-04-30')
    // 31/01 → 28/02 (último dia), que é sábado → o próximo dia útil
    assert.equal(proximoPrazo('2026-01-31', 'mensal', FERIADOS), '2026-03-02')
    assert.equal(proximoPrazo('2026-10-02', 'mensal', FERIADOS), '2026-11-03')
    assert.equal(proximoPrazo('2026-12-15', 'mensal', FERIADOS), '2027-01-15')
  })

  test('prazo do modelo', () => {
    assert.equal(prazoDoModelo('2026-10-14', 2, FERIADOS), '2026-10-16')
    assert.equal(prazoDoModelo('2026-10-14', null, FERIADOS), null)
  })
})

describe('quadro', () => {
  const col = (p: Partial<Coluna>): Coluna => ({
    id: 'c', quadroId: 'q', nome: 'x', cor: null, papel: 'normal', responsavelId: null, limiteWip: null, pos: 1, arquivadaEm: null, ...p,
  })
  test('com quem está a bola', () => {
    assert.equal(comQuemEsta(base, { papel: 'normal' }), 'equipe')
    assert.equal(comQuemEsta({ ...base, envioPendenteEm: '2026-10-13T13:00:00.000Z' }, { papel: 'normal' }), 'cliente')
    assert.equal(comQuemEsta(base, { papel: 'aguardando_cliente' }), 'cliente')
    assert.equal(comQuemEsta({ ...base, retornoEm: '2026-10-13T13:00:00.000Z' }, { papel: 'aguardando_cliente' }), 'equipe')
    assert.equal(comQuemEsta({ ...base, retornoEm: '2026-10-13T11:00:00.000Z' }, { papel: 'aguardando_cliente' }), 'cliente')
    assert.equal(comQuemEsta({ ...base, concluidaEm: '2026-10-13T13:00:00.000Z' }, { papel: 'normal' }), 'concluida')
  })

  test('parado há N dias úteis', () => {
    const d = { ...base, statusDesde: '2026-10-08T12:00:00.000Z' } as Demanda
    assert.deepEqual(paradoHa(d, col({}), new Date('2026-10-14T13:00:00.000Z'), FERIADOS), { comQuem: 'equipe', dias: 3 })
  })

  test('coluna de entrada, minhas, WIP e cards da coluna', () => {
    const colunas = [col({ id: 'a', papel: 'concluida', pos: 1 }), col({ id: 'b', pos: 2 }), col({ id: 'c', pos: 3 })]
    assert.equal(colunaDeEntrada(colunas, 'q')?.id, 'b')
    assert.equal(colunaDeEntrada([col({ id: 'a', papel: 'concluida' })], 'q')?.id, 'a')
    assert.equal(colunaDeEntrada([], 'q'), null)
    assert.equal(ehMinha({ membroIds: ['x'], atendimentoId: null }, 'x'), true)
    assert.equal(ehMinha({ membroIds: [], atendimentoId: 'x' }, 'x'), true)
    assert.equal(ehMinha({ membroIds: [], atendimentoId: null }, 'x'), false)
    assert.equal(passouWip({ limiteWip: 5 }, 6), true)
    assert.equal(passouWip({ limiteWip: 5 }, 5), false)
    assert.equal(passouWip({ limiteWip: null }, 99), false)
    const agora = new Date('2026-10-14T13:00:00.000Z')
    assert.equal(ehCardDaColuna({ arquivadoEm: null, concluidaEm: '2026-10-08T13:00:00.000Z' }, agora, 7), true)
    assert.equal(ehCardDaColuna({ arquivadoEm: null, concluidaEm: '2026-10-06T13:00:00.000Z' }, agora, 7), false)
    assert.equal(ehCardDaColuna({ arquivadoEm: '2026-10-13T13:00:00.000Z', concluidaEm: null }, agora, 7), false)
  })

  test('etiquetas entre quadros: casam por nome sem caixa e sem acento; só cor casa por cor', () => {
    const et = (id: string, nome: string, cor: Etiqueta['cor'], pos = 1): Etiqueta => ({ id, quadroId: 'q', nome, cor, pos })
    const r = mapearEtiquetas([et('u', 'Urgente', 'rosa'), et('a', 'Alteração', 'ambar'), et('c', '', 'azul')],
      [et('a2', 'alteracao', 'verde', 2), et('c2', '', 'azul', 3), et('g', 'Guardada', 'roxo', 1)], ['g'])
    assert.deepEqual(r.ids, ['g', 'a2', 'c2'])
    assert.deepEqual(r.semPar.map((e) => e.id), ['u'])
  })

  test('membros ao mover: coluna de pessoa reatribui; responsável do destino troca', () => {
    const ativos = new Set(['r', 's', 't'])
    assert.deepEqual(membrosAoMover(['r', 'x'], { de: { responsavelId: 'r' }, para: { responsavelId: 's' }, mudaDeQuadro: false,
      membros: 'manter', responsavelDestino: null, ativos }), { membroIds: ['x', 's'], entraram: ['s'], sairam: ['r'] })
    assert.deepEqual(membrosAoMover(['x'], { de: { responsavelId: null }, para: { responsavelId: 's' }, mudaDeQuadro: false,
      membros: 'manter', responsavelDestino: null, ativos }), { membroIds: ['x', 's'], entraram: ['s'], sairam: [] })
    assert.deepEqual(membrosAoMover(['r'], { de: { responsavelId: 'r' }, para: { responsavelId: null }, mudaDeQuadro: false,
      membros: 'manter', responsavelDestino: null, ativos }), { membroIds: ['r'], entraram: [], sairam: [] })
    assert.deepEqual(membrosAoMover(['r', 'x'], { de: { responsavelId: null }, para: { responsavelId: null }, mudaDeQuadro: true,
      membros: 'responsavel_destino', responsavelDestino: 't', ativos }), { membroIds: ['t'], entraram: ['t'], sairam: ['r', 'x'] })
    assert.deepEqual(membrosAoMover(['r'], { de: { responsavelId: null }, para: { responsavelId: null }, mudaDeQuadro: true,
      membros: 'responsavel_destino', responsavelDestino: null, ativos }), { membroIds: ['r'], entraram: [], sairam: [] })
  })

  test('slug', () => {
    assert.equal(slugDe('Criação 2'), 'criacao-2')
    assert.equal(slugDe('  Tráfego & Mídia!! '), 'trafego-midia')
    assert.equal(slugDe('***'), 'quadro')
  })
})

describe('permissões', () => {
  const eu = (papel: 'admin' | 'atendimento' | 'equipe') => ({ id: 'eu', papel })
  test('papéis', () => {
    assert.equal(pode('quadro.administrar', eu('admin')), true)
    assert.equal(pode('quadro.administrar', eu('atendimento')), false)
    assert.equal(pode('automacao.editar', eu('atendimento')), true)
    assert.equal(pode('automacao.editar', eu('equipe')), false)
    assert.equal(pode('ciclo.cliente', eu('equipe')), false)
    assert.equal(pode('cliente.criar', eu('equipe')), true)
    assert.equal(pode('cliente.editar', eu('equipe')), false)
    assert.equal(pode('cliente.editar', eu('atendimento'), { cliente: { atendimentoId: 'eu' } }), true)
    assert.equal(pode('cliente.editar', eu('atendimento'), { cliente: { atendimentoId: null } }), true)
    assert.equal(pode('cliente.editar', eu('atendimento'), { cliente: { atendimentoId: 'outro' } }), false)
    assert.equal(pode('versao.entregar', eu('equipe'), { demanda: { membroIds: ['eu'], atendimentoId: null } }), true)
    assert.equal(pode('versao.entregar', eu('equipe'), { demanda: { membroIds: [], atendimentoId: null } }), false)
    assert.equal(pode('versao.editar', eu('equipe'), { versao: { criadaPor: 'eu' } }), true)
    assert.equal(pode('comentario.editar', eu('admin'), { comentario: { autorId: 'outro' } }), false)
    assert.equal(pode('comentario.excluir', eu('admin'), { comentario: { autorId: 'outro' } }), true)
    assert.equal(pode('comentario.excluir', eu('equipe'), { comentario: { autorId: 'eu' } }), true)
    assert.equal(pode('anexo.excluir', eu('equipe'), { anexo: { enviadoPor: 'outro' } }), false)
    assert.equal(pode('anexo.excluir', eu('atendimento'), { anexo: { enviadoPor: 'outro' } }), true)
    assert.equal(pode('checklist_rodada.excluir', eu('equipe'), { checklist: { rodadaId: 'r1' } }), false)
    assert.equal(pode('checklist_rodada.excluir', eu('equipe'), { checklist: { rodadaId: null } }), true)
    assert.equal(pode('apontamento.editar', eu('atendimento'), { apontamento: { usuarioId: 'outro' } }), false)
    assert.equal(pode('apontamento.editar', eu('admin'), { apontamento: { usuarioId: 'outro' } }), true)
    assert.equal(pode('demanda.excluir', eu('atendimento')), false)
    assert.equal(pode('horas.outros', eu('admin')), true)
    assert.match(motivoNegado('ciclo.cliente'), /atendimento/)
  })

  test('campos por papel', () => {
    assert.deepEqual(camposProibidos({ titulo: 'x', atendimentoId: null }, 'equipe'), ['atendimentoId'])
    assert.deepEqual(camposProibidos({ titulo: 'x', atendimentoId: null }, 'atendimento'), [])
    assert.deepEqual(camposProibidos({ sigla: 'X', nome: 'y', atendimentoId: 'a' }, 'equipe', 'cliente'), ['atendimentoId'])
    assert.deepEqual(camposProibidos({ sigla: 'X', nome: 'y' }, 'equipe', 'cliente'), [])
  })
})

describe('texto, senha e posição', () => {
  test('apelidos, menções e linhas', () => {
    assert.equal(normalizarAlias('  Hospital   Evangélico '), 'hospital evangelico')
    assert.deepEqual(extrairMencoes('oi @[Rafa](mencao:u-1) e @[Bia](mencao:u2) e de novo @[Rafa](mencao:u-1) [x](mencao:zz)'), ['u-1', 'u2'])
    assert.deepEqual(linhasParaItens('- trocar a foto\n\n• aumentar o logo\n1. mudar a cor\n2) texto\n[ ] item\n   '),
      ['trocar a foto', 'aumentar o logo', 'mudar a cor', 'texto', 'item'])
  })

  test('detector de senha', () => {
    assert.equal(detectarSenha('Login do Instagram: senha: Melt@2026'), true)
    assert.equal(detectarSenha('password=abc123'), true)
    assert.equal(detectarSenha('a senha é Abc@1234'), true)
    assert.equal(detectarSenha('senha do instagram: x9k2p'), true)
    assert.equal(detectarSenha('a senha está no cofre do cliente'), false)
    assert.equal(detectarSenha('a senha é segura'), false)
    assert.equal(detectarSenha('Passo a passo do post'), false)
  })

  test('senha fraca', () => {
    assert.equal(ehSenhaFraca('curta1'), true)
    assert.equal(ehSenhaFraca('1234567890'), true)
    assert.equal(ehSenhaFraca('aaaaaaaaaaaa'), true)
    assert.equal(ehSenhaFraca('fulano@melt.com.br', { email: 'fulano@melt.com.br' }), true)
    assert.equal(ehSenhaFraca('cavalo-bateria-grampo'), false)
  })

  test('posição entre vizinhos', () => {
    assert.equal(entre(null, null), 1024)
    assert.equal(entre(null, 1024), 0)
    assert.equal(entre(1024, null), 2048)
    assert.equal(entre(1024, 2048), 1536)
    assert.equal(precisaRenormalizar(1, 1 + 1e-7), true)
    assert.equal(precisaRenormalizar(1, 2), false)
  })
})
