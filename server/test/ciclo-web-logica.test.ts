/**
 * Regras de tela do ciclo (F2, web/src/funcionalidades/ciclo/logica.ts): o passo da peça, o primário do modal, quem
 * vê cada ação, o selo do card, a linha do tempo por rodada e o que pode ser embutido.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Aprovacao, Envio, Rodada, VersaoComItens } from '../../shared/tipos/index.ts'
import {
  acoesDoCiclo, enderecoEmbutido, entregueNaRodada, lerEndereco, linhaDoTempo, passoCiclo, rodadaExtra, seloDoCard, ultimaDecisao,
  type DemandaCiclo,
} from '../../web/src/funcionalidades/ciclo/logica.ts'

const base: DemandaCiclo = {
  nVersoes: 0, versaoAtualId: null, versaoEnviadaId: null, envioPendenteEm: null, aprovadaEm: null, aprovadaVersaoId: null,
  rodadaAtual: 1, rodadasInclusas: 2, concluidaEm: null, arquivadoEm: null, clienteId: 'c', membroIds: ['rafa'], atendimentoId: 'pri',
}
const am = { id: 'pri', papel: 'atendimento' as const }
const rafa = { id: 'rafa', papel: 'equipe' as const }
const outro = { id: 'leo', papel: 'equipe' as const }

describe('passo e ações do modal', () => {
  test('sem versão → Entregar é o primário (para quem pode entregar)', () => {
    assert.equal(passoCiclo(base), 'sem_versao')
    assert.deepEqual(acoesDoCiclo(base, rafa), { visiveis: ['entregar'], primaria: 'entregar' })
    assert.deepEqual(acoesDoCiclo(base, outro), { visiveis: [], primaria: null })
    assert.equal(acoesDoCiclo(base, am).primaria, 'entregar')
  })

  test('versão não enviada → Enviar (atendimento), com ajuste interno e entregar de novo; a equipe só entrega', () => {
    const d = { ...base, nVersoes: 1, versaoAtualId: 'v1' }
    assert.equal(passoCiclo(d), 'nao_enviada')
    const r = acoesDoCiclo(d, am)
    assert.equal(r.primaria, 'enviar')
    assert.deepEqual(r.visiveis, ['enviar', 'ajuste_interno', 'entregar'])
    assert.deepEqual(acoesDoCiclo(d, rafa), { visiveis: ['entregar'], primaria: null })
  })

  test('com o cliente → Registrar retorno, Aprovado pelo WhatsApp e Copiar; ninguém entrega no topo', () => {
    const d = { ...base, nVersoes: 1, versaoAtualId: 'v1', versaoEnviadaId: 'v1', envioPendenteEm: '2026-10-14T13:00:00.000Z' }
    assert.equal(passoCiclo(d), 'com_cliente')
    assert.deepEqual(acoesDoCiclo(d, am), { visiveis: ['retorno', 'aprovado_whatsapp', 'copiar_whatsapp'], primaria: 'retorno' })
    assert.deepEqual(acoesDoCiclo(d, rafa).visiveis, [])
  })

  test('depois do ajuste → Entregar de novo; aprovada → Anular e Copiar, sem entregar', () => {
    const ajuste = { ...base, nVersoes: 1, versaoAtualId: 'v1', versaoEnviadaId: 'v1', rodadaAtual: 2 }
    assert.equal(passoCiclo(ajuste), 'ajuste')
    assert.equal(acoesDoCiclo(ajuste, rafa).primaria, 'entregar')
    assert.deepEqual(acoesDoCiclo(ajuste, am, { rodadaAberta: true, entregueNaRodada: false }).visiveis, ['entregar', 'copiar_whatsapp'])
    const aprovada = { ...ajuste, aprovadaEm: '2026-10-14T13:00:00.000Z', aprovadaVersaoId: 'v1' }
    assert.equal(passoCiclo(aprovada), 'aprovada')
    assert.deepEqual(acoesDoCiclo(aprovada, am, { rodadaAberta: false }), { visiveis: ['copiar_whatsapp', 'anular'], primaria: null })
    assert.deepEqual(acoesDoCiclo({ ...aprovada, arquivadoEm: 'x' }, am).visiveis, [])
  })
})

describe('selo do card', () => {
  test('V2 com o estado e a rodada extra', () => {
    assert.equal(seloDoCard(base), null)
    assert.deepEqual(seloDoCard({ ...base, nVersoes: 2, versaoAtualId: 'v2', versaoEnviadaId: 'v2', envioPendenteEm: 'x' }),
      { versao: 2, estado: 'com_cliente', dica: 'V2 com o cliente' })
    assert.equal(seloDoCard({ ...base, nVersoes: 1, versaoAtualId: 'v1' })!.estado, 'entregue')
    assert.equal(seloDoCard({ ...base, nVersoes: 1, versaoAtualId: 'v1', versaoEnviadaId: 'v1', aprovadaEm: 'x', aprovadaVersaoId: 'v1' })!.estado, 'aprovada')
    assert.equal(rodadaExtra({ rodadaAtual: 3, rodadasInclusas: 2 }), 'R3/2')
    assert.equal(rodadaExtra({ rodadaAtual: 2, rodadasInclusas: 2 }), null)
  })
})

describe('linha do tempo', () => {
  const r = (n: number, fechada: boolean): Rodada => ({
    id: `r${n}`, demandaId: 'd', numero: n, origem: n === 1 ? 'inicial' : 'cliente', motivo: null, motivoTexto: null, extra: false, prazo: null,
    prazoHora: null, prazoOriginal: null, abertaEm: `2026-10-1${n}T10:00:00.000Z`, abertaPor: null, fechadaEm: fechada ? 'x' : null, inclusa: true,
  })
  const v = (n: number, rodadaId: string): VersaoComItens => ({
    id: `v${n}`, demandaId: 'd', numero: n, rodadaId, nota: null, criadaPor: 'rafa', criadaEm: `2026-10-1${n}T11:00:00.000Z`,
    enviadaClienteEm: null, enviadaVia: null, itens: [],
  })
  const ap = (id: string, versaoId: string, criadoEm: string, anulada = false): Aprovacao => ({
    id, demandaId: 'd', versaoId, decisao: 'aprovado', via: 'manual', canal: 'whatsapp', linkId: null, contatoId: null, nomeInformado: null,
    registradoPor: 'pri', comentario: null, motivo: null, rodadaAbertaId: null, evidenciaAnexoId: null, quadroAntesId: 'q', colunaAntesId: 'c',
    criadoEm, anuladaEm: anulada ? 'x' : null, anuladaPor: anulada ? 'pri' : null,
  })
  test('rodadas e versões mais novas primeiro, com envios e decisões; a última decisão válida; entregue na rodada aberta', () => {
    const envio = { id: 'e1', versaoId: 'v1', enviadoEm: '2026-10-11T12:00:00.000Z' } as Envio
    const det = {
      rodadas: [r(1, true), r(2, false)], versoes: [v(1, 'r1'), v(2, 'r1')], envios: [envio],
      aprovacoes: [ap('a1', 'v2', '2026-10-12T10:00:00.000Z', true), ap('a2', 'v2', '2026-10-12T11:00:00.000Z')],
    }
    const linha = linhaDoTempo(det)
    assert.deepEqual(linha.map((x) => [x.rodada.numero, x.versoes.map((y) => y.versao.numero)]), [[2, []], [1, [2, 1]]])
    assert.deepEqual(linha[1]!.versoes[1]!.envios.map((e) => e.id), ['e1'])
    assert.deepEqual(linha[1]!.versoes[0]!.decisoes.map((a) => a.id), ['a1', 'a2'])
    assert.equal(ultimaDecisao(det.aprovacoes)!.id, 'a2')
    assert.equal(entregueNaRodada(det), false)
    assert.equal(entregueNaRodada({ rodadas: det.rodadas, versoes: [...det.versoes, v(3, 'r2')] }), true)
  })
})

describe('endereços', () => {
  test('link ou caminho; embutir só Drive, YouTube e Figma', () => {
    assert.deepEqual(lerEndereco(' https://drive.google.com/file/d/abc/view '), { tipo: 'link', url: 'https://drive.google.com/file/d/abc/view' })
    assert.deepEqual(lerEndereco('M:\\Clientes\\HE'), { tipo: 'caminho', caminho: 'M:\\Clientes\\HE' })
    assert.equal(lerEndereco('http://x.com'), null)
    assert.equal(enderecoEmbutido('https://drive.google.com/file/d/1AbC_d-9/view?usp=sharing'), 'https://drive.google.com/file/d/1AbC_d-9/preview')
    assert.equal(enderecoEmbutido('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    assert.equal(enderecoEmbutido('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    assert.match(enderecoEmbutido('https://www.figma.com/design/abc/Peca')!, /^https:\/\/www\.figma\.com\/embed\?embed_host=pauta&url=/)
    assert.equal(enderecoEmbutido('https://drive.google.com/drive/folders/abc'), null)
    assert.equal(enderecoEmbutido('https://evil.com/file/d/abc'), null)
    assert.equal(enderecoEmbutido('javascript:alert(1)'), null)
  })
})
