/**
 * Roteiro de protocolo do MCP (F7, FASE2-PLANO §3): o fluxo inteiro como o claude.ai / Claude Code faz, contra um Pauta
 * no ar, sem navegador. Imprime "N/17 ok|falhou <passo>" por passo e NUNCA um token, código, state ou cookie.
 *
 *   PAUTA_EMAIL=<seu> PAUTA_SENHA=<sua> node server/scripts/mcp-fluxo.ts --base http://localhost:5230 --quadro criacao
 *   (--limpar arquiva a demanda de teste no fim; o e-mail e a senha só pelo ambiente)
 *
 * 1 registro com loopback → 2 PKCE → 3 GET /oauth/autorizar sem seguir (guarda o cookie do pedido) → 4 login →
 * 5 a tela (GET /api/oauth/pedidos/:id) → 6 decisão → 7 code do redirecionar → 8 token → 9 initialize + tools/list →
 * 10 minhas_demandas → 11 criar_demanda → 12 histórico "via Claude" → 13 comentar → 14 refresh (rotação) →
 * 15 o refresh antigo de novo em 60 s (o mesmo par) → 16 revogar em Conexões → 17 /mcp → 401 invalid_token.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { FERRAMENTAS_MCP } from '../../shared/tipos/index.ts'

const TOTAL = 17

function arg(nome: string, padrao?: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i > 0 ? process.argv[i + 1] : padrao
}

/** Tira do texto qualquer coisa que pareça segredo antes de imprimir (rede de segurança: nada daqui vai ao terminal). */
function seguro(texto: string, segredos: string[]): string {
  let t = texto
  for (const s of segredos) if (s && s.length >= 8) t = t.split(s).join('***')
  return t.replace(/pauta_(at|rt)_[\w-]+/g, 'pauta_$1_***').replace(/\b(code|state|code_verifier|access_token|refresh_token)=[^&\s"]+/g, '$1=***')
    .slice(0, 300)
}

class Falhou extends Error {}

async function main(): Promise<number> {
  const base = (arg('base', process.env.BASE) ?? 'http://localhost:5230').replace(/\/+$/, '')
  const quadro = arg('quadro', 'criacao')!
  const limpar = process.argv.includes('--limpar')
  const email = process.env.PAUTA_EMAIL
  const senha = process.env.PAUTA_SENHA
  if (!email || !senha) {
    console.error('Defina PAUTA_EMAIL e PAUTA_SENHA no ambiente (nunca na linha de comando).')
    return 2
  }
  const origem = new URL(base).origin
  const segredos: string[] = [senha]
  const cookies = new Map<string, string>()
  let passo = 0
  let ok = 0

  const guardarCookies = (r: Response) => {
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(';')
      const i = par!.indexOf('=')
      const nome = par!.slice(0, i).trim()
      const valor = par!.slice(i + 1).trim()
      if (valor) { cookies.set(nome, valor); segredos.push(valor) } else cookies.delete(nome)
    }
  }
  const cabecalhoCookie = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  const tela = (mutacao: boolean): Record<string, string> => ({
    Cookie: cabecalhoCookie(), ...(mutacao ? { Origin: origem, 'X-Trace-Id': randomUUID(), 'Content-Type': 'application/json' } : {}),
  })

  async function etapa<T>(nome: string, fn: () => Promise<T>): Promise<T> {
    passo++
    try {
      const v = await fn()
      ok++
      console.log(`${passo}/${TOTAL} ok ${nome}`)
      return v
    } catch (e) {
      console.log(`${passo}/${TOTAL} falhou ${nome}: ${seguro(e instanceof Error ? e.message : String(e), segredos)}`)
      throw new Falhou()
    }
  }
  const exigir = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg) }
  async function json(r: Response): Promise<any> {
    const t = await r.text()
    try { return t ? JSON.parse(t) : null } catch { return t }
  }

  let at = ''
  let rt = ''
  let id = 1
  const rpc = async (token: string, method: string, params?: unknown) => fetch(`${base}/mcp`, {
    method: 'POST', redirect: 'manual',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, ...(params !== undefined ? { params } : {}) }),
  })
  const ferramenta = async (nome: string, args: Record<string, unknown>) => {
    const r = await rpc(at, 'tools/call', { name: nome, arguments: args })
    const c = await json(r)
    exigir(r.status === 200 && c?.result, `HTTP ${r.status}`)
    exigir(!c.result.isError, `isError: ${c.result.content?.[0]?.text}`)
    return String(c.result.content[0].text)
  }

  try {
    const porta = 40000 + Math.floor(Math.random() * 20000)
    const redirect = `http://127.0.0.1:${porta}/callback`
    const cliente = await etapa('registro com loopback (POST /oauth/registrar)', async () => {
      const r = await fetch(`${base}/oauth/registrar`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'mcp-fluxo (roteiro de protocolo)', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'], token_endpoint_auth_method: 'none' }) })
      const c = await json(r)
      exigir(r.status === 201 && c.client_id && c.application_type === 'native', `HTTP ${r.status} ${c?.error ?? ''}`)
      return c.client_id as string
    })
    const pkce = await etapa('PKCE S256', async () => {
      const verificador = randomBytes(48).toString('base64url')
      segredos.push(verificador)
      return { verificador, desafio: createHash('sha256').update(verificador).digest('base64url'), state: randomBytes(16).toString('hex') }
    })
    segredos.push(pkce.state)
    const pedido = await etapa('GET /oauth/autorizar sem seguir (cookie do pedido)', async () => {
      const q = new URLSearchParams({ response_type: 'code', client_id: cliente, redirect_uri: redirect, code_challenge: pkce.desafio,
        code_challenge_method: 'S256', scope: 'pauta offline_access', state: pkce.state, resource: `${base}/mcp` })
      const r = await fetch(`${base}/oauth/autorizar?${q}`, { redirect: 'manual' })
      exigir(r.status === 302, `HTTP ${r.status}`)
      guardarCookies(r)
      const local = new URL(r.headers.get('location') ?? '', base)
      exigir(local.pathname === '/autorizar', 'não foi para a tela /autorizar')
      exigir([...cookies.keys()].some((k) => k.endsWith('pauta_oauth')), 'sem o cookie do pedido')
      const p = local.searchParams.get('pedido')!
      segredos.push(p)
      return p
    })
    await etapa('login (POST /api/auth/login)', async () => {
      const r = await fetch(`${base}/api/auth/login`, { method: 'POST', redirect: 'manual', headers: tela(true), body: JSON.stringify({ email, senha }) })
      exigir(r.status === 200, `HTTP ${r.status}`)
      guardarCookies(r)
      exigir([...cookies.keys()].some((k) => k === 'sid' || k === '__Host-sid'), 'sem o cookie da sessão')
    })
    const destino = await etapa('a tela (GET /api/oauth/pedidos/:id)', async () => {
      const r = await fetch(`${base}/api/oauth/pedidos/${pedido}`, { redirect: 'manual', headers: tela(false) })
      const c = await json(r)
      exigir(r.status === 200, `HTTP ${r.status} ${c?.erro?.mensagem ?? ''}`)
      exigir(c.destino === 'claude_code' && c.hostRedirect === '127.0.0.1', `destino ${c.destino}`)
      return c
    })
    void destino
    const redirecionar = await etapa('decisão (POST /api/oauth/pedidos/:id/decisao)', async () => {
      const r = await fetch(`${base}/api/oauth/pedidos/${pedido}/decisao`, { method: 'POST', redirect: 'manual', headers: tela(true),
        body: JSON.stringify({ permitir: true, substituir: false }) })
      const c = await json(r)
      exigir(r.status === 200 && c.redirecionar, `HTTP ${r.status} ${c?.erro?.mensagem ?? ''}`)
      guardarCookies(r)
      return String(c.redirecionar)
    })
    const codigo = await etapa('code, state e iss no redirecionar', async () => {
      const u = new URL(redirecionar)
      exigir(`${u.origin}${u.pathname}` === redirect, 'outro redirect')
      exigir(u.searchParams.get('state') === pkce.state, 'state diferente')
      exigir(u.searchParams.get('iss') === origem, 'iss diferente')
      const c = u.searchParams.get('code')
      exigir(c, 'sem code')
      segredos.push(c!)
      return c!
    })
    await etapa('token (POST /oauth/token)', async () => {
      const r = await fetch(`${base}/oauth/token`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: codigo, client_id: cliente, redirect_uri: redirect,
          code_verifier: pkce.verificador, resource: `${base}/mcp` }) })
      const c = await json(r)
      exigir(r.status === 200 && c.access_token && c.refresh_token, `HTTP ${r.status} ${c?.error ?? ''}`)
      exigir(r.headers.get('cache-control') === 'no-store', 'sem Cache-Control: no-store')
      at = c.access_token
      rt = c.refresh_token
      segredos.push(at, rt)
    })
    await etapa('initialize + tools/list (15, na ordem)', async () => {
      const i = await rpc(at, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'mcp-fluxo', version: '1' } })
      const ci = await json(i)
      exigir(i.status === 200 && ci.result?.protocolVersion === '2025-11-25', `initialize HTTP ${i.status}`)
      exigir(!i.headers.get('mcp-session-id'), 'Mcp-Session-Id na resposta')
      const l = await rpc(at, 'tools/list')
      const cl = await json(l)
      const nomes = (cl.result?.tools ?? []).map((t: { name: string }) => t.name)
      exigir(JSON.stringify(nomes) === JSON.stringify(FERRAMENTAS_MCP), `ferramentas: ${nomes.join(',')}`)
    })
    await etapa('minhas_demandas', async () => {
      const t = await ferramenta('minhas_demandas', {})
      exigir(/^.+ \((admin|atendimento|equipe)\) · /.test(t), 'primeira linha diferente')
    })
    const numero = await etapa(`criar_demanda no quadro ${quadro}`, async () => {
      const t = await ferramenta('criar_demanda', { titulo: `Teste MCP ${new Date().toISOString().slice(0, 16)}`, quadro })
      const m = /^Criada #(\d+) /.exec(t)
      exigir(m, `resposta: ${t.slice(0, 80)}`)
      return Number(m![1])
    })
    const demandaId = await etapa('histórico com via claude (GET /api/demandas/:id/historico)', async () => {
      const d = await json(await fetch(`${base}/api/demandas/${numero}`, { headers: tela(false) }))
      const idDemanda = d?.demanda?.id
      exigir(idDemanda, 'demanda não encontrada pela tela')
      const r = await fetch(`${base}/api/demandas/${idDemanda}/historico`, { headers: tela(false) })
      const h = await json(r)
      exigir(r.status === 200 && h.itens?.length && h.itens.every((a: { via?: string }) => a.via === 'claude'), 'sem via claude')
      return String(idDemanda)
    })
    await etapa('comentar', async () => {
      const t = await ferramenta('comentar', { numero, texto: 'Comentário do roteiro de protocolo (mcp-fluxo).' })
      exigir(t.startsWith(`Comentário em #${numero}`), `resposta: ${t.slice(0, 80)}`)
    })
    const novo = await etapa('refresh (rotação)', async () => {
      const r = await fetch(`${base}/oauth/token`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: cliente }) })
      const c = await json(r)
      exigir(r.status === 200 && c.refresh_token && c.refresh_token !== rt && c.access_token !== at, `HTTP ${r.status} ${c?.error ?? ''}`)
      segredos.push(c.access_token, c.refresh_token)
      return { at: c.access_token as string, rt: c.refresh_token as string }
    })
    await etapa('o refresh antigo de novo em 60 s devolve o mesmo par', async () => {
      const r = await fetch(`${base}/oauth/token`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: cliente }) })
      const c = await json(r)
      exigir(r.status === 200 && c.refresh_token === novo.rt && c.access_token === novo.at, `HTTP ${r.status} ${c?.error ?? ''}`)
      at = novo.at
      rt = novo.rt
    })
    await etapa('revogar em Conexões (POST /api/conexoes/:id/revogar)', async () => {
      const lista = await json(await fetch(`${base}/api/conexoes`, { headers: tela(false) }))
      const conexao = (lista?.conexoes ?? []).find((x: { nomeCliente: string; destino: string }) =>
        x.destino === 'claude_code' && x.nomeCliente.startsWith('mcp-fluxo'))
      exigir(conexao, 'conexão do roteiro não aparece em Conexões')
      const r = await fetch(`${base}/api/conexoes/${conexao.id}/revogar`, { method: 'POST', redirect: 'manual', headers: tela(true), body: '{}' })
      const c = await json(r)
      exigir(r.status === 200 && c.revogadaEm && c.motivoRevogacao === 'usuario', `HTTP ${r.status}`)
    })
    await etapa('/mcp → 401 invalid_token com WWW-Authenticate', async () => {
      const r = await rpc(at, 'tools/list')
      const desafio = r.headers.get('www-authenticate') ?? ''
      exigir(r.status === 401, `HTTP ${r.status}`)
      exigir(desafio.includes('error="invalid_token"') && desafio.includes(`resource_metadata="${origem}/.well-known/oauth-protected-resource/mcp"`),
        'WWW-Authenticate diferente')
    })
    if (limpar) {
      const r = await fetch(`${base}/api/demandas/${demandaId}/arquivar`, { method: 'POST', redirect: 'manual', headers: tela(true), body: '{}' })
      console.log(r.status === 200 ? `demanda #${numero} arquivada (--limpar)` : `não arquivou a #${numero}: HTTP ${r.status}`)
    }
  } catch (e) {
    if (!(e instanceof Falhou)) console.log(`erro: ${seguro(e instanceof Error ? e.message : String(e), segredos)}`)
  }
  console.log(`${ok}/${TOTAL} ok`)
  return ok === TOTAL ? 0 : 1
}

process.exit(await main())
