/**
 * Tokens e segredos. Sessão, convite, redefinição e link público: `randomBytes(32)` em base64url, guardados só como
 * sha256 (API.md §1). O token do link público também vai cifrado (AES-256-GCM com chave derivada de SEGREDO) para o
 * atendimento reexibir o link; o IP da decisão pública vira HMAC.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { config } from '../config.ts'

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Token novo (32 bytes base64url) e o sha256 que vai para o banco. */
export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

function chave(finalidade: string): Buffer {
  return Buffer.from(hkdfSync('sha256', config.segredo, 'pauta', finalidade, 32))
}

/** AES-256-GCM: "iv.tag.cifra" em base64url. */
export function cifrar(texto: string, finalidade = 'link_publico'): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(finalidade), iv)
  const cifra = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), cifra].map((b) => b.toString('base64url')).join('.')
}

/** Inverso de `cifrar`. Lança erro se o texto foi adulterado ou o SEGREDO mudou. */
export function decifrar(cifrado: string, finalidade = 'link_publico'): string {
  const [iv, tag, cifra] = cifrado.split('.').map((p) => Buffer.from(p, 'base64url'))
  if (!iv || !tag || !cifra) throw new Error('Texto cifrado inválido')
  const d = createDecipheriv('aes-256-gcm', chave(finalidade), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(cifra), d.final()]).toString('utf8')
}

/** HMAC-SHA256 com SEGREDO em base64url (assinatura de URL, ip_hmac). */
export function hmac(texto: string): string {
  return createHmac('sha256', config.segredo).update(texto, 'utf8').digest('base64url')
}

/** Comparação em tempo constante de dois textos. */
export function iguaisSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}
