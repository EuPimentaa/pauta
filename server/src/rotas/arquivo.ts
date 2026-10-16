/**
 * Arquivo (API.md §4.19, F5): GET /api/arquivo para qualquer usuário. Restaurar e desmarcar a concluída usam as rotas
 * do núcleo (POST /api/demandas/:id/restaurar e /concluir).
 */
import { exigirUsuario, validar, type App } from '../auth.ts'
import { leitura } from '../db.ts'
import { listarArquivo } from '../servicos/cadastros-arquivo.ts'
import * as esquema from '../servicos/cadastros-esquemas.ts'

export function registrar(app: App): void {
  app.get('/api/arquivo', exigirUsuario, (c) => {
    const consulta = validar(esquema.listarArquivo, c.req.query())
    const db = c.get('db')
    return c.json(leitura(db, () => listarArquivo(db, consulta)))
  })
}
