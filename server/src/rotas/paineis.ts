/** Início, Agenda e notificações (API.md §4.18, F3). Qualquer usuário com sessão; cada um vê só o que é seu. */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { montarAgenda, montarInicio } from '../servicos/paineis.ts'
import { listarNotificacoes, marcarLidas } from '../servicos/paineis-notificacoes.ts'
import * as esquema from '../servicos/paineis-esquemas.ts'

/** Lista que pode vir repetida na consulta (`quadroIds=a&quadroIds=b`) ou separada por vírgula. */
function lista(valores: string[] | undefined): string[] | undefined {
  if (!valores) return undefined
  const itens = valores.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  return itens.length > 0 ? itens : undefined
}

export function registrar(app: App): void {
  app.get('/api/inicio', exigirUsuario, (c) => c.json(montarInicio(c.get('db'), c.get('ator'))))

  app.get('/api/agenda', exigirUsuario, (c) => {
    const consulta = validar(esquema.consultaAgenda, {
      ...c.req.query(),
      quadroIds: lista(c.req.queries('quadroIds')),
      campos: lista(c.req.queries('campos')),
    })
    return c.json(montarAgenda(c.get('db'), consulta, c.get('ator')))
  })

  app.get('/api/notificacoes', exigirUsuario, (c) => {
    const consulta = validar(esquema.consultaNotificacoes, c.req.query())
    return c.json(listarNotificacoes(c.get('db'), c.get('ator').usuario!.id, consulta))
  })

  app.post('/api/notificacoes/lidas', exigirUsuario, async (c) => {
    const e = validar(esquema.marcarLidas, await corpoJson(c))
    const db = c.get('db')
    tx(db, () => marcarLidas(db, c.get('ator'), e))
    return c.body(null, 204)
  })
}
