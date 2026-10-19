# Plano da Fase 2: MCP, resultados da Windsor e agenda da Melt

Três funcionalidades em paralelo, cada uma num git worktree, sobre o Pauta em produção. As decisões são as do
`docs/FASE2.md` (valem sobre tudo); o contrato já está na `master` e é a referência das três:

| Contrato | Arquivo |
|---|---|
| Banco | `server/migracoes/100_oauth.sql`, `101_mcp_via_claude.sql`, `102_resultados_windsor.sql`, `103_agenda_externa.sql` |
| Verificação do banco | `node server/scripts/verificar-migracoes.ts` (listas de `shared/tipos` = CHECK, índices, planos, fumaça dos gatilhos novos) |
| Tipos | `shared/tipos/mcp.ts`, `resultados.ts`, `agenda-externa.ts` (reexportados pelo `index.ts`); entidades novas em `tempo-real.ts`; `via?` em `Atividade` e `Comentario` |
| Rotas, ferramentas do MCP, regras | `docs/API.md` §F (§F.5: a lista exata das 15 ferramentas; §F.6: "via Claude"; §F.7: permissões) |
| Variáveis | `server/src/config.ts` e `.env.example` (`WINDSOR_API_KEY`, `MCP_ATIVO`, `MCP_REDIRECTS_EXTRAS`, `MCP_ORIGENS_EXTRAS`) |
| Pontos de extensão novos do front | `web/src/extensoes/tipos.ts` e `registro.ts`: `cliente-aba`, `cliente-config`, `agenda-fonte` (§4) |
| Pesquisas, medições e fixtures | `docs/fase2/pesquisa-mcp.md`, `pesquisa-windsor.md` (+ `fixtures-windsor/`), `pesquisa-ical.md` (+ `fixtures-ical/`) |

Tudo do `docs/PLANO.md` §0 continua valendo; abaixo, só o que muda ou se acrescenta.

Sumário: [0 Regras](#0-regras-da-fase-2) · [1 Ambiente](#1-worktrees-portas-e-variáveis) ·
[2 Quem é dono do quê](#2-quem-é-dono-do-quê) · [3 Funcionalidades](#3-funcionalidades) ·
[4 Pontos de extensão](#4-pontos-de-extensão-do-front) · [5 Ponte F7 ↔ F8/F9](#5-ponte-f7--f8f9-provedores) ·
[6 Merge e verificação final](#6-ordem-de-merge-e-verificação-final) · [7 Dúvidas](#7-dúvidas-em-aberto) ·
[8 Riscos](#8-riscos-e-o-que-fazer)

---

## 0. Regras da Fase 2

1. **Dono único de arquivo** (PLANO §0, regra 1), com a lista da §2. Os "toques" em arquivos que já existem são
   exclusivos de uma funcionalidade nesta fase: nenhum arquivo tem dois donos. Precisa de algo fora da sua lista? Pedido
   em `docs/pedidos/f7-mcp.md`, `f8-resultados.md` ou `f9-agenda.md` e contorno local.
2. **O contrato não muda por conta própria:** os arquivos da tabela acima só mudam por pedido. Tipos só da
   funcionalidade: `shared/tipos/ext/<prefixo>.ts`; lógica pura: `shared/logica/<prefixo>-*.ts`.
3. **Prefixos:** F7 `mcp` e `oauth`; F8 `resultados`; F9 `agenda`. Nas pastas de extensão, o dono é o glob
   `web/src/extensoes/*/<prefixo>{,-*}.{ts,tsx}`.
4. **Migrações:** 100–109 contrato (já feitas); F7 110–119; F8 120–129; F9 130–139; integração 190–199. Só acrescentam.
5. **Dependências:** só a do F7, `@modelcontextprotocol/server` na versão **exata** 2.3.1 (justificativa no commit:
   atende as duas eras do MCP no mesmo endereço, valida com o zod que já usamos e só depende dele e de
   `@modelcontextprotocol/core`; a v1 instala express e mais 16 pacotes e não fala a 2026-07-28). F8 e F9: nenhuma. O
   ical.js 2.2.1 só entra pelo plano B do F9 (§3), com pedido.
6. **Segredos nunca em arquivo versionado:** a chave da Windsor e o endereço iCal real só no shell ou no `.env.<f>` local
   (não versionado). Testes e roteiros usam as fixtures. Nenhum log, resposta, mensagem de erro ou commit pode ter
   token OAuth, código, chave da Windsor ou endereço iCal (cada funcionalidade tem um teste que captura o log e confere).
7. **Pronto = PLANO §0 regra 8 verde** (`npx tsc --noEmit -p server`, `npx tsc --noEmit -p web`, `npm test`,
   `node server/scripts/verificar-migracoes.ts`, `npm run build`, `npm run contraste --workspace web`, `npm run
   auditoria --workspace web -- --url <seu Vite> --paginas <as suas telas>`, roteiro de navegador em claro e escuro, 1440
   e 390 px) **mais o roteiro de protocolo** da funcionalidade (§3) e os critérios de aceite dela.
8. **Nada quebra o que a equipe usa:** os 539 testes de antes continuam verdes; nenhuma rota, tipo ou tela existente muda
   de comportamento fora do que a §2 lista.

## 1. Worktrees, portas e variáveis

```
git worktree add ../melt-demandas-mcp        -b fase2/mcp        master
git worktree add ../melt-demandas-resultados -b fase2/resultados master
git worktree add ../melt-demandas-agenda     -b fase2/agenda     master
cd ../melt-demandas-<nome> && npm ci
```

| # | Funcionalidade | Branch | API / Vite | `DATA_DIR` | Migrações | Rotas novas |
|---|---|---|---|---|---|---|
| F7 | MCP + OAuth + consentimento + Conexões | `fase2/mcp` | 7360 / 5230 | `./data/f7` | 110–119 | 14 (4 de metadados e o 404, 5 de OAuth e o 404, 2 em `/api/oauth`, 2 de conexões, `/mcp`) |
| F8 | Resultados da Windsor | `fase2/resultados` | 7361 / 5231 | `./data/f8` | 120–129 | 6 |
| F9 | Agenda externa (iCal) | `fase2/agenda` | 7362 / 5232 | `./data/f9` | 130–139 | 6 |

Exemplo (F7):
```
PORT=7360 DATA_DIR=./data/f7 APP_URL=http://localhost:5230 SEGREDO=<32+ bytes> \
ADMIN_EMAIL=<seu> ADMIN_SENHA=<sua> npm run dev:server
API_URL=http://127.0.0.1:7360 npm run dev --workspace web -- --port 5230 --strictPort
npm run seed:demo --workspace server      # com o mesmo DATA_DIR
```

Variáveis novas (já em `config.ts` e no `.env.example`): `WINDSOR_API_KEY` (F8), `MCP_ATIVO`, `MCP_REDIRECTS_EXTRAS` e
`MCP_ORIGENS_EXTRAS` (F7). Convenções só de desenvolvimento, sem variável nova (ignoradas com `NODE_ENV=production`):
- **F8:** `WINDSOR_API_KEY=fixtures` faz a busca da Windsor ler `server/test/fixtures/resultados/` (as fixtures da
  pesquisa com as datas deslocadas para o período pedido), para o roteiro de navegador sem a chave real.
- **F9:** o endereço `https://calendar.google.com/calendar/ical/teste%40pauta.test/private-0123456789abcdef/basic.ics`
  busca `server/test/fixtures/agenda/google-2026.ics`.

## 2. Quem é dono do quê

| | F7 `mcp` | F8 `resultados` | F9 `agenda` |
|---|---|---|---|
| Servidor (novos) | `server/src/rotas/{mcp,oauth}*.ts`, `server/src/servicos/{mcp,oauth}*.ts`, `server/src/tarefas/oauth-*.ts` | `server/src/rotas/resultados*.ts`, `server/src/servicos/resultados*.ts`, `server/src/tarefas/resultados-*.ts`, `server/src/provedores/resultados.ts` | `server/src/rotas/agenda*.ts`, `server/src/servicos/agenda*.ts`, `server/src/tarefas/agenda-*.ts`, `server/src/provedores/agenda.ts` |
| Testes e scripts | `server/test/{mcp,oauth}-*.test.ts`, `server/test/mcp-ajuda.ts`, `server/scripts/mcp-fluxo.ts` | `server/test/resultados-*.test.ts`, `server/test/resultados-ajuda.ts`, `server/test/fixtures/resultados/**`, `server/scripts/demo/resultados.ts` | `server/test/agenda-*.test.ts`, `server/test/agenda-ajuda.ts`, `server/test/fixtures/agenda/**` (com `.gitattributes` `*.ics -text`), `server/scripts/demo/agenda.ts`, `server/scripts/agenda-diagnostico.ts` |
| Lógica pura | `shared/logica/mcp-*.ts` | `shared/logica/resultados-*.ts` | `shared/logica/agenda-*.ts` |
| Front (novos) | `web/src/funcionalidades/mcp/**`, `web/src/telas/autorizar/**`, `web/src/extensoes/*/mcp{,-*}.{ts,tsx}` | `web/src/funcionalidades/resultados/**`, `web/src/extensoes/*/resultados{,-*}.{ts,tsx}` | `web/src/funcionalidades/agenda/**`, `web/src/extensoes/*/agenda{,-*}.{ts,tsx}` |
| Toques em arquivos existentes (exclusivos) | `server/package.json`, `package-lock.json`, `web/vite.config.ts` (proxy), `server/src/servicos/pessoas.ts` (desativar revoga as conexões), `server/src/servicos/notificacoes.ts` (`nomeDoAtor` "via Claude"), `server/src/servicos/modal-comum.ts` e `modal-historico.ts` (`Atividade.via`), `server/src/servicos/modal-comentarios.ts` (`Comentario.via`), `web/src/funcionalidades/modal/secoes/Atividade.tsx` (o selo) | `web/src/telas/clientes/TelaCliente.tsx` e `cliente-abas.tsx` (hosts de `cliente-aba` e `cliente-config`) | `server/src/tarefas.ts` (tarefa com intervalo, `aCadaMin`), `web/src/telas/agenda/TelaAgenda.tsx` (host de `agenda-fonte`), `web/src/calendario/**` (itens externos), `web/src/ui/GradeCalendario.tsx` (só props novas, se precisar) |
| Migrações | 110–119 | 120–129 | 130–139 |
| Operação (o integrador leva ao README) | `docs/fase2/operacao-mcp.md` | `docs/fase2/operacao-resultados.md` | `docs/fase2/operacao-agenda.md` |

Ninguém da Fase 2 mexe em `server/src/app.ts`, `server/src/web.ts`, `server/src/auth.ts` nem `server/src/db.ts`: o F7
registra limites de corpo, `Cache-Control` e os `404`/`405` explícitos nas próprias rotas (registradas antes do fallback
de SPA, API §F.1).

## 3. Funcionalidades

### F7 · MCP + OAuth + consentimento + Conexões (`mcp`)

**Rotas (API §F.2–§F.5):** metadados (2 + `404` do resto de `/.well-known`), `POST /oauth/registrar`,
`GET /oauth/autorizar`, `POST /oauth/token`, `POST /oauth/revogar` (+ `404` do resto de `/oauth`),
`GET /api/oauth/pedidos/:id`, `POST /api/oauth/pedidos/:id/decisao`, `GET /api/conexoes`,
`POST /api/conexoes/:id/revogar`, `POST /mcp` (`405` no resto). Tarefa `oauth-poda` (03:30).

**Servidor (sugestão de arquivos):** `servicos/oauth.ts` (clientes, pedidos, códigos, concessões, revogar, poda),
`servicos/oauth-tokens.ts` (emitir, trocar, rotação com a tolerância de 60 s, conferir o bearer → `Ator`),
`servicos/mcp.ts` (o **único** arquivo que importa a SDK: registra as ferramentas no `McpServer` e devolve o handler
`fetch`), `servicos/mcp-ferramentas-leitura.ts` e `mcp-ferramentas-escrita.ts` (cada ferramenta no nosso formato:
`nome`, `titulo`, `descricao`, esquema zod, anotações, `executar(ator, args)`), `servicos/mcp-nomes.ts` (resolver
quadro, coluna, cliente, pessoa, modelo, etiqueta, com as opções no erro), `servicos/mcp-texto.ts` (linha de demanda,
datas, dinheiro, cortes, teto de 20.000 caracteres), `servicos/mcp-provedores.ts` (§5), `rotas/mcp.ts`,
`rotas/oauth.ts`, `rotas/oauth-api.ts`, `tarefas/oauth-poda.ts`. As ferramentas chamam os serviços que já existem
(API §F.5, coluna "Quem / regra"); nenhuma regra de papel nova. O histórico em frases do `ler_demanda` reaproveita
`shared/logica/modal-atividade.ts`.

**Plano B (se a SDK v2 der atrito no TS 7 ou no comportamento):** JSON-RPC à mão em `servicos/mcp.ts` (~250 linhas:
`initialize`, `ping`, `tools/list`, `tools/call`, notificações `202`, `-32601`, `MCP-Protocol-Version` inválida → `400`,
`z.toJSONSchema()` para os esquemas), só a era 2025 (pesquisa-mcp §5.3). As ferramentas não mudam (o adaptador é um
arquivo). Decidir até o fim do 1º dia, com `npx tsc --noEmit -p server` e um `tools/list` pelo `app.request()`.

**Front:** tela `/autorizar` (`telas/autorizar/rota.tsx`, `acesso: 'autenticada'`, `layout: 'vazio'`: logo, "O Claude quer
acessar o {APP_NOME} como você", avatar, nome e papel, o que ele poderá fazer — ler e mexer em demandas, comentar,
lançar horas, registrar retorno se for do atendimento; nunca apagar nem falar com o cliente —, o host do redirect em
destaque, o nome informado pelo aplicativo, aviso de que substitui uma conexão quando for o caso, [Permitir] laranja e
[Cancelar]; decisão por `fetch` + `location.assign`; pedido vencido: "Este pedido expirou. Volte ao Claude e conecte de
novo."); seção `config/mcp-conexoes.tsx` ("Conexões", ordem 60, todos os papéis: `urlMcp` com Copiar, o passo a passo do
claude.ai e do Claude Code, a lista com [Revogar] e confirmação; admin: chave "Todas as pessoas"; vazio: "Nenhuma
conexão. Conecte o Claude com o endereço acima."); `eventos/mcp.ts` (`conexao`); `comandos/mcp.ts` ("Conectar o
Claude" → `/config/conexoes`, ordem 540); o selo "via Claude" (ícone `Sparkles`, texto "via Claude", contraste AA) na
linha do histórico e no cabeçalho do comentário (`modal/secoes/Atividade.tsx`).

**Testes (`node:test` + `app.request()`, relógio fixo):**
- metadados: JSON exato da API §F.2 a partir do `APP_URL`; `/.well-known/openid-configuration` → `404` texto;
  `Cache-Control: no-store`; nenhum `Access-Control-Allow-Origin`.
- `/mcp`: sem token → `401` com o `WWW-Authenticate` exato; token errado, vencido, revogado, de pessoa inativa → `401`
  `error="invalid_token"`; `GET`/`DELETE` → `405 Allow: POST`; `Origin: https://evil.example` → `403`; sem `Origin` e com
  `https://claude.ai` → passam; corpo de 2 MiB → `413`; `Mcp-Session-Id` nunca na resposta.
- registro: claude.ai e claude.com → `201`; `http://127.0.0.1:43123/callback` → `201` `native`; `https://evil.example/cb`,
  `http://localhost/outro`, fragmento → `400 invalid_redirect_uri`; 31º registro na hora do mesmo IP → `429`.
- autorizar: cliente desconhecido e redirect fora da lista → `400` sem `Location`; `code_challenge_method=plain` →
  `302` com `error=invalid_request`, `state` e `iss`; pedido gravado e `302` para `/autorizar?pedido=`; loopback com
  outra porta aceito.
- decisão: sem `X-Trace-Id`/`Origin` → `403 csrf`; permitir → `redirecionar` com `code`, `state`, `iss`; negar →
  `error=access_denied`; segunda decisão → `410`; pedido vencido → `410`.
- token: só form-urlencoded; PKCE certo → par; verificador errado → `invalid_grant`; `redirect_uri` diferente →
  `invalid_grant`; código reusado → `invalid_grant` e a concessão emitida revogada (`codigo_reusado`); refresh roda;
  refresh antigo dentro de 60 s → par novo; depois de 61 s → `invalid_grant` e concessão revogada (`reuso_refresh`);
  `offline_access` aceito; autorizar o mesmo cliente de novo → a anterior `substituida`.
- revogar (`/oauth/revogar` e Conexões): `200` sempre; a próxima chamada ao `/mcp` → `401`; outra pessoa (não admin)
  revogando → `404`; admin revoga a de qualquer um; SSE `conexao` só para a dona e os admins; desativar a pessoa revoga
  (`desativacao`).
- ferramentas: `tools/list` com as 15 na ordem de `FERRAMENTAS_MCP`, `title`, anotações da API §F.5 e esquemas que
  recusam campo desconhecido; cada ferramenta com o caminho feliz e um erro virando `isError`; nomes ambíguos com as
  opções; `registrar_retorno` pela equipe → `isError` "Só o atendimento…"; `resumo_cliente` da equipe sem a linha de
  horas; `criar_demanda` não aceita AM nem rodadas; respostas ≤ 20.000 caracteres com 5.000 demandas; listas de 20 com
  cursor; 61ª chamada no minuto → `isError`.
- via Claude: criar, editar, mover, comentar e concluir pelo MCP → `GET /historico` com `via: 'claude'` nas atividades
  (inclusive a da automação disparada); o mesmo pela tela → `via` nulo; comentário com `via: 'claude'` na lista e no SSE;
  notificação "Rafa via Claude…"; ferramenta que falha não deixa `mcp_traco`; leitura não grava traço.
- segredos: log capturado durante o fluxo inteiro sem `pauta_at_`, `pauta_rt_`, o código, `code_verifier` nem `state`.

**Roteiro de navegador** (dev, 5230, claro e escuro, 1440 e 390 px): conectar o Claude Code de verdade (`claude mcp add
--transport http pauta http://localhost:5230/mcp` e `/mcp` → autenticar) passa pela `/entrar?volta=` e cai na tela de
consentimento com "Claude Code neste computador"; Permitir volta ao terminal; Conexões mostra a conexão; pedir ao Claude
"o que tenho para hoje?" e "cria uma demanda no quadro Criação para o HE: Teste MCP, prazo sexta" → o card aparece no
quadro de outra janela em menos de 1 s e o histórico mostra "via Claude"; Revogar em Conexões → a próxima pergunta pede
para reconectar; Cancelar na tela volta com erro ao Claude; pedido vencido mostra o texto de expirado.

**Roteiro de protocolo** (simula o claude.ai inteiro, sem navegador):
```
BASE=http://localhost:5230        # depois do deploy: https://demandas.meltcomunicacao.com.br
curl -si $BASE/.well-known/oauth-protected-resource/mcp            # 200, resource = $BASE/mcp
curl -si $BASE/.well-known/oauth-authorization-server              # 200, S256, registration_endpoint
curl -si $BASE/.well-known/openid-configuration                    # 404 text/plain (nunca o index.html)
curl -si $BASE/mcp                                                 # 405, Allow: POST
curl -si -X POST $BASE/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'               # 401 + WWW-Authenticate resource_metadata=…
curl -si -X POST $BASE/oauth/registrar -H 'Content-Type: application/json' \
  -d '{"client_name":"x","redirect_uris":["https://evil.example/cb"]}'  # 400 invalid_redirect_uri
PAUTA_EMAIL=<seu> PAUTA_SENHA=<sua> node server/scripts/mcp-fluxo.ts --base $BASE --quadro criacao
```
`server/scripts/mcp-fluxo.ts` (F7) faz, imprimindo uma linha "ok/falhou" por passo e **nunca** um token: registro com
loopback → PKCE → `GET /oauth/autorizar` sem seguir → login por `POST /api/auth/login` (com `Origin` e `X-Trace-Id`) →
`GET /api/oauth/pedidos/:id` → decisão → `code` do `redirecionar` → `POST /oauth/token` → `initialize` + `tools/list`
(15, na ordem) → `minhas_demandas` → `criar_demanda` → `GET /api/demandas/:id/historico` com o cookie (`via: 'claude'`)
→ `comentar` → refresh (rotação) → o refresh antigo de novo dentro de 60 s (aceito) → `POST /api/conexoes/:id/revogar`
→ `/mcp` → `401 invalid_token`. Depois: MCP Inspector (`npx @modelcontextprotocol/inspector`, fluxo OAuth guiado) contra
o mesmo `BASE`.

**Aceite (verificável):** tudo acima verde; `tools/list` devolve exatamente `FERRAMENTAS_MCP`; o `mcp-fluxo.ts` termina
com "15 passos ok"; `grep -E "pauta_(at|rt)_|code_verifier" <log do servidor>` vazio; `MCP_ATIVO=0` → `404` nos 4
caminhos; nenhum arquivo fora da §2 no `git diff --name-only master...fase2/mcp`.

### F8 · Resultados da Windsor (`resultados`)

**Rotas (API §F.8, 6):** `GET /api/resultados/contas`, `GET|POST /api/clientes/:id/resultados/contas`,
`DELETE /api/clientes/:id/resultados/contas/:ligacaoId`, `GET /api/clientes/:id/resultados`,
`POST /api/clientes/:id/resultados/atualizar`. Tarefa `resultados-poda` (03:40). Provedor `provedores/resultados.ts`.

**Antes de codificar a lista de contas:** os 5 comandos da pesquisa-windsor §10, no terminal de quem tem a chave (a chave
só no ambiente do shell), anotando em `docs/fase2/operacao-resultados.md` só o resultado (formato, contagens, nomes dos
cabeçalhos de cota, tempo), nunca a chave nem nomes de clientes. A origem da lista (`ds-accounts` ou o MCP da Windsor) sai
daí; o contrato não muda.

**Servidor (sugestão):** `servicos/resultados-windsor.ts` (HTTP: monta a URL com `URLSearchParams`, `fetch` com 60 s,
zod, `mascararChave()`, `definirBuscaWindsor()`, soma em `windsor_uso`, teto de 8.000/dia), `servicos/resultados.ts`
(período, cache, trava por cliente e período, segundo plano, SSE, estados), `servicos/resultados-contas.ts` (lista em
cache de 24 h, ligar, desligar), `shared/logica/resultados-periodo.ts` (`periodoDe(periodo, hoje)`, puro),
`shared/logica/resultados-calculo.ts` (somas e razões a partir das linhas; puro; o front usa a variação),
`rotas/resultados.ts`, `provedores/resultados.ts`, `tarefas/resultados-poda.ts`.

**Front:** aba `cliente-aba/resultados.tsx` ("Resultados", ordem 150, todos): seletor de período (Este mês, Mês passado,
7, 30, 90 dias, na URL `?periodo=`), "comparado com 20/08–18/09", um bloco por conector com os KPIs (cartões com o
valor, a variação em seta e cor — subir investimento não é "bom" nem "ruim": só custos usam vermelho/verde invertido, e
o resto neutro), o **gráfico SVG próprio** (`funcionalidades/resultados/GraficoSerie.tsx`: linha do período atual e
tracejada do anterior alinhadas por dia, métrica escolhida por chips, eixo com 3–4 marcas, dica no toque e no foco,
`role="img"` com resumo em texto e [Ver como tabela]; cores dos tokens nos dois temas; sem biblioteca), as 10 campanhas
(tabela que vira lista no celular), eventos-chave do GA4, "Dados de 14:05 · [Atualizar agora]" e os estados (sem chave:
"A integração com a Windsor não está configurada." + para o admin "Defina WINDSOR_API_KEY no EasyPanel."; sem contas:
"Nenhuma conta de resultados ligada." + [Ligar contas] para quem pode; fora do ar com os dados antigos; conta sem dados
no período; carregando = esqueleto dos cartões); seção `cliente-config/resultados-contas.tsx` ("Contas de resultados",
ordem 100: por conector, [Ligar conta] abre o diálogo `resultados-ligar-conta` com busca, a lista da Windsor e os clientes
que já usam cada conta, e "Digitar o id" para conta fora da lista; [Desligar] com confirmação); seção
`config/resultados-windsor.tsx` ("Resultados (Windsor)", ordem 560, admin e atendimento: estado da chave, uso de hoje,
todas as contas com o cliente ligado ou "sem cliente", [Recarregar lista] só admin); `eventos/resultados.ts`
(`resultado_cliente`).

**Testes:**
- `periodoDe` com o relógio em 19/10/2026: `30d` = 19/09–18/10 × 20/08–18/09; `7d` = 12/10–18/10 × 05/10–11/10;
  `este_mes` = 01/10–19/10 × 01/09–19/09; `mes_passado` = setembro × agosto; em 31/03, `este_mes` compara com 01/02–28/02.
- cálculo com as fixtures da pesquisa como período atual (B vazio), uma conta por conector — **valores esperados:**
  Meta investimento 246,83 (soma das linhas diárias), impressões 101.245, cliques 758, cliques no link 726, CTR 0,7487%
  (758/101.245), CPC R$ 0,3256, **alcance 62.268** (do total do período, não da soma dos dias), leads 0, conversas 1,
  resultados 1, custo por resultado R$ 246,83, ROAS nulo; Google Ads investimento 1.663,8393, impressões 62.823, cliques
  4.219, CTR 6,72% (4.219/62.823), CPC R$ 0,3944, conversões 128,5283, custo por conversão R$ 12,9453, ROAS nulo (valor
  0); GA4 sessões 1.597, engajadas 973, taxa 60,93% (973/1.597), visualizações 2.780, eventos-chave 153, **usuários
  1.124** (do total, não 1.253 da soma), eventos por nome `click_wpp` 134 e `Lead_chatbot` 18.
- `null` como 0; `data: []` nos dois períodos → `sem_dados`; erros da `erros.json` → `chave_invalida`, `fora_do_ar`
  (500, rede, tempo esgotado), `limite` (429 e o teto de 8.000); o corpo de erro com a chave **nunca** aparece em log,
  resposta ou mensagem (captura do log); `act_123` vira `123`; conta digitada fora da lista sem nome → `400`.
- cache: segunda leitura em 3 h → 0 chamadas; período fechado há mais de 3 dias → 24 h; ligar uma conta → o próximo GET
  busca de novo; erro mantém os dados e o `buscadoEm` antigos; GET sem cache → `atualizando: true` e SSE no fim; duas
  leituras simultâneas → uma busca; "Atualizar agora" 2× em 5 min → `429`; chamadas por atualização ≤ 8.
- permissões: equipe liga conta → `403`; atendimento de outra carteira → `403`; equipe vê resultados; `?recarregar=1`
  por atendimento → `403`.
- provedor: `provedor.resultados(db, …, esperarMs)` espera a busca e devolve; passou do tempo → `atualizando: true`.

**Roteiro de navegador** (`WINDSOR_API_KEY=fixtures`): ligar ao HE uma conta de cada conector pela lista; a aba
Resultados mostra os três blocos, o gráfico com as duas linhas, as campanhas e os eventos-chave; trocar o período muda a
URL e os números; "Atualizar agora" mostra "Atualizando…" e outra janela recebe o fim; desligar a conta do Google Ads tira
o bloco; com `WINDSOR_API_KEY` vazia, o estado "não configurada"; 390 px com cartões em coluna e o gráfico legível; teclado
percorre os chips do gráfico com foco visível.

**Roteiro de protocolo:** `curl` contra a API local com o cookie de uma sessão: `GET /api/resultados/contas`, `POST …/contas`
com `act_1000000000000001` (vira sem `act_`), `GET …/resultados?periodo=7d` duas vezes (a segunda sem `atualizando`);
depois do deploy, com a chave real no EasyPanel: os 5 comandos da pesquisa §10 e um cliente de verdade conferido contra o
painel da Windsor (investimento e cliques do mesmo período batem; alcance e usuários batem com o total do período).

**Aceite:** os valores esperados acima nos testes; `grep -i "api_key" <log>` só com `***`; nenhuma dependência nova;
`git diff --name-only` dentro da §2.

### F9 · Agenda externa (`agenda`)

**Rotas (API §F.9, 6):** `GET|POST /api/agendas-externas`, `PATCH|DELETE /api/agendas-externas/:id`,
`POST /api/agendas-externas/:id/atualizar`, `GET /api/agendas-externas/eventos`. Tarefa `agenda-busca` (a cada 15
min). Provedor `provedores/agenda.ts`.

**Tarefa com intervalo** (toque em `server/src/tarefas.ts`): `Tarefa` ganha `aCadaMin?: number`; com ele, `horario` é
ignorado e a tarefa é devida quando `ultima_em` (em `tarefa_execucao`) tem mais de `aCadaMin` minutos (as diárias não
mudam; teste com `relogio()`).

**Servidor (sugestão, pesquisa-ical §6.5):** `servicos/agenda-ical-leitura.ts` (desdobrar em bytes, linhas, parâmetros
com aspas, TEXT), `agenda-ical-fuso.ts` (local + TZID → instante pelo `Intl`, o algoritmo de 2 candidatos),
`agenda-ical-repeticao.ts` (o subconjunto de RRULE, só até o fim da janela, salto aritmético, tetos),
`agenda-ical.ts` (montagem: UID, EXDATE, exceções, canceladas, órfãs, SEQUENCE, privados, HTML → texto, link da reunião),
`agenda-busca.ts` (validar e normalizar a URL, cifrar, `fetch` em fluxo com teto, hash sem DTSTAMP, gravar numa
transação, estado, SSE, `definirBuscaAgenda()`), `rotas/agenda.ts`, `tarefas/agenda-busca.ts`, `provedores/agenda.ts`;
`server/scripts/agenda-diagnostico.ts` (lê um endereço do ambiente e imprime **só contagens**, pesquisa-ical §8).

**Plano B:** se o diagnóstico do feed real mostrar regras fora do subconjunto que importem, trocar só o expansor pelo
ical.js 2.2.1 (pedido com a justificativa), mantendo o fuso pelo `Intl` e os mesmos testes.

**Front:** fonte `agenda-fonte/agenda.tsx` (ordem 100: `usarItens` lê `GET /api/agendas-externas/eventos` do período
visível com TanStack Query, chave `['agenda-externa', 'eventos', de, ate]`; esconde as agendas desligadas no filtro;
`Filtro` = chips com a cor de cada agenda, ligados e desligados guardados no `localStorage`); host na Agenda
(`TelaAgenda.tsx` + `CalendarioDemandas` com `externos?: ItemAgendaExterno[]`: contorno na cor da agenda e fundo leve,
hora antes do título, dia inteiro no topo do dia, sem arrastar, "livre" e "talvez" mais leves; na semana, por horário;
no celular, na lista do dia; o Calendário do quadro não passa `externos`); diálogo `agenda-evento` (popover no desktop,
folha no celular: título, dia e horário, agenda, local, [Entrar na reunião] só `https:`, descrição em texto puro com
quebras, "Ocupado" sem nada disso); seção do Início `inicio/agenda-hoje.tsx` ("Hoje na agenda", ordem 150, some quando
não há agenda ativa; vazio: "Nada na agenda hoje."); seção `config/agenda-externas.tsx` ("Agendas externas", ordem 570,
admin: nome, cor, a dica do endereço, estado "Atualizada às 14:05 · 312 eventos" ou o erro em português, pausar, trocar o
endereço (colar de novo), excluir, [Atualizar agora], o passo a passo de onde copiar o endereço secreto no Google, e o
aviso de que quem tem o endereço lê a agenda inteira); `eventos/agenda.ts` (`agenda_externa`).

**Testes:** todos os casos da pesquisa-ical §7 sobre as fixtures `google-2026.ics` (relógio `2026-10-19T13:00:00Z`) e
`google-2018.ics` (relógio `2018-11-01T12:00:00Z`), copiadas para `server/test/fixtures/agenda/` com o
`.gitattributes` `*.ics -text` — no mínimo os obrigatórios G1, B1, B2, B3, C1, C2, C4, D1 (29 ocorrências), D2, E1, E2,
E6, E10, F1 (`2018-11-05T12:00:00Z`), F2, F3 (`03:30Z`), F4 (`2019-02-17T01:30Z`) e F6, com os valores da tabela;
B6 (`TZ=UTC` e `TZ=Asia/Tokyo` dão o mesmo); H1–H8 e H11 com a busca trocável (404 mantém as anteriores; mesmo feed com
outro `DTSTAMP` não escreve nem emite; endereço fora do formato → `400`; o endereço nunca em resposta, log ou erro);
privado vira "Ocupado"; janela −30/+180; `aCadaMin`; permissões (equipe criando → `403`; todos leem eventos);
`agendaIds` e o limite de 62 dias; excluir leva as ocorrências.

**Roteiro de navegador** (o endereço de teste da §1): o admin cola o endereço em Configurações → Agendas externas e vê
"Atualizada às …" com as contagens; a Agenda mostra os eventos de outubro junto com os prazos, com estilo distinto, sem
arrastar; clicar abre os detalhes com [Entrar na reunião]; o evento privado aparece "Ocupado"; desligar a agenda no
filtro some com os eventos e sobrevive ao recarregar; o Início mostra "Hoje na agenda"; trocar a cor reflete na outra
janela em menos de 1 s; 390 px na lista do dia; claro e escuro com contraste AA no contorno e no texto.

**Roteiro de protocolo:** `curl` com o cookie: `POST /api/agendas-externas` com `http://…`, com outro host e com
`webcal://…` válido (`400`, `400`, `201`); `GET …/eventos?de=2026-10-01&ate=2026-12-15` → `400` (mais de 62 dias);
`GET …/eventos?de=2026-10-19&ate=2026-10-25` → JSON sem nenhum campo com `private-`. Depois do deploy, com o endereço real
só no shell: `node server/scripts/agenda-diagnostico.ts` e as respostas da pesquisa-ical §8 anotadas em
`docs/fase2/operacao-agenda.md` (só contagens).

**Aceite:** os obrigatórios do §7 verdes com os valores esperados; `grep -r "private-" <log> server/test/*.log` vazio;
nenhuma dependência nova; `git diff --name-only` dentro da §2.

## 4. Pontos de extensão do front

Novos (tipos em `web/src/extensoes/tipos.ts`, registro em `registro.ts`: `abasCliente()`, `secoesCliente()`,
`fontesAgenda()`; as pastas começam vazias):

| Ponto | Export | Host (dono do host) | Contribuem |
|---|---|---|---|
| `extensoes/cliente-aba` | `aba: ExtensaoAbaCliente` | `telas/clientes/TelaCliente.tsx` (F8): mistura com as fixas pela `ordem` (Demandas 100, Aprovações 200, Horas 300, Configurações 900), `?aba=<id>`, um painel por aba, lazy | F8 `resultados` 150 |
| `extensoes/cliente-config` | `secao: ExtensaoSecaoCliente` | aba Configurações do cliente (`cliente-abas.tsx`, F8), abaixo do cadastro, com `podeEditar` | F8 `resultados-contas` 100 |
| `extensoes/agenda-fonte` | `fonte: FonteAgenda` | `telas/agenda/TelaAgenda.tsx` + `calendario/` (F9): chama `usarItens` de cada fonte sempre na mesma ordem, junta os itens e desenha os `Filtro` na barra | F9 `agenda` 100 |

Existentes, com as contribuições da Fase 2:

| Ponto | Ordem |
|---|---|
| Configurações | `cadastros-conta` 50 · **`mcp-conexoes` 60** (todos) · `cadastros-pessoas` 100 · … · `cadastros-parametros` 550 · **`resultados-windsor` 560** (admin, atendimento) · **`agenda-externas` 570** (admin) · `cadastros-aparencia` 600 |
| Início | `cadastros-primeiros-passos` 50 · `paineis-minhas` 100 · **`agenda-hoje` 150** · `paineis-cliente-parado` 200 · `paineis-mencoes` 300 |
| Diálogos | **`resultados-ligar-conta`** (F8) · **`agenda-evento`** (F9): cada um aumenta `MapaDialogos` com `declare module` no próprio arquivo (só ele abre) |
| Tratadores de eventos | **`mcp`** (`conexao`) · **`resultados`** (`resultado_cliente`) · **`agenda`** (`agenda_externa`) |
| Comandos da paleta | **`mcp`** "Conectar o Claude" 540 |
| Telas | **`/autorizar`** (F7, `telas/autorizar/rota.tsx`, autenticada, layout vazio) |

Estados vazios e de erro: os textos estão em cada funcionalidade acima (§3); tom do PLANO §0 regra 4.

## 5. Ponte F7 ↔ F8/F9 (provedores)

O MCP lê resultados e agenda **sem import cruzado** (API §F.5.1):
- **Interface no contrato:** `ProvedorResultadosMcp<Db>` e `ProvedorAgendaMcp<Db>` em `shared/tipos/mcp.ts`.
- **Implementação de cada dona:** `server/src/provedores/resultados.ts` (F8) e `server/src/provedores/agenda.ts` (F9),
  cada um com `export const provedor: ProvedorMcp<Db>` chamando os próprios serviços. Testadas pelas donas.
- **Descoberta pelo F7:** `server/src/servicos/mcp-provedores.ts` lê `server/src/provedores/*.ts` no boot (como as rotas;
  pasta ausente = vazia) e expõe `provedorResultados()` e `provedorAgenda()`, nulos até o merge da dona.
  `definirProvedores({ resultados?, agenda? })` para os testes do F7 (provedores falsos com `ResultadosCliente` e
  `EventosAgendaSaida` montados à mão).
- **Sem provedor:** `resumo_cliente` mostra o resto e "(resultados ainda não disponíveis)"; `agenda` mostra as demandas e
  "(agenda da Melt ainda não disponível)".
- **Depois do merge:** nada a ligar. O integrador roda o teste de integração (§6, passo 3) que chama as duas ferramentas
  com os provedores reais.

## 6. Ordem de merge e verificação final

**Ordem: F7 → F8 → F9.** O MCP é a prioridade do dono ("faz o MCP depois…") e é o que mais depende de configuração fora
do código (Cloudflare, conector no claude.ai): entra primeiro para ir a produção cedo. Os provedores tornam a ordem livre
para o código (F8 e F9 não dependem do F7 nem um do outro, e os arquivos são disjuntos), então um atraso de um não segura
os outros.

Para cada funcionalidade, o integrador:
1. Pede `git rebase master` e o "pronto" da regra 7 (§0) na worktree, com os critérios de aceite.
2. Confere `git diff --name-only master...fase2/<nome>` contra a §2 (extensões pelo glob do prefixo; migrações só na
   faixa; nada em `shared/tipos/*.ts` existentes, `web/src/extensoes/tipos.ts`, `docs/API.md` nem nas migrações 100–103).
3. `git merge --no-ff fase2/<nome>` e, na raiz: `npm ci`, `npx tsc --noEmit -p server`, `npx tsc --noEmit -p web`,
   `npm test`, `node server/scripts/verificar-migracoes.ts`, `npm run build` (sem chunk acima de 500 kB; `/a/:token`
   abaixo de 150 kB gzip) e a tela `/dev/extensoes`. Depois do F8: `resumo_cliente` pelo `mcp-fluxo.ts` mostra os
   resultados das fixtures; depois do F9: `agenda` mostra os eventos da fixture (teste de integração do integrador,
   `server/test/integracao-fase2.test.ts`, faixa 190–199 se precisar de migração).
4. Aplica os pedidos de `docs/pedidos/f{7,8,9}-*.md`, leva o `docs/fase2/operacao-<nome>.md` ao `README.md` (seção
   "Fase 2") e remove a worktree.

**Verificação final** (banco novo e cópia do backup de produção, build servido pelo Node na 7300):
1. As migrações 100–103 e as das faixas aplicam sobre uma cópia do banco de produção (backup do dia) sem erro, e os
   dados de antes continuam iguais (contagens de demandas, atividades e sessões).
2. Duas janelas: o Claude Code conectado por loopback cria, move, comenta e conclui; tudo aparece na outra janela em
   menos de 1 s com "via Claude"; Revogar corta na próxima chamada.
3. A aba Resultados do HE (fixtures) e o `resumo_cliente` do MCP mostram os mesmos números.
4. A Agenda mostra os prazos e os eventos da fixture; o Início, "Hoje na agenda"; o `agenda` do MCP, os dois.
5. CSP da API §1 sem violações no console (a tela `/autorizar` inclusive); `/mcp`, `/oauth/*`, `/.well-known/*` nunca
   devolvem HTML; `Cache-Control: no-store` neles.
6. Logs de um dia inteiro de roteiro sem token, código, chave da Windsor nem endereço iCal.

**Produção** (depois do deploy de cada uma):
- F7 — **antes do deploy**, na Cloudflare (pesquisa-mcp §7): conferir Security → Bots (Bot Fight Mode desafia o backend
  da Anthropic e, no Free, não aceita exceção: desligar, ou IP Access "Allow" para os oito `/24` de `160.79.104.0/21`);
  regra WAF Skip (gerenciadas, rate limiting) e Configuration Rule sem Browser Integrity Check para `/mcp`, `/oauth/*` e
  `/.well-known/oauth-*`; Cache Rule Bypass para os mesmos. Depois: os `curl` do roteiro de protocolo de fora da rede da
  Melt; o Owner adiciona o conector em *Organization settings → Connectors* com `https://demandas.meltcomunicacao.com.br/mcp`;
  cada pessoa clica **Connect**; uma pessoa de cada papel faz 3 perguntas e 1 escrita. Falha do claude.ai mostra um
  `ofid_…` para o chamado.
- F8 — `WINDSOR_API_KEY` no EasyPanel; os 5 comandos da pesquisa-windsor §10; ligar as contas dos clientes (atendimento) e
  conferir 2 clientes contra o painel da Windsor.
- F9 — o admin cola o endereço secreto da agenda da Melt; `agenda-diagnostico.ts` no shell; conferir 3 eventos (um
  recorrente, um de dia inteiro, um privado) contra o Google Agenda.

## 7. Dúvidas em aberto

Decisões tomadas no contrato que o dono do produto deve confirmar (nenhuma bloqueia o início):

1. **Quem liga as contas da Windsor:** a regra de editar o cliente (admin; atendimento nos da carteira e nos sem AM). O
   Tráfego (papel `equipe`) vê os resultados mas não liga contas. Liberar para ele seria uma ação nova em `AcaoPermissao`.
2. **"Resultados" da Meta = leads + conversas** (o "Resultado" do Gerenciador, que muda com o objetivo, não vem pela
   Windsor). Por objetivo de campanha fica como melhoria.
3. **Comparação de "Este mês"** com os mesmos dias do mês anterior (01–19/09 contra 01–19/10); 7/30/90 dias terminam
   ontem (dias fechados).
4. **Um escopo só no OAuth:** o Claude pode tudo o que a pessoa pode pela tela, menos apagar e falar com o cliente.
   `registrar_retorno` entra (só atendimento e admin) porque registra o que o cliente disse, sem mandar nada.
5. **`editar_demanda` substitui a descrição inteira** (a ferramenta avisa para ler antes); não há "acrescentar à
   descrição".
6. **Agendas externas:** "Atualizar agora" e o cadastro só pelo admin; o filtro de calendários fica no aparelho
   (`localStorage`), não na conta.
7. **Evento privado sempre "Ocupado"**, mesmo que o endereço secreto traga os detalhes (toda a equipe vê a Agenda).
8. **Cloudflare:** desligar o Bot Fight Mode ou liberar a faixa da Anthropic (decisão de quem administra a Cloudflare).
9. **Horas no `resumo_cliente`** só para atendimento e admin (a mesma regra do total por cliente, API §2).
10. **Conexões** como seção própria logo depois de "Sua conta" em Configurações (o `FASE2.md` diz "Sua conta →
    Conexões"; a seção "Sua conta" é de outra funcionalidade e não tem subseções).

## 8. Riscos e o que fazer

| Risco | O que fazer |
|---|---|
| A SDK v2 do MCP muda rápido ou não fecha no TS 7 | versão exata; adaptador num arquivo; plano B à mão decidido no 1º dia (§3 F7) |
| Bot Fight Mode / WAF da Cloudflare barram a Anthropic | checklist de produção (§6) antes do deploy; ler os logs de borda na 1ª conexão |
| Prompt injection por texto de cliente numa demanda | `instructions` e descrições dizem que texto de demanda é dado; nenhuma ferramenta apaga ou fala com o cliente; o Claude pede aprovação nas escritas (anotações); "via Claude" e Revogar |
| Lista de contas da Windsor sem a chave real | contrato independe da origem; F8 testa com a chave antes de codificar a lista; "Digitar o id" cobre a falta |
| Windsor lenta ou fora do ar | cache de 3 h, segundo plano, dados antigos com a hora, teto diário, 60 s por chamada; o MCP espera no máximo 45 s |
| Feed iCal grande ou com regras raras | teto de 32 MB / 60 s / 20.000 ocorrências; contagem de "repetições não entendidas"; plano B do expansor |
| Vazamento de segredo em log | teste de captura de log nas três; `mascararChave()`; nenhum `console.error(e)` com URL |
| Mudança de callback do Claude (claude.com) ou do DCR | as duas URLs já na lista; `MCP_REDIRECTS_EXTRAS` sem deploy; CIMD planejado (pesquisa-mcp §4.9) |
