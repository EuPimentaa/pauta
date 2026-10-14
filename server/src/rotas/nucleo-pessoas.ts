/** Pessoas (API.md §4.3) e equipes (§4.4): só o admin muda; qualquer usuário lista as equipes. */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { conflito } from '../erros.ts'
import * as esquema from '../esquemas.ts'
import { exigir } from '../servicos/permissoes.ts'
import {
  carregarUsuario, criarEquipe, criarPessoa, definirMembros, editarEquipe, editarPessoa, gerarLinkAcesso, listarEquipes,
  listarUsuarios,
} from '../servicos/pessoas.ts'

export function registrar(app: App): void {
  app.get('/api/pessoas', exigirUsuario, (c) => {
    exigir(c.get('ator'), 'pessoas')
    return c.json(listarUsuarios(c.get('db')))
  })

  app.post('/api/pessoas', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'pessoas')
    const e = validar(esquema.criarPessoa, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarPessoa(db, e, c.get('ator'))), 201)
  })

  app.patch('/api/pessoas/:id', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'pessoas')
    const e = validar(esquema.editarPessoa, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarPessoa(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.post('/api/pessoas/:id/convite', exigirUsuario, (c) => {
    exigir(c.get('ator'), 'pessoas')
    const db = c.get('db')
    return c.json(tx(db, () => {
      const u = carregarUsuario(db, c.req.param('id'))
      if (u.temSenha) throw conflito('Esta pessoa já definiu a senha. Gere uma redefinição.')
      if (!u.ativo) throw conflito('Esta pessoa está desativada.')
      return gerarLinkAcesso(db, u.id, 'convite', c.get('ator'))
    }))
  })

  app.post('/api/pessoas/:id/redefinicao', exigirUsuario, (c) => {
    exigir(c.get('ator'), 'pessoas')
    const db = c.get('db')
    return c.json(tx(db, () => {
      const u = carregarUsuario(db, c.req.param('id'))
      if (!u.ativo) throw conflito('Esta pessoa está desativada.')
      return gerarLinkAcesso(db, u.id, 'redefinicao', c.get('ator'))
    }))
  })

  app.get('/api/equipes', exigirUsuario, (c) => c.json(listarEquipes(c.get('db'))))

  app.post('/api/equipes', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'pessoas')
    const e = validar(esquema.criarEquipe, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarEquipe(db, e, c.get('ator'))), 201)
  })

  app.patch('/api/equipes/:id', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'pessoas')
    const e = validar(esquema.editarEquipe, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarEquipe(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.put('/api/equipes/:id/membros', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'pessoas')
    const e = validar(esquema.definirMembros, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => definirMembros(db, c.req.param('id'), e.membros, c.get('ator'))))
  })
}
