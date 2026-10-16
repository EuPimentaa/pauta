/** Cronômetro (ligar e parar) e "Lançar tempo" (API.md §4.15, F1). Listar, editar e excluir horas: §4.20 (núcleo). */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../servicos/modal-esquemas.ts'
import { iniciarCronometro, lancarTempo, pararMeuCronometro } from '../servicos/modal-tempo.ts'

export function registrar(app: App): void {
  app.post('/api/demandas/:id/cronometro', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => iniciarCronometro(db, c.req.param('id'), c.get('ator'))))
  })

  app.post('/api/cronometro/parar', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => pararMeuCronometro(db, c.get('ator'))))
  })

  app.post('/api/demandas/:id/apontamentos', exigirUsuario, async (c) => {
    const e = validar(esquema.criarApontamento, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => lancarTempo(db, c.req.param('id'), e, c.get('ator'))), 201)
  })
}
