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
| Código comum das três (com teste) | `server/src/servicos/segredos.ts` (`mascararSegredos`, `descreverErro`, `registrarFalhaMascarada`, API §F.1); `shared/logica/resultados-formato.ts` (KPIs principais, rótulo, formato, sentido e variação: o mesmo texto na aba e no MCP, API §F.8; **não** é do F8 apesar do prefixo); `server/test/fase2-contrato.test.ts` |
| Pesquisas, medições e fixtures | `docs/fase2/pesquisa-mcp.md`, `pesquisa-windsor.md` (+ `fixtures-windsor/`), `pesquisa-ical.md` (+ `fixtures-ical/`) |

Tudo do `docs/PLANO.md` §0 continua valendo; abaixo, só o que muda ou se acrescenta.

Sumário: [0 Regras](#0-regras-da-fase-2) · [1 Ambiente](#1-worktrees-portas-e-variáveis) ·
[2 Quem é dono do quê](#2-quem-é-dono-do-quê) · [3 Funcionalidades](#3-funcionalidades) ·
[4 Pontos de extensão](#4-pontos-de-extensão-do-front) · [5 Ponte F7 ↔ F8/F9](#5-ponte-f7--f8f9-provedores) ·
[6 Merge e verificação final](#6-ordem-de-merge-e-verificação-final) · [7 Dúvidas](#7-dúvidas-em-aberto) ·
[8 Riscos](#8-riscos-e-o-que-fazer) · [9 Críticas descartadas](#9-críticas-descartadas)

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
   (não versionado). Testes e roteiros usam as fixtures. Nenhum log, resposta, mensagem de erro, resultado de ferramenta
   do MCP, `tarefa_execucao.detalhe` ou commit pode ter token OAuth, código, chave da Windsor ou endereço iCal. Cada
   funcionalidade tem um teste que injeta `Error('… api_key=K… private-abc… pauta_at_x')` no provedor, na busca e na
   tarefa e confere o resultado, o log capturado e `tarefa_execucao` (API §F.1: erro que não é `ErroHttp` nunca sai como
   veio; todo `void busca…()` com `.catch(registrarFalhaMascarada(…))`).
7. **Pronto = PLANO §0 regra 8 verde** (`npx tsc --noEmit -p server`, `npx tsc --noEmit -p web`, `npm test`,
   `node server/scripts/verificar-migracoes.ts`, `npm run build`, `npm run contraste --workspace web`, `npm run
   auditoria --workspace web -- --url <seu Vite> --paginas <as suas telas>`, roteiro de navegador em claro e escuro, 1440
   e 390 px) **mais o roteiro de protocolo** da funcionalidade (§3) e os critérios de aceite dela.
8. **Nada quebra o que a equipe usa:** os 539 testes de antes continuam verdes; nenhuma rota, tipo ou tela existente muda
   de comportamento fora do que a §2 lista.
9. **Cores:** `web/src/estilos/tokens.css` e `web/scripts/contraste.ts` são do integrador. F8 e F9 usam só tokens que já
   existem ou `color-mix()` no próprio CSS; cada par novo de cor (contorno do evento, verde e vermelho da variação, faixa
   "Atenção") vai por pedido com as duas cores e o fundo, e o integrador o acrescenta em `pares()` antes da verificação
   final (o aceite lista os pares).

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
| F8 | Resultados da Windsor | `fase2/resultados` | 7361 / 5231 | `./data/f8` | 120–129 | 7 (6 do cliente e da lista de contas, `panorama`) |
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
| Testes e scripts | `server/test/{mcp,oauth}-*.test.ts`, `server/test/mcp-ajuda.ts`, `server/scripts/mcp-fluxo.ts`, `server/scripts/mcp-medir.ts` | `server/test/resultados-*.test.ts`, `server/test/resultados-ajuda.ts`, `server/test/fixtures/resultados/**`, `server/scripts/demo/resultados.ts` | `server/test/agenda-*.test.ts`, `server/test/agenda-ajuda.ts`, `server/test/fixtures/agenda/**` (com `.gitattributes` `*.ics -text`), `server/scripts/demo/agenda.ts`, `server/scripts/agenda-diagnostico.ts` |
| Lógica pura | `shared/logica/mcp-*.ts` | `shared/logica/resultados-*.ts` (menos `resultados-formato.ts`, do contrato) | `shared/logica/agenda-*.ts` |
| Front (novos) | `web/src/funcionalidades/mcp/**`, `web/src/telas/autorizar/**`, `web/src/extensoes/*/mcp{,-*}.{ts,tsx}` | `web/src/funcionalidades/resultados/**`, `web/src/telas/resultados/**` (a carteira), `web/src/extensoes/*/resultados{,-*}.{ts,tsx}` | `web/src/funcionalidades/agenda/**`, `web/src/extensoes/*/agenda{,-*}.{ts,tsx}` |
| Toques em arquivos existentes (exclusivos) | `server/package.json`, `package-lock.json`, `web/vite.config.ts` (proxy), `server/src/servicos/pessoas.ts` (desativar e mudar o papel revogam as conexões), `server/src/rotas/nucleo-auth.ts` (trocar e redefinir a senha revogam as conexões), `server/src/servicos/entrada-busca.ts` (exportar `idsDaBusca`; `buscarDemandas` passa a usá-la com teto 20 e os testes da busca de hoje ficam iguais), `server/src/servicos/notificacoes.ts` (`nomeDoAtor` "via Claude"), `server/src/servicos/modal-comum.ts` e `modal-historico.ts` (`Atividade.via`), `server/src/servicos/modal-comentarios.ts` (`Comentario.via`), `web/src/funcionalidades/modal/secoes/Atividade.tsx` (o selo) | `web/src/telas/clientes/TelaCliente.tsx` e `cliente-abas.tsx` (hosts de `cliente-aba` e `cliente-config`) | `server/src/tarefas.ts` (tarefa com intervalo, `aCadaMin`), `web/src/telas/agenda/TelaAgenda.tsx` (host de `agenda-fonte`), `web/src/calendario/**` (itens externos), `web/src/ui/GradeCalendario.tsx` (só props novas, se precisar) |
| Migrações | 110–119 | 120–129 | 130–139 |
| Operação (o integrador leva ao README) | `docs/fase2/operacao-mcp.md` | `docs/fase2/operacao-resultados.md` | `docs/fase2/operacao-agenda.md` |

Ninguém da Fase 2 mexe em `server/src/app.ts`, `server/src/web.ts`, `server/src/auth.ts` nem `server/src/db.ts`: o F7
registra limites de corpo, `Cache-Control` e os `404`/`405` explícitos nas próprias rotas (registradas antes do fallback
de SPA, API §F.1), e as rotas da Fase 2 capturam os próprios erros sem chegar ao `onError`. Do integrador (por pedido):
`web/src/estilos/tokens.css`, `web/scripts/contraste.ts` e os arquivos do contrato.

## 3. Funcionalidades

### F7 · MCP + OAuth + consentimento + Conexões (`mcp`)

**Rotas (API §F.2–§F.5):** metadados (2 + `404` do resto de `/.well-known`), `POST /oauth/registrar`,
`GET /oauth/autorizar`, `POST /oauth/token`, `POST /oauth/revogar` (+ `404` do resto de `/oauth`),
`GET /api/oauth/pedidos/:id`, `POST /api/oauth/pedidos/:id/decisao`, `GET /api/conexoes`,
`POST /api/conexoes/:id/revogar`, `POST /mcp` (`405` no resto). Tarefa `oauth-poda` (03:30).

**Servidor (sugestão de arquivos):** `servicos/oauth.ts` (clientes, pedidos com o cookie do navegador, códigos,
concessões, `redirectPermitido()`, `revogarConexoesDe(db, usuarioId, motivo)` chamada por `pessoas.ts` e
`nucleo-auth.ts` na transação de `revogarSessoes`, poda), `servicos/oauth-tokens.ts` (emitir, trocar, rotação com o
mesmo par na tolerância de 60 s via `filho_cifrado`, conferir o bearer → `Ator`, `resource` e redirect),
`servicos/mcp.ts` (o **único** arquivo que importa a SDK: registra as ferramentas no `McpServer` e devolve o handler
`fetch`; try/catch em todo `executar` e provedor, API §F.5), `servicos/mcp-ferramentas-leitura.ts` e
`mcp-ferramentas-escrita.ts` (cada ferramenta no nosso formato: `nome`, `titulo`, `descricao`, esquema zod, anotações,
`executar(ator, args)`; as de escrita passam por `entradaDaApi()`: `exigirCamposPermitidos` + `validar(<esquema da
rota>)`), `servicos/mcp-nomes.ts` (resolver quadro, coluna, cliente, pessoa, modelo, etiqueta, com as opções no erro),
`shared/logica/mcp-texto.ts` (linha de demanda, `umaLinha()`, blocos «««/»»», datas, cortes, teto de 20.000 caracteres;
KPIs pelo `resultados-formato.ts` do contrato), `servicos/mcp-provedores.ts` (§5), `rotas/mcp.ts`, `rotas/oauth.ts`,
`rotas/oauth-api.ts`, `tarefas/oauth-poda.ts`. As ferramentas chamam os serviços que já existem (API §F.5, coluna "Quem
/ regra"); nenhuma regra de papel nova. O histórico em frases do `ler_demanda` reaproveita
`shared/logica/modal-atividade.ts`. `server/scripts/mcp-medir.ts`: roda cada leitura no seed de demonstração e imprime
caracteres e tokens estimados contra `ORCAMENTO_MCP` (linha de base em `docs/fase2/operacao-mcp.md`).

**Plano B (se a SDK v2 der atrito no TS 7 ou no comportamento):** JSON-RPC à mão em `servicos/mcp.ts` (~250 linhas:
`initialize`, `ping`, `tools/list`, `tools/call`, notificações `202`, `-32601`, `MCP-Protocol-Version` inválida → `400`,
`z.toJSONSchema()` para os esquemas), só a era 2025 (pesquisa-mcp §5.3). As ferramentas não mudam (o adaptador é um
arquivo). Decidir até o fim do 1º dia, com `npx tsc --noEmit -p server` e um `tools/list` pelo `app.request()`.

**Front:** tela `/autorizar` (`telas/autorizar/rota.tsx`, `acesso: 'autenticada'`, `layout: 'vazio'`: logo; título pelo
destino — claude.ai: "O Claude quer acessar o {APP_NOME} como você"; loopback: "Um aplicativo neste computador quer
acessar o {APP_NOME} como você", com o nome informado em destaque e a caixa obrigatória "Fui eu que comecei esta
conexão no Claude Code" (Permitir desabilitado até marcar) —; avatar, nome e papel; o que ele poderá fazer — ler e
mexer em demandas, comentar, lançar horas, registrar retorno se for do atendimento; nunca apagar nem falar com o
cliente —; o host do redirect em destaque; o nome informado pelo aplicativo; "Pedido criado às 14:05 · Só continue se
você acabou de clicar em Conectar no Claude. Se alguém te mandou este link, cancele."; com `anteriores > 0`, a caixa
"Substituir a conexão anterior" (marcada); [Permitir] laranja e [Cancelar]; decisão por `fetch` + `location.assign`;
pedido vencido: "Este pedido expirou. Volte ao Claude e conecte de novo."; outro navegador: "Abra a conexão pelo Claude
neste navegador."); seção `config/mcp-conexoes.tsx` ("Conexões", ordem 60, todos os papéis: `urlMcp` com Copiar, o passo
a passo em três caminhos — claude.ai de organização, claude.ai de conta individual, Claude Code (API §F.4) —, a lista
com [Revogar] e confirmação; admin: chave "Todas as pessoas"; vazio: "Nenhuma conexão. Conecte o Claude com o endereço
acima."); `eventos/mcp.ts` (`conexao`); `comandos/mcp.ts` ("Conectar o Claude" → `/config/conexoes`, ordem 540); o selo
"via Claude" (ícone `Sparkles`, texto "via Claude", contraste AA) na linha do histórico e no cabeçalho do comentário
(`modal/secoes/Atividade.tsx`).

**Testes (`node:test` + `app.request()`, relógio fixo):**
- metadados: JSON exato da API §F.2 a partir do `APP_URL`; `/.well-known/openid-configuration` → `404` texto;
  `Cache-Control: no-store`; nenhum `Access-Control-Allow-Origin`.
- `/mcp`: sem token → `401` com o `WWW-Authenticate` exato; token errado, vencido, revogado, de pessoa inativa → `401`
  `error="invalid_token"`; `GET`/`DELETE` → `405 Allow: POST`; `Origin: https://evil.example` → `403`; sem `Origin` e com
  `https://claude.ai` → passam; corpo de 2 MiB → `413`; `Mcp-Session-Id` nunca na resposta.
- registro: claude.ai e claude.com → `201`; `http://127.0.0.1:43123/callback` → `201` `native`; `https://evil.example/cb`,
  `http://localhost/outro`, `http://localhost/callback?x=1`, `http://u@localhost/callback`, `https://localhost/callback`,
  fragmento → `400 invalid_redirect_uri`; 11º registro na hora de um IP fora da `FAIXA_ANTHROPIC` → `429`; dentro dela,
  o 301º; com 300 clientes sem concessão, o 301º registro apaga os sem pedido pendente com mais de 15 min e dá `201`.
- autorizar: cliente desconhecido e redirect fora da lista → `400` sem `Location`; `code_challenge_method=plain` →
  `302` com `error=invalid_request`, `state` e `iss`; pedido gravado, `Set-Cookie` do pedido e `302` para
  `/autorizar?pedido=`; loopback com outra porta aceito; 6º pedido pendente do mesmo cliente apaga o mais antigo; 61º
  pedido na hora do mesmo IP → `429`; `configurar()` sem o extra → o cliente que o registrou recebe `400`.
- pedido e decisão: sem o cookie ou com outro → `410` "Abra a conexão pelo Claude neste navegador" (o caso do link
  encaminhado); sem `X-Trace-Id`/`Origin` → `403 csrf`; permitir → `redirecionar` com `code`, `state`, `iss`; negar →
  `error=access_denied`; segunda decisão → `410`; pedido vencido → `410`; `anteriores` conta as ativas do mesmo destino.
- token: só form-urlencoded; PKCE certo → par; verificador errado → `invalid_grant`; `redirect_uri` diferente →
  `invalid_grant`; código reusado → `invalid_grant` e a concessão emitida revogada (`codigo_reusado`); a concessão guarda
  o `resource`; refresh roda; **dois reusos do refresh antigo em 60 s devolvem o mesmo `refresh_token`** (nenhuma linha
  nova em `oauth_token`); depois de 61 s → `invalid_grant`, `filho_cifrado` apagado e concessão revogada
  (`reuso_refresh`); refresh com outro `resource` → `invalid_target`; `configurar()` sem o extra → refresh
  `invalid_grant` e `/mcp` `401`; `offline_access` aceito; autorizar o mesmo cliente de novo → a anterior `substituida`;
  outro cliente com o mesmo destino e `substituir` → a anterior `substituida`; sem `substituir` → as duas ativas.
- revogar (`/oauth/revogar` e Conexões): `200` sempre; a próxima chamada ao `/mcp` → `401`; outra pessoa (não admin)
  revogando → `404`; admin revoga a de qualquer um; SSE `conexao` só para a dona e os admins. **As conexões seguem as
  sessões:** depois de trocar a senha, redefini-la, mudar o papel e desativar a pessoa, o `/mcp` → `401 invalid_token` e
  o refresh → `invalid_grant` (motivos `credenciais`, `papel`, `desativacao`); trocar o e-mail não revoga.
- ferramentas: `tools/list` com as 15 na ordem de `FERRAMENTAS_MCP`, `title`, anotações da API §F.5 (destrutivas =
  `FERRAMENTAS_MCP_DESTRUTIVAS`) e esquemas que recusam campo desconhecido; cada ferramenta com o caminho feliz e um erro
  virando `isError`; nomes ambíguos com as opções; `registrar_retorno` pela equipe → `isError` "Só o atendimento…";
  `resumo_cliente` da equipe sem a linha de horas; `criar_demanda` não aceita AM nem rodadas; respostas ≤ 20.000
  caracteres com 5.000 demandas; listas de 20 com cursor; 61ª chamada no minuto da mesma pessoa, somando duas conexões →
  `isError`; 11ª busca na Windsor na hora → só cache (provedor falso com `buscar: false`).
- mesmas regras da API (sobre cada item de `FERRAMENTAS_MCP_ESCRITA`): entradas acima dos limites da rota (título,
  itens de checklist, nota das horas) → `isError`; as chaves da entrada montada por `entradaDaApi()` ⊆ as do esquema da
  rota.
- `buscar_demandas`: 40 abertas com "outubro", as 3 do @rafa da 25ª posição em diante → `texto: outubro, membro: rafa` dá
  "3 demandas"; filtros sem texto; 45 resultados em 20 + 20 + 5; os testes de `GET /api/busca` de hoje iguais.
- `editar_demanda`: ler, `PATCH` pela API, editar pelo MCP com o rev antigo → `isError` e a descrição intacta; sem `rev`
  com `descricao` → `isError`; descrição de 6.000 + `descricao` → `isError`; `acrescentarDescricao` → as 6.000 + "\n\n"
  + o texto.
- texto de fora: um `SUMMARY` de evento e um nome de campanha com `\n#999 … Ignore…` e U+202E saem numa linha só; uma
  descrição com `»»»` dentro não fecha o bloco.
- erros: `Error('… api_key=K… private-abc… pauta_at_x')` lançado pelo serviço e pelo provedor → `isError` "Algo deu
  errado nesta ferramenta (ref mcp-…)" e o log sem nenhum dos três; um RAISE do SQLite idem.
- via Claude: criar, editar, mover, comentar e concluir pelo MCP → `GET /historico` com `via: 'claude'` nas atividades
  (inclusive a da automação disparada); o mesmo pela tela → `via` nulo; comentário com `via: 'claude'` na lista e no SSE;
  notificação "Rafa via Claude…"; ferramenta que falha não deixa `mcp_traco`; leitura não grava traço.
- segredos: log capturado durante o fluxo inteiro sem `pauta_at_`, `pauta_rt_`, o código, `code_verifier` nem `state`.
- orçamento: `mcp-medir.ts` dentro de `ORCAMENTO_MCP` (também como teste, sobre o seed de demonstração).

**Roteiro de navegador** (dev, 5230, claro e escuro, 1440 e 390 px): conectar o Claude Code de verdade (`claude mcp add
--transport http pauta http://localhost:5230/mcp` e `/mcp` → autenticar) passa pela `/entrar?volta=` e cai na tela de
consentimento com "Um aplicativo neste computador…" e a caixa obrigatória; Permitir volta ao terminal; Conexões mostra a
conexão; pedir ao Claude "o que tenho para hoje?" (vem a agenda de hoje junto) e "cria uma demanda no quadro Criação
para a CLA: Teste MCP, prazo sexta" → o card aparece no quadro de outra janela em menos de 1 s e o histórico mostra "via
Claude"; colar a URL `/autorizar?pedido=` noutro navegador logado → "Abra a conexão pelo Claude neste navegador"; trocar
a senha → a próxima pergunta pede para reconectar; Revogar em Conexões → idem; Cancelar na tela volta com erro ao
Claude; pedido vencido mostra o texto de expirado; os três caminhos do passo a passo de Conexões conferidos (o de conta
individual numa conta Pro, se houver).

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
`server/scripts/mcp-fluxo.ts` (F7) faz, imprimindo "N/17 ok|falhou <passo>" por passo e **nunca** um token: 1 registro com
loopback → 2 PKCE → 3 `GET /oauth/autorizar` sem seguir (guarda o cookie do pedido) → 4 login por `POST
/api/auth/login` (com `Origin` e `X-Trace-Id`) → 5 `GET /api/oauth/pedidos/:id` (com os dois cookies) → 6 decisão → 7
`code` do `redirecionar` → 8 `POST /oauth/token` → 9 `initialize` + `tools/list` (15, na ordem) → 10 `minhas_demandas` →
11 `criar_demanda` → 12 `GET /api/demandas/:id/historico` com o cookie (`via: 'claude'`) → 13 `comentar` → 14 refresh
(rotação) → 15 o refresh antigo de novo dentro de 60 s (o mesmo par) → 16 `POST /api/conexoes/:id/revogar` → 17 `/mcp`
→ `401 invalid_token`. Depois: MCP Inspector (`npx @modelcontextprotocol/inspector`, fluxo OAuth guiado) contra o
mesmo `BASE`.

**Aceite (verificável):** tudo acima verde; `tools/list` devolve exatamente `FERRAMENTAS_MCP`; o `mcp-fluxo.ts` termina
com "17/17 ok" e código de saída 0; `mcp-medir.ts` dentro de `ORCAMENTO_MCP`;
`grep -E "pauta_(at|rt)_|code_verifier" <log do servidor>` vazio; `MCP_ATIVO=0` → `404` nos 4 caminhos; nenhum arquivo
fora da §2 no `git diff --name-only master...fase2/mcp`.

### F8 · Resultados da Windsor (`resultados`)

**Rotas (API §F.8, 7):** `GET /api/resultados/contas`, `GET /api/resultados/panorama`,
`GET|POST /api/clientes/:id/resultados/contas`, `DELETE /api/clientes/:id/resultados/contas/:ligacaoId`,
`GET /api/clientes/:id/resultados`, `POST /api/clientes/:id/resultados/atualizar`. Tarefa `resultados-poda` (03:40).
Provedor `provedores/resultados.ts` (`resultados` e `panorama`, com `buscar` e `esperarMs`; nunca lança).

**Antes de codificar a lista de contas:** os 5 comandos da pesquisa-windsor §10, no terminal de quem tem a chave (a chave
só no ambiente do shell), anotando em `docs/fase2/operacao-resultados.md` só o resultado (formato, contagens, nomes dos
cabeçalhos de cota, tempo), nunca a chave nem nomes de clientes. A origem da lista (`ds-accounts` ou o MCP da Windsor) sai
daí; o contrato não muda.

**Servidor (sugestão):** `servicos/resultados-windsor.ts` (HTTP: monta a URL com `URLSearchParams`, `fetch` com 60 s e
`redirect: 'error'`, zod, o texto de erro lido até 4 KB e reduzido a status + `code` dentro do arquivo (API §F.8),
`definirBuscaWindsor()`, soma em `windsor_uso`, teto de 8.000/dia), `servicos/resultados.ts` (período, cache, trava por
cliente e período, segundo plano com `.catch(registrarFalhaMascarada(…))`, SSE, estados, alertas, carteira),
`servicos/resultados-contas.ts` (lista em cache de 24 h, ligar, desligar), `shared/logica/resultados-periodo.ts`
(`periodoDe(periodo, hoje)`, puro), `shared/logica/resultados-calculo.ts` (somas e razões a partir das linhas; puro),
`shared/logica/resultados-alertas.ts` (puro), `rotas/resultados.ts`, `provedores/resultados.ts`,
`tarefas/resultados-poda.ts`. Formato, variação e cor: só pelo `shared/logica/resultados-formato.ts` do contrato.

**Front:** aba `cliente-aba/resultados.tsx` ("Resultados", ordem 150, todos; leitura em 10 segundos): seletor de período
(Este mês, Mês passado, 7, 30, 90 dias, na URL `?periodo=`; no dia 1, "Este mês" desabilitado com a dica "o mês começa
a contar amanhã"), "comparado com 20/08–18/09", a faixa **"Atenção"** no topo com os `alertas` (some quando vazia), por
conector os 4 `KPIS_PRINCIPAIS` numa linha de cartões (valor, variação em seta e a cor de `tomVariacao`: resultados,
conversões, eventos, CTR e ROAS verdes ao subir; custos invertidos; volume e investimento neutros) e o resto em "Mais
métricas" (fechado), o **gráfico SVG próprio** (`funcionalidades/resultados/GraficoSerie.tsx`: linha do período atual e
tracejada do anterior alinhadas por dia, métrica escolhida por chips, eixo com 3–4 marcas, dica no toque e no foco,
`role="img"` com resumo em texto e [Ver como tabela]; cores dos tokens nos dois temas; sem biblioteca), as 10 campanhas
(tabela que vira lista no celular), eventos-chave do GA4, "Dados de 14:05 · [Atualizar agora]" e os estados (sem chave:
"A integração com a Windsor não está configurada." + para o admin "Defina WINDSOR_API_KEY no EasyPanel."; sem contas:
"Nenhuma conta de resultados ligada." + [Ligar contas] para quem pode; fora do ar com os dados antigos; conta sem dados
no período; carregando = esqueleto dos cartões); seção `cliente-config/resultados-contas.tsx` ("Contas de resultados",
ordem 100: por conector, [Ligar conta] abre o diálogo `resultados-ligar-conta` com busca, a lista da Windsor e os clientes
que já usam cada conta, e "Digitar o id" para conta fora da lista; [Desligar] com confirmação); seção
`config/resultados-windsor.tsx` ("Resultados (Windsor)", ordem 560, admin e atendimento: estado da chave, uso de hoje,
todas as contas com o cliente ligado ou "sem cliente" e, em cada uma, o seletor **"Ligar a…"** (só os clientes que a
pessoa pode editar; sugestão pré-marcada quando o nome da conta contém a sigla, o nome ou um apelido do cliente; o mesmo
`POST …/contas`), para ligar as 42 contas numa tela só; [Recarregar lista] só admin); a **carteira**
(`telas/resultados/rota.tsx`, `/resultados`, casca, todos os internos; item "Resultados" no menu, grupo `agencia`, por
`extensoes/menu/resultados.tsx`): uma linha por cliente com conta ligada — sigla, investimento, resultados ou conversões,
custo e as variações (pelo `resultados-formato.ts`), os alertas — com o mesmo seletor de período, a linha leva à aba do
cliente; tabela que vira lista no celular; `eventos/resultados.ts` (`resultado_cliente`).

**Testes:**
- `periodoDe` com o relógio em 19/10/2026: `30d` = 19/09–18/10 × 20/08–18/09; `7d` = 12/10–18/10 × 05/10–11/10;
  `este_mes` = 01/10–18/10 × 01/09–18/09; `mes_passado` = setembro × agosto; em 31/03, `este_mes` = 01/03–30/03 ×
  01/02–28/02; em 01/11, `este_mes` vira `mes_passado` (outubro × setembro).
- alertas: conta com gasto nos 7 dias e zero ontem → `parou_de_gastar`; custo por resultado +30% → `custo_subiu`; +29% →
  nada; o `texto` igual na resposta da API e no provedor.
- carteira: 3 clientes com contas nos três conectores → no máximo 6 chamadas; segunda leitura em 3 h → 0.
- cálculo com as fixtures da pesquisa como período atual (B vazio), uma conta por conector — **valores esperados:**
  Meta investimento 246,83 (soma das linhas diárias), impressões 101.245, cliques 758, cliques no link 726, CTR 0,7487%
  (758/101.245), CPC R$ 0,3256, **alcance 62.268** (do total do período, não da soma dos dias), leads 0, conversas 1,
  resultados 1, custo por resultado R$ 246,83, ROAS nulo; Google Ads investimento 1.663,8393, impressões 62.823, cliques
  4.219, CTR 6,72% (4.219/62.823), CPC R$ 0,3944, conversões 128,5283, custo por conversão R$ 12,9453, ROAS nulo (valor
  0); GA4 sessões 1.597, engajadas 973, taxa 60,93% (973/1.597), visualizações 2.780, eventos-chave 153, **usuários
  1.124** (do total, não 1.253 da soma), eventos por nome `click_wpp` 134 e `Lead_chatbot` 18.
- `null` como 0; `data: []` nos dois períodos → `sem_dados`; erros da `erros.json` → `chave_invalida`, `fora_do_ar`
  (500, rede, tempo esgotado), `limite` (429 e o teto de 8.000); o corpo de erro com a chave **em claro e codificada**
  nunca aparece em log, resposta, exceção ou `tarefa_execucao` (captura do log; o log é só `windsor <conector> http=…
  code=…`); um `302` da Windsor → `fora_do_ar` sem seguir; `act_123` vira `123`; conta digitada fora da lista sem nome →
  `400`.
- cache: segunda leitura em 3 h → 0 chamadas; período fechado há mais de 3 dias → 24 h; ligar uma conta → o próximo GET
  busca de novo; erro mantém os dados e o `buscadoEm` antigos; GET sem cache → `atualizando: true` e SSE no fim; duas
  leituras simultâneas → uma busca; "Atualizar agora" 2× em 5 min → `429`; chamadas por atualização ≤ 8.
- permissões: equipe liga conta → `403`; atendimento de outra carteira → `403`; equipe vê resultados; `?recarregar=1`
  por atendimento → `403`.
- provedor: `provedor.resultados(db, …, esperarMs)` espera a busca e devolve; passou do tempo → `atualizando: true`.

**Roteiro de navegador** (`WINDSOR_API_KEY=fixtures`; `server/scripts/demo/resultados.ts` liga as contas das fixtures à
CLA do `seed:demo`): ligar as 3 contas das fixtures pela seção "Resultados (Windsor)" com o "Ligar a…", numa tela só; a
aba Resultados da CLA mostra a faixa Atenção (se houver), os 12 cartões principais **antes do gráfico em 1440 px**, o
gráfico com as duas linhas, as campanhas e os eventos-chave; trocar o período muda a URL e os números; "Atualizar agora"
mostra "Atualizando…" e outra janela recebe o fim; a carteira `/resultados` mostra a CLA com os mesmos números da aba;
desligar a conta do Google Ads tira o bloco; com `WINDSOR_API_KEY` vazia, o estado "não configurada"; 390 px com cartões
em coluna e o gráfico legível; teclado percorre os chips do gráfico com foco visível.

**Roteiro de protocolo:** `curl` contra a API local com o cookie de uma sessão: `GET /api/resultados/contas`, `POST …/contas`
com `act_1000000000000001` (vira sem `act_`), `GET …/resultados?periodo=7d` duas vezes (a segunda sem `atualizando`);
depois do deploy, com a chave real no EasyPanel: os 5 comandos da pesquisa §10 e um cliente de verdade conferido contra o
painel da Windsor (investimento e cliques do mesmo período batem; alcance e usuários batem com o total do período).

**Aceite:** os valores esperados acima nos testes; os 12 cartões principais antes do gráfico em 1440 px;
`grep -i "api_key" <log>` vazio ou só com `***`; os pares de cor novos pedidos ao integrador (§0, regra 9) e listados;
nenhuma dependência nova; `git diff --name-only` dentro da §2.

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
`agenda-ical.ts` (montagem: UID, EXDATE, exceções, canceladas, órfãs, SEQUENCE, privados, HTML → texto, link da reunião
só nos hosts de Meet, Zoom e Teams, inclusive o `X-GOOGLE-CONFERENCE`), `agenda-busca.ts` (`validarEnderecoIcal()` pelo
`new URL` no POST, no PATCH e antes de cada `fetch`, cifrar, `fetch` em fluxo com teto de 32 MB depois de descomprimir,
hash sem DTSTAMP, gravar numa transação, estado, SSE, `definirBuscaAgenda()`; cada agenda num try/catch, com
`descreverErro(e, [url])`), `rotas/agenda.ts`, `tarefas/agenda-busca.ts`, `provedores/agenda.ts`;
`server/scripts/agenda-diagnostico.ts` (lê um endereço do ambiente e imprime **só contagens**, pesquisa-ical §8).

**Plano B:** se o diagnóstico do feed real mostrar regras fora do subconjunto que importem, trocar só o expansor pelo
ical.js 2.2.1 (pedido com a justificativa), mantendo o fuso pelo `Intl` e os mesmos testes.

**Front:** fonte `agenda-fonte/agenda.tsx` (ordem 100: `usarItens` lê `GET /api/agendas-externas/eventos` do período
visível com TanStack Query, chave `['agenda-externa', 'eventos', de, ate]`; esconde as agendas desligadas no filtro;
`Filtro` = chips com a cor de cada agenda, ligados e desligados guardados no `localStorage`); host na Agenda
(`TelaAgenda.tsx` + `CalendarioDemandas` com `externos?: ItemAgendaExterno[]`: contorno na cor da agenda e fundo leve,
hora antes do título, sem arrastar, "livre" e "talvez" mais leves; **no mês, os prazos têm prioridade**: as demandas
ocupam as vagas da célula e os externos do dia viram uma linha só, "3 eventos" (botão que abre a lista do dia), depois
delas; na semana, por horário, dia inteiro no topo; no celular, na lista do dia, tudo; o Calendário do quadro não passa
`externos`); diálogo `agenda-evento` (popover no desktop,
folha no celular: título, dia e horário, agenda, local, [Entrar na reunião] só `https:`, descrição em texto puro com
quebras, "Ocupado" sem nada disso); seção do Início `inicio/agenda-hoje.tsx` ("Hoje na agenda", ordem 150, some quando
não há agenda ativa; no máximo 5 eventos + "Ver na Agenda"; respeita o filtro de calendários, pela mesma chave de
`localStorage`; vazio: "Nada na agenda hoje."); seção `config/agenda-externas.tsx` ("Agendas externas", ordem 570,
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
`agendaIds` e o limite de 62 dias; excluir leva as ocorrências. Validação pelo `new URL`: `:8443`, `u:p@`, `?x=1`,
`#y`, `CALENDAR.google.com.evil.example` → `400`; um endereço decifrado fora do formato (gravado à mão no banco) →
`endereco_invalido` sem chamar a busca; `X-GOOGLE-CONFERENCE:https://evil.example/x` → sem link; gzip que passa de 32 MB
descomprimido → `grande_demais`; uma exceção na busca de uma agenda não impede a próxima e `tarefa_execucao.detalhe` sai
mascarado. Componente: um dia com 2 eventos de dia inteiro, 1 reunião e 2 prazos no mês → os 2 prazos e "3 eventos".

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
| Menu lateral | **`resultados`** (F8, grupo `agencia`): item "Resultados" → `/resultados`, ordem 150 (entre Clientes 100 e Arquivo 200) |
| Telas | **`/autorizar`** (F7, `telas/autorizar/rota.tsx`, autenticada, layout vazio) · **`/resultados`** (F8, `telas/resultados/rota.tsx`, autenticada, casca: a carteira) |

Estados vazios e de erro: os textos estão em cada funcionalidade acima (§3); tom do PLANO §0 regra 4.

## 5. Ponte F7 ↔ F8/F9 (provedores)

O MCP lê resultados e agenda **sem import cruzado** (API §F.5.1):
- **Interface no contrato:** `ProvedorResultadosMcp<Db>` e `ProvedorAgendaMcp<Db>` em `shared/tipos/mcp.ts`.
- **Implementação de cada dona:** `server/src/provedores/resultados.ts` (F8) e `server/src/provedores/agenda.ts` (F9),
  cada um com `export const provedor: ProvedorMcp<Db>` chamando os próprios serviços. Testadas pelas donas. O de
  resultados tem `resultados` e `panorama`, com `esperarMs` (o MCP passa 20 000) e `buscar` (o MCP passa `false` quando a
  pessoa passou de `LIMITES_MCP.buscasWindsorPorHora`: só cache), e nunca lança (erro vira o `estado`). O F7 ainda
  envolve toda chamada de provedor num try/catch (API §F.5).
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
4. Aplica os pedidos de `docs/pedidos/f{7,8,9}-*.md` (os pares de cor novos entram em `pares()` do
   `web/scripts/contraste.ts`, §0 regra 9), leva o `docs/fase2/operacao-<nome>.md` ao `README.md` (seção "Fase 2") e
   remove a worktree.

**Verificação final** (banco novo e cópia do backup de produção, build servido pelo Node na 7300):
1. As migrações 100–103 e as das faixas aplicam sobre uma cópia do banco de produção (backup do dia) sem erro, e os
   dados de antes continuam iguais (contagens de demandas, atividades e sessões).
2. Duas janelas: o Claude Code conectado por loopback cria, move, comenta e conclui; tudo aparece na outra janela em
   menos de 1 s com "via Claude"; Revogar corta na próxima chamada; trocar a senha também.
3. A aba Resultados da CLA (fixtures), a carteira e o `resumo_cliente` do MCP mostram os mesmos números:
   `integracao-fase2.test.ts` compara, string a string, os 4 `KPIS_PRINCIPAIS` de cada conector (`linhaKpi`) na resposta
   da API formatada e no texto do `resumo_cliente`.
4. A Agenda mostra os prazos e os eventos da fixture; o Início, "Hoje na agenda"; o `agenda` do MCP, os dois.
5. CSP da API §1 sem violações no console (a tela `/autorizar` inclusive); `/mcp`, `/oauth/*`, `/.well-known/*` nunca
   devolvem HTML; `Cache-Control: no-store` neles.
6. Logs de um dia inteiro de roteiro sem token, código, chave da Windsor nem endereço iCal.

**Produção** (depois do deploy de cada uma):
- F7 — **antes do deploy**, na Cloudflare (pesquisa-mcp §7): conferir Security → Bots (Bot Fight Mode desafia o backend
  da Anthropic e, no Free, não aceita exceção: desligar, ou IP Access "Allow" para os oito `/24` de `160.79.104.0/21`);
  regra WAF Skip das **regras gerenciadas** e Configuration Rule sem Browser Integrity Check para `/mcp`,
  `/oauth/registrar`, `/oauth/token`, `/oauth/revogar` e `/.well-known/oauth-*` (chamados pelo backend da Anthropic); Skip
  do **rate limiting** só para `/mcp`, `/oauth/token` e `/.well-known/*` — `/oauth/registrar` e `/oauth/autorizar` ficam
  com o limite da borda (o `/oauth/autorizar` é navegação da pessoa e não precisa de exceção nenhuma); Cache Rule Bypass
  para `/mcp`, `/oauth/*` e `/.well-known/*`. Depois: os `curl` do roteiro de protocolo de fora da rede da Melt; no plano
  de organização o Owner adiciona o conector em *Organization settings → Connectors* com
  `https://demandas.meltcomunicacao.com.br/mcp` e cada pessoa clica **Connect** (conta individual: *Customize →
  Connectors → Add custom connector*); uma pessoa de cada papel faz 3 perguntas e 1 escrita. Falha do claude.ai mostra
  um `ofid_…` para o chamado.
- F8 — `WINDSOR_API_KEY` no EasyPanel; os 5 comandos da pesquisa-windsor §10; ligar as contas dos clientes (atendimento) e
  conferir 2 clientes contra o painel da Windsor.
- F9 — o admin cola o endereço secreto da agenda da Melt; `agenda-diagnostico.ts` no shell; conferir 3 eventos (um
  recorrente, um de dia inteiro, um privado) contra o Google Agenda.

## 7. Dúvidas em aberto

Decisões tomadas no contrato que o dono do produto deve confirmar (nenhuma bloqueia o início):

1. **Quem liga as contas da Windsor:** a regra de editar o cliente (admin; atendimento nos da carteira e nos sem AM). O
   Tráfego (papel `equipe`) vê os resultados mas não liga contas. Liberar para ele seria uma ação nova em `AcaoPermissao`.
   Com o "Ligar a…" na seção "Resultados (Windsor)", o admin liga as 42 contas numa tela só, com o Tráfego ao lado;
   confirmar antes do F8 começar a tela.
2. **"Resultados" da Meta = leads + conversas** (o "Resultado" do Gerenciador, que muda com o objetivo, não vem pela
   Windsor). Por objetivo de campanha fica como melhoria.
3. **"Este mês" termina ontem**, como 7/30/90 dias (em 19/10: 01–18/10 contra 01–18/09; hoje pela metade mostraria queda
   falsa todo dia); no dia 1 vale "Mês passado".
4. **Um escopo só no OAuth:** o Claude pode tudo o que a pessoa pode pela tela, menos apagar e falar com o cliente.
   `registrar_retorno` entra (só atendimento e admin) porque registra o que o cliente disse, sem mandar nada.
5. **`editar_demanda` exige o `rev` lido** para mexer no título ou na descrição e tem `acrescentarDescricao`; trocar a
   descrição inteira é recusado quando ela passa dos 4.000 caracteres que a leitura mostra (revisto em 19/10: o "rev
   atual" apagava em silêncio a edição de outra pessoa).
6. **Agendas externas:** "Atualizar agora" e o cadastro só pelo admin; o filtro de calendários fica no aparelho
   (`localStorage`), não na conta.
7. **Evento privado sempre "Ocupado"**, mesmo que o endereço secreto traga os detalhes (toda a equipe vê a Agenda).
8. **Cloudflare:** desligar o Bot Fight Mode ou liberar a faixa da Anthropic (decisão de quem administra a Cloudflare).
9. **Horas no `resumo_cliente`** só para atendimento e admin (a mesma regra do total por cliente, API §2).
10. **Conexões** como seção própria logo depois de "Sua conta" em Configurações (o `FASE2.md` diz "Sua conta →
    Conexões"; a seção "Sua conta" é de outra funcionalidade e não tem subseções).
11. **As conexões seguem as sessões:** trocar ou redefinir a senha e mudar o papel revogam as conexões do Claude (a
    pessoa conecta de novo em 1 clique); trocar o e-mail não.
12. **`entregar_versao` fica fora do MCP:** entregar versão é anexar arquivo e escolher itens; "entreguei a V2 da #123"
    vira comentário. O lote de `criar_demanda` (até 20) cobre "cria os 12 posts de novembro".
13. **Carteira de resultados** (`/resultados` e `resumo_cliente` sem cliente): acrescentada ao pedido "visão dos
    resultados dos clientes"; custa ~6 chamadas à Windsor a cada 3 h.

## 8. Riscos e o que fazer

| Risco | O que fazer |
|---|---|
| A SDK v2 do MCP muda rápido ou não fecha no TS 7 | versão exata; adaptador num arquivo; plano B à mão decidido no 1º dia (§3 F7) |
| Bot Fight Mode / WAF da Cloudflare barram a Anthropic | checklist de produção (§6) antes do deploy; ler os logs de borda na 1ª conexão |
| Prompt injection por texto de cliente, convite de agenda ou nome de campanha | `instructions` cita as fontes; `umaLinha()` nos campos de uma linha e blocos «««/»»» com a origem nos de várias (API §F.5); nenhuma ferramenta apaga ou fala com o cliente; `editar_demanda` e `registrar_retorno` com `destructiveHint: true`; `rev` obrigatório para trocar texto; "via Claude" e Revogar |
| Consentimento por link encaminhado | cookie do pedido amarrado ao navegador; tela com a hora do pedido e o aviso "se alguém te mandou este link, cancele"; loopback com título próprio e caixa obrigatória |
| Cota da Windsor queimada pelo MCP | 10 buscas por pessoa por hora; acima, só cache; o limite por minuto soma as conexões da pessoa |
| Lista de contas da Windsor sem a chave real | contrato independe da origem; F8 testa com a chave antes de codificar a lista; "Digitar o id" cobre a falta |
| Windsor lenta ou fora do ar | cache de 3 h, segundo plano, dados antigos com a hora, teto diário, 60 s por chamada; o MCP espera no máximo 20 s e depois responde com o cache e "pergunte de novo em 1 min" |
| Feed iCal grande ou com regras raras | teto de 32 MB / 60 s / 20.000 ocorrências; contagem de "repetições não entendidas"; plano B do expansor |
| Vazamento de segredo em log ou na conversa | erro que não é `ErroHttp` nunca sai como veio; `mascararSegredos()` e `descreverErro()` do contrato; texto da Windsor preso em `resultados-windsor.ts`; `.catch` em todo segundo plano; teste de injeção de segredo nas três |
| Mudança de callback do Claude (claude.com) ou do DCR | as duas URLs já na lista; `MCP_REDIRECTS_EXTRAS` sem deploy; CIMD planejado (pesquisa-mcp §4.9) |

## 9. Críticas descartadas

Revisão adversarial do contrato em 19/10 (segurança: 14 achados; produto: 15). Tudo o que não está abaixo entrou no
contrato (migração 100 e 103, `shared/tipos`, `segredos.ts`, `resultados-formato.ts`, API §F e este plano). As colunas
novas de OAuth foram para a 100, e não para uma 110, porque a 100 ainda não foi para produção (a faixa 110–119 fica toda
do F7). Descartadas, no todo ou em parte:

- **Seg. 1, revogar ao trocar o e-mail:** fora; as conexões seguem as sessões, e trocar o e-mail não revoga sessão na Fase 1 nem dá acesso a ninguém.
- **Seg. 5, marcar cada evento "(agenda externa)":** trocado por um cabeçalho só na seção de eventos; o mesmo aviso ao modelo, sem pagar tokens por linha.
- **Seg. 7, podar clientes sem concessão em 1 h:** fora; o Claude Code guarda o `client_id` e o reusa, e um cliente podado cedo cai numa página de erro sem volta; a limpeza ao chegar no teto já resolve o DoS.
- **Prod. 2, extrair `idsDaBusca` num commit de contrato:** feito como toque exclusivo do F7 em `entrada-busca.ts` (ninguém mais mexe nele na fase), com os testes da busca de hoje como garantia; mexer em código de produção fica com quem testa.
- **Prod. 3, `FonteAgenda.usarItens({ soMinhas })`:** fora; o evento do iCal não tem dono no Pauta (convidados não são guardados), então "só as minhas" não tem o que filtrar; o filtro por calendário cobre.
- **Prod. 9, decidir a dúvida 1 agora:** continua com o dono do produto (é regra de permissão); o "Ligar a…" em lote reduz o custo de manter a regra.
- **Prod. 10, carteira como seção do Início:** virou a tela `/resultados` no menu; o Início é pessoal e a carteira interessa a poucas pessoas.
- **Prod. 11, resultados só quando pedidos no `resumo_cliente`:** fora; o `FASE2.md` põe os resultados no resumo; ficam no padrão com espera de 20 s, o cache com a hora quando passar e `partes` para pular.
- **Prod. 14, `demandas: [...]` com os 17 parâmetros por item:** trocado por `lote` com título, datas e descrição (o resto vale para todas), para não dobrar o esquema no `tools/list`; `entregar_versao` fica fora (§7, 12).
