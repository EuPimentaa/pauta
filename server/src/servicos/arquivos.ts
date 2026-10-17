/**
 * Arquivos em disco (API.md §4.14): upload até 10 MB conferindo o magic number, gravado em
 * DATA_DIR/uploads/<2 primeiros do id>/<id> (nunca o nome original no disco), download seguro e URL assinada
 * (HMAC com SEGREDO, validade em minutos) para a página pública.
 */
import { createHash } from 'node:crypto'
import { createReadStream, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { LIMITE_UPLOAD_BYTES, type ArquivoInfo, type Id, type MimePermitido } from '../../../shared/tipos/index.ts'
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

/** Extensões que casam com cada tipo detectado; a primeira é a que o nome ganha quando não casa. */
const EXTENSOES: Record<MimePermitido, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jpe', 'jfif'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  // o .ai (e o modelo .ait) do Illustrator salvo com compatibilidade PDF começa com %PDF-
  'application/pdf': ['pdf', 'ai', 'ait'],
  // formatos sem macro que são zip por dentro: Office (e os modelos e apresentações sem macro), OpenDocument, Visio,
  // CorelDRAW (desde o X4), InDesign, XD, Sketch, iWork, Krita/OpenRaster, Procreate, Lottie, modelo do Premiere,
  // 3D (3MF, USDZ), XPS e Google Earth. Fora da lista, o nome ganha ".zip" (não abre em outro programa sem querer).
  'application/zip': [
    'zip', 'docx', 'xlsx', 'pptx', 'dotx', 'xltx', 'potx', 'ppsx', 'sldx', 'thmx',
    'odt', 'ods', 'odp', 'odg', 'odf', 'odc', 'odm', 'ott', 'ots', 'otp', 'otg', 'epub',
    'vsdx', 'vssx', 'vstx', 'cdr', 'cdt', 'idml', 'xd', 'sketch', 'key', 'pages', 'numbers',
    'kra', 'ora', 'procreate', 'lottie', 'mogrt', '3mf', 'usdz', 'xps', 'oxps', 'kmz', 'cbz',
  ],
}
/**
 * Abrem como página ou script no navegador, ou executam ou instalam algo no sistema (zip com macro do Office ou do
 * Visio, pacote Java, extensão de navegador ou de editor, app): sempre trocadas.
 */
const EXTENSOES_PERIGOSAS = new Set([
  'html', 'htm', 'svg', 'js', 'hta', 'vbs', 'exe', 'bat', 'cmd', 'ps1',
  'xlsm', 'docm', 'pptm', 'dotm', 'xltm', 'potm', 'ppsm', 'sldm', 'xlam', 'ppam', 'vsdm', 'vssm', 'vstm',
  'jar', 'war', 'ear', 'apk', 'xpi', 'vsix', 'appx', 'appxbundle', 'msix', 'msixbundle', 'xap',
])
const EXTENSOES_CONHECIDAS = new Set(Object.values(EXTENSOES).flat())

/**
 * O nome com a extensão do tipo detectado pelo magic number (API.md §4.14): a que casa fica ("Contrato.docx" num zip);
 * a perigosa ou a de outro tipo é trocada ("boleto.html" num PDF → "boleto.pdf"; "foto.jpg" num PNG → "foto.png"); sem
 * extensão, ou com uma que não diz nada ("Proposta v1.2"), o nome ganha a do tipo ("Proposta v1.2.pdf"). Pontos e
 * espaços no fim saem (o Windows os tira e "boleto.html." viraria .html). Até 200 caracteres. Vale no upload e no
 * download (nomes gravados antes desta regra).
 */
export function nomeParaTipo(nome: string, mime: string): string {
  const permitidas = EXTENSOES[mime as MimePermitido]
  if (!permitidas) return nome
  const limpo = nome.replace(/[.\s]+$/, '')
  const ponto = limpo.lastIndexOf('.')
  const ext = ponto >= 0 ? limpo.slice(ponto + 1).toLowerCase() : ''
  if (ext && permitidas.includes(ext)) return limpo
  const trocar = ext !== '' && (EXTENSOES_PERIGOSAS.has(ext) || EXTENSOES_CONHECIDAS.has(ext))
  const base = (trocar ? limpo.slice(0, ponto) : limpo).trim() || 'arquivo'
  const nova = `.${permitidas[0]}`
  return base.slice(0, 200 - nova.length) + nova
}

/** "10 MB", "1,5 MB", "200 KB" (para a mensagem do limite). */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = Math.round((bytes / 1_048_576) * 10) / 10
  return `${String(mb).replace('.', ',')} MB`
}

/**
 * Grava o upload (já lido em memória pelo multipart, até o bodyLimit). Tamanho acima de uploadLimiteBytes → 413
 * arquivo_grande; vazio → 400; magic number fora da lista → 415 tipo_arquivo.
 */
export function salvarUpload(db: Db, conteudo: Uint8Array, nomeOriginal: string, ator: Ator): ArquivoInfo {
  if (conteudo.byteLength === 0) throw validacao('O arquivo está vazio.', { arquivo: 'vazio' })
  // a configuração pode baixar o limite, nunca passar dos 10 MB do contrato (e do CHECK de arquivo.bytes)
  const limite = Math.min(lerConfig(db).uploadLimiteBytes, LIMITE_UPLOAD_BYTES)
  if (conteudo.byteLength > limite) {
    throw new ErroHttp(413, 'arquivo_grande', `O arquivo passa de ${tamanhoLegivel(limite)}.`, { limiteBytes: limite })
  }
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
    id, nomeParaTipo(nomeSeguro(nomeOriginal), mime), mime, conteudo.byteLength, sha256, ator.usuario!.id, agora())
  return lerArquivo(db, id).info
}

/** Arquivo existente e fora do lixo. 404 se não existe, foi excluído ou sumiu do disco. */
export function lerArquivo(db: Db, id: Id): { info: ArquivoInfo; caminho: string } {
  const l = um<Record<string, unknown>>(db, 'SELECT * FROM arquivo WHERE id = ? AND excluido_em IS NULL', id)
  if (!l) throw naoEncontrado('Arquivo não encontrado.')
  return { info: mapear.arquivo(l), caminho: caminhoDoArquivo(id) }
}

/** O texto assinado: o link, o arquivo e a validade (o prefixo separa esta assinatura das outras HMAC com SEGREDO). */
const textoAssinado = (linkId: Id, id: Id, exp: number) => `arquivo-publico|${linkId}|${id}|${exp}`

/**
 * URL assinada para a página pública de um link: /api/publico/arquivos/:id?l=<link>&exp=&sig= (sig = HMAC do link, do
 * arquivo e de exp). A rota confere também que o link segue ativo e contém o arquivo (`arquivoDoLink`, ciclo-publico.ts):
 * revogar o link corta as URLs já emitidas.
 */
export function urlAssinada(linkId: Id, id: Id, minutos: number): string {
  const exp = Math.floor(agoraData().getTime() / 1000) + Math.round(minutos * 60)
  return `/api/publico/arquivos/${encodeURIComponent(id)}?l=${encodeURIComponent(linkId)}&exp=${exp}&sig=${hmac(textoAssinado(linkId, id, exp))}`
}

/** Assinatura certa para o link e o arquivo, e ainda no prazo (exp em segundos Unix). */
export function assinaturaValida(linkId: Id, id: Id, exp: number, sig: string): boolean {
  if (!linkId || !Number.isFinite(exp) || exp * 1000 < agoraData().getTime()) return false
  return iguaisSeguro(hmac(textoAssinado(linkId, id, exp)), sig)
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
  // o nome baixado tem a extensão do tipo de verdade (também os gravados antes da regra do upload)
  const nomeFinal = nomeParaTipo(info.nome, info.mime)
  const nome = encodeURIComponent(nomeFinal).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  const ascii = nomeFinal.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
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
