/** Trilha de aprovações do cliente (API.md §4.10, F5): qualquer usuário; inclusive as anuladas, mais novas primeiro. */
import { exigirUsuario, type App } from '../auth.ts'
import { trilhaDoCliente } from '../servicos/cadastros-trilha.ts'

export function registrar(app: App): void {
  app.get('/api/clientes/:id/aprovacoes', exigirUsuario, (c) => c.json(trilhaDoCliente(c.get('db'), c.req.param('id'))))
}
