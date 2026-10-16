/**
 * Modelos de demanda (API.md §4.9, F4): listar (com `inativos=1` para a tela de modelos), criar, editar ("excluir" =
 * desativar) e "Revisei os modelos" dos Primeiros passos (admin).
 */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { leitura, tx } from '../db.ts'
import * as esquema from '../servicos/entrada-esquemas.ts'
import { criarModelo, editarModelo, listarModelos, marcarRevisados } from '../servicos/entrada-modelos.ts'

export function registrar(app: App): void {
  app.get('/api/modelos-demanda', exigirUsuario, (c) => {
    const db = c.get('db')
    const inativos = ['1', 'true'].includes(c.req.query('inativos') ?? '')
    return c.json(leitura(db, () => listarModelos(db, inativos)))
  })

  app.post('/api/modelos-demanda/revisados', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => marcarRevisados(db, c.get('ator'))))
  })

  app.post('/api/modelos-demanda', exigirUsuario, async (c) => {
    const e = validar(esquema.criarModelo, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarModelo(db, e, c.get('ator'))), 201)
  })

  app.patch('/api/modelos-demanda/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarModelo, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarModelo(db, c.req.param('id'), e, c.get('ator'))))
  })
}
