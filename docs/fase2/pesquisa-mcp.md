# Pesquisa: MCP remoto + OAuth para o claude.ai

Fase 2, item 1 do `docs/FASE2.md`. Pesquisa feita em 19/10/2026 nas fontes oficiais (lista no fim). Não muda código:
é a base para quem for implementar `/mcp`, o servidor de autorização e a tela de consentimento.

## 0. Resumo e recomendação

- **Protocolo.** A especificação vigente do MCP é a **2026-07-28** (sem estado: acabam `initialize`, sessões
  `Mcp-Session-Id`, o GET de SSE e a retomada por `Last-Event-ID`). A anterior, **2025-11-25**, ainda é a que a
  documentação do Claude cita para autorização, e a Anthropic diz que o suporte à 2026-07-28 "está sendo distribuído"
  nos produtos. O `/mcp` do Pauta precisa atender **as duas eras no mesmo endereço**, sem estado, sempre com resposta
  JSON (sem SSE), GET e DELETE com `405`.
- **SDK.** O `@modelcontextprotocol/sdk` 1.32 **roda no Hono sem express** (`WebStandardStreamableHTTPServerTransport`),
  mas instala express, cors, express-rate-limit, ajv, jose e mais 11 pacotes na imagem, só fala até a 2025-11-25 e é a
  linha v1, já substituída. **Recomendo a v2: `@modelcontextprotocol/server`** (versão exata, hoje 2.3.1), que depende só
  de `zod` (já temos) e `@modelcontextprotocol/core`, atende a 2026-07-28 e os clientes 2025 sem estado, e expõe um
  `fetch(Request) → Response` que montamos numa rota do nosso Hono. Plano B, se a v2 der atrito: JSON-RPC à mão
  (subconjunto pequeno, §5.3). Não usar a v1.
- **OAuth.** Feito à mão (nenhum SDK oferece servidor de autorização para Hono): metadados RFC 9728 e RFC 8414, registro
  dinâmico RFC 7591 (o claude.ai usa por padrão), código com PKCE S256, `resource` RFC 8707, `iss` RFC 9207, tokens
  opacos com hash e refresh com rotação. Lista fechada de `redirect_uri` (claude.ai, claude.com e loopback do Claude
  Code) no registro: é a defesa principal contra phishing de consentimento. CIMD fica para depois (§4.9).
- **Claude.ai exige:** `401` com `WWW-Authenticate: Bearer resource_metadata=...` (num `200` ele ignora), `resource` dos
  metadados igual à URL digitada, callback `https://claude.ai/api/mcp/auth_callback`, `/token` aceitando
  `application/x-www-form-urlencoded`, `invalid_grant` em refresh vencido, respostas de descoberta/registro/token em até
  10 s, tráfego vindo de `160.79.104.0/21` (IPv4), resultado de ferramenta até ~150 mil caracteres e 240 s por chamada.
- **Maiores riscos no nosso ambiente:** Bot Fight Mode da Cloudflare (não aceita exceção por regra no plano Free), o
  fallback de SPA do `web.ts` devolvendo `index.html` com `200` em `/.well-known/*` e `/oauth/*`, a CSP
  `form-action 'self'` bloqueando o redirecionamento do consentimento no Chrome, o anti-CSRF e o `bodyLimit` que hoje só
  cobrem `/api/*`, e limites por IP (todo o tráfego do Claude vem da mesma faixa da Anthropic).

## 1. A especificação hoje

| Revisão | O que importa para nós |
|---|---|
| [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) | `initialize` + `notifications/initialized`; sessão **opcional** (`Mcp-Session-Id`); GET pode responder `405`; resposta JSON ou SSE à escolha do servidor; `MCP-Protocol-Version` em toda requisição depois do `initialize` (versão inválida → `400`; ausente → assumir `2025-03-26`). Autorização: PRM obrigatório, CIMD **SHOULD**, DCR **MAY**, PKCE S256, `resource`. |
| [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog) | Sem `initialize` nem sessões: cada requisição leva versão e capacidades em `_meta`; novo `server/discover` (obrigatório); GET removido (servidor só desta revisão responde `405` a GET/DELETE e ignora `Mcp-Session-Id` e `Last-Event-ID`); cabeçalhos `Mcp-Method` e `Mcp-Name` obrigatórios e conferidos contra o corpo (`400` + erro `-32020`); versão não suportada → `400` + `-32022`; método desconhecido → `404` + `-32601`; todo resultado com `resultType`; `tools/list` com `ttlMs` e `cacheScope`. Autorização: **DCR passa a "deprecated"** (continua valendo por compatibilidade, janela mínima de 12 meses), `iss` na resposta de autorização (RFC 9207, **SHOULD**), `application_type` no DCR, credenciais do cliente presas ao emissor, `offline_access` não deve aparecer no PRM. |

O mesmo endereço pode servir as duas eras: o cliente moderno manda uma requisição moderna e, se recebe `400` sem um erro
JSON-RPC moderno reconhecível, volta ao `initialize`
([compatibilidade](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#backward-compatibility)).

## 2. O que o Claude (claude.ai, Desktop, celular, Cowork, Claude Code) exige

Fonte: [Authentication for connectors](https://claude.com/docs/connectors/building/authentication),
[Build an MCP server](https://claude.com/docs/connectors/building/index.md),
[Lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication.md),
[Troubleshooting](https://claude.com/docs/connectors/building/troubleshooting.md),
[Testing](https://claude.com/docs/connectors/building/testing.md). A mesma infraestrutura atende todas as superfícies.

| Ponto | Exigência |
|---|---|
| Transporte | Streamable HTTP (o HTTP+SSE antigo ainda funciona, mas está saindo). Não suporta assinaturas de recursos nem sampling. |
| Especificação de autorização | Segue 2025-03-26, 2025-06-18 e 2025-11-25. |
| Gatilho do login | Só `401` com `WWW-Authenticate: Bearer resource_metadata="..."`. `WWW-Authenticate` num `200` é ignorado; `200` com `isError` vira texto para o modelo, sem botão de conectar. `403` só reautoriza com `error="insufficient_scope"`; outro `403` é erro final. |
| PRM | `resource` **igual** à URL que a pessoa digita (com o caminho `/mcp`); só o **primeiro** item de `authorization_servers` é usado. Sem o ponteiro no `401`, tenta `/.well-known/oauth-protected-resource/mcp` e depois `/.well-known/oauth-protected-resource`. |
| Metadados do AS | Tenta `/.well-known/oauth-authorization-server` e depois `/.well-known/openid-configuration`. Precisa de `code_challenge_methods_supported: ["S256"]` e de `registration_endpoint` (DCR) ou de CIMD. |
| Registro do cliente | DCR (`oauth_dcr`) e CIMD (`oauth_cimd`) funcionam sem falar com a Anthropic. CIMD só é escolhido se o AS anunciar `client_id_metadata_document_supported: true` **e** `"none"` em `token_endpoint_auth_methods_supported`; senão usa DCR. No DCR o Claude é **cliente público** e registra um cliente novo a cada conexão nova. |
| Callback | Apps hospedados: exatamente `https://claude.ai/api/mcp/auth_callback` (o artigo de suporte avisa que pode mudar para `https://claude.com/api/mcp/auth_callback`; aceitar as duas). Claude Code: loopback em porta variável (`http://localhost:PORTA/callback` e `http://127.0.0.1:PORTA/callback`), comparar **ignorando a porta** (RFC 8252 §7.3). |
| PKCE e escopo | Sempre `code_challenge_method=S256`. Escopo pedido = `scope` do `WWW-Authenticate` do `401`; sem ele, todos os `scopes_supported` do PRM. Acrescenta `offline_access` se o AS o listar em `scopes_supported`, para ganhar refresh token. |
| `resource` | Enviado na autorização e no token, na forma canônica (esquema e host minúsculos, sem barra final, sem fragmento, sem porta padrão). Comparar normalizado, não byte a byte. |
| Token | `/token` recebe `application/x-www-form-urlencoded` (o `/register` recebe JSON). Refresh reativo no `401` e proativo até 5 min antes de vencer (precisa de `expires_in`). Refresh inválido → `invalid_grant`. Rotacionar refresh de cliente público e devolver o novo na mesma resposta. |
| Prazos | 10 s para descoberta, registro e token; 30 s para refresh. Ferramenta: 240 s por chamada no claude.ai. |
| Tamanho | Resultado de ferramenta até ~150.000 caracteres (claude.ai/Desktop); Claude Code corta em 25.000 tokens por padrão (`MAX_MCP_OUTPUT_TOKENS`). |
| Rede | Todo o tráfego (MCP, descoberta, registro, token) sai de **`160.79.104.0/21`** ([IPs](https://platform.claude.com/docs/en/api/ip-addresses)); conectores são **só IPv4** e recusam host que resolva para IP privado. Redirecionamento para outro host derruba o `Authorization` e vira "Authorization ... failed". |
| Cache de descoberta | O Claude guarda PRM e metadados do AS por ~5 min por URL, para todos os usuários. Mudança de metadados demora isso para valer. |
| Identificação | `clientInfo.name` varia ("claude-ai", "Anthropic", "claude-code"): só para telemetria, nunca para autorizar. |
| Planos | Conector por URL em Free (1), Pro, Max, Team e Enterprise. Em Team/Enterprise o **Owner** adiciona em *Organization settings > Connectors* e cada membro clica **Connect** com a própria conta (é o nosso caso: cada pessoa autoriza com o próprio login do Pauta). Autenticação do conector não muda depois de criado: remover e adicionar de novo. |

## 3. O que o `/mcp` do Pauta responde

URL: `https://demandas.meltcomunicacao.com.br/mcp` (derivada de `APP_URL` + `/mcp`; sem barra final; sem redirecionar).

| Pedido | Resposta |
|---|---|
| Qualquer método sem `Authorization: Bearer` válido | `401` + `WWW-Authenticate` (§4.3). Todas as ferramentas agem como a pessoa, então não há modo anônimo ("lazy auth" não se aplica). |
| `Origin` presente e fora da lista | `403` (exigência da spec contra DNS rebinding). Ausente = aceito (o Claude chama do backend). Lista: origem do `APP_URL`, `https://claude.ai`, `https://claude.com`. Registrar no log o valor recusado (sem token) para ajustar: a doc do Claude avisa que checagem estrita de `Origin` derruba conexões. |
| `GET` ou `DELETE` | `405` com `Allow: POST` (não oferecemos stream nem sessão). **Precisa estar registrado antes do fallback de SPA**, senão o GET devolve o `index.html`. |
| `POST` com notificação | `202` sem corpo. |
| `POST` com requisição | `200` `application/json` (nunca SSE). Era 2025: `initialize`, `ping`, `tools/list`, `tools/call`. Era 2026: `server/discover`, `tools/list`, `tools/call` com `_meta`. |
| `Mcp-Session-Id` recebido | Ignorar; nunca emitir. Sem estado: um deploy ou reinício não derruba ninguém. |
| Corpo grande | `413` antes do parse (o `bodyLimit` atual só vale para `/api/*`: pôr 1 MiB em `/mcp`). |

Ferramentas: lista igual para todo mundo (as regras de papel e campo valem na execução, como na API), ordem fixa, com
`annotations` (`readOnlyHint: true` nas leituras; `destructiveHint: false` e `idempotentHint` onde couber nas escritas;
`openWorldHint: false`). Erro de regra de negócio (o `ErroHttp` 403/404/409/422 dos serviços) vira **resultado com
`isError: true`** e a mensagem em português, para o modelo ler e corrigir. Só problema de token vira HTTP `401`.
Respostas enxutas (`#123`, páginas de 20 com cursor): o teto do Claude Code (25 mil tokens) é bem menor que o do claude.ai.

## 4. Autorização: contrato proposto

Emissor (`issuer`) = origem do `APP_URL`, sem barra: `https://demandas.meltcomunicacao.com.br`. O Pauta é servidor de
autorização e de recurso no mesmo host, o que evita a segunda rodada de descoberta em outro host/WAF.

Caminhos (fora de `/api`, porque são chamados pelo backend da Anthropic sem `Origin` nem `X-Trace-Id`):

| Caminho | Quem chama | Observação |
|---|---|---|
| `GET /.well-known/oauth-protected-resource/mcp` e `GET /.well-known/oauth-protected-resource` | Anthropic | Mesmo JSON nos dois. |
| `GET /.well-known/oauth-authorization-server` | Anthropic | |
| `GET /.well-known/*` (o resto) | qualquer | `404` explícito (hoje cairia no `index.html` com `200`). |
| `POST /oauth/registrar` | Anthropic | DCR, JSON. |
| `GET /oauth/autorizar` | navegador da pessoa | Valida e redireciona para a tela `/autorizar?pedido=<id>`. |
| `POST /oauth/token` | Anthropic | form-urlencoded. |
| `POST /oauth/revogar` | cliente (opcional) | RFC 7009. |
| `GET /api/oauth/pedidos/:id`, `POST /api/oauth/pedidos/:id/decisao` | tela de consentimento | Dentro de `/api`: sessão por cookie + anti-CSRF atual. |
| `GET /api/conexoes`, `DELETE /api/conexoes/:id` | Configurações → Conexões | Admin vê e revoga todas. |

Os nomes em português são livres: o cliente lê os endereços dos metadados.

### 4.1 Metadados do recurso (RFC 9728)

```json
{
  "resource": "https://demandas.meltcomunicacao.com.br/mcp",
  "authorization_servers": ["https://demandas.meltcomunicacao.com.br"],
  "scopes_supported": ["pauta"],
  "bearer_methods_supported": ["header"],
  "resource_name": "Pauta"
}
```

Um escopo só (`pauta`): o que a pessoa pode fazer é decidido pelo papel dela, como na API. `offline_access` **não**
entra aqui (2026-07-28).

### 4.2 Metadados do servidor de autorização (RFC 8414)

```json
{
  "issuer": "https://demandas.meltcomunicacao.com.br",
  "authorization_endpoint": "https://demandas.meltcomunicacao.com.br/oauth/autorizar",
  "token_endpoint": "https://demandas.meltcomunicacao.com.br/oauth/token",
  "registration_endpoint": "https://demandas.meltcomunicacao.com.br/oauth/registrar",
  "revocation_endpoint": "https://demandas.meltcomunicacao.com.br/oauth/revogar",
  "scopes_supported": ["pauta", "offline_access"],
  "response_types_supported": ["code"],
  "response_modes_supported": ["query"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["none"],
  "revocation_endpoint_auth_methods_supported": ["none"],
  "code_challenge_methods_supported": ["S256"],
  "authorization_response_iss_parameter_supported": true
}
```

Sem `client_id_metadata_document_supported`: o Claude cai no DCR. Se um dia quiser aceitar cliente confidencial
(`client_secret_post`/`client_secret_basic`), anunciar só depois de implementar; o segredo tem alta entropia, então o hash
é sha256 (scrypt estouraria o prazo de 10 s sob carga e não acrescenta nada).

### 4.3 Desafios no `/mcp`

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://demandas.meltcomunicacao.com.br/.well-known/oauth-protected-resource/mcp", scope="pauta"
```

Com token presente mas inválido, vencido, revogado, de pessoa inativa ou de outro `resource`: o mesmo `401` com
`error="invalid_token"` (o Claude tenta o refresh e, se falhar, pede para reconectar). Corpo JSON curto, opcional.
`403 insufficient_scope` não será usado enquanto houver um escopo só.

### 4.4 Registro dinâmico (`POST /oauth/registrar`, RFC 7591)

- Aceita JSON com `redirect_uris` (obrigatório), `client_name`, `grant_types`, `response_types`,
  `token_endpoint_auth_method`, `application_type`, `scope`, `client_uri`, `logo_uri`. Campos desconhecidos: ignorar.
- **Política de `redirect_uri` (lista fechada):** `https://claude.ai/api/mcp/auth_callback`,
  `https://claude.com/api/mcp/auth_callback` e loopback `http://localhost[:porta]/callback`,
  `http://127.0.0.1[:porta]/callback` (Claude Code). Qualquer outro → `400 invalid_redirect_uri`. Sem isso, qualquer um
  registra um cliente com redirect próprio, manda o link de autorização para alguém da Melt e recebe um token com as
  permissões da pessoa. Uma variável opcional (por exemplo `MCP_REDIRECTS_EXTRAS`) permite acrescentar outro cliente sem
  deploy de código.
- `token_endpoint_auth_method`: só `none` por ora (RFC 7591 deixa o servidor substituir o valor pedido; a resposta diz o
  que valeu). `grant_types` ⊆ `authorization_code`, `refresh_token`; `response_types` = `code`.
- Resposta `201` com `client_id` (aleatório, não segredo), `client_id_issued_at`, os metadados aceitos e `Cache-Control: no-store`.
- Sem autenticação (é o DCR aberto que o Claude usa). Contenção: limite por IP **generoso** (o IP é o da Anthropic,
  compartilhado por todos), teto de clientes e uma tarefa diária em `server/src/tarefas/` que apaga clientes sem nenhuma
  concessão depois de 24 h (o Claude registra um cliente a cada conexão nova).

### 4.5 Autorização e consentimento (`GET /oauth/autorizar`)

1. Validar `client_id` e `redirect_uri` (exato; loopback sem porta). **Se um dos dois falhar, mostrar erro e não
   redirecionar** (OAuth 2.1 §4.1.2.1: evita redirecionamento aberto).
2. Demais erros (`response_type` ≠ `code`, sem `code_challenge`, método ≠ `S256`, escopo desconhecido, `resource` de
   outro servidor) → redirecionar para o `redirect_uri` com `error`, `error_description`, `state` e `iss`.
3. Gravar o pedido no banco (`oauth_pedido`: cliente, redirect, `code_challenge`, escopo, `state`, `resource`, expira em
   10 min) e redirecionar para `/autorizar?pedido=<id>`. Os parâmetros não passam pelo navegador de novo e a tela não
   depende de query string longa. A tela entra pela `AreaAutenticada`, que já leva para `/entrar?volta=...` e volta.
   O cookie `__Host-sid` é `SameSite=Lax`: chega na navegação de topo vinda do claude.ai.
4. Tela "O Claude quer acessar o {APP_NOME} como você": nome e papel da pessoa, o que o Claude poderá fazer, o **host do
   redirect em destaque** (spec: MUST; "claude.ai" ou "Claude Code neste computador" para loopback, com aviso extra no
   loopback), o `client_name` como dado declarado pelo cliente, botões Permitir / Cancelar.
5. **Decisão por `fetch`, não por `<form>`:** `POST /api/oauth/pedidos/:id/decisao` (anti-CSRF já existente) devolve
   `{ "redirecionar": "https://claude.ai/api/mcp/auth_callback?code=...&state=...&iss=..." }` e a tela faz
   `location.assign`. Um `<form method=post>` com `302` para o claude.ai é **bloqueado pela CSP `form-action 'self'` no
   Chrome e no Safari**, que aplicam a diretiva ao redirecionamento; mudar a CSP fere o contrato "exata" da API §1.
6. Código: 32 bytes aleatórios, hash sha256, uso único, 5 min, ligado a cliente, redirect, `code_challenge`, escopo,
   `resource` e pessoa. Segundo uso do mesmo código → recusar e revogar o que ele emitiu.
7. `iss` = emissor exato em toda resposta de autorização, inclusive de erro (RFC 9207).
8. Tela e `/oauth/autorizar` com `Referrer-Policy: no-referrer` (como `/convite`); `frame-ancestors 'none'` já impede
   clickjacking.

### 4.6 Token (`POST /oauth/token`)

- Só `application/x-www-form-urlencoded`; outro tipo → `400 invalid_request`. Respostas com `Cache-Control: no-store` e
  `Pragma: no-cache`; erros no formato RFC 6749 (`invalid_request`, `invalid_client`, `invalid_grant`,
  `unsupported_grant_type`, `invalid_scope`), nunca códigos próprios.
- `authorization_code`: confere código, `client_id`, `redirect_uri` igual ao do pedido, PKCE
  (`base64url(sha256(code_verifier)) === code_challenge`, verificador de 43 a 128 caracteres, comparação em tempo
  constante) e `resource` (normalizado; ausente = o nosso).
- Resposta: `{ "access_token", "token_type": "Bearer", "expires_in": 3600, "refresh_token", "scope": "pauta" }`.
- Tokens opacos de 32 bytes (`randomBytes` em base64url, como sessões e convites), com prefixo para identificação em
  vazamentos (por exemplo `pauta_at_` / `pauta_rt_`), guardados só como sha256.
- Acesso: 1 h. Refresh: **rotação a cada uso**; validade deslizante igual à da sessão (`sessaoValidadeDias`).
- Reuso de refresh já trocado → revogar a concessão inteira (detecção de roubo da OAuth 2.1), **com tolerância de ~60 s**:
  o Claude renova proativamente e no `401`, e duas conversas podem renovar ao mesmo tempo; sem a folga, a corrida derruba
  a conexão da pessoa.
- `offline_access` aceito no escopo e ignorado na prática (sempre emitimos refresh para `authorization_code`).

### 4.7 Revogação e Conexões

- Concessão = pessoa + cliente (o que a tela Conexões lista: cliente, redirect host, criada em, último uso). Revogar marca
  `revogada_em` e mata acesso e refresh de uma vez.
- `POST /oauth/revogar` (RFC 7009): responde `200` sempre, mesmo com token desconhecido.
- Desativar a pessoa revoga as concessões dela; e o `/mcp` confere `usuario.ativo = 1` a cada requisição, como o
  `exigirUsuario`.

### 4.8 Do token ao `Ator`

A cada `POST /mcp`: sha256 do bearer → token não vencido → concessão não revogada → pessoa ativa → `resource` igual ao
nosso. Monta `Ator { tipo: 'usuario', usuario, papel, traceId: uuid v4 por chamada de ferramenta, ip }` mais a marca da
conexão (para o histórico "via Claude"). Gravar `ultimo_uso_em` no máximo a cada 10 min, como a sessão. **Não gravar o IP
em `sessao.ip`:** é o IP da Anthropic, e `pessoasDaRede()` passaria a tratar `160.79.104.0/21` como rede interna.

### 4.9 CIMD: por que não agora

A 2026-07-28 prefere CIMD ao DCR e o Claude escolhe CIMD se anunciarmos. Mas CIMD obriga o Pauta a buscar uma URL
informada pelo cliente durante a autorização (risco de SSRF, cache, prazo de 10 s), e a URL do documento dos apps
hospedados do Claude não está publicada (só a do Claude Code: `https://claude.ai/oauth/claude-code-client-metadata`).
O DCR continua suportado pelo Claude por padrão e pela spec por pelo menos 12 meses. Quando vier, aceitar só `client_id`
em `https://claude.ai/` (lista de domínios), conferir o `client_id` do documento e os `redirect_uris`.

## 5. SDK do MCP

### 5.1 Comparação

| | `@modelcontextprotocol/sdk` 1.32.1 (v1) | `@modelcontextprotocol/server` 2.3.1 (v2) | À mão |
|---|---|---|---|
| Roda no Hono sem express | Sim: `new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` e `transport.handleRequest(c.req.raw, { parsedBody, authInfo })`, um `McpServer` + transporte por requisição. | Sim: `createMcpHandler(fabrica).fetch(c.req.raw, { authInfo })`; a fábrica roda a cada requisição. | Sim. |
| Dependências que entram na imagem | 17 diretas: express 5, cors, express-rate-limit, raw-body, ajv, ajv-formats, jose, cross-spawn, eventsource, eventsource-parser, pkce-challenge, content-type, zod-to-json-schema, json-schema-typed, hono, @hono/node-server, zod. Instaladas mesmo sem uso. | `zod ^4.2` (já temos 4.6, deduplica) e `@modelcontextprotocol/core`. | Nenhuma. |
| Tamanho (descompactado) | 4,5 MB + dependências (ajv ~1 MB, jose 0,2 MB...) | 6,5 MB + 1,3 MB | 0 |
| Protocolo | Até 2025-11-25 (`LATEST_PROTOCOL_VERSION`). Não fala 2026-07-28. | 2026-07-28; clientes 2025 atendidos sem estado no mesmo endereço (`legacy: 'stateless'`, padrão); GET/DELETE legados → `405`. | O que escrevermos. |
| Validação de argumentos / JSON Schema | ajv + zod-to-json-schema | zod 4 | `z.toJSONSchema()` do zod 4 |
| OAuth | `mcpAuthRouter` só para Express (congelado). | Não emite token; tem `requireBearerAuth` e `oauthMetadataResponse` web-standard; helpers de AS da v1 congelados em `server-legacy/auth`. | À mão de qualquer jeito. |
| Situação | Linha antiga; o README da v2 diz que ela substitui o pacote único da v1. | Estável desde 27/07/2026; ritmo alto (2.0 → 2.3.1 em 10 semanas): fixar versão exata. | Acompanhar a spec por conta própria. |

`@modelcontextprotocol/hono` (adaptador) e `@modelcontextprotocol/node` **não são necessários**: o primeiro cria outro
app Hono com parse de corpo e checagem de Host; o segundo puxa `@hono/node-server ^1.19.9`, diferente da nossa 2.x.

### 5.2 Recomendação

Usar `@modelcontextprotocol/server` (v2, versão exata) só para o protocolo. Justificativa para o commit: atende as duas
eras do MCP enquanto o Claude migra para a 2026-07-28 (cabeçalhos `Mcp-Method`/`Mcp-Name`, códigos `-32020`/`-32022`,
`server/discover`, `resultType`, cache de `tools/list`), valida argumentos com o zod que já usamos e só depende dele.

Isolar a SDK num arquivo: as ferramentas ficam no nosso formato (`nome`, `descricao`, esquema zod, `annotations`,
`executar(ator, args)`) e um adaptador as registra no `McpServer`. Trocar pela implementação à mão mexe em um arquivo.

Esboço (conferir nomes de opções na referência da v2 antes de implementar; é ilustrativo):

```ts
// rota /mcp, registrada antes do fallback de SPA
const mcp = createMcpHandler((ctx) => montarServidor(ctx.authInfo))   // McpServer novo por requisição
app.use('/mcp', limiteMcp)                                             // bodyLimit 1 MiB
app.all('/mcp', async (c) => {
  if (c.req.method !== 'POST') return c.body(null, 405, { Allow: 'POST' })
  conferirOrigem(c)                                                    // 403 se Origin fora da lista
  const conexao = conexaoDoBearer(c)                                   // 401 + WWW-Authenticate
  return mcp.fetch(c.req.raw, { authInfo: paraAuthInfo(conexao) })
})
```

Resposta sempre JSON (opção de modo de resposta "json" da v2, ou nenhuma ferramenta emitindo notificação antes do
resultado). Conferir no primeiro dia: `npx tsc --noEmit -p server` com o TypeScript 7 do projeto (`skipLibCheck` já está
ligado) e os testes com `app.request()`, que funcionam porque o handler é `fetch` puro.

### 5.3 Plano B: JSON-RPC à mão

Se a v2 trouxer atrito (tipos no TS 7, mudança de API, comportamento estranho), o subconjunto que precisamos é pequeno
(~250 linhas + testes): `initialize` (devolver a versão pedida se for 2025-11-25, 2025-06-18 ou 2025-03-26, senão
2025-11-25; `capabilities: { tools: { listChanged: false } }`, `serverInfo`, `instructions` curtas), `ping` → `{}`,
`tools/list`, `tools/call`, notificações → `202`, método desconhecido → `-32601`, `MCP-Protocol-Version` desconhecida →
`400`, só JSON, GET/DELETE → `405`. Isso cobre o Claude atual (2025-11-25); um cliente só-2026 cai no `initialize` ao
receber `400` sem erro moderno. A era 2026 vira trabalho extra quando o Claude deixar de aceitar 2025, o que a política
de depreciação adia por no mínimo 12 meses.

## 6. Encaixe no código atual

- **`server/src/web.ts`**: o `app.get('*')` serve `index.html` com `200` para caminho sem extensão. As rotas de
  `/.well-known/*`, `/oauth/*` e `/mcp` precisam existir em `src/rotas/` (registradas antes do `servirWeb`) e responder
  `404`/`405` explícitos no que não atendem.
- **`server/src/app.ts`**: `bodyLimit` e anti-CSRF valem só em `/api/*`. `/mcp` e `/oauth/*` ficam fora de `/api` de
  propósito (sem `Origin` igual ao `APP_URL` nem `X-Trace-Id`) e ganham limites próprios (1 MiB e 64 KiB). O cabeçalho
  `Cache-Control: no-store` hoje só sai em `/api/*`: pôr também em `/mcp`, `/oauth/*` e nos metadados (o Claude já faz
  cache de 5 min do lado dele).
- **Log**: o caminho sai sem query (o `code_challenge` e o `state` não vão ao log); o `Authorization` nunca é logado.
  Manter assim e não logar corpo de `/oauth/*`.
- **CSP**: fica como está (a decisão usa `fetch` + `location.assign`, §4.5).
- **Front**: tela `/autorizar` (rota autenticada) e seção "Conexões" em Configurações → Sua conta. Em desenvolvimento,
  o proxy do Vite precisa encaminhar `/mcp`, `/oauth` e `/.well-known` para a API, porque emissor e `resource` derivam do
  `APP_URL` (a origem do Vite).
- **Banco** (faixa 100–199, só acrescenta), sugestão: `oauth_cliente` (id, nome, redirect_uris JSON, método, tipo,
  criado_em), `oauth_pedido` (pendente, expira em 10 min), `oauth_codigo` (hash, uso único), `oauth_concessao` (pessoa +
  cliente, escopo, criada_em, ultimo_uso_em, revogada_em) e `oauth_token` (hash, tipo acesso/refresh, concessão,
  expira_em, trocado_em para a detecção de reuso). Poda diária de pedidos, códigos e tokens vencidos.
- **Variáveis**: nenhuma obrigatória (tudo deriva de `APP_URL` e `APP_NOME`). Opcional: lista extra de redirects e de
  origens. Documentar no `.env.example` e no README.

## 7. Riscos e mitigação

| Risco | Efeito | Mitigação |
|---|---|---|
| **Bot Fight Mode** (Cloudflare Free) | Desafia requisições sem navegador do backend da Anthropic → "Couldn't reach the MCP server". Não aceita exceção por regra WAF nem Page Rule. | Conferir em Security > Bots. Desligar, ou regra de IP Access "Allow" para `160.79.104.0/21` (os exemplos da Cloudflare usam faixas `/24` e `/16`: a `/21` vira oito `/24`), ou plano Pro com Super Bot Fight Mode e regra Skip. |
| WAF, Browser Integrity Check, rate limiting da Cloudflare | `403`/`429` gerados na borda, invisíveis no log do Pauta. | Regra WAF Skip (gerenciadas, rate limit, SBFM) para `/mcp`, `/oauth/*`, `/.well-known/oauth-*` e/ou a faixa da Anthropic; Configuration Rule desligando Browser Integrity Check nesses caminhos. Ver os logs de borda na primeira conexão. |
| Cache da Cloudflare | Metadados ou respostas de token velhos. | Regra Bypass para `/mcp`, `/oauth/*`, `/.well-known/*` (hoje só `/api/*` e `/a/*`), além do `no-store`. |
| Corte de 100 s da Cloudflare | `524` antes dos 240 s do Claude. | Ferramentas em segundos; chamadas à Windsor com timeout curto e cache (§2 da FASE2). |
| SSE atrás da Cloudflare + Traefik | Buffer e compressão atrasam ou quebram o stream. | Não usar SSE no `/mcp`: sempre JSON; GET → `405`. Se um dia precisar de progresso: `X-Accel-Buffering: no`, sem compressão, como no `/api/eventos`. |
| Sessões `Mcp-Session-Id` | Estado em memória se perde em deploy/reinício e não existe na 2026-07-28. | Sem estado; nunca emitir; ignorar o recebido. |
| `Origin` | Estrito demais derruba o Claude; frouxo demais fere a spec. | Ausente = ok; lista (APP_URL, claude.ai, claude.com) + log do recusado + variável para acrescentar. O `/mcp` não usa cookie, então um site malicioso não ganha nada com o navegador da pessoa. |
| CORS | Não é necessário: tudo vem do backend da Anthropic e o navegador só **navega** até `/oauth/autorizar`. | Não pôr `Access-Control-Allow-Origin` no `/mcp` nem no `/oauth/token`. Se quiser o MCP Inspector no navegador, liberar só em desenvolvimento. |
| Fallback de SPA | `/.well-known/openid-configuration` ou `/oauth/x` devolvem HTML com `200`; o GET `/mcp` também. | Rotas e `404`/`405` explícitos (§6). |
| CSP `form-action 'self'` | Consentimento por `<form>` com `302` para claude.ai é bloqueado no Chrome/Safari. | Decisão por `fetch` + `location.assign`. |
| Limites por IP | Todo o Claude chega pela mesma faixa: um limite por IP trava a Melt inteira. | Limitar por conexão/token; por IP só no registro, com folga. |
| Registro dinâmico aberto | Tabela de clientes cresce (um por conexão nova) e alguém tenta phishing com redirect próprio. | Lista fechada de redirects; poda diária de clientes sem concessão; teto. |
| Corrida de refresh | Duas renovações simultâneas com o mesmo refresh revogam a conexão. | Tolerância de ~60 s antes de tratar como roubo. |
| Prazo de 10 s nos endpoints OAuth | Falha intermitente de conexão. | Só SQLite síncrono; nada de scrypt no `/oauth/token`. |
| Prompt injection | Texto de cliente/WhatsApp na descrição de uma demanda induz o Claude a mover, comentar ou concluir. | `annotations` corretas (o Claude pede aprovação nas escritas), nada que apague ou fale com o cliente (já decidido), histórico "via Claude", revogação fácil. Resultados tratam texto de fora como dado. |
| Token vazado | Acesso como a pessoa. | Hash no banco, prefixo reconhecível, acesso de 1 h, refresh com rotação e detecção de reuso, nunca em URL ou log, revogação na tela. |
| `sessao.ip` | IP da Anthropic marcaria "rede interna" na decisão pública (§4.17 da API). | Conexões MCP fora da tabela `sessao`; não alimentar `pessoasDaRede()`. |
| Mudança de callback / spec | Claude pode passar a usar `claude.com`; DCR está "deprecated". | As duas URLs na lista; CIMD planejado (§4.9); fixar a SDK e revisar a cada versão. |
| URL digitada diferente | `resource` não bate (barra final, `www`, `http`). | Instrução única no README e na tela Conexões: `https://demandas.meltcomunicacao.com.br/mcp`. Nenhum redirecionamento nesse caminho. |

## 8. Como testar

1. **Automatizado** (`node:test` + `app.request()`): metadados; `401` com o cabeçalho exato; `405` em GET/DELETE; `Origin`;
   DCR (redirects aceitos e recusados, loopback com porta); autorização (sem login, pedido, erro sem redirect, erro com
   redirect + `iss`); decisão com anti-CSRF; token (PKCE certo/errado, `resource`, código reusado, form-urlencoded);
   refresh (rotação, reuso dentro e fora da folga, `invalid_grant`); revogação; pessoa desativada; `initialize`,
   `tools/list` e `tools/call` (e `server/discover` se for a v2); erro de permissão virando `isError`.
2. **Da internet** (fora da rede da Melt):
   `curl -i https://demandas.meltcomunicacao.com.br/.well-known/oauth-protected-resource/mcp`,
   `curl -i https://demandas.meltcomunicacao.com.br/.well-known/oauth-authorization-server`,
   `curl -si -X POST https://demandas.meltcomunicacao.com.br/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
   (espera `401` com `WWW-Authenticate`) e `curl -sI .../mcp` (nada de `3xx`).
3. **MCP Inspector**: `npx @modelcontextprotocol/inspector` (fluxo OAuth guiado) ou a linha de comando
   `--cli <url> --transport http --method tools/list`.
4. **Claude Code**: `claude mcp add --transport http pauta https://demandas.meltcomunicacao.com.br/mcp`, depois `/mcp`
   para autenticar (exercita o loopback).
5. **claude.ai**: Pro/Max em *Customize > Connectors > Add custom connector*; Team/Enterprise: o Owner adiciona em
   *Organization settings > Connectors* e cada pessoa clica **Connect**. Falha mostra um `ofid_...` para abrir chamado
   em `github.com/anthropics/claude-ai-mcp/issues`.

## 9. Fontes

- MCP 2026-07-28: [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog),
  [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
  [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
  [anúncio](https://blog.modelcontextprotocol.io/posts/2026-07-28/).
- MCP 2025-11-25: [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
  [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
  [Security best practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices).
- Claude: [Authentication for connectors](https://claude.com/docs/connectors/building/authentication),
  [Build an MCP server for Claude](https://claude.com/docs/connectors/building/index.md),
  [Lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication.md),
  [Troubleshoot your connector](https://claude.com/docs/connectors/building/troubleshooting.md),
  [Test your connector](https://claude.com/docs/connectors/building/testing.md),
  [Add a connector that isn't in the directory](https://claude.com/docs/connectors/custom/add-unlisted.md),
  [IP addresses](https://platform.claude.com/docs/en/api/ip-addresses),
  [Building custom connectors via remote MCP servers](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers),
  [Bringing MCP 2026-07-28 to Claude](https://claude.com/resources/articles/bringing-mcp-2026-07-28-to-claude),
  [CIMD do Claude Code](https://claude.ai/oauth/claude-code-client-metadata).
- SDK: `npm view @modelcontextprotocol/sdk@1.32.1` (dependências), [types.js 1.32.1](https://unpkg.com/@modelcontextprotocol/sdk@1.32.1/dist/esm/types.js)
  (versões), [webStandardStreamableHttp.d.ts 1.32.1](https://unpkg.com/@modelcontextprotocol/sdk@1.32.1/dist/esm/server/webStandardStreamableHttp.d.ts),
  `npm view @modelcontextprotocol/server@2.3.1`, [v2: Serving over HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http),
  [v2: legacy clients](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients),
  [v2: authorization](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization),
  [v2: Hono](https://ts.sdk.modelcontextprotocol.io/v2/serving/hono),
  [v2: tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools).
- RFCs: [OAuth 2.1 (draft 13)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13),
  [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728), [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414),
  [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591), [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636),
  [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html), [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750),
  [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009), [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207),
  [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252),
  [CIMD (draft)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00).
- Cloudflare: [interoperabilidade dos recursos de segurança](https://developers.cloudflare.com/waf/feature-interoperability)
  (Bot Fight Mode não aceita Skip), [IP Access rules](https://developers.cloudflare.com/waf/tools/ip-access-rules/parameters/).
- CSP `form-action` e redirecionamentos: [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/form-action),
  [content-security-policy.com](https://content-security-policy.com/form-action).
