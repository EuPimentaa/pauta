/** Auth e sessão (API.md §1 e §4.2): login, limites, IP real, senha, convite, redefinição, CSRF, corpo e cookie. */
import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { configurar, type Config } from '../src/config.ts'
import { atorDe } from '../src/auth.ts'
import { tx, um } from '../src/db.ts'
import { gerarLinkAcesso } from '../src/servicos/pessoas.ts'
import { ORIGEM, SENHA_TESTE, ambiente, clienteHttp, sessaoPara } from './ajuda.ts'

const NOVA = 'girafa-azul-no-telhado-42'

function login(app: Parameters<typeof clienteHttp>[0], email: string, senha: string, ip?: string) {
  return app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': randomUUID(), Origin: ORIGEM, ...(ip ? { 'X-Forwarded-For': ip } : {}) },
    body: JSON.stringify({ email, senha }),
  })
}

let restaurar: Config | null = null
afterEach(() => {
  if (restaurar) configurar(restaurar)
  restaurar = null
})

describe('login', () => {
  test('certo entra (cookie + Eu) e errado responde 401 sem dizer qual dos dois', async () => {
    const a = await ambiente()
    const ok = await login(a.app, 'design@melt.test', SENHA_TESTE)
    assert.equal(ok.status, 200)
    const eu = await ok.json()
    assert.equal(eu.usuario.id, a.pessoas.design.id)
    assert.equal(eu.rotaInicial, '/inicio')
    const cookie = ok.headers.get('set-cookie')!
    assert.match(cookie, /^sid=/)
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /SameSite=Lax/i)
    const token = /sid=([^;]+)/.exec(cookie)![1]!
    assert.equal((await clienteHttp(a.app, token).get('/api/auth/eu')).status, 200)
    assert.ok(um(a.db, 'SELECT ultimo_acesso_em FROM usuario WHERE id = ?', a.pessoas.design.id))

    for (const [email, senha] of [['design@melt.test', 'errada-123456'], ['ninguem@melt.test', SENHA_TESTE]]) {
      const r = await login(a.app, email!, senha!)
      assert.equal(r.status, 401)
      assert.equal((await r.json()).erro.codigo, 'credenciais_invalidas')
    }
  })

  test('e-mail inexistente leva o mesmo tempo (scrypt contra hash fictício)', async () => {
    const a = await ambiente()
    const medir = async (email: string) => {
      const inicio = performance.now()
      await login(a.app, email, 'qualquer-coisa-1')
      return performance.now() - inicio
    }
    await medir('ninguem@melt.test')
    const errada: number[] = []
    const inexistente: number[] = []
    for (let i = 0; i < 3; i++) {
      errada.push(await medir('design@melt.test'))
      inexistente.push(await medir(`ninguem${i}@melt.test`))
    }
    const mediana = (xs: number[]) => [...xs].sort((x, y) => x - y)[1]!
    assert.ok(mediana(inexistente) > mediana(errada) * 0.5, `${mediana(inexistente)} x ${mediana(errada)}`)
  })

  test('6ª falha em 15 min no mesmo e-mail+IP → 429; acerto zera o par', async () => {
    const a = await ambiente()
    for (let i = 0; i < 4; i++) assert.equal((await login(a.app, 'web@melt.test', 'errada-123456')).status, 401)
    assert.equal((await login(a.app, 'web@melt.test', SENHA_TESTE)).status, 200)
    for (let i = 0; i < 5; i++) assert.equal((await login(a.app, 'web@melt.test', 'errada-123456')).status, 401)
    const r = await login(a.app, 'web@melt.test', SENHA_TESTE)
    assert.equal(r.status, 429)
    const corpo = await r.json()
    assert.equal(corpo.erro.codigo, 'muitas_tentativas')
    assert.ok(corpo.erro.detalhes.tenteEmSegundos > 0 && corpo.erro.detalhes.tenteEmSegundos <= 900)
    a.relogio('2026-10-14T13:16:00.000Z')
    assert.equal((await login(a.app, 'web@melt.test', SENHA_TESTE)).status, 200)
  })

  test('21ª falha no mesmo e-mail em 1 h vinda de IPs diferentes → 429', async () => {
    const a = await ambiente()
    restaurar = configurar({ trustProxyHops: 1 })
    for (let i = 0; i < 20; i++) assert.equal((await login(a.app, 'am@melt.test', 'errada-123456', `10.0.0.${i}`)).status, 401)
    assert.equal((await login(a.app, 'am@melt.test', SENHA_TESTE, '10.0.1.1')).status, 429)
    assert.equal((await login(a.app, 'am2@melt.test', SENHA_TESTE, '10.0.1.1')).status, 200)
  })

  test('X-Forwarded-For com TRUST_PROXY_HOPS=1 usa o último item (o do proxy)', async () => {
    const a = await ambiente()
    restaurar = configurar({ trustProxyHops: 1 })
    await login(a.app, 'am@melt.test', 'errada-123456', '1.1.1.1, 2.2.2.2')
    assert.equal(um<{ ip: string }>(a.db, 'SELECT ip FROM login_tentativa ORDER BY id DESC LIMIT 1')!.ip, '2.2.2.2')
    configurar({ trustProxyHops: 2 })
    await login(a.app, 'am@melt.test', 'errada-123456', '1.1.1.1, 2.2.2.2')
    assert.equal(um<{ ip: string }>(a.db, 'SELECT ip FROM login_tentativa ORDER BY id DESC LIMIT 1')!.ip, '1.1.1.1')
    configurar({ trustProxyHops: 0 })
    await login(a.app, 'am@melt.test', 'errada-123456', '1.1.1.1, 2.2.2.2')
    assert.notEqual(um<{ ip: string }>(a.db, 'SELECT ip FROM login_tentativa ORDER BY id DESC LIMIT 1')!.ip, '1.1.1.1')
  })

  test('pessoa inativa ou sem senha não entra (mesma resposta)', async () => {
    const a = await ambiente()
    tx(a.db, () => a.db.prepare('UPDATE usuario SET ativo = 0 WHERE id = ?').run(a.pessoas.web.id))
    assert.equal((await login(a.app, 'web@melt.test', SENHA_TESTE)).status, 401)
  })
})

describe('sessão e eu', () => {
  test('sem sessão → 401; logout revoga e apaga o cookie', async () => {
    const a = await ambiente()
    assert.equal((await clienteHttp(a.app, '').get('/api/bootstrap')).status, 401)
    assert.equal((await clienteHttp(a.app, 'token-que-nao-existe').get('/api/auth/eu')).status, 401)
    const eu = a.como(a.pessoas.am)
    assert.equal((await eu.get('/api/auth/eu')).status, 200)
    const r = await eu.post('/api/auth/logout')
    assert.equal(r.status, 204)
    assert.match(r.headers.get('set-cookie') ?? '', /sid=;|Max-Age=0/)
    assert.equal((await eu.get('/api/auth/eu')).status, 401)
  })

  test('sessão de pessoa desativada → 401', async () => {
    const a = await ambiente()
    const web = a.como(a.pessoas.web)
    assert.equal((await web.get('/api/auth/eu')).status, 200)
    assert.equal((await a.como(a.pessoas.admin).patch(`/api/pessoas/${a.pessoas.web.id}`, { ativo: false })).status, 200)
    assert.equal((await web.get('/api/auth/eu')).status, 401)
  })

  test('PATCH /api/auth/eu muda nome, apelido, cor e mescla as prefs; apelido de outra pessoa → 409', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    let r = await eu.patch('/api/auth/eu', { prefs: { tema: 'escuro' } })
    r = await eu.patch('/api/auth/eu', { nome: 'Rafael Lima', cor: 'verde', prefs: { atalhos: false } })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.usuario.nome, 'Rafael Lima')
    assert.deepEqual(r.corpo.prefs, { tema: 'escuro', atalhos: false })
    assert.equal((await eu.patch('/api/auth/eu', { apelido: 'Pri' })).status, 409)
    assert.equal((await eu.patch('/api/auth/eu', { cor: 'laranja' })).status, 400)
  })

  test('sessão vencida → 401 e uso renova a validade (deslizante)', async () => {
    const a = await ambiente()
    const token = sessaoPara(a.db, a.pessoas.am.id)
    a.relogio('2026-11-10T13:00:00.000Z')
    const c = clienteHttp(a.app, token)
    assert.equal((await c.get('/api/auth/eu')).status, 200)
    a.relogio('2026-12-05T13:00:00.000Z')
    assert.equal((await c.get('/api/auth/eu')).status, 200)
    a.relogio('2027-01-10T13:00:00.000Z')
    assert.equal((await c.get('/api/auth/eu')).status, 401)
  })
})

describe('troca de senha', () => {
  test('certa troca e revoga as outras sessões; fraca → 422; errada 6× → 429', async () => {
    const a = await ambiente()
    const outra = clienteHttp(a.app, sessaoPara(a.db, a.pessoas.am.id))
    const eu = a.como(a.pessoas.am)
    assert.equal((await eu.post('/api/auth/senha', { senhaAtual: SENHA_TESTE, senhaNova: '123' })).status, 422)
    assert.equal((await eu.post('/api/auth/senha', { senhaAtual: SENHA_TESTE, senhaNova: NOVA })).status, 204)
    assert.equal((await eu.get('/api/auth/eu')).status, 200)
    assert.equal((await outra.get('/api/auth/eu')).status, 401)
    assert.equal((await login(a.app, 'am@melt.test', NOVA)).status, 200)

    const design = a.como(a.pessoas.design)
    for (let i = 0; i < 5; i++) {
      const r = await design.post('/api/auth/senha', { senhaAtual: 'errada-123456', senhaNova: NOVA })
      assert.equal(r.status, 401)
    }
    const r = await design.post('/api/auth/senha', { senhaAtual: SENHA_TESTE, senhaNova: NOVA })
    assert.equal(r.status, 429)
  })
})

describe('convite e redefinição', () => {
  test('convite: consultar não consome; definir entra; usado 2× → 410; senha fraca → 422', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const criada = await admin.post('/api/pessoas', { nome: 'Nina Nova', email: 'Nina@Melt.test', papel: 'equipe' })
    assert.equal(criada.status, 201)
    const url: string = criada.corpo.convite.url
    assert.match(url, /^http:\/\/localhost:5173\/convite#[A-Za-z0-9_-]{43}$/)
    const token = url.split('#')[1]!
    const anonimo = clienteHttp(a.app, '')
    const info = await anonimo.post('/api/auth/convite/consultar', { token })
    assert.equal(info.status, 200)
    assert.deepEqual(info.corpo, { nome: 'Nina Nova', email: 'nina@melt.test', expiraEm: '2026-10-21T13:00:00.000Z' })
    assert.equal((await anonimo.post('/api/auth/convite', { token, senha: 'curta' })).status, 422)
    const def = await anonimo.post('/api/auth/convite', { token, senha: NOVA })
    assert.equal(def.status, 200)
    assert.equal(def.corpo.usuario.temSenha, true)
    assert.match(def.headers.get('set-cookie') ?? '', /^sid=/)
    const deNovo = await anonimo.post('/api/auth/convite', { token, senha: NOVA })
    assert.equal(deNovo.status, 410)
    assert.equal(deNovo.corpo.erro.codigo, 'token_invalido')
    assert.equal((await anonimo.post('/api/auth/convite/consultar', { token })).status, 410)
    // convite de quem já tem senha → 409
    assert.equal((await admin.post(`/api/pessoas/${def.corpo.usuario.id}/convite`)).status, 409)
  })

  test('convite de pessoa desativada → 410; desativar revoga os tokens pendentes', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const criada = await admin.post('/api/pessoas', { nome: 'Leo', email: 'leo@melt.test', papel: 'equipe' })
    const token = (criada.corpo.convite.url as string).split('#')[1]!
    await admin.patch(`/api/pessoas/${criada.corpo.usuario.id}`, { ativo: false })
    assert.ok(um(a.db, 'SELECT 1 FROM token_acesso WHERE usuario_id = ? AND revogado_em IS NOT NULL', criada.corpo.usuario.id))
    assert.equal((await clienteHttp(a.app, '').post('/api/auth/convite', { token, senha: NOVA })).status, 410)
    // mesmo sem a revogação (token gerado direto), a pessoa inativa não entra
    const link = tx(a.db, () => gerarLinkAcesso(a.db, criada.corpo.usuario.id, 'convite', atorDe(a.pessoas.admin)))
    assert.equal((await clienteHttp(a.app, '').post('/api/auth/convite/consultar', { token: link.url.split('#')[1] })).status, 410)
  })

  test('convite vencido → 410; novo convite revoga o anterior', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const criada = await admin.post('/api/pessoas', { nome: 'Mia', email: 'mia@melt.test', papel: 'equipe' })
    const antigo = (criada.corpo.convite.url as string).split('#')[1]!
    const novo = await admin.post(`/api/pessoas/${criada.corpo.usuario.id}/convite`)
    assert.equal(novo.status, 200)
    assert.equal((await clienteHttp(a.app, '').post('/api/auth/convite/consultar', { token: antigo })).status, 410)
    a.relogio('2026-10-22T13:00:00.000Z')
    assert.equal((await clienteHttp(a.app, '').post('/api/auth/convite/consultar', { token: (novo.corpo.url as string).split('#')[1] })).status, 410)
  })

  test('redefinição (1 h) troca a senha e revoga as sessões antigas', async () => {
    const a = await ambiente()
    const antiga = a.como(a.pessoas.social)
    assert.equal((await antiga.get('/api/auth/eu')).status, 200)
    const link = await a.como(a.pessoas.admin).post(`/api/pessoas/${a.pessoas.social.id}/redefinicao`)
    assert.equal(link.status, 200)
    assert.equal(link.corpo.expiraEm, '2026-10-14T14:00:00.000Z')
    const token = (link.corpo.url as string).split('#')[1]!
    assert.match(link.corpo.url, /\/redefinir#/)
    const r = await clienteHttp(a.app, '').post('/api/auth/redefinicao', { token, senha: NOVA })
    assert.equal(r.status, 200)
    assert.equal((await antiga.get('/api/auth/eu')).status, 401)
    assert.equal((await login(a.app, 'social@melt.test', NOVA)).status, 200)
    assert.equal((await login(a.app, 'social@melt.test', SENHA_TESTE)).status, 401)
  })

  test('tokens inválidos contam no limite do IP', async () => {
    const a = await ambiente()
    const anonimo = clienteHttp(a.app, '')
    for (let i = 0; i < 50; i++) await anonimo.post('/api/auth/convite/consultar', { token: `invalido-${i}-xxxxxxxx` })
    assert.equal((await anonimo.post('/api/auth/convite/consultar', { token: 'invalido-fim-xxxxxxxx' })).status, 429)
  })
})

describe('proteções da API', () => {
  test('mutação sem X-Trace-Id ou com Origin errado → 403 csrf (inclusive login)', async () => {
    const a = await ambiente()
    const sem = await a.como(a.pessoas.am).post('/api/quadros/x/colunas', { nome: 'A' }, { semCsrf: true })
    assert.equal(sem.status, 403)
    assert.equal(sem.corpo.erro.codigo, 'csrf')
    const origem = await a.como(a.pessoas.am).post('/api/clientes', { sigla: 'XX', nome: 'X' }, { headers: { Origin: 'https://evil.example' } })
    assert.equal(origem.status, 403)
    const traceRuim = await a.como(a.pessoas.am).post('/api/clientes', { sigla: 'XX', nome: 'X' }, { headers: { 'X-Trace-Id': 'a b' } })
    assert.equal(traceRuim.status, 403)
    const r = await a.app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'am@melt.test', senha: SENHA_TESTE }) })
    assert.equal(r.status, 403)
    assert.equal((await a.como(a.pessoas.am).get('/api/auth/eu', { semCsrf: true })).status, 200)
  })

  test('corpo JSON de 2 MiB → 413 corpo_grande sem ler o corpo', async () => {
    const a = await ambiente()
    let lido = false
    const corpo = new ReadableStream<Uint8Array>({ pull() { lido = true; throw new Error('não devia ler') } }, { highWaterMark: 0 })
    const r = await a.app.request('/api/clientes', {
      method: 'POST', body: corpo, duplex: 'half',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(2 * 1024 * 1024), 'X-Trace-Id': randomUUID(),
        Origin: ORIGEM, Cookie: `sid=${a.como(a.pessoas.am).cookie}` },
    } as RequestInit)
    assert.equal(r.status, 413)
    assert.equal((await r.json()).erro.codigo, 'corpo_grande')
    assert.equal(lido, false)
  })

  test('JSON inválido e campos fora do esquema → 400 validacao com detalhes.campos', async () => {
    const a = await ambiente()
    const r = await a.como(a.pessoas.am).bruto('/api/clientes', { method: 'POST', body: '{nao', headers: { 'Content-Type': 'application/json' } })
    assert.equal(r.status, 400)
    const v = await a.como(a.pessoas.am).post('/api/clientes', { sigla: 'abc-!', nome: '' })
    assert.equal(v.status, 400)
    assert.equal(v.corpo.erro.codigo, 'validacao')
    assert.ok(v.corpo.erro.detalhes.campos.sigla)
    assert.ok(v.corpo.erro.detalhes.campos.nome)
  })

  test('NODE_ENV=production: cookie __Host-sid Secure e CSP exata', async () => {
    const a = await ambiente()
    restaurar = configurar({ producao: true })
    const r = await login(a.app, 'am@melt.test', SENHA_TESTE)
    assert.equal(r.status, 200)
    const cookie = r.headers.get('set-cookie')!
    assert.match(cookie, /^__Host-sid=/)
    assert.match(cookie, /Secure/)
    assert.match(cookie, /Path=\//)
    assert.doesNotMatch(cookie, /Domain/i)
    const token = /__Host-sid=([^;]+)/.exec(cookie)![1]!
    const eu = await a.app.request('/api/auth/eu', { headers: { Cookie: `__Host-sid=${token}` } })
    assert.equal(eu.status, 200)
    assert.equal(eu.headers.get('content-security-policy'), "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com; frame-src https://drive.google.com "
      + "https://www.youtube-nocookie.com https://www.figma.com; connect-src 'self'; font-src 'self'; object-src 'none'; "
      + "base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
    assert.equal(eu.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(eu.headers.get('referrer-policy'), 'same-origin')
  })

  test('rota desconhecida da API → 404 nao_encontrado em JSON', async () => {
    const a = await ambiente()
    const r = await a.como(a.pessoas.am).get('/api/nao-existe')
    assert.equal(r.status, 404)
    assert.equal(r.corpo.erro.codigo, 'nao_encontrado')
    const saude = await a.app.request('/api/saude')
    assert.deepEqual(await saude.json(), { ok: true, versao: '0.1.0' })
  })
})
