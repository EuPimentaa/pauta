/** Horas (API.md §4.20): listar (com os totais por papel), editar e excluir lançamentos. */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../esquemas.ts'
import { editarApontamento, excluirApontamento, listarApontamentos } from '../servicos/horas.ts'

export function registrar(app: App): void {
  app.get('/api/apontamentos', exigirUsuario, (c) => {
    const consulta = validar(esquema.listarApontamentos, c.req.query())
    return c.json(listarApontamentos(c.get('db'), consulta, c.get('ator')))
  })

  app.patch('/api/apontamentos/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarApontamento, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarApontamento(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.delete('/api/apontamentos/:id', exigirUsuario, (c) => {
    const db = c.get('db')
    tx(db, () => excluirApontamento(db, c.req.param('id'), c.get('ator')))
    return c.body(null, 204)
  })
}
