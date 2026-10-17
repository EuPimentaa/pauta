/** Arquivos (API.md §4.14): upload multipart com magic number e limites, download seguro, URL assinada e lixo. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { request } from 'node:http'
import { serve } from '@hono/node-server'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { config } from '../src/config.ts'
import { rodar, tx, um } from '../src/db.ts'
import {
  assinaturaValida, caminhoDoArquivo, detectarMime, nomeSeguro, salvarUpload, tamanhoLegivel, urlAssinada,
} from '../src/servicos/arquivos.ts'
import { LIMITE_UPLOAD_BYTES } from '../../shared/tipos/index.ts'
import { gravarConfig } from '../src/servicos/config-app.ts'
import { limparArquivos } from '../src/tarefas/nucleo-lixo.ts'
import { ambiente, ORIGEM, type Ambiente, type Cliente_ } from './ajuda.ts'

const bytes = (...partes: (number[] | string)[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(partes.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : p)))

const AMOSTRAS = {
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'resto do png'),
  jpg: bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF resto'),
  webp: bytes('RIFF', [0x10, 0, 0, 0], 'WEBPVP8 resto'),
  gif: bytes('GIF89a resto'),
  pdf: bytes('%PDF-1.7\n1 0 obj\n'),
  zip: bytes([0x50, 0x4b, 0x03, 0x04], 'resto do zip'),
}

async function enviar(cli: Cliente_, conteudo: Uint8Array<ArrayBuffer>, nome: string, campo = 'arquivo') {
  const form = new FormData()
  form.append(campo, new File([conteudo], nome))
  const r = await cli.bruto('/api/arquivos', { method: 'POST', body: form })
  return { status: r.status, corpo: await r.json() }
}

async function subir(a: Ambiente, conteudo: Uint8Array<ArrayBuffer> = AMOSTRAS.png, nome = 'arte.png'): Promise<string> {
  const r = await enviar(a.como(a.pessoas.design), conteudo, nome)
  assert.equal(r.status, 201)
  return r.corpo.id
}

describe('POST /api/arquivos', () => {
  test('grava no disco em uploads/<2>/<id> com o sha256 e responde 201 ArquivoInfo', async () => {
    const a = await ambiente()
    const r = await enviar(a.como(a.pessoas.design), AMOSTRAS.png, 'Arte final.png')
    assert.equal(r.status, 201)
    const info = r.corpo
    assert.equal(info.nome, 'Arte final.png')
    assert.equal(info.mime, 'image/png')
    assert.equal(info.bytes, AMOSTRAS.png.byteLength)
    assert.equal(info.imagem, true)
    assert.equal(info.url, `/api/arquivos/${info.id}?inline=1`)                  // imagem abre inline
    const caminho = caminhoDoArquivo(info.id)
    assert.ok(caminho.startsWith(config.dataDir))
    assert.ok(caminho.includes(info.id.slice(0, 2)))
    assert.deepEqual(new Uint8Array(readFileSync(caminho)), AMOSTRAS.png)
    const l = um<{ sha256: string; enviado_por: string }>(a.db, 'SELECT sha256, enviado_por FROM arquivo WHERE id = ?', info.id)!
    assert.equal(l.sha256, createHash('sha256').update(AMOSTRAS.png).digest('hex'))
    assert.equal(l.enviado_por, a.pessoas.design.id)
  })

  test('tipo pelo conteúdo: jpg, png, webp, gif, pdf e zip passam; o resto → 415 tipo_arquivo (a extensão não engana)', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const esperado = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', zip: 'application/zip' }
    for (const [tipo, conteudo] of Object.entries(AMOSTRAS)) {
      const r = await enviar(eu, conteudo, `x.${tipo}`)
      assert.equal(r.status, 201, tipo)
      assert.equal(r.corpo.mime, esperado[tipo as keyof typeof esperado])
      assert.equal(r.corpo.imagem, tipo !== 'pdf' && tipo !== 'zip')
    }
    for (const [nome, conteudo] of [['falso.png', bytes('<html><script>alert(1)</script>')], ['logo.svg', bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      ['nota.txt', bytes('texto')], ['meio.png', bytes('RIFF', [0, 0, 0, 0], 'AVI LIST')]] as const) {
      const r = await enviar(eu, conteudo, nome)
      assert.equal(r.status, 415, nome)
      assert.equal(r.corpo.erro.codigo, 'tipo_arquivo')
    }
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM arquivo')!.n, 6)
  })

  test('validação: sem o campo, vazio ou fora de multipart → 400; sem sessão → 401; sem CSRF → 403', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const semCampo = await enviar(eu, AMOSTRAS.png, 'a.png', 'outro')
    assert.equal(semCampo.status, 400)
    assert.equal(semCampo.corpo.erro.codigo, 'validacao')
    assert.equal((await enviar(eu, new Uint8Array(), 'vazio.png')).status, 400)
    const json = await eu.post('/api/arquivos', { arquivo: 'x' })
    assert.equal(json.status, 400)
    const form = new FormData()
    form.append('arquivo', new File([AMOSTRAS.png], 'a.png'))
    assert.equal((await a.app.request('/api/arquivos', { method: 'POST', body: form, headers: { 'X-Trace-Id': randomUUID(), Origin: ORIGEM } })).status, 401)
    const semCsrf = await a.app.request('/api/arquivos', { method: 'POST', body: form, headers: { Cookie: `sid=${eu.cookie}` } })
    assert.equal(semCsrf.status, 403)
  })

  test('limites: Content-Length acima de 10 MiB + 64 KiB → 413 sem parse (o corpo só é descartado); 2 MiB (acima do limite de JSON) passa', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    // o corpo que quebra ao ser lido não derruba o 413: o servidor só o descarta (drenarCorpo), nunca o interpreta
    const corpo = new ReadableStream<Uint8Array>({ pull() { throw new Error('conexão caiu') } }, { highWaterMark: 0 })
    const r = await eu.bruto('/api/arquivos', {
      method: 'POST', body: corpo, duplex: 'half',
      headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(11 * 1024 * 1024) },
    } as RequestInit)
    assert.equal(r.status, 413)
    assert.equal((await r.json()).erro.codigo, 'arquivo_grande')

    const grande = new Uint8Array(2 * 1024 * 1024)
    grande.set(AMOSTRAS.pdf)
    const ok = await enviar(eu, grande, 'manual.pdf')
    assert.equal(ok.status, 201)
    assert.equal(ok.corpo.bytes, grande.byteLength)
  })

  test('upload de 11 MB lento (servidor de verdade): o servidor lê e descarta o corpo e responde 413 sem derrubar a conexão', async () => {
    // o navegador só lê a resposta depois de mandar tudo: com a conexão derrubada no meio (RST), o aviso dizia
    // "Sem conexão com o servidor" em vez de "passa de 10 MB" (revisão funcional da integração 3A, achado 6)
    const a = await ambiente()
    const srv = serve({ fetch: a.app.fetch, port: 0, hostname: '127.0.0.1' })
    try {
      await new Promise((pronto) => srv.once('listening', pronto))
      const porta = (srv.address() as { port: number }).port
      const total = 11 * 1024 * 1024
      const pedaco = Buffer.alloc(512 * 1024)
      const saida = await new Promise<{ status: number | null; enviados: number; erro: string | null }>((pronto) => {
        let status: number | null = null
        let erro: string | null = null
        let enviados = 0
        const req = request({ host: '127.0.0.1', port: porta, path: '/api/arquivos', method: 'POST',
          headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(total) } })
        req.on('response', (r) => { status = r.statusCode ?? null; r.resume() })
        req.on('error', (e) => { erro = e.message })
        // 22 pedaços a cada 40 ms: quase 1 s, mais que os 500 ms que o @hono/node-server drena sozinho
        const passo = () => {
          if (erro || enviados >= total) { req.end(); setTimeout(() => pronto({ status, enviados, erro }), 200); return }
          req.write(pedaco, (e) => { if (e) erro = e.message; else enviados += pedaco.length; setTimeout(passo, 40) })
        }
        passo()
      })
      assert.equal(saida.erro, null)
      assert.equal(saida.enviados, total)
      assert.equal(saida.status, 413)
    } finally {
      srv.close()
    }
  })

  test('acima de uploadLimiteBytes (configurável) → 413 arquivo_grande e nada fica no disco', async () => {
    const a = await ambiente()
    gravarConfig(a.db, 'uploadLimiteBytes', 1000, null)
    const r = await enviar(a.como(a.pessoas.am), new Uint8Array([...AMOSTRAS.png, ...new Uint8Array(1000)]), 'grande.png')
    assert.equal(r.status, 413)
    assert.equal(r.corpo.erro.codigo, 'arquivo_grande')
    assert.equal(r.corpo.erro.mensagem, 'O arquivo passa de 1 KB.')                // o limite configurado, não o do contrato
    assert.deepEqual(r.corpo.erro.detalhes, { limiteBytes: 1000 })
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM arquivo')!.n, 0)
  })

  test('a configuração só baixa o limite: gravada acima de 10 MB, vale 10 MB (o CHECK de arquivo.bytes)', async () => {
    const a = await ambiente()
    gravarConfig(a.db, 'uploadLimiteBytes', 20 * 1024 * 1024, null)
    const conteudo = new Uint8Array(LIMITE_UPLOAD_BYTES + 1)                        // cabe no bodyLimit (10 MiB + 64 KiB)
    conteudo.set(AMOSTRAS.pdf)
    const r = await enviar(a.como(a.pessoas.am), conteudo, 'grande.pdf')
    assert.equal(r.status, 413)
    assert.equal(r.corpo.erro.mensagem, 'O arquivo passa de 10 MB.')
    assert.deepEqual(r.corpo.erro.detalhes, { limiteBytes: LIMITE_UPLOAD_BYTES })
    const noLimite = await enviar(a.como(a.pessoas.am), conteudo.subarray(0, LIMITE_UPLOAD_BYTES), 'no-limite.pdf')
    assert.equal(noLimite.status, 201)
    assert.equal(noLimite.corpo.bytes, LIMITE_UPLOAD_BYTES)
    assert.equal(tamanhoLegivel(1_572_864), '1,5 MB')
    assert.equal(tamanhoLegivel(200 * 1024), '200 KB')
    assert.equal(tamanhoLegivel(10), '1 KB')
  })

  test('transação desfeita depois do upload apaga o arquivo do disco', async () => {
    const a = await ambiente()
    let caminho = ''
    assert.throws(() => tx(a.db, () => {
      caminho = caminhoDoArquivo(salvarUpload(a.db, AMOSTRAS.png, 'a.png', a.ator(a.pessoas.am)).id)
      assert.ok(existsSync(caminho))
      throw new Error('falhou depois')
    }), /falhou depois/)
    assert.equal(existsSync(caminho), false)
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM arquivo')!.n, 0)
    // dentro de um SAVEPOINT desfeito também; o que veio antes dele fica
    let fica = ''
    let sai = ''
    tx(a.db, () => {
      fica = caminhoDoArquivo(salvarUpload(a.db, AMOSTRAS.png, 'fica.png', a.ator(a.pessoas.am)).id)
      try {
        tx(a.db, () => {
          sai = caminhoDoArquivo(salvarUpload(a.db, AMOSTRAS.gif, 'sai.gif', a.ator(a.pessoas.am)).id)
          throw new Error('desfaz só este')
        })
      } catch {
        // segue a transação de fora
      }
    })
    assert.equal(existsSync(fica), true)
    assert.equal(existsSync(sai), false)
  })

  test('nome seguro: sem caminho, sem controle, até 200 caracteres mantendo a extensão', () => {
    assert.equal(nomeSeguro('../../etc/passwd.png'), 'passwd.png')
    assert.equal(nomeSeguro('C:\\Users\\x\\Arte "final".pdf'), 'Arte final.pdf')
    assert.equal(nomeSeguro('a\u0000b\u001fc.png'), 'abc.png')
    assert.equal(nomeSeguro('..'), 'arquivo')
    assert.equal(nomeSeguro('   '), 'arquivo')
    const longo = nomeSeguro(`${'x'.repeat(300)}.jpeg`)
    assert.equal(longo.length, 200)
    assert.ok(longo.endsWith('.jpeg'))
    assert.equal(detectarMime(bytes('GIF87a')), 'image/gif')
    assert.equal(detectarMime(bytes([0x50, 0x4b, 0x05, 0x06])), 'application/zip')
    assert.equal(detectarMime(new Uint8Array()), null)
  })
})

describe('GET /api/arquivos/:id', () => {
  test('download: attachment com filename*, nosniff e cache privado; ?inline=1 só para imagem', async () => {
    const a = await ambiente()
    const png = await subir(a, AMOSTRAS.png, 'Peça ação.png')
    const pdf = await subir(a, AMOSTRAS.pdf, 'contrato.pdf')
    const eu = a.como(a.pessoas.social)
    const r = await eu.bruto(`/api/arquivos/${png}`)
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'image/png')
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(r.headers.get('cache-control'), 'private, max-age=3600')
    assert.equal(r.headers.get('content-length'), String(AMOSTRAS.png.byteLength))
    assert.equal(r.headers.get('content-disposition'), `attachment; filename="Pe_a a__o.png"; filename*=UTF-8''Pe%C3%A7a%20a%C3%A7%C3%A3o.png`)
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), AMOSTRAS.png)

    const inline = await eu.bruto(`/api/arquivos/${png}?inline=1`)
    assert.match(inline.headers.get('content-disposition')!, /^inline;/)
    await inline.body?.cancel()
    const pdfInline = await eu.bruto(`/api/arquivos/${pdf}?inline=1`)
    assert.match(pdfInline.headers.get('content-disposition')!, /^attachment;/)
    await pdfInline.body?.cancel()
  })

  test('sem sessão → 401; inexistente, no lixo ou apagado do disco → 404', async () => {
    const a = await ambiente()
    const id = await subir(a)
    assert.equal((await a.app.request(`/api/arquivos/${id}`)).status, 401)
    const eu = a.como(a.pessoas.am)
    assert.equal((await eu.get('/api/arquivos/nao-existe')).status, 404)
    rodar(a.db, 'UPDATE arquivo SET excluido_em = ? WHERE id = ?', '2026-10-14T13:00:00.000Z', id)
    assert.equal((await eu.get(`/api/arquivos/${id}`)).status, 404)
    const outro = await subir(a)
    rmSync(caminhoDoArquivo(outro))                               // sumiu do disco por fora do app
    const sumiu = await eu.get(`/api/arquivos/${outro}`)
    assert.equal(sumiu.status, 404)
    assert.equal(sumiu.corpo.erro.codigo, 'nao_encontrado')
  })
})

describe('URL assinada (página pública)', () => {
  test('vale até expirar; assinatura de outro arquivo, de outro link ou adulterada não vale', async () => {
    const a = await ambiente()
    const id = await subir(a)
    const url = new URL(urlAssinada('link-1', id, 10), 'http://x')
    assert.equal(url.pathname, `/api/publico/arquivos/${id}`)
    assert.equal(url.searchParams.get('l'), 'link-1')
    const exp = Number(url.searchParams.get('exp'))
    const sig = url.searchParams.get('sig')!
    assert.equal(exp, Date.parse('2026-10-14T13:10:00.000Z') / 1000)
    assert.equal(assinaturaValida('link-1', id, exp, sig), true)
    assert.equal(assinaturaValida('link-1', 'outro-id', exp, sig), false)
    assert.equal(assinaturaValida('link-2', id, exp, sig), false)
    assert.equal(assinaturaValida('', id, exp, sig), false)
    assert.equal(assinaturaValida('link-1', id, exp + 60, sig), false)
    // troca o último caractere por OUTRO (com "A" fixo, 1 vez em 64 a assinatura já terminava em "A" e o teste falhava)
    assert.equal(assinaturaValida('link-1', id, exp, `${sig.slice(0, -1)}${sig.at(-1) === 'A' ? 'B' : 'A'}`), false)
    assert.equal(assinaturaValida('link-1', id, Number.NaN, sig), false)
    a.relogio('2026-10-14T13:11:00.000Z')
    assert.equal(assinaturaValida('link-1', id, exp, sig), false)
  })
})

describe('lixo de arquivos (job diário)', () => {
  test('órfão há mais de 24 h sai do disco; em uso e recente ficam; excluído há mais de 30 dias sai', async () => {
    const a = await ambiente()
    const orfao = await subir(a)
    const emUso = await subir(a)
    await a.criarDemanda({ links: [{ tipo: 'arquivo', arquivoId: emUso, nome: 'Referência' }] })
    const anexoExcluido = await subir(a)
    const d = await a.criarDemanda({ links: [{ tipo: 'arquivo', arquivoId: anexoExcluido }] })
    rodar(a.db, 'UPDATE anexo SET excluido_em = ? WHERE demanda_id = ?', '2026-10-14T13:00:00.000Z', d.id)

    a.relogio('2026-10-15T12:00:00.000Z')                         // 23 h depois
    const recente = await subir(a)
    assert.deepEqual(limparArquivos(a.db).apagados, [])

    a.relogio('2026-10-15T13:30:00.000Z')                         // 24,5 h depois do primeiro
    const r = limparArquivos(a.db)
    assert.deepEqual(new Set(r.apagados), new Set([orfao, anexoExcluido]))
    for (const id of [orfao, anexoExcluido]) {
      assert.equal(existsSync(caminhoDoArquivo(id)), false)
      const l = um<{ excluido_em: string | null; apagado_em: string | null }>(a.db, 'SELECT excluido_em, apagado_em FROM arquivo WHERE id = ?', id)!
      assert.ok(l.excluido_em && l.apagado_em)
    }
    assert.equal(existsSync(caminhoDoArquivo(emUso)), true)
    assert.equal(existsSync(caminhoDoArquivo(recente)), true)

    // arquivo em uso não vai para o lixo (gatilho → 409); arquivo no lixo não volta a ser usado (→ 400)
    assert.throws(() => rodar(a.db, 'UPDATE arquivo SET excluido_em = ? WHERE id = ?', '2026-10-15T13:30:00.000Z', emUso), /arquivo_em_uso/)
    const volta = await a.como(a.pessoas.am).post('/api/demandas', {
      titulo: 'Usa o do lixo', quadroId: a.quadros.criacao.quadro.id, clienteId: a.clientes.he.id,
      links: [{ tipo: 'arquivo', arquivoId: orfao }],
    })
    assert.equal(volta.status, 400)

    // excluído (sem uso) há mais de 30 dias sai do disco
    const velho = await subir(a)
    rodar(a.db, 'UPDATE arquivo SET excluido_em = ? WHERE id = ?', '2026-10-15T13:30:00.000Z', velho)
    a.relogio('2026-11-10T13:30:00.000Z')
    assert.deepEqual(limparArquivos(a.db).apagados.filter((id) => id === velho), [])
    a.relogio('2026-11-15T13:30:00.000Z')
    assert.ok(limparArquivos(a.db).apagados.includes(velho))
    assert.equal(existsSync(caminhoDoArquivo(velho)), false)
  })
})
