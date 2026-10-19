/**
 * Fase 2: o Claude opera o Pauta pelo MCP remoto (/mcp), com o Pauta como servidor de autorização OAuth 2.1.
 * Contrato: docs/API.md §F.1 a §F.7; banco: server/migracoes/100_oauth.sql e 101_mcp_via_claude.sql; pesquisa:
 * docs/fase2/pesquisa-mcp.md. Os formatos do OAuth (metadados, registro, token, erro) seguem as RFCs em snake_case;
 * o resto da API segue camelCase.
 */
import type { DataLocal, Id, Instante } from './nucleo.ts'
import type { PeriodoResultados, ResultadosCliente } from './resultados.ts'
import type { EventosAgendaSaida } from './agenda-externa.ts'

// ─────────────────────────────── "via Claude" ───────────────────────────────

export const VIAS_ATIVIDADE = ['claude'] as const
/**
 * Por onde a pessoa agiu, quando não foi pela tela: 'claude' = uma ferramenta do MCP com o token da pessoa
 * (API.md §F.6). Vem em Atividade.via e Comentario.via; ausente ou null = pela tela.
 */
export type ViaAtividade = (typeof VIAS_ATIVIDADE)[number]

/** Trace de cada chamada de ferramenta: PREFIXO_TRACE_MCP + uuid v4 (40 caracteres; tabela mcp_traco). */
export const PREFIXO_TRACE_MCP = 'mcp-'

// ─────────────────────────────── OAuth: valores fechados ───────────────────────────────

/** Um escopo só: o que a pessoa pode fazer é decidido pelo papel dela, como na API. */
export const ESCOPO_MCP = 'pauta'
/** Aceitos no pedido; offline_access é aceito e ignorado (o refresh sai sempre). */
export const ESCOPOS_OAUTH = ['pauta', 'offline_access'] as const

/**
 * redirect_uri aceitos no registro dinâmico (lista fechada: a defesa contra phishing de consentimento). Além destes,
 * loopback do Claude Code: `http://localhost[:porta]/callback` e `http://127.0.0.1[:porta]/callback`, comparados sem a
 * porta (RFC 8252 §7.3), e os de MCP_REDIRECTS_EXTRAS (só https).
 */
export const REDIRECTS_CLAUDE = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
] as const
/** Origins aceitos no POST /mcp além da origem do APP_URL e de MCP_ORIGENS_EXTRAS. Origin ausente também é aceito. */
export const ORIGENS_CLAUDE = ['https://claude.ai', 'https://claude.com'] as const

export const TIPOS_CLIENTE_OAUTH = ['web', 'native'] as const
export type TipoClienteOAuth = (typeof TIPOS_CLIENTE_OAUTH)[number]

export const DECISOES_AUTORIZACAO = ['permitido', 'negado'] as const
export type DecisaoAutorizacao = (typeof DECISOES_AUTORIZACAO)[number]

export const TIPOS_TOKEN_OAUTH = ['acesso', 'atualizacao'] as const
export type TipoTokenOAuth = (typeof TIPOS_TOKEN_OAUTH)[number]

export const MOTIVOS_REVOGACAO_CONEXAO = [
  'usuario', 'admin', 'desativacao', 'reuso_refresh', 'codigo_reusado', 'pedido_cliente', 'substituida',
] as const
/**
 * usuario: a própria pessoa em Conexões; admin: o admin em Conexões; desativacao: a pessoa foi desativada;
 * reuso_refresh: refresh já trocado usado de novo depois da tolerância (roubo provável); codigo_reusado: código de
 * autorização usado duas vezes; pedido_cliente: POST /oauth/revogar; substituida: a pessoa autorizou o mesmo cliente de
 * novo.
 */
export type MotivoRevogacaoConexao = (typeof MOTIVOS_REVOGACAO_CONEXAO)[number]
export const ROTULO_MOTIVO_REVOGACAO: Record<MotivoRevogacaoConexao, string> = {
  usuario: 'Revogada por você',
  admin: 'Revogada pelo admin',
  desativacao: 'Pessoa desativada',
  reuso_refresh: 'Revogada por segurança (token reutilizado)',
  codigo_reusado: 'Revogada por segurança (código reutilizado)',
  pedido_cliente: 'Desconectada pelo Claude',
  substituida: 'Substituída por uma autorização nova',
}

/** Prazos do OAuth e do MCP. */
export const PRAZOS_OAUTH = {
  pedidoMin: 10,
  codigoMin: 5,
  acessoSeg: 3600,
  /** Reuso de um refresh já trocado dentro desta folga troca de novo (duas conversas renovando juntas). */
  toleranciaRefreshSeg: 60,
  /** ultimo_uso_em da concessão e do cliente: no máximo a cada 10 min. O refresh vale sessaoValidadeDias (config). */
  ultimoUsoMin: 10,
} as const

/** Limites (por concessão, não por IP: todo o Claude chega pela mesma faixa da Anthropic). */
export const LIMITES_MCP = {
  chamadasPorMinuto: 60,
  /** Itens por página nas listas das ferramentas (padrão) e o máximo que `limite` aceita. */
  pagina: 20,
  paginaMax: 50,
  /** Teto de uma resposta de ferramenta (o Claude Code corta em 25 mil tokens). */
  respostaMaxCaracteres: 20000,
  descricaoMaxCaracteres: 4000,
  comentarioMaxCaracteres: 600,
  /** Registro dinâmico: por IP por hora, e o teto de clientes ainda sem concessão. */
  registrosPorHoraIp: 30,
  clientesSemConcessaoMax: 300,
  /** POST /oauth/token por client_id por minuto. */
  tokensPorMinutoCliente: 30,
} as const

// ─────────────────────────────── OAuth: formatos das RFCs (snake_case) ───────────────────────────────

/** GET /.well-known/oauth-protected-resource[/mcp] (RFC 9728). */
export interface MetadadosRecursoProtegido {
  resource: string
  authorization_servers: [string]
  scopes_supported: ['pauta']
  bearer_methods_supported: ['header']
  resource_name: string
}

/** GET /.well-known/oauth-authorization-server (RFC 8414). Sem client_id_metadata_document_supported (CIMD depois). */
export interface MetadadosServidorAutorizacao {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint: string
  revocation_endpoint: string
  scopes_supported: ['pauta', 'offline_access']
  response_types_supported: ['code']
  response_modes_supported: ['query']
  grant_types_supported: ['authorization_code', 'refresh_token']
  token_endpoint_auth_methods_supported: ['none']
  revocation_endpoint_auth_methods_supported: ['none']
  code_challenge_methods_supported: ['S256']
  authorization_response_iss_parameter_supported: true
}

/** POST /oauth/registrar (RFC 7591; JSON). Campos desconhecidos são ignorados. */
export interface RegistroClienteEntrada {
  redirect_uris: string[]
  client_name?: string
  grant_types?: string[]
  response_types?: string[]
  token_endpoint_auth_method?: string
  application_type?: string
  scope?: string
}

/** 201 do registro: o que valeu (o servidor troca o método por 'none'). */
export interface RegistroClienteSaida {
  client_id: string
  client_id_issued_at: number
  client_name: string
  redirect_uris: string[]
  grant_types: ['authorization_code', 'refresh_token']
  response_types: ['code']
  token_endpoint_auth_method: 'none'
  application_type: TipoClienteOAuth
  scope: 'pauta'
}

/** 200 de POST /oauth/token (form-urlencoded na entrada). */
export interface TokenSaida {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: 'pauta'
}

/** Erro do /oauth/registrar e do /oauth/token (RFC 6749 §5.2, RFC 7591 §3.2.2). Nunca ErroApi aqui. */
export interface ErroOAuth {
  error: 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'unauthorized_client' | 'unsupported_grant_type'
    | 'invalid_scope' | 'invalid_redirect_uri' | 'invalid_client_metadata' | 'temporarily_unavailable'
  error_description?: string
}

// ─────────────────────────────── consentimento e Conexões (dentro de /api, camelCase) ───────────────────────────────

/** Para onde o código vai: claude.ai/claude.com, o Claude Code neste computador (loopback) ou um extra do ambiente. */
export type DestinoConexao = 'claude_ai' | 'claude_code' | 'outro'

/** GET /api/oauth/pedidos/:id: o que a tela /autorizar mostra. */
export interface PedidoAutorizacao {
  id: string
  /** client_name declarado pelo cliente: dado, não garantia (a tela diz isso). */
  nomeCliente: string
  destino: DestinoConexao
  /** Host do redirect em destaque ("claude.ai", "localhost"). */
  hostRedirect: string
  expiraEm: Instante
  /** A pessoa já tem uma conexão ativa com este cliente (autorizar de novo substitui). */
  substitui: boolean
}

/** POST /api/oauth/pedidos/:id/decisao */
export interface DecisaoAutorizacaoEntrada {
  permitir: boolean
}

/**
 * A tela faz location.assign(redirecionar): um <form> com 302 para o claude.ai seria bloqueado pela CSP
 * `form-action 'self'` (pesquisa-mcp §4.5). Leva code (ou error=access_denied), state e iss.
 */
export interface DecisaoAutorizacaoSaida {
  redirecionar: string
}

/** Uma conexão (oauth_concessao). Também é o evento de tempo real `conexao` (público usuario_admin: o dono e admins). */
export interface ConexaoMcp {
  id: Id
  usuarioId: Id
  nomeCliente: string
  destino: DestinoConexao
  hostRedirect: string
  criadaEm: Instante
  ultimoUsoEm: Instante | null
  revogadaEm: Instante | null
  motivoRevogacao: MotivoRevogacaoConexao | null
}

/** GET /api/conexoes */
export interface ListarConexoesConsulta {
  /** Só admin: as de todas as pessoas (sem: só as minhas). */
  todas?: boolean
  /** Padrão false: só as ativas. */
  incluirRevogadas?: boolean
}

export interface ListarConexoesSaida {
  /** O endereço que se cola no Claude: APP_URL + '/mcp', sem barra no fim. */
  urlMcp: string
  conexoes: ConexaoMcp[]
}

// ─────────────────────────────── ferramentas ───────────────────────────────

/** Ordem fixa do tools/list (API.md §F.5). */
export const FERRAMENTAS_MCP = [
  'minhas_demandas', 'buscar_demandas', 'ler_demanda', 'agenda', 'listar', 'resumo_cliente',
  'criar_demanda', 'editar_demanda', 'mover_demanda', 'comentar', 'checklist', 'concluir_demanda',
  'arquivar_demanda', 'lancar_horas', 'registrar_retorno',
] as const
export type FerramentaMcp = (typeof FERRAMENTAS_MCP)[number]
/** As que escrevem (readOnlyHint false): gravam mcp_traco e marcam o histórico "via Claude". */
export const FERRAMENTAS_MCP_ESCRITA = [
  'criar_demanda', 'editar_demanda', 'mover_demanda', 'comentar', 'checklist', 'concluir_demanda',
  'arquivar_demanda', 'lancar_horas', 'registrar_retorno',
] as const satisfies readonly FerramentaMcp[]

// ─────────────────────────────── ponte F7 ↔ F8/F9 (sem import cruzado) ───────────────────────────────

/**
 * Quem fornece dados de outra funcionalidade às ferramentas do MCP. Cada funcionalidade cria
 * `server/src/provedores/<prefixo>.ts` com `export const provedor: ProvedorMcp<Db>`; o F7 descobre a pasta no boot
 * (`server/src/servicos/mcp-provedores.ts`; pasta ausente = vazia). Sem provedor, a ferramenta diz "ainda não disponível"
 * e segue com o resto. `Db` é o DatabaseSync do servidor (opaco aqui, porque shared/ não conhece o servidor).
 */
export interface ProvedorResultadosMcp<Db = unknown> {
  tipo: 'resultados'
  /**
   * Os resultados do cliente no período (permissão: todo interno vê). Com cache vencido ou ausente, busca na Windsor e
   * espera no máximo `esperarMs` (o MCP usa 45 000, abaixo do corte de 100 s da Cloudflare); passou disso, devolve o
   * que houver com `atualizando: true`.
   */
  resultados(db: Db, e: { clienteId: Id; periodo: PeriodoResultados; esperarMs: number }): Promise<ResultadosCliente>
}

export interface ProvedorAgendaMcp<Db = unknown> {
  tipo: 'agenda'
  /** As ocorrências das agendas ativas no período (até 62 dias), do cache; privados já vêm como "Ocupado". */
  eventos(db: Db, e: { de: DataLocal; ate: DataLocal }): EventosAgendaSaida
}

export type ProvedorMcp<Db = unknown> = ProvedorResultadosMcp<Db> | ProvedorAgendaMcp<Db>
