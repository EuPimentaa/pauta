/**
 * Entrada (API.md §4.13, F4): criação rápida no rodapé da coluna (prévia e criar) e "Colar do WhatsApp" (analisar).
 * Qualquer pessoa. A Nova demanda cria por POST /api/demandas (núcleo), com origem 'whatsapp' quando veio do colar.
 */
import { corpoJson, exigirUsuario, validar, type App } from '../auth.ts'
import { leitura, tx } from '../db.ts'
import { analisarTexto, criarRapida, previaRapida } from '../servicos/entrada.ts'
import * as esquema from '../servicos/entrada-esquemas.ts'

export function registrar(app: App): void {
  app.post('/api/demandas/rapida/previa', exigirUsuario, async (c) => {
    const e = validar(esquema.criarRapida, await corpoJson(c))
    const db = c.get('db')
    return c.json(leitura(db, () => previaRapida(db, e)))
  })

  app.post('/api/demandas/rapida', exigirUsuario, async (c) => {
    const e = validar(esquema.criarRapida, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => criarRapida(db, e, c.get('ator'))), 201)
  })

  app.post('/api/entrada/analisar', exigirUsuario, async (c) => {
    const e = validar(esquema.analisarTexto, await corpoJson(c))
    const db = c.get('db')
    return c.json(leitura(db, () => analisarTexto(db, e)))
  })
}
