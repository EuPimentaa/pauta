/**
 * OAuth 2.1 do MCP fora de /api (F7, API.md §F.1 a §F.3): metadados em /.well-known (e o 404 do resto, que antes caía
 * no index.html), registro dinâmico, autorização, token, revogação e o 404 do resto de /oauth. Chamados pelo backend
 * da Anthropic (sem cookie, sem Origin do app, sem X-Trace-Id): sem anti-CSRF e sem CORS. Limite de corpo próprio
 * (64 KiB), `Cache-Control: no-store` em toda resposta e nenhum erro sai como veio (`descreverErro` no log).
 * MCP_ATIVO=0: 404 em /oauth/* e /.well-known/oauth-*.
 */
import type { Context, Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { setCookie } from 'hono/cookie'
import { COOKIE_PEDIDO_OAUTH, PRAZOS_OAUTH } from '../../../shared/tipos/index.ts'
import type { Ambiente, App } from '../auth.ts'
import { config } from '../config.ts'
import { descreverErro } from '../servicos/segredos.ts'
import {
  ErroOAuthHttp, iniciarAutorizacao, metadadosRecurso, metadadosServidor, registrarCliente,
} from '../servicos/oauth.ts'
import { revogarPorToken, trocarToken } from '../servicos/oauth-tokens.ts'

type C = Context<Ambiente>

export const LIMITE_CORPO_OAUTH = 64 * 1024

function semCache(c: C): void {
  c.header('Cache-Control', 'no-store')
  c.header('Pragma', 'no-cache')
}

function naoEncontrado(c: C): Response {
  semCache(c)
  return c.text('Não encontrado.', 404)
}

function erroOAuth(c: C, e: ErroOAuthHttp): Response {
  semCache(c)
  if (e.esperaSeg !== null) c.header('Retry-After', String(e.esperaSeg))
  return c.json(e.corpo(), e.status as 400)
}

/** Nenhum erro sai como veio: ErroOAuthHttp no formato da RFC; o resto vira server_error com o log mascarado. */
async function seguro(c: C, rotulo: string, fn: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ErroOAuthHttp) return erroOAuth(c, e)
    console.error(`${rotulo}: ${descreverErro(e)}`)
    return erroOAuth(c, new ErroOAuthHttp(500, 'server_error', 'Algo deu errado. Tente de novo.'))
  }
}

/** form-urlencoded (o /token e o /revogar). Outro tipo → null. */
async function lerFormulario(c: C): Promise<URLSearchParams | null> {
  const tipo = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (tipo !== 'application/x-www-form-urlencoded') return null
  return new URLSearchParams(await c.req.text())
}

const limiteOAuth = bodyLimit({
  maxSize: LIMITE_CORPO_OAUTH,
  onError: (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({ error: 'invalid_request', error_description: 'Corpo grande demais.' }, 413)
  },
})

export function registrar(app: App): void {
  // ─── /.well-known ───
  app.use('/.well-known/*', async (c, next: Next) => {
    if (!config.mcpAtivo && c.req.path.startsWith('/.well-known/oauth-')) return naoEncontrado(c)
    await next()
    c.header('Cache-Control', 'no-store')
  })
  const recurso = (c: C) => seguro(c, 'oauth metadados', () => c.json(metadadosRecurso()))
  app.get('/.well-known/oauth-protected-resource/mcp', recurso)
  app.get('/.well-known/oauth-protected-resource', recurso)
  app.get('/.well-known/oauth-authorization-server', (c) => seguro(c, 'oauth metadados', () => c.json(metadadosServidor())))
  app.all('/.well-known/*', (c) => naoEncontrado(c))

  // ─── /oauth ───
  app.use('/oauth/*', async (c, next: Next) => {
    if (!config.mcpAtivo) return naoEncontrado(c)
    await next()
    c.header('Cache-Control', 'no-store')
  })
  app.use('/oauth/*', limiteOAuth)

  app.post('/oauth/registrar', (c) => seguro(c, 'oauth registrar', async () => {
    let corpo: unknown
    try {
      corpo = JSON.parse(await c.req.text())
    } catch {
      throw new ErroOAuthHttp(400, 'invalid_client_metadata', 'O corpo precisa ser JSON.')
    }
    const saida = registrarCliente(c.get('db'), corpo, c.get('ator').ip)
    semCache(c)
    return c.json(saida, 201)
  }))

  app.get('/oauth/autorizar', (c) => seguro(c, 'oauth autorizar', () => {
    const r = iniciarAutorizacao(c.get('db'), c.req.query(), c.get('ator').ip)
    semCache(c)
    if (r.tipo === 'pagina') {
      if (r.esperaSeg) c.header('Retry-After', String(r.esperaSeg))
      return c.text(r.texto, r.status)
    }
    if (r.tipo === 'redirecionar') return c.redirect(r.url, 302)
    setCookie(c, config.producao ? COOKIE_PEDIDO_OAUTH.producao : COOKIE_PEDIDO_OAUTH.desenvolvimento, r.cookie, {
      httpOnly: true, sameSite: 'Lax', path: '/', secure: config.producao, maxAge: PRAZOS_OAUTH.pedidoMin * 60,
    })
    return c.redirect(`/autorizar?pedido=${encodeURIComponent(r.id)}`, 302)
  }))

  app.post('/oauth/token', (c) => seguro(c, 'oauth token', async () => {
    const form = await lerFormulario(c)
    if (!form) throw new ErroOAuthHttp(400, 'invalid_request', 'Use application/x-www-form-urlencoded.')
    const saida = trocarToken(c.get('db'), form)
    semCache(c)
    return c.json(saida)
  }))

  app.post('/oauth/revogar', (c) => seguro(c, 'oauth revogar', async () => {
    const form = await lerFormulario(c)
    if (form) revogarPorToken(c.get('db'), form.get('token') ?? '')
    semCache(c)
    return c.body(null, 200)
  }))

  app.all('/oauth/*', (c) => naoEncontrado(c))
}
