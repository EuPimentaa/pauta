/**
 * Configuração (API.md §4.11, F5): feriados (GET qualquer usuário; POST e DELETE admin) e parâmetros da aplicação
 * (GET qualquer usuário; PATCH admin). Papel decidido só por servicos/permissoes.ts (`config`).
 */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { validacao } from '../erros.ts'
import { ehDataLocal } from '../../../shared/logica/datas.ts'
import { configSaida, criarFeriado, editarConfig, excluirFeriado, listarFeriados } from '../servicos/cadastros-config.ts'
import * as esquema from '../servicos/cadastros-esquemas.ts'
import { exigir } from '../servicos/permissoes.ts'

export function registrar(app: App): void {
  app.get('/api/config/feriados', exigirUsuario, (c) => {
    const { ano } = validar(esquema.consultaFeriados, c.req.query())
    return c.json(listarFeriados(c.get('db'), ano))
  })

  app.post('/api/config/feriados', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'config')
    const e = validar(esquema.criarFeriado, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarFeriado(db, e, c.get('ator'))), 201)
  })

  app.delete('/api/config/feriados/:data', exigirUsuario, (c) => {
    exigir(c.get('ator'), 'config')
    const data = c.req.param('data')
    if (!ehDataLocal(data)) throw validacao('Data inválida.', { data: 'use AAAA-MM-DD' })
    const db = c.get('db')
    tx(db, () => excluirFeriado(db, data, c.get('ator')))
    return c.body(null, 204)
  })

  app.get('/api/config/app', exigirUsuario, (c) => c.json(configSaida(c.get('db'))))

  app.patch('/api/config/app', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'config')
    const e = validar(esquema.editarConfigApp, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarConfig(db, e, c.get('ator'))))
  })
}
