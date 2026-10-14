/**
 * `criarApp(db)`: o Hono com os middlewares globais (contexto, bodyLimit antes de tudo, cabeçalhos, anti-CSRF, log
 * mascarado) e as rotas descobertas em src/rotas/*.ts (cada arquivo exporta `registrar(app)`). Usado pelo index e
 * pelos testes (`app.request()`).
 */
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { HEADER_TRACE } from '../../shared/tipos/index.ts'
import { ipReal, type Ambiente, type App } from './auth.ts'
import { config, origemApp } from './config.ts'
import type { Db } from './db.ts'
import { ErroHttp, traduzirErroBanco } from './erros.ts'

const PASTA_ROTAS = join(dirname(fileURLToPath(import.meta.url)), 'rotas')

interface ModuloRota {
  registrar(app: App): void
}

const modulosRotas: { nome: string; modulo: ModuloRota }[] = await Promise.all(
  readdirSync(PASTA_ROTAS)
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.d.ts'))
    .sort()
    .map(async (nome) => ({ nome, modulo: (await import(pathToFileURL(join(PASTA_ROTAS, nome)).href)) as ModuloRota })),
)
for (const { nome, modulo } of modulosRotas) {
  if (typeof modulo.registrar !== 'function') throw new Error(`src/rotas/${nome} não exporta registrar(app)`)
}

/** CSP exata da API.md §1 (produção, no HTML e na API). */
export const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com",
  'frame-src https://drive.google.com https://www.youtube-nocookie.com https://www.figma.com', "connect-src 'self'",
  "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ')

export const LIMITE_UPLOAD_CORPO = 10 * 1024 * 1024 + 64 * 1024
export const LIMITE_JSON = 1024 * 1024
const MUTACOES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const TRACE = /^[A-Za-z0-9-]{8,64}$/

/**
 * Caminho para o log (API.md §1): sem query; /a/*, /api/publico/*, /api/auth/convite* e /api/auth/redefinicao* saem
 * mascarados (token de link público e de acesso nunca vai ao log).
 */
export function caminhoParaLog(caminho: string): string {
  return caminho
    .replace(/^\/a\/.*/, '/a/***')
    .replace(/^\/api\/publico\/.*/, '/api/publico/***')
    .replace(/^\/api\/auth\/(convite|redefinicao).*/, '/api/auth/$1***')
}

/** Páginas e rotas com Referrer-Policy no-referrer (os tokens não podem vazar pelo Referer). */
function semReferer(caminho: string): boolean {
  return caminho.startsWith('/a/') || caminho.startsWith('/api/publico/') || caminho === '/convite' || caminho === '/redefinir'
}

function erroJson(c: Context, e: ErroHttp): Response {
  return c.json(e.corpo(), e.status as 400)
}

export function criarApp(db: Db): App {
  const app = new Hono<Ambiente>()

  // contexto: banco, ator anônimo (o exigirUsuario troca pelo usuário), IP real e trace; log mascarado
  app.use('*', async (c, next) => {
    c.set('db', db)
    c.set('ator', { tipo: 'cliente', usuario: null, papel: null, traceId: c.req.header(HEADER_TRACE) ?? null, ip: ipReal(c) })
    const inicio = performance.now()
    await next()
    if (config.log) {
      console.log(`${c.req.method} ${caminhoParaLog(c.req.path)} ${c.res.status} ${Math.round(performance.now() - inicio)}ms`
        + `${c.get('ator').traceId ? ` t=${c.get('ator').traceId}` : ''}`)
    }
  })

  // bodyLimit antes de qualquer parse: recusa pelo Content-Length sem ler o corpo
  const limiteUpload = bodyLimit({
    maxSize: LIMITE_UPLOAD_CORPO, onError: () => { throw new ErroHttp(413, 'arquivo_grande', 'O arquivo passa de 10 MB.') },
  })
  const limiteJson = bodyLimit({
    maxSize: LIMITE_JSON, onError: () => { throw new ErroHttp(413, 'corpo_grande', 'O conteúdo enviado é grande demais.') },
  })
  app.use('/api/*', (c, next) => (c.req.method === 'POST' && c.req.path === '/api/arquivos' ? limiteUpload(c, next) : limiteJson(c, next)))

  // cabeçalhos (API.md §1)
  app.use('*', async (c, next) => {
    await next()
    const caminho = c.req.path
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', semReferer(caminho) ? 'no-referrer' : 'same-origin')
    if (config.producao) c.header('Content-Security-Policy', CSP)
    if (caminho.startsWith('/api/publico/') || caminho.startsWith('/a/')) {
      c.header('X-Robots-Tag', 'noindex')
      c.header('Cache-Control', 'no-store')
    } else if (caminho.startsWith('/api/') && !c.res.headers.has('Cache-Control')) {
      c.header('Cache-Control', 'no-store')
    }
  })

  // anti-CSRF: toda mutação exige X-Trace-Id e Origin igual a APP_URL (inclusive login e página pública)
  app.use('/api/*', async (c, next) => {
    if (MUTACOES.has(c.req.method)) {
      const trace = c.req.header(HEADER_TRACE)
      const origem = c.req.header('origin')
      if (!trace || !TRACE.test(trace) || origem !== origemApp()) {
        throw new ErroHttp(403, 'csrf', 'Requisição recusada. Recarregue a página e tente de novo.')
      }
    }
    await next()
  })

  for (const { modulo } of modulosRotas) modulo.registrar(app)

  app.notFound((c) => (c.req.path.startsWith('/api/')
    ? erroJson(c, new ErroHttp(404, 'nao_encontrado', 'Rota não encontrada.'))
    : c.text('Página não encontrada.', 404)))

  app.onError((e, c) => {
    const traduzido = traduzirErroBanco(e)
    if (traduzido) return erroJson(c, traduzido)
    if (e instanceof HTTPException) {
      return erroJson(c, new ErroHttp(e.status, e.status === 413 ? 'corpo_grande' : 'validacao', e.message || 'Requisição inválida.'))
    }
    console.error(`erro interno em ${c.req.method} ${caminhoParaLog(c.req.path)} t=${c.get('ator')?.traceId ?? '-'}:`, e)
    return erroJson(c, new ErroHttp(500, 'interno', 'Algo deu errado. Tente de novo.'))
  })

  return app
}
