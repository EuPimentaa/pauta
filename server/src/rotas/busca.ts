/** Busca de demandas (API.md §4.13, F4): GET /api/busca, a fonte Demandas da paleta Cmd+K. Qualquer pessoa. */
import { exigirUsuario, validar, type App } from '../auth.ts'
import { leitura } from '../db.ts'
import { buscarDemandas } from '../servicos/entrada-busca.ts'
import * as esquema from '../servicos/entrada-esquemas.ts'

export function registrar(app: App): void {
  app.get('/api/busca', exigirUsuario, (c) => {
    const consulta = validar(esquema.busca, c.req.query())
    const db = c.get('db')
    return c.json(leitura(db, () => buscarDemandas(db, consulta)))
  })
}
