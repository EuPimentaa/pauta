/**
 * Demandas (API.md §4.12): detalhe, criar, PATCH com If-Match, mover, concluir, membros, etiquetas, arquivar,
 * restaurar e excluir (anonimizar, admin).
 */
import { HEADER_IF_MATCH } from '../../../shared/tipos/index.ts'
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { conflito, validacao } from '../erros.ts'
import * as esquema from '../esquemas.ts'
import { concluir } from '../servicos/concluir.ts'
import {
  adicionarEtiqueta, adicionarMembro, arquivarDemanda, atualizarDemanda, carregarDetalhe, criarDemanda, demandaViva,
  excluirDemanda, origemDaProximaDesfeita, removerEtiqueta, removerMembro, restaurarDemanda,
} from '../servicos/demandas.ts'
import { mover } from '../servicos/mover.ts'
import { exigir, exigirCamposPermitidos } from '../servicos/permissoes.ts'

/** "3", "\"3\"" ou W/"3" → 3; sem header ou inválido → 400 validacao. */
function lerIfMatch(valor: string | undefined): number {
  const m = /^(?:W\/)?"?(\d+)"?$/.exec((valor ?? '').trim())
  if (!m) throw validacao('Mande o header If-Match com o rev da demanda.', { [HEADER_IF_MATCH]: 'obrigatório' })
  return Number(m[1])
}

function numero(valor: string): number {
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 1) throw validacao('Número de demanda inválido.', { numero: 'inteiro positivo' })
  return n
}

export function registrar(app: App): void {
  app.get('/api/demandas/:numero', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(carregarDetalhe(db, numero(c.req.param('numero')), c.get('ator')))
  })

  app.post('/api/demandas', exigirUsuario, async (c) => {
    const ator = c.get('ator')
    const bruto = await corpoJson(c)
    if (bruto && typeof bruto === 'object') exigirCamposPermitidos(ator, bruto, 'demanda')
    const e = validar(esquema.criarDemanda, bruto)
    const db = c.get('db')
    return c.json(tx(db, () => criarDemanda(db, e, ator)), 201)
  })

  app.patch('/api/demandas/:id', exigirUsuario, async (c) => {
    const ator = c.get('ator')
    const rev = lerIfMatch(c.req.header(HEADER_IF_MATCH))
    const bruto = await corpoJson(c)
    if (bruto && typeof bruto === 'object') exigirCamposPermitidos(ator, bruto, 'demanda')
    const e = validar(esquema.editarDemanda, bruto)
    const db = c.get('db')
    return c.json(tx(db, () => atualizarDemanda(db, c.req.param('id'), { ...e }, ator, { rev })))
  })

  app.post('/api/demandas/:id/mover', exigirUsuario, async (c) => {
    const e = validar(esquema.mover, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => mover(db, { ...e, demandaId: c.req.param('id'), ator: c.get('ator'), via: 'manual' })))
  })

  app.post('/api/demandas/:id/concluir', exigirUsuario, async (c) => {
    const e = validar(esquema.concluir, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => concluir(db, { demandaId: c.req.param('id'), ator: c.get('ator'), concluida: e.concluida, via: 'checkbox' })))
  })

  app.post('/api/demandas/:id/membros', exigirUsuario, async (c) => {
    const e = validar(esquema.adicionarMembro, await corpoJson(c))
    const db = c.get('db')
    return c.json({ demanda: tx(db, () => adicionarMembro(db, c.req.param('id'), e.usuarioId, c.get('ator'))) })
  })

  app.delete('/api/demandas/:id/membros/:usuarioId', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json({ demanda: tx(db, () => removerMembro(db, c.req.param('id'), c.req.param('usuarioId'), c.get('ator'))) })
  })

  app.post('/api/demandas/:id/etiquetas', exigirUsuario, async (c) => {
    const e = validar(esquema.adicionarEtiqueta, await corpoJson(c))
    const db = c.get('db')
    return c.json({ demanda: tx(db, () => adicionarEtiqueta(db, c.req.param('id'), e.etiquetaId, c.get('ator'))) })
  })

  app.delete('/api/demandas/:id/etiquetas/:etiquetaId', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json({ demanda: tx(db, () => removerEtiqueta(db, c.req.param('id'), c.req.param('etiquetaId'), c.get('ator'))) })
  })

  app.post('/api/demandas/:id/arquivar', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json({ demanda: tx(db, () => arquivarDemanda(db, c.req.param('id'), c.get('ator'))) })
  })

  app.post('/api/demandas/:id/restaurar', exigirUsuario, async (c) => {
    const e = validar(esquema.restaurar, await corpoJson(c))
    const db = c.get('db')
    return c.json({ demanda: tx(db, () => {
      const origem = origemDaProximaDesfeita(db, c.req.param('id'))
      if (origem !== null) throw conflito(`Esta é a próxima de uma repetição desfeita. Ela volta sozinha quando a #${origem} for concluída.`)
      return restaurarDemanda(db, c.req.param('id'), { colunaId: e.colunaId }, c.get('ator'))
    }) })
  })

  app.post('/api/demandas/:id/excluir', exigirUsuario, async (c) => {
    exigir(c.get('ator'), 'demanda.excluir')
    const e = validar(esquema.excluirDemanda, await corpoJson(c))
    const db = c.get('db')
    tx(db, () => {
      demandaViva(db, c.req.param('id'))
      excluirDemanda(db, c.req.param('id'), e.confirmarNumero, c.get('ator'))
    })
    return c.body(null, 204)
  })
}
