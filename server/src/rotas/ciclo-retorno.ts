/**
 * Retorno do cliente e rodadas (API.md §4.16, F2; atendimento e admin): Registrar retorno (Shift+R), Aprovado pelo
 * WhatsApp, anular a aprovação (o Desfazer), Pedir ajuste interno e marcar a rodada como extra.
 */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { ajusteInterno, anularAprovacao, marcarExtra, registrarRetorno } from '../servicos/ciclo.ts'
import * as esquema from '../servicos/ciclo-esquemas.ts'

export function registrar(app: App): void {
  app.post('/api/demandas/:id/retorno', exigirUsuario, async (c) => {
    const e = validar(esquema.registrarRetorno, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => registrarRetorno(db, { ...e, demandaId: c.req.param('id'), ator: c.get('ator'), via: 'manual' })))
  })

  app.post('/api/demandas/:id/aprovado-whatsapp', exigirUsuario, async (c) => {
    const e = validar(esquema.aprovadoWhatsapp, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => registrarRetorno(db, {
      demandaId: c.req.param('id'), ator: c.get('ator'), via: 'manual', decisao: 'aprovado', canal: 'whatsapp',
      versaoId: e.versaoId, contatoId: e.contatoId,
    })))
  })

  app.post('/api/aprovacoes/:id/anular', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => anularAprovacao(db, c.req.param('id'), c.get('ator'))))
  })

  app.post('/api/demandas/:id/ajuste-interno', exigirUsuario, async (c) => {
    const e = validar(esquema.ajusteInterno, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => ajusteInterno(db, c.req.param('id'), e, c.get('ator'))))
  })

  app.post('/api/rodadas/:id/extra', exigirUsuario, async (c) => {
    const e = validar(esquema.marcarExtra, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => marcarExtra(db, c.req.param('id'), e.extra, c.get('ator'))))
  })
}
