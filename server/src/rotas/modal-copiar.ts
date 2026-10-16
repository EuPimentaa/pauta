/** "Copiar…" da demanda (API.md §4.15, F1). */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../servicos/modal-esquemas.ts'
import { copiarDemanda } from '../servicos/modal-copiar.ts'

export function registrar(app: App): void {
  app.post('/api/demandas/:id/copiar', exigirUsuario, async (c) => {
    const e = validar(esquema.copiarDemanda, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => copiarDemanda(db, c.req.param('id'), e, c.get('ator'))), 201)
  })
}
