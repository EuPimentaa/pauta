/**
 * Front compilado (web/dist) servido pelo próprio Node em produção: arquivos com o tipo certo, `/assets/*` com cache
 * longo (nomes com hash) e fallback de SPA para o index.html (sem cache). Os cabeçalhos de segurança (CSP,
 * Referrer-Policy no-referrer em /a/*, /convite e /redefinir, noindex e no-store em /a/*) vêm do middleware global.
 * O index.html sai com o APP_NOME no <title> e no <meta name="application-name"> (o front lê o nome dali antes do login).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { App } from './auth.ts'
import { config } from './config.ts'

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
}

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ENTIDADES[ch]!)
}

/** Troca o nome do produto do index.html ("Pauta" no build) pelo APP_NOME, escapado para HTML. */
export function comNomeApp(html: string, nome: string): string {
  const v = escaparHtml(nome)
  return html
    .replace(/(<meta\s+name="application-name"\s+content=")[^"]*(")/i, (_, antes: string, depois: string) => `${antes}${v}${depois}`)
    .replace(/<title>[^<]*<\/title>/i, () => `<title>${v}</title>`)
}

/** Registra o front estático. `pasta` = web/dist. Sem a pasta (dev com Vite), não faz nada. */
export function servirWeb(app: App, pasta: string): boolean {
  const raiz = resolve(pasta)
  const indice = join(raiz, 'index.html')
  if (!existsSync(indice)) return false
  // lido uma vez: o arquivo só muda com um deploy novo, que reinicia o processo
  const html = comNomeApp(readFileSync(indice, 'utf8'), config.appNome)
  const responderIndice = () => new Response(html, { headers: { 'Content-Type': TIPOS['.html']!, 'Cache-Control': 'no-cache' } })

  app.get('*', (c) => {
    let caminho: string
    try {
      caminho = decodeURIComponent(c.req.path)
    } catch {
      return c.text('Endereço inválido.', 400)
    }
    if (caminho.startsWith('/api/')) return c.notFound()
    const alvo = normalize(join(raiz, caminho))
    const dentro = alvo === raiz || alvo.startsWith(raiz + sep)
    if (alvo === indice) return responderIndice()
    if (dentro && alvo !== raiz && existsSync(alvo) && statSync(alvo).isFile()) {
      const longo = caminho.startsWith('/assets/')
      return new Response(readFileSync(alvo), {
        headers: {
          'Content-Type': TIPOS[extname(alvo).toLowerCase()] ?? 'application/octet-stream',
          'Cache-Control': longo ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
        },
      })
    }
    if (extname(caminho) && !caminho.endsWith('.html')) return c.text('Não encontrado.', 404)
    return responderIndice()
  })
  return true
}
