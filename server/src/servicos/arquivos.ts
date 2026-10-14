/**
 * Arquivos em disco (API.md §4.14): upload até 10 MB conferindo o magic number, gravado em
 * DATA_DIR/uploads/<2 primeiros do id>/<id> (nunca o nome original no disco), download seguro e URL assinada
 * (HMAC com SEGREDO, validade em minutos) para a página pública.
 */
import { createHash } from 'node:crypto'
import { createReadStream, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ArquivoInfo, Id, MimePermitido } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { config } from '../config.ts'
import { agora, agoraData, novoId, rodar, seDesfeita, um, type Db } from '../db.ts'
import { ErroHttp, naoEncontrado, validacao } from '../erros.ts'
import { lerConfig } from './config-app.ts'
import { hmac, iguaisSeguro } from './cripto.ts'
import { mapear } from './mapear.ts'

export function pastaUploads(): string {
  return join(config.dataDir, 'uploads')
}

/** Caminho no disco: uploads/<2 primeiros do id>/<id>. */
export function caminhoDoArquivo(id: Id): string {
  return join(pastaUploads(), id.slice(0, 2), id)
}

/** Tipo pelo conteúdo (jpg, png, webp, gif, pdf, zip); null fora da lista. */
export function detectarMime(b: Uint8Array): MimePermitido | null {
  const comeca = (...bytes: number[]) => bytes.every((x, i) => b[i] === x)
  const ascii = (inicio: number, texto: string) => [...texto].every((ch, i) => b[inicio + i] === ch.charCodeAt(0))
  if (comeca(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif'
  if (ascii(0, '%PDF-')) return 'application/pdf'
  if (comeca(0x50, 0x4b, 0x03, 0x04) || comeca(0x50, 0x4b, 0x05, 0x06)) return 'application/zip'
  return null
}

/** Nome original sem caminho, sem caracteres de controle e com até 200 caracteres. */
export function nomeSeguro(nome: string): string {
  const base = nome.split(/[\\/]/).at(-1) ?? ''
  const limpo = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').replace(/\s+/g, ' ').trim()
  if (!limpo || limpo === '.' || limpo === '..') return 'arquivo'
  if (limpo.length <= 200) return limpo
  const ponto = limpo.lastIndexOf('.')
  const ext = ponto > 0 && limpo.length - ponto <= 10 ? limpo.slice(ponto) : ''
  return limpo.slice(0, 200 - ext.length) + ext
}

/**
 * Grava o upload (já lido em memória pelo multipart, até o bodyLimit). Tamanho acima de uploadLimiteBytes → 413
 * arquivo_grande; vazio → 400; magic number fora da lista → 415 tipo_arquivo.
 */
export function salvarUpload(db: Db, conteudo: Uint8Array, nomeOriginal: string, ator: Ator): ArquivoInfo {
  if (conteudo.byteLength === 0) throw validacao('O arquivo está vazio.', { arquivo: 'vazio' })
  if (conteudo.byteLength > lerConfig(db).uploadLimiteBytes) throw new ErroHttp(413, 'arquivo_grande', 'O arquivo passa de 10 MB.')
  const mime = detectarMime(conteudo)
  if (!mime) throw new ErroHttp(415, 'tipo_arquivo', 'Envie imagem (jpg, png, webp, gif), PDF ou zip.')
  const id = novoId()
  const destino = caminhoDoArquivo(id)
  mkdirSync(join(pastaUploads(), id.slice(0, 2)), { recursive: true })
  writeFileSync(destino, conteudo, { flag: 'wx' })
  // a transação de quem chama pode desfazer a linha: o arquivo sai do disco junto (nada no disco sem linha)
  seDesfeita(db, () => rmSync(destino, { force: true }))
  const sha256 = createHash('sha256').update(conteudo).digest('hex')
  rodar(db, 'INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, nomeSeguro(nomeOriginal), mime, conteudo.byteLength, sha256, ator.usuario!.id, agora())
  return lerArquivo(db, id).info
}

/** Arquivo existente e fora do lixo. 404 se não existe, foi excluído ou sumiu do disco. */
export function lerArquivo(db: Db, id: Id): { info: ArquivoInfo; caminho: string } {
  const l = um<Record<string, unknown>>(db, 'SELECT * FROM arquivo WHERE id = ? AND excluido_em IS NULL', id)
  if (!l) throw naoEncontrado('Arquivo não encontrado.')
  return { info: mapear.arquivo(l), caminho: caminhoDoArquivo(id) }
}

/** URL assinada para a página pública: /api/publico/arquivos/:id?exp=&sig= (sig = HMAC de `${id}.${exp}`). */
export function urlAssinada(id: Id, minutos: number): string {
  const exp = Math.floor(agoraData().getTime() / 1000) + Math.round(minutos * 60)
  return `/api/publico/arquivos/${encodeURIComponent(id)}?exp=${exp}&sig=${hmac(`${id}.${exp}`)}`
}

/** Assinatura certa e ainda no prazo (exp em segundos Unix). */
export function assinaturaValida(id: Id, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < agoraData().getTime()) return false
  return iguaisSeguro(hmac(`${id}.${exp}`), sig)
}

/**
 * Resposta do download (interno e público): nosniff, `attachment` exceto imagem com `inline`, cache privado de 1 h.
 */
export function respostaArquivo(info: ArquivoInfo, caminho: string, opcoes: { inline?: boolean } = {}): Response {
  let tamanho: number
  try {
    tamanho = statSync(caminho).size
  } catch {
    throw naoEncontrado('Arquivo não encontrado.')
  }
  const inline = opcoes.inline === true && info.imagem
  const nome = encodeURIComponent(info.nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  const ascii = info.nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const corpo = Readable.toWeb(createReadStream(caminho)) as ReadableStream<Uint8Array>
  return new Response(corpo, {
    status: 200,
    headers: {
      'Content-Type': info.mime,
      'Content-Length': String(tamanho),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${nome}`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
