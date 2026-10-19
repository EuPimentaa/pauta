# Operação: o Claude no Pauta (MCP + OAuth)

F7 da Fase 2 (`docs/FASE2.md` §1; contrato em `docs/API.md` §F.1–§F.7). Este arquivo vai para o `README.md` na
integração (seção "Fase 2").

## O que existe

| Caminho | Para quê |
|---|---|
| `POST /mcp` | O servidor MCP (Streamable HTTP, sem estado, sempre JSON). `GET`/`DELETE` → `405 Allow: POST`. |
| `GET /.well-known/oauth-protected-resource[/mcp]`, `GET /.well-known/oauth-authorization-server` | Metadados (RFC 9728 e 8414). O resto de `/.well-known` → `404` em texto. |
| `POST /oauth/registrar`, `GET /oauth/autorizar`, `POST /oauth/token`, `POST /oauth/revogar` | O Pauta como servidor de autorização (registro dinâmico, PKCE S256, refresh com rotação, RFC 7009). |
| `/autorizar?pedido=…` | A tela de consentimento (precisa de sessão; sem ela, `/entrar?volta=` e volta). |
| Configurações → **Conexões** | O endereço para colar no Claude, o passo a passo e as conexões com Revogar (o admin vê todas). |

O endereço do conector é sempre `APP_URL` + `/mcp`, sem barra no fim: em produção,
`https://demandas.meltcomunicacao.com.br/mcp`.

## Variáveis (já no `.env.example`)

| Variável | Padrão | Efeito |
|---|---|---|
| `MCP_ATIVO` | `1` | `0` desliga na hora `/mcp`, `/oauth/*`, `/.well-known/oauth-*` e `/api/oauth/*` (404). Conexões continua listando e revogando. |
| `MCP_REDIRECTS_EXTRAS` | vazio | `redirect_uri` https de outro cliente MCP, separados por vírgula. Tirar um extra corta também os clientes e as conexões que o usavam. |
| `MCP_ORIGENS_EXTRAS` | vazio | `Origin` https aceitos no `POST /mcp` além do `APP_URL`, `https://claude.ai` e `https://claude.com` (Origin ausente sempre passa). |

## Decisão de implementação: plano B (JSON-RPC à mão)

O protocolo está em `server/src/servicos/mcp.ts`, sem dependência nova: `initialize`, `ping`, `tools/list`,
`tools/call`, notificações → `202`, método desconhecido → `-32601`, `MCP-Protocol-Version` fora de 2025-11-25,
2025-06-18 e 2025-03-26 → `400`. É a era 2025 do MCP, a que o claude.ai e o Claude Code falam hoje. Um cliente só da
era 2026-07-28 recebe `400` e volta ao `initialize` (regra de compatibilidade da própria especificação). A SDK
`@modelcontextprotocol/server` 2.3.1 não pôde ser integrada no ambiente desta worktree; trocar o plano B pela SDK mexe
só nesse arquivo (as ferramentas ficam no nosso formato, `servicos/mcp-comum.ts`).

## Antes do deploy: Cloudflare (pesquisa-mcp §7)

Já feito pelo dono em 19/10/2026 (`docs/pedidos/dono.md`): a regra "Claude (Anthropic) MCP",
`(ip.src in {160.79.104.0/21})` → Ignorar (regras personalizadas, Rate Limiting, gerenciadas, Super Bot Fight e os
componentes extras), com log. Falta conferir:

1. Security → Bots: o **Bot Fight Mode** comum (Free) não obedece a regra acima. Se o claude.ai disser "Couldn't reach
   the MCP server", desligar em Segurança → Configurações (ou IP Access "Allow" para os oito `/24` de `160.79.104.0/21`).
2. Browser Integrity Check: a regra acima ignora os componentes extras para a faixa da Anthropic; se o log de borda
   mostrar desafio em `/mcp`, `/oauth/registrar`, `/oauth/token`, `/oauth/revogar` ou `/.well-known/oauth-*`, uma
   Configuration Rule sem Browser Integrity Check nesses caminhos.
3. `/oauth/autorizar` e `/autorizar` são navegação da pessoa (o IP dela, não o da Anthropic): ficam com as regras de
   sempre.
4. Cache Rule **Bypass** para `/mcp`, `/oauth/*` e `/.well-known/*` (as respostas já saem com `Cache-Control: no-store`).

## Depois do deploy

De fora da rede da Melt:

```
BASE=https://demandas.meltcomunicacao.com.br
curl -si $BASE/.well-known/oauth-protected-resource/mcp            # 200, resource = $BASE/mcp
curl -si $BASE/.well-known/oauth-authorization-server              # 200, S256, registration_endpoint
curl -si $BASE/.well-known/openid-configuration                    # 404 text/plain (nunca o index.html)
curl -si $BASE/mcp                                                 # 405, Allow: POST
curl -si -X POST $BASE/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'               # 401 + WWW-Authenticate resource_metadata=…
curl -si -X POST $BASE/oauth/registrar -H 'Content-Type: application/json' \
  -d '{"client_name":"x","redirect_uris":["https://evil.example/cb"]}'  # 400 invalid_redirect_uri
PAUTA_EMAIL=<seu> PAUTA_SENHA=<sua> node server/scripts/mcp-fluxo.ts --base $BASE --quadro criacao --limpar
```

`mcp-fluxo.ts` simula o Claude inteiro (17 passos: registro com loopback, PKCE, autorizar com o cookie do pedido,
login, a tela, a decisão, o code com state e iss, token, `initialize` + `tools/list`, `minhas_demandas`,
`criar_demanda`, histórico "via Claude", `comentar`, refresh com rotação, o refresh antigo de novo em 60 s, revogar em
Conexões e o `401`). Termina com "17/17 ok" e código 0; nunca imprime token, código, state nem cookie; `--limpar`
arquiva a demanda de teste. E-mail e senha só pelo ambiente.

Depois: no plano de organização o **Owner** adiciona o conector em *Organization settings → Connectors → Add custom
connector* com o endereço acima e cada pessoa clica **Connect** (conta individual: *Customize → Connectors → Add
custom connector*; Claude Code: `claude mcp add --transport http pauta <endereço>` e `/mcp`). Uma pessoa de cada papel
faz 3 perguntas e 1 escrita. Falha no claude.ai mostra um `ofid_…` para o chamado.

## Limites (em memória; um deploy zera)

| O quê | Limite |
|---|---|
| Chamadas de ferramenta | 60 por minuto por pessoa (somando as conexões dela); acima, `isError` "Muitas chamadas seguidas". |
| Buscas na Windsor pelo `resumo_cliente` | 10 por pessoa por hora; acima, só o cache. |
| Registro dinâmico | 10 por hora por IP; 300 dentro da faixa da Anthropic. **Em desenvolvimento** (`TRUST_PROXY_HOPS=0`) tudo vem de 127.0.0.1: depois de 10 registros na hora, reinicie a API. |
| `/oauth/autorizar` | 60 por hora pelo IP do navegador. |
| `/oauth/token` | 30 por minuto por `client_id`. |
| Clientes sem concessão | 300; ao chegar, o registro apaga os sem pedido vivo criados há mais de 15 min. A tarefa `oauth-poda` (03:30) apaga os com mais de 24 h. |

## Orçamento de respostas (`ORCAMENTO_MCP`)

`node server/scripts/mcp-medir.ts` monta o seed de demonstração em memória e mede (≈ 3,3 caracteres por token). Linha
de base de 19/10/2026 (300 demandas na Criação; também é o teste `server/test/mcp-orcamento.test.ts`):

| Resposta | Caracteres (F7 sozinho) | Depois da integração (com a agenda) | ≈ tokens | Teto |
|---|---:|---:|---:|---:|
| `tools/list` | 10.735 | 10.735 | 3.253 | 12.000 |
| `minhas_demandas` (Rafa, equipe) | 1.412 | 1.715 | 520 | 2.500 |
| `ler_demanda` (a maior de 30) | 1.451 | 1.451 | 440 | 4.000 |
| `agenda` de 7 dias | 2.453 | 2.824 | 856 | 3.000 |
| `resumo_cliente` CLA | 499 | 525 | 159 | 3.000 |
| `listar clientes` | 383 | 383 | 116 | 1.200 |

Depois do merge do F9 (19/10/2026, `docs/pedidos/INTEGRACAO-F2.md`), a `agenda` e o `minhas_demandas` levam os eventos
da agenda de demonstração (o seed cria a agenda "Melt" com a fixture do iCal). A `agenda` de 7 dias ficou a 176
caracteres do teto: o limite de 8 linhas por dia (`agendaLinhasPorDia`) segura o total, mas uma semana cheia na agenda
real pode passar dos 3.000 (o teto rígido continua o `respostaMaxCaracteres`, 20.000). Se o Claude começar a cortar,
o caminho é baixar `agendaLinhasPorDia` ou encurtar a linha do evento. O `resumo_cliente` medido aqui é sem a chave da
Windsor (o seed não tem); com as 3 contas das fixtures ligadas, a parte de resultados soma ~900 caracteres (medido
na verificação em produção).

## Quando algo dá errado

- **O Claude pede para conectar de novo:** o token de acesso venceu e o refresh foi recusado (`invalid_grant`): a senha
  foi trocada ou redefinida, o papel mudou, a pessoa foi desativada, a conexão foi revogada, um refresh antigo foi usado
  depois de 60 s (`reuso_refresh`) ou passou de 30 dias sem uso. Conexões (com "Mostrar as revogadas") diz o motivo.
- **"Abra a conexão pelo Claude neste navegador":** o link `/autorizar?pedido=` foi aberto noutro navegador (o pedido
  fica amarrado ao cookie do navegador que clicou em Conectar). É a defesa contra link encaminhado.
- **"Este pedido expirou":** o pedido vale 10 minutos; conecte de novo pelo Claude.
- **"Algo deu errado nesta ferramenta (ref mcp-…)":** o log do servidor tem uma linha `mcp <ferramenta> ref=mcp-…` com o
  erro mascarado (`descreverErro`); a mensagem original nunca vai para a conversa.
- **`403` no `/mcp` com Origin:** o log diz `mcp origem recusada: <origem>`; acrescente em `MCP_ORIGENS_EXTRAS` se for
  legítima.
- O log de cada requisição sai só com o caminho (sem query); token, código, `code_verifier`, `state` e o cookie do
  pedido nunca vão ao log (`grep -E "pauta_(at|rt)_|code_verifier" <log>` vazio).
