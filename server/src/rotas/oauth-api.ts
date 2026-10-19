/**
 * A tela de consentimento e as Conexões (F7, API.md §F.3 e §F.4), dentro de /api: sessão por cookie e o anti-CSRF de
 * sempre, mais o cookie do pedido (só o navegador que abriu /oauth/autorizar vê e decide). Nenhum erro que não seja
 * ErroHttp sai como veio: vira 500 `interno` com o log mascarado. MCP_ATIVO=0: 404 em /api/oauth/*; Conexões continua.
 */
import type { Context } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import { z } from 'zod'
import { COOKIE_PEDIDO_OAUTH, type DecisaoAutorizacaoEntrada, type ListarConexoesConsulta } from '../../../shared/tipos/index.ts'
import { corpoJson, exigirUsuario, validar, type Ambiente, type App } from '../auth.ts'
import { config } from '../config.ts'
import { ErroHttp, naoEncontrado, traduzirErroBanco } from '../erros.ts'
import { decidirPedido, lerPedido, listarConexoes, revogarConexaoPelaTela } from '../servicos/oauth.ts'
import { descreverErro } from '../servicos/segredos.ts'

type C = Context<Ambiente>

const decisao: z.ZodType<DecisaoAutorizacaoEntrada> = z.object({ permitir: z.boolean(), substituir: z.boolean().optional() })
const consultaConexoes: z.ZodType<ListarConexoesConsulta> = z.object({
  todas: z.enum(['1', 'true', '0', 'false']).optional().transform((v) => v === '1' || v === 'true'),
  incluirRevogadas: z.enum(['1', 'true', '0', 'false']).optional().transform((v) => v === '1' || v === 'true'),
})

function nomeCookiePedido(): string {
  return config.producao ? COOKIE_PEDIDO_OAUTH.producao : COOKIE_PEDIDO_OAUTH.desenvolvimento
}

/** ErroHttp segue o caminho de sempre (o onError do app); o resto vira 500 interno sem a mensagem original. */
async function seguro(c: C, rotulo: string, fn: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    const traduzido = traduzirErroBanco(e)
    if (traduzido) throw traduzido
    console.error(`${rotulo} t=${c.get('ator').traceId ?? '-'}: ${descreverErro(e)}`)
    throw new ErroHttp(500, 'interno', 'Algo deu errado. Tente de novo.')
  }
}

export function registrar(app: App): void {
  app.use('/api/oauth/*', async (c, next) => {
    if (!config.mcpAtivo) throw naoEncontrado('Rota não encontrada.')
    await next()
  })

  app.get('/api/oauth/pedidos/:id', exigirUsuario, (c) => seguro(c, 'oauth pedido', () =>
    c.json(lerPedido(c.get('db'), c.req.param('id'), getCookie(c, nomeCookiePedido()), c.get('ator')))))

  app.post('/api/oauth/pedidos/:id/decisao', exigirUsuario, (c) => seguro(c, 'oauth decisao', async () => {
    const e = validar(decisao, await corpoJson(c))
    const saida = decidirPedido(c.get('db'), c.req.param('id'), getCookie(c, nomeCookiePedido()), c.get('ator'), e)
    // o pedido acabou: o cookie dele também (é HttpOnly; a tela não consegue apagar)
    deleteCookie(c, nomeCookiePedido(), { path: '/', secure: config.producao })
    return c.json(saida)
  }))

  app.get('/api/conexoes', exigirUsuario, (c) => seguro(c, 'conexoes', () =>
    c.json(listarConexoes(c.get('db'), c.get('ator'), validar(consultaConexoes, c.req.query())))))

  app.post('/api/conexoes/:id/revogar', exigirUsuario, (c) => seguro(c, 'conexoes revogar', () =>
    c.json(revogarConexaoPelaTela(c.get('db'), c.req.param('id'), c.get('ator')))))
}
