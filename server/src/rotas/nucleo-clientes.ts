/**
 * Clientes (API.md §4.10, menos a trilha de aprovações, que é do F5). Criar: todos (a equipe só com sigla e nome);
 * editar, apelidos, responsáveis, contatos e links: `cliente.editar` (admin; atendimento da carteira ou sem AM).
 */
import type { Context } from 'hono'
import { corpoJson, exigirUsuario, validar, type Ambiente, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../esquemas.ts'
import {
  carregarClienteResumo, clientePorSigla, criarCliente, criarContato, criarLink, definirApelidos, definirResponsaveis,
  editarCliente, editarContato, editarLink, excluirLink, listarClientes,
} from '../servicos/clientes.ts'
import { exigir, exigirCamposPermitidos } from '../servicos/permissoes.ts'

/** Confere `cliente.editar` para o cliente da rota e devolve o id. */
function podeEditar(c: Context<Ambiente>): string {
  const cliente = carregarClienteResumo(c.get('db'), c.req.param('id')!)
  exigir(c.get('ator'), 'cliente.editar', { cliente })
  return cliente.id
}

export function registrar(app: App): void {
  app.get('/api/clientes', exigirUsuario, (c) => c.json(listarClientes(c.get('db'))))

  app.get('/api/clientes/:sigla', exigirUsuario, (c) => c.json(clientePorSigla(c.get('db'), c.req.param('sigla'))))

  app.post('/api/clientes', exigirUsuario, async (c) => {
    const ator = c.get('ator')
    exigir(ator, 'cliente.criar')
    const bruto = await corpoJson(c)
    if (bruto && typeof bruto === 'object') exigirCamposPermitidos(ator, bruto, 'cliente')
    const e = validar(esquema.criarCliente, bruto)
    const db = c.get('db')
    return c.json(tx(db, () => criarCliente(db, e, ator)), 201)
  })

  app.patch('/api/clientes/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarCliente, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarCliente(db, podeEditar(c), e, c.get('ator'))))
  })

  app.put('/api/clientes/:id/apelidos', exigirUsuario, async (c) => {
    const e = validar(esquema.definirApelidos, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => definirApelidos(db, podeEditar(c), e.apelidos, c.get('ator'))))
  })

  app.put('/api/clientes/:id/responsaveis', exigirUsuario, async (c) => {
    const e = validar(esquema.definirResponsaveis, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => definirResponsaveis(db, podeEditar(c), e.responsaveis, c.get('ator'))))
  })

  app.post('/api/clientes/:id/contatos', exigirUsuario, async (c) => {
    const e = validar(esquema.criarContato, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarContato(db, podeEditar(c), e, c.get('ator'))), 201)
  })

  app.patch('/api/clientes/:id/contatos/:contatoId', exigirUsuario, async (c) => {
    const e = validar(esquema.editarContato, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarContato(db, podeEditar(c), c.req.param('contatoId'), e, c.get('ator'))))
  })

  app.post('/api/clientes/:id/links', exigirUsuario, async (c) => {
    const e = validar(esquema.criarLink, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarLink(db, podeEditar(c), e, c.get('ator'))), 201)
  })

  app.patch('/api/clientes/:id/links/:linkId', exigirUsuario, async (c) => {
    const e = validar(esquema.editarLink, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarLink(db, podeEditar(c), c.req.param('linkId'), e, c.get('ator'))))
  })

  app.delete('/api/clientes/:id/links/:linkId', exigirUsuario, (c) => {
    const db = c.get('db')
    tx(db, () => excluirLink(db, podeEditar(c), c.req.param('linkId'), c.get('ator')))
    return c.body(null, 204)
  })
}
