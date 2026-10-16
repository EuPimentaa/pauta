/** Anexos de referência (API.md §4.15, F1). O upload em si é POST /api/arquivos (núcleo). */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../servicos/modal-esquemas.ts'
import { criarAnexo, editarAnexo, excluirAnexo } from '../servicos/modal-anexos.ts'

export function registrar(app: App): void {
  app.post('/api/demandas/:id/anexos', exigirUsuario, async (c) => {
    const e = validar(esquema.criarAnexo, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarAnexo(db, c.req.param('id'), e, c.get('ator'))), 201)
  })

  app.patch('/api/anexos/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarAnexo, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarAnexo(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.delete('/api/anexos/:id', exigirUsuario, (c) => {
    const db = c.get('db')
    tx(db, () => excluirAnexo(db, c.req.param('id'), c.get('ator')))
    return c.body(null, 204)
  })
}
