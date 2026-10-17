/**
 * Página pública de aprovação (API.md §4.17, F2): sem sessão. Cabeçalhos no-store, noindex e no-referrer e o log
 * mascarado vêm do middleware global (app.ts) para todo /api/publico/*. Limites em memória: 30 por minuto por IP+token
 * em /api/publico/a/:token*, 300 por minuto por IP nos arquivos.
 */
import { HEADER_IDEMPOTENCIA } from '../../../shared/tipos/index.ts'
import { corpoJson, limite, sessaoDaRequisicao, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { ErroHttp, validacao } from '../erros.ts'
import { assinaturaValida, lerArquivo, respostaArquivo } from '../servicos/arquivos.ts'
import * as esquema from '../servicos/ciclo-esquemas.ts'
import {
  TEXTO_ARQUIVO_VENCIDO, conferirArquivoDoLink, decidir, paginaAprovacao, registrarVisto,
} from '../servicos/ciclo-publico.ts'

export function registrar(app: App): void {
  const porToken = limite('publico-a', 30, 60)

  app.get('/api/publico/a/:token', porToken, (c) => c.json(paginaAprovacao(c.get('db'), c.req.param('token'))))

  // sessão interna válida no cookie (atendimento no "Ver como o cliente", o link copiado): a visita não conta e a decisão
  // responde 403 previa_interna; a página mostra a faixa "Prévia" pela dica de sessão
  app.post('/api/publico/a/:token/visto', porToken, (c) => {
    const db = c.get('db')
    const previaInterna = !!sessaoDaRequisicao(c)
    tx(db, () => registrarVisto(db, c.req.param('token'), c.get('ator'), { previaInterna }))
    return c.body(null, 204)
  })

  app.post('/api/publico/a/:token/decisao', porToken, async (c) => {
    const bruta = c.req.header(HEADER_IDEMPOTENCIA)
    if (!bruta) throw validacao('Falta o Idempotency-Key.', { [HEADER_IDEMPOTENCIA]: 'obrigatório' })
    const chave = validar(esquema.chaveIdempotencia, bruta)
    const e = validar(esquema.decisaoPublica, await corpoJson(c))
    const db = c.get('db')
    const userAgent = (c.req.header('user-agent') ?? '').slice(0, 300) || null
    const previaInterna = !!sessaoDaRequisicao(c)
    return c.json(tx(db, () => decidir(db, c.req.param('token'), chave, e, c.get('ator'), userAgent, { previaInterna })))
  })

  // a assinatura cobre o link, o arquivo e a validade; o link precisa seguir ativo e conter o arquivo
  app.get('/api/publico/arquivos/:id', limite('publico-arquivos', 300, 60), (c) => {
    const id = c.req.param('id')
    const linkId = c.req.query('l') ?? ''
    const exp = Number(c.req.query('exp'))
    const sig = c.req.query('sig') ?? ''
    if (!assinaturaValida(linkId, id, exp, sig)) throw new ErroHttp(403, 'sem_permissao', TEXTO_ARQUIVO_VENCIDO)
    const db = c.get('db')
    conferirArquivoDoLink(db, linkId, id)
    const { info, caminho } = lerArquivo(db, id)
    return respostaArquivo(info, caminho, { inline: c.req.query('inline') === '1' })
  })
}
