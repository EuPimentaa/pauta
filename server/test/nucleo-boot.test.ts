/** Boot e operação: primeiro admin, front servido em produção (SPA e cabeçalhos), jobs diários e backup. */
import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CSP, caminhoParaLog, criarApp } from '../src/app.ts'
import { configurar, type Config } from '../src/config.ts'
import { abrir, migrar, novoId, rodar, todos, um } from '../src/db.ts'
import { criarAdminInicial } from '../src/primeiro-boot.ts'
import { carregarTarefas, executarTarefa, tarefasDevidas, type Tarefa } from '../src/tarefas.ts'
import { fazerBackup } from '../src/tarefas/nucleo-backup.ts'
import { apagarIpsAntigos } from '../src/tarefas/nucleo-ip.ts'
import { servirWeb } from '../src/web.ts'
import { ambiente, clienteHttp, ORIGEM, SENHA_TESTE, sessaoPara } from './ajuda.ts'

let restaurar: Config | null = null
afterEach(() => {
  if (restaurar) configurar(restaurar)
  restaurar = null
})

describe('primeiro boot', () => {
  test('banco sem usuários + ADMIN_EMAIL/ADMIN_SENHA cria o admin uma vez; senha fraca recusa; sem env só avisa', async (t) => {
    t.mock.method(console, 'warn', () => undefined)
    t.mock.method(console, 'log', () => undefined)
    const db = abrir(':memory:')
    migrar(db)
    restaurar = configurar({ adminEmail: null, adminSenha: null })
    assert.equal(await criarAdminInicial(db), false)

    configurar({ adminEmail: 'dono@melt.test', adminSenha: '123' })
    await assert.rejects(criarAdminInicial(db), /ADMIN_SENHA fraca/)

    configurar({ adminSenha: `${randomBytes(12).toString('base64url')}-Boot1` })
    assert.equal(await criarAdminInicial(db), true)
    const admin = um<{ nome: string; email: string; papel: string; ativo: number; senha_hash: string | null }>(db, 'SELECT nome, email, papel, ativo, senha_hash FROM usuario')!
    assert.equal(admin.email, 'dono@melt.test')
    assert.equal(admin.nome, 'Dono', 'o nome provisório sai do e-mail, com maiúscula (os Primeiros passos pedem para conferir)')
    assert.equal(admin.papel, 'admin')
    assert.equal(admin.ativo, 1)
    assert.match(admin.senha_hash!, /^scrypt\$/)
    assert.equal(await criarAdminInicial(db), false)               // já tem usuário: não cria outro
    assert.equal(um<{ n: number }>(db, 'SELECT count(*) AS n FROM usuario')!.n, 1)
  })

  test('migrar é idempotente e registra cada arquivo em _migracoes', () => {
    const db = abrir(':memory:')
    const aplicadas = migrar(db)
    assert.deepEqual(aplicadas.slice(0, 2), ['001_base.sql', '002_config.sql'])
    assert.deepEqual(migrar(db), [])
    assert.deepEqual(todos<{ nome: string }>(db, 'SELECT nome FROM _migracoes ORDER BY nome').map((l) => l.nome), aplicadas)
    assert.equal(um<{ foreign_keys: number }>(db, 'PRAGMA foreign_keys')!.foreign_keys, 1)
  })

  test('migração com erro desfaz o arquivo inteiro e não registra', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pauta-mig-'))
    writeFileSync(join(pasta, '001_ok.sql'), 'CREATE TABLE a (x INTEGER) STRICT;')
    writeFileSync(join(pasta, '002_ruim.sql'), 'CREATE TABLE b (x INTEGER) STRICT; INSERT INTO nao_existe VALUES (1);')
    const db = abrir(':memory:')
    assert.throws(() => migrar(db, pasta), /Migração 002_ruim\.sql falhou/)
    assert.deepEqual(todos<{ nome: string }>(db, 'SELECT nome FROM _migracoes').map((l) => l.nome), ['001_ok.sql'])
    assert.equal(um(db, "SELECT name FROM sqlite_master WHERE name = 'b'"), undefined)
    writeFileSync(join(pasta, '002_outro.sql'), '')
    assert.throws(() => migrar(abrir(':memory:'), pasta), /repetidos/)
  })
})

describe('front em produção (web/dist)', () => {
  function distFalso(): string {
    const pasta = mkdtempSync(join(tmpdir(), 'pauta-dist-'))
    mkdirSync(join(pasta, 'assets'))
    writeFileSync(join(pasta, 'index.html'), '<!doctype html><title>Pauta</title>')
    writeFileSync(join(pasta, 'assets', 'app-1a2b.js'), 'console.log(1)')
    writeFileSync(join(pasta, 'favicon-32.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    return pasta
  }

  test('SPA: rotas do app caem no index.html sem cache; assets com cache longo; arquivo que falta → 404; /api não cai no index', async () => {
    const a = await ambiente()
    restaurar = configurar({ producao: true })
    const app = criarApp(a.db)
    assert.equal(servirWeb(app, distFalso()), true)

    for (const caminho of ['/', '/q/criacao', '/d/12', '/convite']) {
      const r = await app.request(caminho)
      assert.equal(r.status, 200, caminho)
      assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8')
      assert.equal(r.headers.get('cache-control'), 'no-cache')
      assert.equal(r.headers.get('content-security-policy'), CSP)
      assert.equal(await r.text(), '<!doctype html><title>Pauta</title>')
    }
    const js = await app.request('/assets/app-1a2b.js')
    assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.equal(js.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.equal((await app.request('/favicon-32.png')).headers.get('content-type'), 'image/png')
    assert.equal((await app.request('/assets/nao-existe.js')).status, 404)
    const api = await app.request('/api/nao-existe')
    assert.equal(api.status, 404)
    assert.equal((await api.json()).erro.codigo, 'nao_encontrado')
    assert.equal((await app.request('/api/saude')).status, 200)
  })

  test('index.html sai com o APP_NOME (escapado) no <title> e no application-name, inclusive em /index.html', async () => {
    const a = await ambiente()
    restaurar = configurar({ producao: true, appNome: 'Fila & <Cia> "M"' })
    const pasta = distFalso()
    writeFileSync(join(pasta, 'index.html'),
      '<!doctype html><head><meta name="application-name" content="Pauta" /><title>Pauta</title></head><body>Pauta</body>')
    const app = criarApp(a.db)
    servirWeb(app, pasta)
    const esperado = '<!doctype html><head><meta name="application-name" content="Fila &amp; &lt;Cia&gt; &quot;M&quot;" />'
      + '<title>Fila &amp; &lt;Cia&gt; &quot;M&quot;</title></head><body>Pauta</body>'
    for (const caminho of ['/entrar', '/index.html', '/']) {
      const r = await app.request(caminho)
      assert.equal(r.headers.get('cache-control'), 'no-cache', caminho)
      assert.equal(await r.text(), esperado, caminho)
    }
  })

  test('dica de sessão: o index.html a põe com sessão válida e a tira sem; login e logout também (sem 401 no console)', async () => {
    const a = await ambiente()
    restaurar = configurar({ producao: true })
    const app = criarApp(a.db)
    servirWeb(app, distFalso())
    const token = sessaoPara(a.db, a.pessoas.design.id)
    const com = await app.request('/q/criacao', { headers: { Cookie: `__Host-sid=${token}` } })
    assert.match(com.headers.get('set-cookie') ?? '', /pauta_sessao=1;.*Max-Age=\d+.*Path=\//)
    assert.doesNotMatch(com.headers.get('set-cookie') ?? '', /HttpOnly/, 'o JS lê a dica')
    const vencida = await app.request('/', { headers: { Cookie: 'pauta_sessao=1; __Host-sid=token-que-nao-existe' } })
    assert.match(vencida.headers.get('set-cookie') ?? '', /pauta_sessao=;.*Max-Age=0/)
    const sem = await app.request('/')
    assert.equal(sem.headers.get('set-cookie'), null, 'sem sessão e sem dica: nada')
    // login põe a dica junto do cookie da sessão; logout tira as duas
    const login = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trace-Id': randomUUID(), Origin: ORIGEM },
      body: JSON.stringify({ email: a.pessoas.design.email, senha: SENHA_TESTE }),
    })
    assert.equal(login.status, 200)
    assert.match(login.headers.get('set-cookie') ?? '', /pauta_sessao=1/)
    const sid = /__Host-sid=([^;]+)/.exec(login.headers.get('set-cookie') ?? '')![1]
    const sair = await app.request('/api/auth/logout', {
      method: 'POST', headers: { Cookie: `__Host-sid=${sid}`, 'X-Trace-Id': randomUUID(), Origin: ORIGEM },
    })
    assert.match(sair.headers.get('set-cookie') ?? '', /pauta_sessao=;.*Max-Age=0/)
  })

  test('não sai da pasta (../ codificado) e sem web/dist não registra nada', async () => {
    const a = await ambiente()
    const app = criarApp(a.db)
    servirWeb(app, distFalso())
    for (const caminho of ['/%2e%2e/%2e%2e/package.json', '/assets/%2e%2e%2f%2e%2e%2fpackage.json', '/..%5c..%5cpackage.json']) {
      const r = await app.request(caminho)
      assert.notEqual(await r.text(), '', caminho)
      assert.ok(r.status === 404 || (r.headers.get('content-type') ?? '').startsWith('text/html'), caminho)
    }
    assert.equal((await app.request('/%E0%A4%A')).status, 400)
    assert.equal(servirWeb(criarApp(a.db), join(tmpdir(), 'nao-existe-dist')), false)
  })

  test('Referrer-Policy no-referrer em /a/*, /convite, /redefinir e /api/publico/*; noindex e no-store nas públicas', async () => {
    const a = await ambiente()
    restaurar = configurar({ producao: true })
    const app = criarApp(a.db)
    servirWeb(app, distFalso())
    for (const caminho of ['/a/token-secreto', '/convite', '/redefinir']) {
      assert.equal((await app.request(caminho)).headers.get('referrer-policy'), 'no-referrer', caminho)
    }
    const publica = await app.request('/a/token-secreto')
    assert.equal(publica.headers.get('x-robots-tag'), 'noindex')
    assert.equal(publica.headers.get('cache-control'), 'no-store')
    const api = await app.request('/api/publico/a/token-secreto')
    assert.equal(api.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(api.headers.get('cache-control'), 'no-store')
    assert.equal((await app.request('/q/criacao')).headers.get('referrer-policy'), 'same-origin')
    const saude = await app.request('/api/saude')
    assert.equal(saude.headers.get('cache-control'), 'no-store')
    assert.equal(saude.headers.get('x-content-type-options'), 'nosniff')
  })

  test('log: caminhos com token mascarados e nada do corpo das rotas de auth', async (t) => {
    assert.equal(caminhoParaLog('/a/tok3n-secreto'), '/a/***')
    assert.equal(caminhoParaLog('/a/tok3n/qualquer'), '/a/***')
    assert.equal(caminhoParaLog('/api/publico/a/tok3n/decisao'), '/api/publico/***')
    assert.equal(caminhoParaLog('/api/publico/arquivos/id-do-arquivo'), '/api/publico/***')
    assert.equal(caminhoParaLog('/api/auth/convite/consultar'), '/api/auth/convite***')
    assert.equal(caminhoParaLog('/api/auth/redefinicao'), '/api/auth/redefinicao***')
    assert.equal(caminhoParaLog('/api/auth/login'), '/api/auth/login')
    assert.equal(caminhoParaLog('/api/demandas/12'), '/api/demandas/12')

    const a = await ambiente()
    restaurar = configurar({ log: true })
    const linhas: string[] = []
    t.mock.method(console, 'log', (...partes: unknown[]) => { linhas.push(partes.join(' ')) })
    const r = await clienteHttp(a.app, '').post('/api/auth/login', { email: 'am@melt.test', senha: SENHA_TESTE })
    assert.equal(r.status, 200)
    await clienteHttp(a.app, '').post('/api/auth/convite/consultar', { token: 'token-de-convite-qualquer' })
    assert.equal(linhas.length, 2)
    assert.match(linhas[0]!, /^POST \/api\/auth\/login 200 \d+ms t=/)
    assert.ok(linhas[1]!.startsWith('POST /api/auth/convite*** 410 '), linhas[1])
    assert.ok(linhas.every((l) => !l.includes(SENHA_TESTE) && !l.includes('am@melt.test') && !l.includes('token-de-convite')))
  })

  test('em desenvolvimento não manda CSP (o Vite injeta scripts)', async () => {
    const a = await ambiente()
    assert.equal((await a.app.request('/api/saude')).headers.get('content-security-policy'), null)
  })
})

describe('jobs diários', () => {
  test('descobre os jobs do núcleo; devidos depois do horário e uma vez por dia; quem perdeu o horário roda ao subir', async (t) => {
    const erros = t.mock.method(console, 'error', () => undefined)
    const a = await ambiente()
    const tarefas = await carregarTarefas()
    assert.deepEqual(tarefas.map((t) => t.nome).filter((n) => n.startsWith('nucleo-')).sort(),
      ['nucleo-backup', 'nucleo-ip', 'nucleo-lixo', 'nucleo-poda'])

    const feitas: string[] = []
    const cedo: Tarefa = { nome: 'teste-cedo', horario: '03:00', executar: () => { feitas.push('cedo') } }
    const tarde: Tarefa = { nome: 'teste-tarde', horario: '23:00', executar: () => { feitas.push('tarde') } }
    const falha: Tarefa = { nome: 'teste-falha', horario: '01:00', executar: () => { throw new Error('disco cheio') } }
    // 10h em São Paulo: as das 3h e da 1h (perdidas com o servidor desligado) estão devidas; a das 23h não
    assert.deepEqual(tarefasDevidas(a.db, [cedo, tarde, falha]).map((t) => t.nome), ['teste-cedo', 'teste-falha'])
    assert.equal(await executarTarefa(a.db, cedo), true)
    assert.equal(await executarTarefa(a.db, falha), false)
    const registro = um<{ ok: number; detalhe: string }>(a.db, "SELECT ok, detalhe FROM tarefa_execucao WHERE nome = 'teste-falha'")!
    assert.deepEqual([registro.ok, registro.detalhe], [0, 'disco cheio'])
    assert.equal(erros.mock.callCount(), 1)                       // a falha vai ao log
    assert.deepEqual(tarefasDevidas(a.db, [cedo, tarde]).map((t) => t.nome), [])
    a.relogio('2026-10-15T02:30:00.000Z')                         // 23h30 do mesmo dia em SP
    assert.deepEqual(tarefasDevidas(a.db, [cedo, tarde]).map((t) => t.nome), ['teste-tarde'])
    a.relogio('2026-10-15T06:30:00.000Z')                         // 3h30 do dia seguinte
    assert.deepEqual(tarefasDevidas(a.db, [cedo]).map((t) => t.nome), ['teste-cedo'])
    assert.deepEqual(feitas, ['cedo'])
  })

  test('módulo em src/tarefas sem `tarefa` válida impede o boot', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pauta-tarefas-'))
    writeFileSync(join(pasta, 'x-ruim.ts'), "export const tarefa = { nome: 'x', horario: '25:00', executar() {} }\n")
    await assert.rejects(carregarTarefas(pasta), /não exporta uma tarefa válida/)
  })

  test('backup: VACUUM INTO em DATA_DIR/backups com a data; guarda os backupManter mais novos', async () => {
    const a = await ambiente()
    const dataDir = mkdtempSync(join(tmpdir(), 'pauta-backup-'))
    restaurar = configurar({ dataDir })
    const pasta = join(dataDir, 'backups')
    mkdirSync(pasta)
    for (let dia = 1; dia <= 15; dia++) writeFileSync(join(pasta, `demandas-2026-09-${String(dia).padStart(2, '0')}.db`), '')
    writeFileSync(join(pasta, 'outro-arquivo.txt'), 'fica')
    await a.criarDemanda({ titulo: 'Vai no backup' })
    const destino = fazerBackup(a.db)
    assert.equal(destino, join(pasta, 'demandas-2026-10-14.db'))
    const copia = new DatabaseSync(destino, { readOnly: true })
    assert.equal((copia.prepare('SELECT titulo FROM demanda').get() as { titulo: string }).titulo, 'Vai no backup')
    copia.close()
    const restantes = readdirSync(pasta).sort()
    assert.equal(restantes.filter((n) => n.endsWith('.db')).length, 14)
    assert.ok(restantes.includes('outro-arquivo.txt'))
    assert.ok(!restantes.includes('demandas-2026-09-01.db') && !restantes.includes('demandas-2026-09-02.db'))
    // de novo no mesmo dia: substitui
    assert.equal(fazerBackup(a.db), destino)
    assert.ok(existsSync(destino))
  })

  test('privacidade: apaga ip_hmac e user-agent das decisões com mais de 12 meses', async () => {
    const a = await ambiente()
    const inserir = async (criadoEm: string) => {
      const d = await a.criarDemanda({ ate: 'entregue' })        // uma decisão por versão
      const versao = um<{ id: string }>(a.db, 'SELECT id FROM versao WHERE demanda_id = ?', d.id)!.id
      const id = novoId()
      rodar(a.db, `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, registrado_por, quadro_antes_id, coluna_antes_id,
                     ip_hmac, user_agent, criado_em) VALUES (?, ?, ?, 'aprovado', 'manual', 'whatsapp', ?, ?, ?, 'hmac', 'Mozilla', ?)`,
      id, d.id, versao, a.pessoas.am.id, d.quadroId, d.colunaId, criadoEm)
      return id
    }
    const velha = await inserir('2025-10-01T12:00:00.000Z')
    const nova = await inserir('2025-11-01T12:00:00.000Z')
    assert.equal(apagarIpsAntigos(a.db), 1)
    const l = (id: string) => um<{ ip_hmac: string | null; user_agent: string | null }>(a.db, 'SELECT ip_hmac, user_agent FROM aprovacao WHERE id = ?', id)!
    assert.deepEqual({ ...l(velha) }, { ip_hmac: null, user_agent: null })
    assert.deepEqual({ ...l(nova) }, { ip_hmac: 'hmac', user_agent: 'Mozilla' })
    assert.equal(apagarIpsAntigos(a.db), 0)
  })
})
