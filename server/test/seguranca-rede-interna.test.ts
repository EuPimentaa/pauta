/**
 * Segurança 2, segunda volta (verificação da leva 2): com o cookie da sessão, a página pública já era só prévia; mas
 * quem é da agência copia o endereço do link (GET /links, sem rastro) e abre numa aba anônima, no próprio celular ou por
 * curl, e decide como o cliente, com nome livre, e a trilha ficava igual à de uma decisão real. Agora:
 * - a decisão pelo link vinda da mesma rede de uma sessão interna das últimas 24 h (IPv4 igual, IPv6 no mesmo /64) vale
 *   (o cliente pode estar na rede da agência), mas fica marcada com quem eram (`redeInterna`, imutável), o resumo da
 *   notificação diz "· da mesma rede que Pri" e os admins também a recebem;
 * - a trilha do cliente mostra a marca e, ao admin, o aparelho e o navegador;
 * - quem recebe o endereço de um link ativo fica no histórico (`link.exibido`, a cada 6 h por pessoa e link; só o
 *   admin vê a linha), e link inativo não vem mais com o endereço.
 */
import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { Atividade, ItemTrilhaCliente, PaginaAprovacao } from '../../shared/tipos/index.ts'
import { pessoasDaRede, redeDoIp } from '../src/auth.ts'
import { configurar } from '../src/config.ts'
import { rodar, todos, um } from '../src/db.ts'
import { dispositivoDoUa } from '../src/servicos/cadastros-trilha.ts'
import { INICIO, ORIGEM, type Ambiente, type Resposta } from './ajuda.ts'
import { ambiente, enviarAoCliente, publico, tokenDe } from './ciclo-ajuda.ts'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ESCRITORIO = '200.9.9.9'

/** Decisão pela página pública, sem cookie, de um IP e de um navegador. */
async function decidirDe(a: Ambiente, ip: string, token: string, corpo: Record<string, unknown>, ua = IPHONE): Promise<Resposta> {
  const r = await a.app.request(`/api/publico/a/${token}/decisao`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'user-agent': ua, 'X-Trace-Id': randomUUID(), Origin: ORIGEM, 'Idempotency-Key': randomUUID(),
      'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const texto = await r.text()
  return { status: r.status, corpo: texto ? JSON.parse(texto) : texto, texto, headers: r.headers }
}

async function comLink() {
  const a = await ambiente()
  const d = await a.criarDemanda({ ate: 'entregue' })
  const s = await enviarAoCliente(a, d)
  const token = tokenDe(s.link!.url)
  const pag = (await publico(a).pagina(token)).corpo as PaginaAprovacao
  return { a, d, token, versaoId: pag.itens[0]!.versao!.id }
}

/** A pessoa usa o app de um IP (a sessão guarda o IP da última requisição). */
const usarAppDe = (a: Ambiente, quem: Ambiente['pessoas'][keyof Ambiente['pessoas']], ip: string, caminho = '/api/auth/eu') =>
  a.como(quem).get(caminho, { headers: { 'x-forwarded-for': ip } })

const atividades = (a: Ambiente, tipo: string) =>
  todos<{ ator_id: string | null; dados: string }>(a.db, 'SELECT ator_id, dados FROM atividade WHERE tipo = ? ORDER BY id', tipo)

describe('decisão pelo link vinda da rede de uma sessão interna', () => {
  // o IP vem do X-Forwarded-For (um proxy confiável, como o Traefik)
  beforeEach(() => { configurar({ trustProxyHops: 1 }) })
  afterEach(() => { configurar({ trustProxyHops: 0 }) })

  test('a Pri copia o link e aprova sem cookie da mesma rede: vale, mas fica marcada, notifica os admins e aparece na trilha', async () => {
    const { a, d, token, versaoId } = await comLink()
    // a Pri usa o app do escritório e lê o endereço do link
    const links = await usarAppDe(a, a.pessoas.am, ESCRITORIO, `/api/demandas/${d.id}/links`)
    assert.equal(links.status, 200)
    assert.equal(um<{ ip: string }>(a.db, 'SELECT ip FROM sessao WHERE usuario_id = ?', a.pessoas.am.id)!.ip, ESCRITORIO)

    const r = await decidirDe(a, ESCRITORIO, token, { demandaId: d.id, versaoId, decisao: 'aprovado', nomeInformado: 'Diretora do cliente' })
    assert.equal(r.status, 200, r.texto)

    const ap = um<{ rede_interna: string; via: string; registrado_por: string | null }>(a.db, 'SELECT rede_interna, via, registrado_por FROM aprovacao')!
    assert.deepEqual(JSON.parse(ap.rede_interna), [a.pessoas.am.id])
    assert.equal(ap.via, 'link')
    assert.equal(ap.registrado_por, null)
    assert.throws(() => rodar(a.db, 'UPDATE aprovacao SET rede_interna = NULL'), /aprovacao_imutavel/, 'a marca não sai')

    // o DTO, a atividade e a notificação
    const det = (await a.como(a.pessoas.design).get(`/api/demandas/${d.numero}`)).corpo
    assert.deepEqual(det.aprovacoes[0].redeInterna, [a.pessoas.am.id])
    const reg = atividades(a, 'retorno.registrado')
    assert.equal(reg.length, 1)
    assert.deepEqual(JSON.parse(reg[0]!.dados).redeInterna, [a.pessoas.am.id])
    const notas = todos<{ usuario_id: string; resumo: string }>(a.db, "SELECT usuario_id, resumo FROM notificacao WHERE tipo = 'aprovada'")
    assert.ok(notas.some((n) => n.usuario_id === a.pessoas.admin.id), 'o admin também recebe')
    for (const n of notas) assert.match(n.resumo, /^Diretora do cliente aprovou a V1 de #\d+ .+ · da mesma rede que Pri$/)

    // a trilha do cliente: a marca para todos; o aparelho só para o admin
    const trilha = (quem: Ambiente['pessoas']['admin']) => a.como(quem).get<ItemTrilhaCliente[]>(`/api/clientes/${a.clientes.he.id}/aprovacoes`)
    const doAdmin = (await trilha(a.pessoas.admin)).corpo[0]!
    assert.deepEqual(doAdmin.redeInterna, [a.pessoas.am.id])
    assert.equal(doAdmin.dispositivo, 'iPhone · Safari')
    const daPri = (await trilha(a.pessoas.am)).corpo[0]!
    assert.deepEqual(daPri.redeInterna, [a.pessoas.am.id])
    assert.equal(daPri.dispositivo, null)
  })

  test('o cliente de outra rede decide sem marca e os admins não recebem', async () => {
    const { a, d, token, versaoId } = await comLink()
    await usarAppDe(a, a.pessoas.am, ESCRITORIO)
    await usarAppDe(a, a.pessoas.admin, '200.9.9.10')
    const r = await decidirDe(a, '189.40.1.2', token, { demandaId: d.id, versaoId, decisao: 'ajuste', contatoId: null,
      nomeInformado: 'Fulana', linhas: ['Trocar a foto'] }, 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')
    assert.equal(r.status, 200, r.texto)
    assert.equal(um<{ rede_interna: string | null }>(a.db, 'SELECT rede_interna FROM aprovacao')!.rede_interna, null)
    assert.equal(JSON.parse(atividades(a, 'retorno.registrado')[0]!.dados).redeInterna, undefined)
    const notas = todos<{ usuario_id: string; resumo: string }>(a.db, "SELECT usuario_id, resumo FROM notificacao WHERE tipo = 'ajuste_pedido'")
    assert.ok(notas.length > 0)
    assert.ok(!notas.some((n) => n.usuario_id === a.pessoas.admin.id))
    for (const n of notas) assert.doesNotMatch(n.resumo, /mesma rede/)
    const item = (await a.como(a.pessoas.admin).get<ItemTrilhaCliente[]>(`/api/clientes/${a.clientes.he.id}/aprovacoes`)).corpo[0]!
    assert.deepEqual(item.redeInterna, [])
    assert.equal(item.dispositivo, 'Android · Chrome')
  })

  test('IPv6: o mesmo /64 é a mesma rede (o celular e o notebook da mesma casa); outro /64 não', async () => {
    const { a, d, token, versaoId } = await comLink()
    await usarAppDe(a, a.pessoas.am2, '2804:14c:5b81:8a00:1111:2222:3333:4444')
    assert.deepEqual(pessoasDaRede(a.db, '2804:14c:5b81:8a01::1'), [])
    const r = await decidirDe(a, '2804:14c:5b81:8a00::abcd', token, { demandaId: d.id, versaoId, decisao: 'aprovado', nomeInformado: 'Fulana' })
    assert.equal(r.status, 200, r.texto)
    assert.deepEqual(JSON.parse(um<{ r: string }>(a.db, 'SELECT rede_interna AS r FROM aprovacao')!.r), [a.pessoas.am2.id])
  })

  test('janela de 24 h pelo último uso da sessão; sessão encerrada conta (sair e decidir no mesmo navegador)', async () => {
    const a = await ambiente()
    await usarAppDe(a, a.pessoas.am, ESCRITORIO)
    rodar(a.db, 'UPDATE sessao SET revogada_em = ? WHERE usuario_id = ?', INICIO, a.pessoas.am.id)
    a.relogio('2026-10-15T12:59:00.000Z') // 23h59 depois
    assert.deepEqual(pessoasDaRede(a.db, ESCRITORIO), [a.pessoas.am.id])
    a.relogio('2026-10-15T13:01:00.000Z') // 24h01 depois
    assert.deepEqual(pessoasDaRede(a.db, ESCRITORIO), [])
    // a sessão segue o IP da última requisição
    await usarAppDe(a, a.pessoas.design, '177.1.1.1')
    await usarAppDe(a, a.pessoas.design, '177.2.2.2')
    assert.deepEqual(pessoasDaRede(a.db, '177.2.2.2'), [a.pessoas.design.id])
    assert.deepEqual(pessoasDaRede(a.db, '177.1.1.1'), [])
    // sem IP de verdade não casa (o socket desconhecido dos testes, vazio)
    assert.deepEqual(pessoasDaRede(a.db, 'desconhecido'), [])
  })

  test('a visita da mesma rede não conta como do cliente (acessos e link.visto); a de outra rede conta', async () => {
    const { a, token } = await comLink()
    await usarAppDe(a, a.pessoas.am, ESCRITORIO)
    assert.equal((await publico(a, ESCRITORIO).visto(token)).status, 204)
    const acessos = () => um<{ n: number }>(a.db, 'SELECT acessos AS n FROM link_publico')!.n
    assert.equal(acessos(), 0)
    assert.equal(atividades(a, 'link.visto').length, 0)
    assert.equal((await publico(a, '189.40.1.2').visto(token)).status, 204)
    assert.equal(acessos(), 1)
    assert.equal(atividades(a, 'link.visto').length, 1)
  })
})

describe('quem recebe o endereço do link fica no histórico (link.exibido)', () => {
  test('GET /links e o texto do lembrete gravam, uma vez a cada 6 h por pessoa e link; só o admin vê a linha', async () => {
    const { a, d } = await comLink()
    const links = async (quem: Ambiente['pessoas']['am']) => (await a.como(quem).get(`/api/demandas/${d.id}/links`)).corpo
    assert.ok((await links(a.pessoas.am))[0].url.includes('/a/'))
    await links(a.pessoas.am)
    assert.deepEqual(atividades(a, 'link.exibido').map((l) => l.ator_id), [a.pessoas.am.id], 'a segunda leitura em 6 h não repete')
    await links(a.pessoas.admin)
    const w = await a.como(a.pessoas.am2).get(`/api/demandas/${d.id}/whatsapp?modelo=lembrete`)
    assert.equal(w.status, 200, w.texto)
    assert.deepEqual(atividades(a, 'link.exibido').map((l) => l.ator_id), [a.pessoas.am.id, a.pessoas.admin.id, a.pessoas.am2.id])
    a.relogio('2026-10-14T19:01:00.000Z')
    await links(a.pessoas.am)
    assert.equal(atividades(a, 'link.exibido').length, 4, 'depois de 6 h grava de novo')

    const historico = async (quem: Ambiente['pessoas']['am']) =>
      ((await a.como(quem).get(`/api/demandas/${d.id}/historico`)).corpo.itens as Atividade[]).filter((x) => x.tipo === 'link.exibido')
    assert.equal((await historico(a.pessoas.admin)).length, 4)
    assert.equal((await historico(a.pessoas.am)).length, 0)
    assert.equal((await historico(a.pessoas.design)).length, 0)
  })

  test('link revogado não vem com o endereço e não grava', async () => {
    const { a, d } = await comLink()
    const [link] = (await a.como(a.pessoas.am).get(`/api/demandas/${d.id}/links`)).corpo
    assert.equal((await a.como(a.pessoas.am).post(`/api/links-publicos/${link.id}/revogar`)).status, 200)
    const antes = atividades(a, 'link.exibido').length
    const [depois] = (await a.como(a.pessoas.admin).get(`/api/demandas/${d.id}/links`)).corpo
    assert.equal(depois.url, '')
    assert.equal(depois.ativo, false)
    assert.equal(atividades(a, 'link.exibido').length, antes)
  })
})

describe('peças puras', () => {
  test('redeDoIp: IPv4 inteiro, IPv4 dentro do IPv6, IPv6 pelo /64; o resto não casa', () => {
    assert.equal(redeDoIp('200.9.9.9'), '200.9.9.9')
    assert.equal(redeDoIp('::ffff:200.9.9.9'), '200.9.9.9')
    assert.equal(redeDoIp('2804:14c:5b81:8a00:1111:2222:3333:4444'), redeDoIp('2804:14c:5b81:8a00::abcd'))
    assert.equal(redeDoIp('2804:014C:5b81:8A00::1'), '2804:14c:5b81:8a00::/64')
    assert.equal(redeDoIp('2804::1'), '2804:0:0:0::/64')
    assert.equal(redeDoIp('fe80::1%eth0'), 'fe80:0:0:0::/64')
    assert.notEqual(redeDoIp('2804:14c:5b81:8a00::1'), redeDoIp('2804:14c:5b81:8a01::1'))
    for (const x of ['desconhecido', '', null, undefined, '999.1.1.1', 'abc']) assert.equal(redeDoIp(x), null, String(x))
  })

  test('dispositivoDoUa: aparelho e navegador; sem os dois, o começo do texto', () => {
    assert.equal(dispositivoDoUa(IPHONE), 'iPhone · Safari')
    assert.equal(dispositivoDoUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0'), 'Windows · Edge')
    assert.equal(dispositivoDoUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'), 'Mac · Safari')
    assert.equal(dispositivoDoUa('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36'), 'Android · Samsung Internet')
    assert.equal(dispositivoDoUa('curl/8.4.0'), 'curl/8.4.0')
    assert.equal(dispositivoDoUa(''), null)
    assert.equal(dispositivoDoUa(null), null)
  })
})
