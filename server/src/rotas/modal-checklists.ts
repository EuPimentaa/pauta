/** Checklists e itens (API.md §4.15, F1). */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../servicos/modal-esquemas.ts'
import {
  criarChecklist, criarItens, editarChecklist, editarItem, excluirChecklist, excluirItem,
} from '../servicos/modal-checklists.ts'

export function registrar(app: App): void {
  app.post('/api/demandas/:id/checklists', exigirUsuario, async (c) => {
    const e = validar(esquema.criarChecklist, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarChecklist(db, c.req.param('id'), e, c.get('ator'))), 201)
  })

  app.patch('/api/checklists/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarChecklist, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarChecklist(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.delete('/api/checklists/:id', exigirUsuario, (c) => {
    const db = c.get('db')
    tx(db, () => excluirChecklist(db, c.req.param('id'), c.get('ator')))
    return c.body(null, 204)
  })

  app.post('/api/checklists/:id/itens', exigirUsuario, async (c) => {
    const e = validar(esquema.criarItens, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarItens(db, c.req.param('id'), e, c.get('ator'))), 201)
  })

  app.patch('/api/checklist-itens/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarItem, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarItem(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.delete('/api/checklist-itens/:id', exigirUsuario, (c) => {
    const db = c.get('db')
    tx(db, () => excluirItem(db, c.req.param('id'), c.get('ator')))
    return c.body(null, 204)
  })
}
