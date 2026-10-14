/** GET /api/saude: público, para o health check do EasyPanel. */
import type { App } from '../auth.ts'
import { config } from '../config.ts'
import { um } from '../db.ts'

export function registrar(app: App): void {
  app.get('/api/saude', (c) => {
    um(c.get('db'), 'SELECT 1')
    return c.json({ ok: true, versao: config.versao })
  })
}
