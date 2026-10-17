/**
 * Paridade da fixture (PLANO §1.1.1): os serviços reais do ciclo (entregar, enviar por fora sem automação, retorno
 * aprovado e anular) gravam as mesmas linhas que `criarDemanda({ ate })` (scripts/ciclo-sql.ts, do núcleo), fora ids
 * e instantes. Diferenças que são do serviço, não da trilha (e por isso ficam fora da comparação):
 * - `versao_item.previa_url`: o teste do Drive do serviço guarda a miniatura pública (o SQL não testa nada);
 * - `demanda.atualizado_por` na entrega: o serviço grava quem entregou (toda UPDATE grava o autor); o SQL só deixa os
 *   gatilhos mexerem na demanda;
 * - o envio pelo serviço leva `prazoRetorno: null` (o padrão seria hoje + 2 dias úteis; o SQL não grava prazo).
 * Tudo no quadro Social, que não tem automação (nada se move).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Demanda } from '../../shared/tipos/index.ts'
import { todos, um, type Db } from '../src/db.ts'
import { aguardarTestesDrive } from '../src/servicos/ciclo.ts'
import { ambiente } from './ciclo-ajuda.ts'

type Linha = Record<string, unknown>
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** As linhas do ciclo da demanda, com ids da própria demanda trocados por rótulos e instantes por "<instante>". */
function retrato(db: Db, demandaId: string, opcoes: { semAutorDaDemanda?: boolean } = {}): Record<string, Linha[]> {
  const rotulos = new Map<string, string>([[demandaId, '<demanda>']])
  const rotular = (tabela: string, linhas: Linha[]) => linhas.forEach((l, i) => rotulos.set(String(l.id), `<${tabela}${i + 1}>`))
  const versoes = todos<Linha>(db, 'SELECT * FROM versao WHERE demanda_id = ? ORDER BY numero', demandaId)
  const itens = todos<Linha>(db, 'SELECT * FROM versao_item WHERE demanda_id = ? ORDER BY pos', demandaId)
  const rodadas = todos<Linha>(db, 'SELECT * FROM rodada WHERE demanda_id = ? ORDER BY numero', demandaId)
  const envios = todos<Linha>(db, 'SELECT * FROM envio WHERE demanda_id = ? ORDER BY enviado_em, rowid', demandaId)
  const aprovacoes = todos<Linha>(db, 'SELECT * FROM aprovacao WHERE demanda_id = ? ORDER BY criado_em, rowid', demandaId)
  rotular('versao', versoes); rotular('item', itens); rotular('rodada', rodadas); rotular('envio', envios); rotular('aprovacao', aprovacoes)
  const demanda = todos<Linha>(db, `SELECT id, quadro_id, coluna_id, envio_pendente_em, retorno_em, aprovada_em, aprovada_versao_id,
    versao_atual_id, versao_enviada_id, n_versoes, rodada_atual, atualizado_por FROM demanda WHERE id = ?`, demandaId)
  if (opcoes.semAutorDaDemanda) delete demanda[0]!.atualizado_por
  for (const i of itens) delete i.previa_url
  const normal = (linhas: Linha[]) => linhas.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k,
    typeof v === 'string' && INSTANTE.test(v) ? '<instante>' : typeof v === 'string' && rotulos.has(v) ? rotulos.get(v)! : v])))
  return { demanda: normal(demanda), versao: normal(versoes), versao_item: normal(itens), rodada: normal(rodadas), envio: normal(envios),
    aprovacao: normal(aprovacoes) }
}

describe('paridade com criarDemanda({ ate })', () => {
  test('entregue, enviada, aprovada e anulada', async () => {
    const a = await ambiente()
    const base = { quadroId: a.quadros.social.quadro.id, membroIds: [a.pessoas.design.id] }
    const fixture = {} as Record<'entregue' | 'enviada' | 'aprovada' | 'anulada', Demanda>
    for (const ate of ['entregue', 'enviada', 'aprovada', 'anulada'] as const) fixture[ate] = await a.criarDemanda({ ...base, ate })

    const d = await a.criarDemanda(base)
    const entrega = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/versoes`, {
      itens: [{ tipo: 'link', url: 'https://drive.google.com/file/d/arte-v1/view', nome: 'Arte final' }],
    })
    assert.equal(entrega.status, 201, entrega.texto)
    await aguardarTestesDrive()
    assert.deepEqual(retrato(a.db, d.id, { semAutorDaDemanda: true }), retrato(a.db, fixture.entregue.id, { semAutorDaDemanda: true }))

    const envio = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/enviar`, { via: 'fora', canal: 'whatsapp', prazoRetorno: null })
    assert.equal(envio.status, 200, envio.texto)
    assert.equal(envio.corpo.automacao, false)
    assert.deepEqual(retrato(a.db, d.id), retrato(a.db, fixture.enviada.id))

    const aprovado = await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/aprovado-whatsapp`, {})
    assert.equal(aprovado.status, 200, aprovado.texto)
    assert.equal(aprovado.corpo.automacao, false)
    assert.deepEqual(retrato(a.db, d.id), retrato(a.db, fixture.aprovada.id))

    const anulada = await a.como(a.pessoas.am).post(`/api/aprovacoes/${aprovado.corpo.aprovacao.id}/anular`, {})
    assert.equal(anulada.status, 200, anulada.texto)
    assert.deepEqual(retrato(a.db, d.id), retrato(a.db, fixture.anulada.id))
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM aprovacao WHERE demanda_id = ? AND anulada_em IS NOT NULL', d.id)!.n, 1)
  })
})
