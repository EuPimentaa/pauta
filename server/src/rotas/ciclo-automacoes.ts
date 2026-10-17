/** Automações do quadro (API.md §4.8, F2): PUT e DELETE de cada gatilho (admin e atendimento). */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../servicos/ciclo-esquemas.ts'
import { definirAutomacao, excluirAutomacao } from '../servicos/ciclo-automacoes.ts'

export function registrar(app: App): void {
  app.put('/api/quadros/:id/automacoes/:gatilho', exigirUsuario, async (c) => {
    const e = validar(esquema.definirAutomacao, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => definirAutomacao(db, c.req.param('id'), c.req.param('gatilho'), e, c.get('ator'))))
  })

  app.delete('/api/quadros/:id/automacoes/:gatilho', exigirUsuario, (c) => {
    const db = c.get('db')
    tx(db, () => excluirAutomacao(db, c.req.param('id'), c.req.param('gatilho'), c.get('ator')))
    return c.body(null, 204)
  })
}
