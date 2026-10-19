/**
 * POST /mcp (F7, API.md §F.5): Streamable HTTP sem estado, fora de /api (o backend da Anthropic não manda cookie,
 * Origin do app nem X-Trace-Id). Nesta ordem: MCP_ATIVO=0 → 404; outro método → 405 `Allow: POST`; corpo acima de
 * 1 MiB → 413; `Origin` presente e fora da lista → 403 (o valor recusado vai ao log, mascarado); bearer ausente ou
 * inválido → 401 com `WWW-Authenticate`; o resto vai ao adaptador do protocolo (servicos/mcp.ts). Sempre
 * `Cache-Control: no-store`, nunca CORS, nunca `Mcp-Session-Id`, nunca o index.html.
 */
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { ORIGENS_CLAUDE } from '../../../shared/tipos/index.ts'
import { umaLinha } from '../../../shared/logica/mcp-texto.ts'
import type { Ambiente, App } from '../auth.ts'
import { config, origemApp } from '../config.ts'
import { responderMcp } from '../servicos/mcp.ts'
import { desafioBearer } from '../servicos/oauth.ts'
import { conferirBearer } from '../servicos/oauth-tokens.ts'
import { descreverErro, mascararSegredos } from '../servicos/segredos.ts'

type C = Context<Ambiente>

export const LIMITE_CORPO_MCP = 1024 * 1024

/** Origins aceitos: o do APP_URL, os do Claude e os de MCP_ORIGENS_EXTRAS (ausente também passa). */
export function origemAceita(origem: string | undefined): boolean {
  if (origem === undefined) return true
  return origem === origemApp() || (ORIGENS_CLAUDE as readonly string[]).includes(origem) || config.mcpOrigensExtras.includes(origem)
}

const limiteMcp = bodyLimit({
  maxSize: LIMITE_CORPO_MCP,
  onError: (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Corpo grande demais.' } }, 413)
  },
})

function naoAutorizado(c: C, tokenInvalido: boolean): Response {
  c.header('WWW-Authenticate', desafioBearer(tokenInvalido))
  return c.json(tokenInvalido
    ? { error: 'invalid_token', error_description: 'Token inválido, vencido ou revogado.' }
    : { error: 'unauthorized', error_description: 'Conecte o Claude ao Pauta.' }, 401)
}

export function registrar(app: App): void {
  app.use('/mcp', async (c, next) => {
    if (!config.mcpAtivo) {
      c.header('Cache-Control', 'no-store')
      return c.text('Não encontrado.', 404)
    }
    await next()
    c.header('Cache-Control', 'no-store')
  })
  app.use('/mcp', limiteMcp)

  app.all('/mcp', async (c) => {
    c.header('Cache-Control', 'no-store')
    if (c.req.method !== 'POST') {
      c.header('Allow', 'POST')
      return c.text('Use POST.', 405)
    }
    try {
      const origem = c.req.header('origin')
      if (!origemAceita(origem)) {
        console.warn(`mcp origem recusada: ${mascararSegredos(umaLinha(origem, 120))}`)
        return c.text('Origem não permitida.', 403)
      }
      const db = c.get('db')
      const conexao = conferirBearer(db, c.req.header('authorization'))
      if (conexao.tipo !== 'ok') return naoAutorizado(c, conexao.tipo === 'invalido')
      const r = await responderMcp(db, { usuario: conexao.usuario, concessaoId: conexao.concessaoId, ip: c.get('ator').ip },
        await c.req.text(), c.req.header('mcp-protocol-version'))
      if (r.status === 202 || !r.corpo) return c.body(null, 202)
      return c.json(r.corpo, r.status)
    } catch (e) {
      console.error(`mcp: ${descreverErro(e)}`)
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Algo deu errado. Tente de novo.' } }, 500)
    }
  })

  // /mcp/qualquer-coisa nunca cai no index.html
  app.all('/mcp/*', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.text('Não encontrado.', 404)
  })
}
