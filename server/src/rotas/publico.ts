/**
 * Página pública de aprovação (API.md §4.17, F2): sem sessão. Cabeçalhos no-store, noindex e no-referrer e o log
 * mascarado vêm do middleware global (app.ts) para todo /api/publico/*. Limites em memória: 30 por minuto por IP+token
 * em /api/publico/a/:token*, 300 por minuto por IP nos arquivos.
 */
import { HEADER_IDEMPOTENCIA } from '../../../shared/tipos/index.ts'
import { corpoJson, limite, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { ErroHttp, validacao } from '../erros.ts'
import { assinaturaValida, lerArquivo, respostaArquivo } from '../servicos/arquivos.ts'
import * as esquema from '../servicos/ciclo-esquemas.ts'
import { decidir, paginaAprovacao, registrarVisto } from '../servicos/ciclo-publico.ts'

export function registrar(app: App): void {
  const porToken = limite('publico-a', 30, 60)

  app.get('/api/publico/a/:token', porToken, (c) => c.json(paginaAprovacao(c.get('db'), c.req.param('token'))))

  app.post('/api/publico/a/:token/visto', porToken, (c) => {
    const db = c.get('db')
    tx(db, () => registrarVisto(db, c.req.param('token'), c.get('ator')))
    return c.body(null, 204)
  })

  app.post('/api/publico/a/:token/decisao', porToken, async (c) => {
    const bruta = c.req.header(HEADER_IDEMPOTENCIA)
    if (!bruta) throw validacao('Falta o Idempotency-Key.', { [HEADER_IDEMPOTENCIA]: 'obrigatório' })
    const chave = validar(esquema.chaveIdempotencia, bruta)
    const e = validar(esquema.decisaoPublica, await corpoJson(c))
    const db = c.get('db')
    const userAgent = (c.req.header('user-agent') ?? '').slice(0, 300) || null
    return c.json(tx(db, () => decidir(db, c.req.param('token'), chave, e, c.get('ator'), userAgent)))
  })

  app.get('/api/publico/arquivos/:id', limite('publico-arquivos', 300, 60), (c) => {
    const id = c.req.param('id')
    const exp = Number(c.req.query('exp'))
    const sig = c.req.query('sig') ?? ''
    if (!assinaturaValida(id, exp, sig)) throw new ErroHttp(403, 'sem_permissao', 'Este endereço de arquivo venceu. Recarregue a página.')
    const { info, caminho } = lerArquivo(c.get('db'), id)
    return respostaArquivo(info, caminho, { inline: c.req.query('inline') === '1' })
  })
}
