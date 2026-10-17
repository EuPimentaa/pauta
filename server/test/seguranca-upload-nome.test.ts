/**
 * Segurança 5 (revisão da leva 2): o magic number já decidia o tipo, mas o nome original ficava com qualquer extensão
 * e o arquivo era baixado assim (inclusive pelo cliente na página pública): um PDF chamado boleto.html, um zip chamado
 * planilha.xlsm. O nome ganha a extensão do tipo detectado quando não casa, e as perigosas são trocadas. Vale no upload
 * e no download (arquivos gravados antes desta correção).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rodar } from '../src/db.ts'
import { nomeParaTipo } from '../src/servicos/arquivos.ts'
import { ambiente, type Ambiente } from './ajuda.ts'

const bytes = (...partes: (number[] | string)[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(partes.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : p)))
const PDF = bytes('%PDF-1.7\n1 0 obj\n')
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04], 'resto do zip')
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'resto do png')
const JPG = bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF resto')

async function subir(a: Ambiente, conteudo: Uint8Array<ArrayBuffer>, nome: string): Promise<{ id: string; nome: string }> {
  const form = new FormData()
  form.append('arquivo', new File([conteudo], nome))
  const r = await a.como(a.pessoas.design).bruto('/api/arquivos', { method: 'POST', body: form })
  assert.equal(r.status, 201, nome)
  return r.json() as Promise<{ id: string; nome: string }>
}

const nomeBaixado = async (a: Ambiente, id: string) =>
  decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec((await a.como(a.pessoas.am).bruto(`/api/arquivos/${id}`)).headers.get('content-disposition')!)![1]!)

describe('nome do arquivo pelo tipo detectado', () => {
  test('upload: extensão perigosa trocada, a de outro tipo trocada, nenhuma ganha a do tipo; o download sai igual', async () => {
    const a = await ambiente()
    const casos: [Uint8Array<ArrayBuffer>, string, string][] = [
      [PDF, 'boleto.html', 'boleto.pdf'],
      [PDF, 'BOLETO.HTM', 'BOLETO.pdf'],
      [PDF, 'nota.svg', 'nota.pdf'],
      [ZIP, 'planilha.xlsm', 'planilha.zip'],
      [ZIP, 'app.jar', 'app.zip'],
      [ZIP, 'instalar.exe', 'instalar.zip'],
      [PNG, 'foto.jpg', 'foto.png'],
      [PNG, 'sem-extensao', 'sem-extensao.png'],
      [PDF, 'Proposta v1.2', 'Proposta v1.2.pdf'],
      [PDF, 'boleto.html.', 'boleto.pdf'],
    ]
    for (const [conteudo, enviado, esperado] of casos) {
      const info = await subir(a, conteudo, enviado)
      assert.equal(info.nome, esperado, enviado)
      assert.equal(await nomeBaixado(a, info.id), esperado, `download de ${enviado}`)
    }
  })

  test('extensão que casa com o tipo fica como está (docx e xlsx são zip; jpeg e jpg; ai é PDF)', async () => {
    const a = await ambiente()
    for (const [conteudo, nome] of [[ZIP, 'Contrato.docx'], [ZIP, 'Mídia.xlsx'], [ZIP, 'peças.zip'], [JPG, 'foto.jpeg'], [JPG, 'foto.JPG'],
      [PDF, 'logo.ai'], [PNG, 'Arte final.png']] as const) {
      assert.equal((await subir(a, conteudo, nome)).nome, nome)
    }
  })

  test('arquivo gravado antes da correção (nome com .html) é baixado com a extensão do tipo', async () => {
    const a = await ambiente()
    const info = await subir(a, PDF, 'boleto.pdf')
    rodar(a.db, 'UPDATE arquivo SET nome = ? WHERE id = ?', 'boleto.html', info.id)
    const r = await a.como(a.pessoas.am).bruto(`/api/arquivos/${info.id}`)
    assert.match(r.headers.get('content-disposition')!, /^attachment; filename="boleto\.pdf"; filename\*=UTF-8''boleto\.pdf$/)
  })

  test('nomeParaTipo: limite de 200 caracteres com a extensão nova', () => {
    const longo = nomeParaTipo(`${'x'.repeat(200)}`, 'application/pdf')
    assert.equal(longo.length, 200)
    assert.ok(longo.endsWith('.pdf'))
    assert.equal(nomeParaTipo('.html', 'application/pdf'), 'arquivo.pdf')
  })
})
