/**
 * Variáveis de ambiente. `config` é lido uma vez no boot; os testes ajustam com `configurar()` (ex.: NODE_ENV de
 * produção para o cookie __Host-sid, TRUST_PROXY_HOPS para o IP real).
 */
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

export interface Config {
  porta: number
  /** Endereço de escuta: 0.0.0.0 em produção (container), 127.0.0.1 em desenvolvimento. */
  host: string
  dataDir: string
  /** Origem do app ("https://demandas.meltcomunicacao.com.br"; em dev, a do Vite). O anti-CSRF compara o Origin. */
  appUrl: string
  appNome: string
  /** 32+ bytes: assina URLs de arquivo, cifra o token do link público e faz o HMAC do IP. */
  segredo: string
  producao: boolean
  /** Quantos proxies confiáveis acrescentam ao X-Forwarded-For (o Traefik do EasyPanel = 1). */
  trustProxyHops: number
  adminEmail: string | null
  adminSenha: string | null
  /** Log de cada requisição (desligado nos testes). */
  log: boolean
  versao: string
  // Fase 2 (docs/FASE2-PLANO.md §1.3; .env.example)
  /** WINDSOR_API_KEY: só no servidor; nunca em log, resposta ou mensagem de erro. Null = "sem chave" (F8). */
  windsorApiKey: string | null
  /** MCP_ATIVO (padrão 1): 0 desliga /mcp, /oauth/* e os metadados (404) sem deploy de código (F7). */
  mcpAtivo: boolean
  /** MCP_REDIRECTS_EXTRAS: redirect_uri https aceitos no registro além dos do Claude e do loopback (F7). */
  mcpRedirectsExtras: string[]
  /** MCP_ORIGENS_EXTRAS: Origins https aceitos no POST /mcp além do APP_URL, claude.ai e claude.com (F7). */
  mcpOrigensExtras: string[]
}

function inteiro(valor: string | undefined, padrao: number): number {
  if (valor === undefined || valor === '') return padrao
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 0) throw new Error(`Número inválido no ambiente: ${valor}`)
  return n
}

/** Lista separada por vírgula, cada item https:// (origem: sem caminho). Vazia → []. */
function listaHttps(nome: string, valor: string | undefined, soOrigem: boolean): string[] {
  const itens = (valor ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  for (const item of itens) {
    let url: URL
    try {
      url = new URL(item)
    } catch {
      throw new Error(`${nome}: endereço inválido: ${item}`)
    }
    if (url.protocol !== 'https:') throw new Error(`${nome}: só https: ${item}`)
    if (soOrigem && url.origin !== item.replace(/\/+$/, '')) throw new Error(`${nome}: só a origem, sem caminho: ${item}`)
  }
  return soOrigem ? itens.map((x) => new URL(x).origin) : itens
}

function lerAmbiente(env: NodeJS.ProcessEnv): Config {
  const producao = env.NODE_ENV === 'production'
  let segredo = env.SEGREDO ?? ''
  if (Buffer.byteLength(segredo) < 32) {
    if (producao) throw new Error('SEGREDO precisa ter pelo menos 32 bytes em produção.')
    if (segredo) console.warn('SEGREDO com menos de 32 bytes: usando um segredo aleatório nesta execução.')
    segredo = randomBytes(32).toString('base64url')
  }
  const appUrl = (env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
  return {
    porta: inteiro(env.PORT, 7300),
    host: env.HOST ?? (producao ? '0.0.0.0' : '127.0.0.1'),
    dataDir: resolve(env.DATA_DIR ?? './data'),
    appUrl,
    appNome: env.APP_NOME?.trim() || 'Pauta',
    segredo,
    producao,
    trustProxyHops: inteiro(env.TRUST_PROXY_HOPS, 0),
    adminEmail: env.ADMIN_EMAIL?.trim().toLowerCase() || null,
    adminSenha: env.ADMIN_SENHA || null,
    log: env.NODE_ENV !== 'test',
    versao: env.APP_VERSAO ?? '0.1.0',
    windsorApiKey: env.WINDSOR_API_KEY?.trim() || null,
    mcpAtivo: env.MCP_ATIVO !== '0',
    mcpRedirectsExtras: listaHttps('MCP_REDIRECTS_EXTRAS', env.MCP_REDIRECTS_EXTRAS, false),
    mcpOrigensExtras: listaHttps('MCP_ORIGENS_EXTRAS', env.MCP_ORIGENS_EXTRAS, true),
  }
}

export const config: Config = lerAmbiente(process.env)

/** Ajusta a configuração (testes). Devolve a anterior para restaurar. */
export function configurar(parcial: Partial<Config>): Config {
  const anterior = { ...config }
  Object.assign(config, parcial)
  return anterior
}

/** Origem (esquema + host + porta) de APP_URL, para comparar com o header Origin. */
export function origemApp(): string {
  return new URL(config.appUrl).origin
}
