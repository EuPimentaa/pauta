/** Comentários e histórico da demanda (API.md §4.15, F1). */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../servicos/modal-esquemas.ts'
import { criarComentario, editarComentario, excluirComentario, listarComentarios } from '../servicos/modal-comentarios.ts'
import { listarHistorico } from '../servicos/modal-historico.ts'

export function registrar(app: App): void {
  app.get('/api/demandas/:id/comentarios', exigirUsuario, (c) => c.json(listarComentarios(c.get('db'), c.req.param('id'))))

  app.get('/api/demandas/:id/historico', exigirUsuario, (c) => {
    const consulta = validar(esquema.listarHistorico, c.req.query())
    return c.json(listarHistorico(c.get('db'), c.req.param('id'), consulta, c.get('ator')))
  })

  app.post('/api/demandas/:id/comentarios', exigirUsuario, async (c) => {
    const e = validar(esquema.criarComentario, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarComentario(db, c.req.param('id'), e, c.get('ator'))), 201)
  })

  app.patch('/api/comentarios/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarComentario, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarComentario(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.delete('/api/comentarios/:id', exigirUsuario, (c) => {
    const db = c.get('db')
    tx(db, () => excluirComentario(db, c.req.param('id'), c.get('ator')))
    return c.body(null, 204)
  })
}
