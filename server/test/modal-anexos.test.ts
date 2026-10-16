/** Anexos do modal (F1, API.md §4.15): link https, caminho de rede, arquivo, capa, evidência e quem exclui. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Anexo } from '../../shared/tipos/index.ts'
import { um } from '../src/db.ts'
import { ambiente, eventos, ultimoSeq } from './ajuda.ts'
import { anular, aprovarComPrint, enviar, PDF_MINIMO } from './modal-ajuda.ts'

describe('POST /api/demandas/:id/anexos', () => {
  test('link http:// → 400; https detecta o provedor; caminho de rede; arquivo; nAnexos no evento', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const http = await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/anexos`, { tipo: 'link', url: 'http://drive.google.com/file/d/x' })
    assert.equal(http.status, 400)
    assert.equal(http.corpo.erro.codigo, 'validacao')
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/anexos`, { tipo: 'link', url: 'javascript:alert(1)' })).status, 400)

    const seq = ultimoSeq(a.db)
    const drive: Anexo = (await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/anexos`,
      { tipo: 'link', url: 'https://drive.google.com/drive/folders/abc', nome: 'Pasta da campanha' })).corpo
    assert.equal(drive.provedor, 'drive')
    assert.equal(drive.nome, 'Pasta da campanha')
    assert.equal(drive.enviadoPor, a.pessoas.design.id)
    const caminho: Anexo = (await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/anexos`,
      { tipo: 'caminho', caminho: 'M:\\Clientes\\HE\\2026\\Outubro' })).corpo
    assert.equal(caminho.provedor, 'rede')
    assert.equal(caminho.nome, 'Outubro')
    assert.equal(caminho.url, null)
    const arquivo: Anexo = (await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/anexos`,
      { tipo: 'arquivo', arquivoId: enviar(a, a.ator(a.pessoas.design)) })).corpo
    assert.equal(arquivo.provedor, 'arquivo')
    assert.equal(arquivo.arquivo?.imagem, true)
    assert.equal(arquivo.nome, 'print.png')
    assert.equal((await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/anexos`, { tipo: 'arquivo', arquivoId: 'nao-existe' })).status, 400)

    const evs = eventos(a.db, seq)
    assert.equal(evs.filter((e) => e.entidade === 'anexo').length, 3)
    assert.equal(evs.filter((e) => e.entidade === 'demanda' && e.campos?.includes('nAnexos')).at(-1)?.patch?.nAnexos, 3)
    assert.equal(um<{ n: number }>(a.db, `SELECT count(*) AS n FROM atividade WHERE tipo = 'anexo.adicionado' AND demanda_id = ?`, d.id)!.n, 3)
  })

  test('renomear e reordenar', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const x: Anexo = (await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/anexos`, { tipo: 'link', url: 'https://figma.com/a' })).corpo
    const y: Anexo = (await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/anexos`, { tipo: 'link', url: 'https://figma.com/b' })).corpo
    const r = await a.como(a.pessoas.design).patch(`/api/anexos/${y.id}`, { nome: 'Layout final', posicao: { depoisDeId: null } })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.nome, 'Layout final')
    const det = (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo
    assert.deepEqual(det.anexos.map((z: Anexo) => z.id), [y.id, x.id])
  })

  test('finalidade "evidencia" pelo HTTP é ignorada: o anexo do modal é sempre de referência e sai normalmente', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const equipe = a.como(a.pessoas.design)
    const r = await equipe.post(`/api/demandas/${d.id}/anexos`, {
      tipo: 'link', url: 'https://drive.google.com/file/d/print-aprovacao', nome: 'Print: cliente aprovou', finalidade: 'evidencia',
    })
    assert.equal(r.status, 201)
    assert.equal(r.corpo.finalidade, 'referencia')
    assert.equal(um<{ f: string }>(a.db, 'SELECT finalidade AS f FROM anexo WHERE id = ?', r.corpo.id)!.f, 'referencia')
    assert.equal((await equipe.del(`/api/anexos/${r.corpo.id}`)).status, 204, 'quem enviou remove')
  })
})

describe('DELETE /api/anexos/:id', () => {
  test('excluir o anexo da capa limpa a capa', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const img: Anexo = (await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/anexos`,
      { tipo: 'arquivo', arquivoId: enviar(a, a.ator(a.pessoas.am)) })).corpo
    const capa = await a.como(a.pessoas.am).patch(`/api/demandas/${d.id}`, { capaAnexoId: img.id }, { ifMatch: d.rev })
    assert.equal(capa.status, 200)
    assert.ok(capa.corpo.demanda.capaUrl)
    const seq = ultimoSeq(a.db)
    assert.equal((await a.como(a.pessoas.am).del(`/api/anexos/${img.id}`)).status, 204)
    const depois = (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo
    assert.equal(depois.demanda.capaAnexoId, null)
    assert.equal(depois.demanda.capaUrl, null)
    assert.equal(depois.demanda.nAnexos, 0)
    assert.equal(depois.anexos.length, 0)
    const ev = eventos(a.db, seq).find((e) => e.entidade === 'demanda')
    assert.equal(ev?.patch?.capaAnexoId, null)
    assert.equal(ev?.patch?.nAnexos, 0)
    // o arquivo sem uso vai para o lixo
    assert.ok(um<{ e: string | null }>(a.db, 'SELECT excluido_em AS e FROM arquivo WHERE id = ?', img.arquivo!.id)!.e)
    assert.equal((await a.como(a.pessoas.am).del(`/api/anexos/${img.id}`)).status, 404)
  })

  test('o print de evidência de uma aprovação nunca sai (mesmo anulada) → 409', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'enviada' })
    const { anexoId, aprovacaoId } = aprovarComPrint(a, d.id)
    const r = await a.como(a.pessoas.admin).del(`/api/anexos/${anexoId}`)
    assert.equal(r.status, 409)
    assert.equal(r.corpo.erro.codigo, 'conflito')
    assert.equal(r.corpo.erro.mensagem, 'Este print é a prova de uma aprovação.')
    anular(a.db, aprovacaoId, a.pessoas.am.id)
    assert.equal((await a.como(a.pessoas.am).del(`/api/anexos/${anexoId}`)).status, 409)
  })

  test('equipe excluindo anexo enviado por outra pessoa → 403; o próprio e o atendimento podem', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const doDesign: Anexo = (await a.como(a.pessoas.design).post(`/api/demandas/${d.id}/anexos`,
      { tipo: 'arquivo', arquivoId: enviar(a, a.ator(a.pessoas.design), PDF_MINIMO, 'briefing.pdf') })).corpo
    assert.equal(doDesign.arquivo?.imagem, false)
    const r = await a.como(a.pessoas.design2).del(`/api/anexos/${doDesign.id}`)
    assert.equal(r.status, 403)
    assert.equal(r.corpo.erro.codigo, 'sem_permissao')
    assert.equal((await a.como(a.pessoas.design).del(`/api/anexos/${doDesign.id}`)).status, 204)
    const doDesign2: Anexo = (await a.como(a.pessoas.design2).post(`/api/demandas/${d.id}/anexos`, { tipo: 'link', url: 'https://canva.com/x' })).corpo
    assert.equal(doDesign2.provedor, 'canva')
    assert.equal((await a.como(a.pessoas.am).del(`/api/anexos/${doDesign2.id}`)).status, 204)
  })
})
