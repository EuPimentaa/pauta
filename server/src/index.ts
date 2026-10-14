import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const PORT = Number(process.env.PORT ?? 7300)

const app = new Hono()
app.get('/api/saude', (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`servidor em http://127.0.0.1:${info.port}`)
})
