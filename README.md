# Pauta (melt-demandas)

Sistema interno de demandas da Melt Comunicação: quadros separados por equipe, como no Trello, com o ciclo da peça
(versões, envio ao cliente, aprovação por link, rodadas) por cima. O nome do produto vem de `APP_NOME` (padrão "Pauta").

- Arquitetura, stack e convenções: `docs/ARQUITETURA.md`
- Contrato HTTP: `docs/API.md` · tipos: `shared/tipos/` · banco: `server/migracoes/`
- Plano de construção e donos dos arquivos: `docs/PLANO.md`

## Desenvolvimento

Node 24 (roda TypeScript direto). Copie `.env.example` para `.env` e preencha.

```
npm ci
npm run dev:server                      # API + SSE na 7300
npm run dev:web                         # Vite na 5173 (encaminha /api para API_URL)
npm run seed:demo --workspace server    # dados de exemplo (só desenvolvimento)
```

Pronto = verde em tudo, na raiz (`docs/PLANO.md` §0, regra 8): `npx tsc --noEmit -p server`, `npx tsc --noEmit -p web`,
`npm test`, `node server/scripts/verificar-migracoes.ts`, `npm run build` e o roteiro de navegador (claro e escuro,
1440 e 390 px). No front, também `npm run contraste --workspace web` (pares de tokens) e
`npm run auditoria --workspace web -- --url http://localhost:5173` (navegador: anel de foco no Tab, contraste composto,
piso de tipo e rolagem lateral no `/dev/ui`; com `AUDITORIA_EMAIL` e `AUDITORIA_SENHA`, também a casca).

## Deploy (EasyPanel atrás da Cloudflare)

Código em `github.com/EuPimentaa/pauta` (privado), branch `master`; o EasyPanel faz o build pelo `Dockerfile` da raiz.

- Serviço **App**, origem Git, porta `7300`, health check `GET /api/saude`.
- **Volume** em `/app/data` (`DATA_DIR=/app/data`): banco, anexos e `backups/` (backup diário, mantém 14).
- Variáveis: `NODE_ENV=production`, `APP_URL=https://demandas.meltcomunicacao.com.br`, `APP_NOME`, `SEGREDO`
  (32+ bytes), `DATA_DIR=/app/data`, **`TRUST_PROXY_HOPS=2`** e, só no primeiro boot, `ADMIN_EMAIL` e `ADMIN_SENHA`.
  Fase 2: `WINDSOR_API_KEY` e, se precisar, `MCP_ATIVO`, `MCP_REDIRECTS_EXTRAS`, `MCP_ORIGENS_EXTRAS` (seção abaixo).

### Por que `TRUST_PROXY_HOPS=2`

O pedido passa por dois proxies: a Cloudflare acrescenta o IP do visitante ao `X-Forwarded-For` e o Traefik acrescenta
o da Cloudflare. O servidor lê o 2º item a partir do fim, que é o IP real do visitante. É esse IP que conta nos limites
de login (e-mail+IP e IP). Com `1`, todos os visitantes pareceriam ser a Cloudflare e dividiriam o mesmo limite. Com
`0`, o IP seria sempre o do Traefik.

### Cloudflare

- SSL/TLS em **Full (strict)**.
- **Rocket Loader desligado**: ele reescreve os `<script>`, o que quebra a CSP (`script-src 'self'`) e o app.
- Regra de cache **Bypass** para `/api/*` e `/a/*` (a página pública do cliente e as respostas da API não podem ficar
  em cache; o servidor já manda `no-store`).
- **Always Online desligado** para a página pública (`/a/*`): uma cópia antiga mostraria versões e decisões vencidas.
- Tempo real (SSE em `/api/eventos`): a Cloudflare corta conexões ociosas em 100 s, e o ping de 25 s mantém a conexão
  viva. O servidor responde com `Cache-Control: no-cache` e `X-Accel-Buffering: no` e não comprime `text/event-stream`.
  Não ligue regra de compressão nem de transformação para esse caminho.

## Fase 2: Claude (MCP), resultados da Windsor e agenda da Melt

Decisões em `docs/FASE2.md`; contrato em `docs/API.md` §F; plano e integração em `docs/FASE2-PLANO.md` e
`docs/pedidos/INTEGRACAO-F2.md`. A operação de cada parte, com o que fazer quando algo dá errado:

| Parte | O que é | Operação |
|---|---|---|
| **Claude (MCP + OAuth)** | `POST /mcp` (conector personalizado do claude.ai, Claude Code e Desktop), o Pauta como servidor de autorização, a tela `/autorizar` e Configurações → **Conexões**. Tudo o que o Claude faz fica no histórico como a pessoa, com "via Claude". | `docs/fase2/operacao-mcp.md` |
| **Resultados (Windsor)** | Aba **Resultados** do cliente, a carteira `/resultados`, Configurações → **Resultados (Windsor)** e "Contas de resultados" do cliente; o `resumo_cliente` do MCP. | `docs/fase2/operacao-resultados.md` |
| **Agenda da Melt (iCal)** | Configurações → **Agendas externas**; os eventos na Agenda, "Hoje na agenda" no Início e a `agenda` do MCP. | `docs/fase2/operacao-agenda.md` |

Variáveis novas no EasyPanel (já no `.env.example`): **`WINDSOR_API_KEY`** (a chave da Windsor; só no servidor, nunca
em arquivo, log ou commit), `MCP_ATIVO` (padrão `1`; `0` desliga `/mcp`, `/oauth/*` e os metadados na hora),
`MCP_REDIRECTS_EXTRAS` e `MCP_ORIGENS_EXTRAS` (opcionais). A agenda não tem variável: o endereço secreto é colado pelo
admin e fica cifrado com o `SEGREDO` (trocar o `SEGREDO` obriga a colar de novo).

O `/mcp` está no **plano B** (JSON-RPC à mão em `server/src/servicos/mcp.ts`, sem dependência nova): atende a era 2025
do MCP, a que o claude.ai e o Claude Code falam; um cliente só da era 2026 recebe `400` e volta ao `initialize`.

**Antes do deploy (Cloudflare, `docs/fase2/operacao-mcp.md`):** a regra "Claude (Anthropic) MCP" para
`160.79.104.0/21` já existe (`docs/pedidos/dono.md`); conferir o **Bot Fight Mode** (o comum não obedece a regra:
desligar ou IP Access "Allow" para a faixa), o Browser Integrity Check em `/mcp`, `/oauth/registrar`, `/oauth/token`,
`/oauth/revogar` e `/.well-known/oauth-*`, e uma Cache Rule **Bypass** para `/mcp`, `/oauth/*` e `/.well-known/*`.

**Depois do deploy:**
1. MCP: os `curl` e o `node server/scripts/mcp-fluxo.ts --base https://demandas.meltcomunicacao.com.br --quadro criacao
   --limpar` (e-mail e senha só pelo ambiente; termina com "17/17 ok"); o Owner adiciona o conector em *Organization
   settings → Connectors*; uma pessoa de cada papel faz 3 perguntas e 1 escrita.
2. Windsor: `WINDSOR_API_KEY` no EasyPanel; os 5 comandos da `docs/fase2/pesquisa-windsor.md` §10 (anotar só o
   resultado em `operacao-resultados.md`); ligar as contas em Configurações → Resultados (Windsor); conferir 2 clientes
   contra o painel da Windsor.
3. Agenda: o admin cola o endereço secreto; `AGENDA_ENDERECO='…' node server/scripts/agenda-diagnostico.ts` no shell (só
   contagens); conferir 3 eventos (recorrente, dia inteiro, particular) contra o Google Agenda.

Em desenvolvimento, `WINDSOR_API_KEY=fixtures` lê as fixtures da Windsor e o endereço de teste
`https://calendar.google.com/calendar/ical/teste%40pauta.test/private-0123456789abcdef/basic.ics` lê a fixture do iCal
(os dois ignorados com `NODE_ENV=production`); o `seed:demo` já liga as contas das fixtures à CLA e cria a agenda "Melt".
O Vite encaminha `/mcp`, `/oauth` e `/.well-known` para a API (o emissor do OAuth é o `APP_URL`).
