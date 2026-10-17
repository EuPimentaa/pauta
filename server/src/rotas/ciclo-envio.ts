/**
 * Enviar ao cliente, texto para WhatsApp e links públicos da demanda (API.md §4.16, F2; atendimento e admin).
 * O envio por link testa o Drive antes da transação (o serviço busca na rede e depois grava).
 */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { tx } from '../db.ts'
import * as esquema from '../servicos/ciclo-esquemas.ts'
import { enviarAoCliente, linksDaDemanda, revogarLink, textoParaWhatsapp } from '../servicos/ciclo-envio.ts'

export function registrar(app: App): void {
  app.post('/api/demandas/:id/enviar', exigirUsuario, async (c) => {
    const e = validar(esquema.enviar, await corpoJson(c))
    return c.json(await enviarAoCliente(c.get('db'), c.req.param('id'), e, c.get('ator')))
  })

  app.get('/api/demandas/:id/whatsapp', exigirUsuario, (c) => {
    const { modelo } = validar(esquema.modeloWhatsapp, { modelo: c.req.query('modelo') ?? 'envio' })
    const db = c.get('db')
    return c.json(tx(db, () => textoParaWhatsapp(db, c.req.param('id'), modelo, c.get('ator'))))
  })

  // quem recebe o endereço de um link ativo fica no histórico (link.exibido): por isso a leitura grava
  app.get('/api/demandas/:id/links', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => linksDaDemanda(db, c.req.param('id'), c.get('ator'))))
  })

  app.post('/api/links-publicos/:id/revogar', exigirUsuario, (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => revogarLink(db, c.req.param('id'), c.get('ator'))))
  })
}
