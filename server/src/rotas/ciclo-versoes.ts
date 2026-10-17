/**
 * Versões (API.md §4.16, F2): entregar (membros, AM, atendimento, admin), editar a nota e acrescentar itens (autor,
 * atendimento, admin; só antes do envio) e o teste de Drive público (da versão, gravando, e de um link avulso).
 */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { adicionarItens, carregarVersaoSemItens, editarVersao, entregarVersao, testarDriveDaVersao } from '../servicos/ciclo.ts'
import * as esquema from '../servicos/ciclo-esquemas.ts'
import { testarLinkDrive } from '../servicos/drive.ts'

export function registrar(app: App): void {
  app.post('/api/demandas/:id/versoes', exigirUsuario, async (c) => {
    const e = validar(esquema.entregarVersao, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => entregarVersao(db, c.req.param('id'), e, c.get('ator'))), 201)
  })

  app.patch('/api/versoes/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarVersao, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarVersao(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.post('/api/versoes/:id/itens', exigirUsuario, async (c) => {
    const e = validar(esquema.adicionarItens, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => adicionarItens(db, c.req.param('id'), e.itens, c.get('ator'))), 201)
  })

  app.post('/api/versoes/:id/testar-drive', exigirUsuario, async (c) => {
    const db = c.get('db')
    carregarVersaoSemItens(db, c.req.param('id'))
    return c.json(await testarDriveDaVersao(db, c.req.param('id'), c.get('ator')))
  })

  app.post('/api/drive/testar', exigirUsuario, async (c) => {
    const e = validar(esquema.testarDrive, await corpoJson(c))
    return c.json(await testarLinkDrive(e.url))
  })
}
