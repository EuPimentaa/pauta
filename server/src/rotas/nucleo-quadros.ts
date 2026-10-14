/**
 * Quadros (API.md §4.5), colunas (§4.6) e etiquetas (§4.7). Quadro: só o admin cria, copia, edita, arquiva,
 * restaura e exclui; colunas e etiquetas: qualquer usuário; estrela e seguir: para si.
 */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../esquemas.ts'
import {
  arquivarCards, arquivarColuna, criarColuna, editarColuna, moverCards, ordenarColuna, restaurarColuna,
} from '../servicos/colunas.ts'
import { criarEtiqueta, editarEtiqueta, excluirEtiqueta } from '../servicos/etiquetas.ts'
import { exigir } from '../servicos/permissoes.ts'
import {
  arquivarQuadro, copiarQuadro, criarQuadro, definirFavorito, definirSeguir, editarQuadro, excluirQuadro, listarQuadros,
  quadroCompleto, restaurarQuadro,
} from '../servicos/quadros.ts'

export function registrar(app: App): void {
  // ─────────── quadros ───────────
  app.get('/api/quadros', exigirUsuario, (c) => {
    const arquivados = ['1', 'true'].includes(c.req.query('arquivados') ?? '')
    return c.json(listarQuadros(c.get('db'), arquivados))
  })

  app.get('/api/quadros/:id', exigirUsuario, (c) => c.json(quadroCompleto(c.get('db'), c.req.param('id'))))

  app.post('/api/quadros', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'quadro.administrar')
    const e = validar(esquema.criarQuadro, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarQuadro(db, e, c.get('ator'))), 201)
  })

  app.post('/api/quadros/:id/copiar', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'quadro.administrar')
    const e = validar(esquema.copiarQuadro, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => copiarQuadro(db, c.req.param('id'), e, c.get('ator'))), 201)
  })

  app.patch('/api/quadros/:id', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'quadro.administrar')
    const e = validar(esquema.editarQuadro, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarQuadro(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.post('/api/quadros/:id/arquivar', exigirUsuario, (c) => {
    exigir(c.get('ator'), 'quadro.administrar')
    const db = c.get('db')
    return c.json(tx(db, () => arquivarQuadro(db, c.req.param('id'), c.get('ator'))))
  })

  app.post('/api/quadros/:id/restaurar', exigirUsuario, (c) => {
    exigir(c.get('ator'), 'quadro.administrar')
    const db = c.get('db')
    return c.json(tx(db, () => restaurarQuadro(db, c.req.param('id'), c.get('ator'))))
  })

  app.delete('/api/quadros/:id', exigirUsuario, (c) => {
    exigir(c.get('ator'), 'quadro.administrar')
    const db = c.get('db')
    tx(db, () => excluirQuadro(db, c.req.param('id'), c.get('ator')))
    return c.body(null, 204)
  })

  app.put('/api/quadros/:id/favorito', exigirUsuario, async (c) => {
    const e = validar(esquema.favorito, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => definirFavorito(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.put('/api/quadros/:id/seguir', exigirUsuario, async (c) => {
    const e = validar(esquema.seguir, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => definirSeguir(db, c.req.param('id'), e.seguindo, c.get('ator'))))
  })

  // ─────────── colunas ───────────
  app.post('/api/quadros/:id/colunas', exigirUsuario, async (c) => {
    const e = validar(esquema.criarColuna, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarColuna(db, c.req.param('id'), e, c.get('ator'))), 201)
  })

  app.patch('/api/colunas/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarColuna, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarColuna(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.post('/api/colunas/:id/arquivar', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => arquivarColuna(db, c.req.param('id'), c.get('ator'))))
  })

  app.post('/api/colunas/:id/restaurar', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => restaurarColuna(db, c.req.param('id'), c.get('ator'))))
  })

  app.post('/api/colunas/:id/mover-cards', exigirUsuario, async (c) => {
    const e = validar(esquema.moverCards, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => moverCards(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.post('/api/colunas/:id/arquivar-cards', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => arquivarCards(db, c.req.param('id'), c.get('ator'))))
  })

  app.post('/api/colunas/:id/ordenar', exigirUsuario, async (c) => {
    const e = validar(esquema.ordenarColuna, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => ordenarColuna(db, c.req.param('id'), e.por, c.get('ator'))))
  })

  // ─────────── etiquetas ───────────
  app.post('/api/quadros/:id/etiquetas', exigirUsuario, async (c) => {
    const e = validar(esquema.criarEtiqueta, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarEtiqueta(db, c.req.param('id'), e, c.get('ator'))), 201)
  })

  app.patch('/api/etiquetas/:id', exigirUsuario, async (c) => {
    const e = validar(esquema.editarEtiqueta, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => editarEtiqueta(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.delete('/api/etiquetas/:id', exigirUsuario, (c) => {
    const db = c.get('db')
    tx(db, () => excluirEtiqueta(db, c.req.param('id'), c.get('ator')))
    return c.body(null, 204)
  })
}
