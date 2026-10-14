# API

Contrato HTTP do servidor. Tipos citados (`MoverEntrada`, `Demanda`...) estão em `shared/tipos/` e são a fonte da
verdade dos formatos; este documento diz **quem pode, o que acontece, que erro sai e que evento é emitido**.
Banco: `server/migracoes/001_base.sql`. Plano de construção e donos de cada rota: `docs/PLANO.md`.

Sumário: [1 Convenções](#1-convenções) · [2 Permissões](#2-permissões) · [3 Tempo real](#3-tempo-real) ·
[4 Endpoints](#4-endpoints) · [5 Regras transversais](#5-regras-transversais) · [6 Textos para WhatsApp](#6-textos-para-whatsapp)

---

## 1. Convenções

- **Base:** tudo sob `/api`. JSON em camelCase (o banco é snake_case; o servidor converte).
- **Sessão:** cookie `__Host-sid` em produção (httpOnly, Secure, SameSite=Lax, `Path=/`, sem `Domain`: um subdomínio
  irmão não consegue plantá-lo) e `sid` em desenvolvimento; 30 dias deslizantes. Valor = `randomBytes(32)` em
  base64url; o banco guarda só o sha256. Convite, redefinição e link público usam a mesma entropia e o mesmo hash.
  `exigirUsuario` confere em **toda** requisição: sessão com `revogada_em` nulo e `expira_em > agora`, e `usuario.ativo = 1`.
  Sem sessão válida: `401 nao_autenticado`. Rotas sem sessão: `GET /api/saude`, `POST /api/auth/login`,
  `POST /api/auth/convite/consultar`, `POST /api/auth/convite`, `POST /api/auth/redefinicao/consultar`,
  `POST /api/auth/redefinicao`, `/api/publico/*`.
- **Anti-CSRF:** toda mutação (POST, PATCH, PUT, DELETE), inclusive login e página pública, exige o header
  `X-Trace-Id` (uuid v4 gerado pelo navegador por mutação) e `Origin` igual a `APP_URL`. Falta ou diferença:
  `403 csrf`. O `X-Trace-Id` volta no evento SSE (`t`) para o navegador ignorar o próprio eco e vai para `atividade.trace_id`.
- **IP do cliente** (`Ator.ip`, limites, `ip_hmac`): atrás do Traefik do EasyPanel, `TRUST_PROXY_HOPS=1` (env; 0 em
  desenvolvimento). Com N > 0, o IP é o N-ésimo item **a partir do fim** de `X-Forwarded-For` (com 1, o último, que o
  Traefik acrescentou); nunca o primeiro, que o cliente forja. Sem o header (ou N = 0): o endereço do socket.
- **Limite de corpo:** `bodyLimit` (`hono/body-limit`) antes de qualquer parse, recusando pelo `Content-Length` sem
  ler o corpo: `POST /api/arquivos` até 10 MiB + 64 KiB (`413 arquivo_grande`); o resto de `/api`, 1 MiB (`413 corpo_grande`).
- **Cabeçalhos** (produção, no HTML e na API): `Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com;
  frame-src https://drive.google.com https://www.youtube-nocookie.com https://www.figma.com; connect-src 'self';
  font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
  `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer` no HTML de `/a/*`, `/convite` e `/redefinir` e em
  `/api/publico/*`, `same-origin` no resto. (`'unsafe-inline'` só em estilo: o sonner e o TipTap injetam `<style>`;
  scripts continuam só `'self'` e o DOMPurify não deixa passar `style`.)
- **Logs:** caminhos `/a/*`, `/api/publico/*`, `/api/auth/convite*` e `/api/auth/redefinicao*` saem mascarados; corpo de
  rota de auth nunca vai ao log.
- **Concorrência:** `PATCH /api/demandas/:id` exige `If-Match: <rev>`. Diferente do atual: `409 conflito_rev` com
  `detalhes.atual: ConflitoRevDetalhes` (demanda + briefing, para mesclar campo a campo). O `rev` sobe só com campos
  editados por pessoas (gatilho `demanda_rev`), então um comentário de outra pessoa não gera conflito em quem edita o
  título. `POST /mover` aceita `rev` opcional no corpo com a mesma regra.
- **Idempotência:** `POST /api/publico/a/:token/decisao` exige `Idempotency-Key` (uuid). A chave vale **por link**
  (`aprovacao_idem_uk`) e é procurada antes de qualquer validação: mesma chave e mesmo pedido → `200` com o estado
  atual, sem efeito novo; mesma chave com outro pedido → `422 idempotencia` (detalhe em §4.12).
- **Transação:** toda mutação roda em `BEGIN IMMEDIATE ... COMMIT`, grava `atividade` e as linhas de `evento` na mesma
  transação; o barramento entrega aos SSE abertos depois do commit. Instantes gravados vêm de `agora()` (`src/db.ts`).
- **Respostas de mutação** trazem o objeto atualizado (o navegador aplica sem esperar o SSE).
- **Datas:** instantes em ISO 8601 UTC (`Instante`); datas e horas locais de São Paulo em `YYYY-MM-DD` e `HH:MM`.
  Prazo sem hora = 18:00. A semana começa na segunda.
- **Listas paginadas:** `?cursor=&limite=` (padrão 50, máximo 200) e resposta `Pagina<T>` (`proximo` opaco).
- **Erro:** sempre `ErroApi` = `{ "erro": { "codigo", "mensagem", "detalhes"? } }`. A `mensagem` é em português,
  pronta para o aviso ("Você não tem acesso a esta ação." + o motivo).

| Status | `codigo` | Quando |
|---|---|---|
| 400 | `validacao` | zod recusou corpo ou consulta; `detalhes.campos: { caminho: mensagem }` |
| 401 | `nao_autenticado`, `credenciais_invalidas` | sem sessão; login errado (sem dizer qual dos dois) |
| 403 | `csrf`, `sem_permissao`, `campo_nao_permitido` | ver acima; papel/relação; PATCH com campo fora da lista (`detalhes.campo`) |
| 404 | `nao_encontrado` | não existe ou foi excluída (anonimizada) |
| 409 | `conflito_rev`, `requer_dialogo`, `versao_desatualizada`, `ja_decidida`, `conflito` | ver cada rota |
| 410 | `link_inativo`, `token_invalido` | link público expirado/revogado; convite ou redefinição usado/revogado/expirado ou de pessoa inativa |
| 413 / 415 | `arquivo_grande`, `corpo_grande` / `tipo_arquivo` | upload acima de 10 MB, JSON acima de 1 MiB / magic number fora da lista |
| 422 | `transicao_invalida`, `senha_fraca`, `drive_privado`, `idempotencia` | regra de negócio recusou; chave de idempotência repetida com outro pedido |
| 429 | `muitas_tentativas` | login e troca de senha (§4.2), página pública (§4.12); `detalhes.tenteEmSegundos` |
| 500 | `interno` | registrado no log com o trace |

Notação usada nas rotas: **SSE** lista os eventos gravados (`entidade` e público: *interno* = todos os usuários
ativos; *gestão* = atendimento e admin; *usuário* = só o destinatário; *dono+admin*). **Atividade** é o `tipo` gravado em `atividade`.
**Notifica** são as linhas de `notificacao` criadas (sempre já resolvidas para o substituto, §5.3).

## 2. Permissões

Papéis: `admin`, `atendimento`, `executor` (`agente` fica para a v1). **Admin pode tudo** o que qualquer papel interno
pode. Relações com uma demanda (calculadas por `relacaoCom()` em `shared/logica/permissoes.ts`, **incluindo quem eu
cubro hoje**):

| Relação | Verdadeira quando |
|---|---|
| responsável | `responsavelId` = eu ou alguém que eu cubro |
| aprovador | `aprovadorId` = eu/coberto; se `aprovadorId` for nulo, o AM da demanda é o aprovador. **Na Triagem** (aceitar, recusar, `/mover` triagem → fila/cancelado): o `aprovadorPadraoId` da equipe do tipo (`tipo.equipeId`, ou `demanda.equipeId` se o tipo não tiver equipe), nunca uma equipe vinda do corpo |
| AM da demanda | `atendimentoId` = eu/coberto (não confundir com o papel `atendimento`) |
| com a bola | `bola = 'agencia'` e `comQuemId` = eu/coberto |

`relacaoCom(d, eu, { equipes, tipos })` (`shared/logica/permissoes.ts`) recebe as equipes e os tipos para resolver o
aprovador da Triagem.

Regras gerais (SPEC §7.1): todo usuário interno **vê** todas as demandas; o cliente vê só o que foi enviado pelo link;
horas individuais só o dono e o admin. Transições de etapa seguem a tabela `transicao` (§5.1).

**Executor criando** (`POST /api/demandas`, `/repetir`, `/entrada/rapida`) ou aceitando da Triagem: `responsavelId` só
nulo ou ele mesmo; `atendimentoId`, `aprovadorId` (`CAMPOS_CRIACAO_SO_ATENDIMENTO`) e `prioridade ≠ 0` →
`403 campo_nao_permitido` (`detalhes.campo`). Os padrões do servidor (AM do cliente, aprovador da equipe) valem
sempre, então o executor nunca vira o aprovador da própria peça. Teste: executor cria Relatório com `aprovadorId` = ele → 403.

PATCH da demanda:

| Papel | Campos permitidos |
|---|---|
| admin, atendimento | todos de `EditarDemandaEntrada` (prioridade 1 e 2 exigem motivo) |
| executor sendo responsável | `CAMPOS_EDITAVEIS_EXECUTOR`: briefingMd, briefingCampos, estimativaMin, planejadaPara, bloqueio, bloqueioMotivo |
| executor com a bola (não responsável) | só bloqueio e bloqueioMotivo |
| outro executor | nenhum (`403 campo_nao_permitido` com o primeiro campo) |

## 3. Tempo real

### `GET /api/eventos` (SSE) · núcleo
- **Quem:** qualquer usuário com sessão. Headers da resposta: `Content-Type: text/event-stream`, `Cache-Control:
  no-cache`, `X-Accel-Buffering: no`. Começa com `retry: 1000`.
- **Retomada:** `Last-Event-ID` (o navegador manda sozinho) ou `?desde=<seq>` na primeira conexão (o `seq` do bootstrap).
  Com `atual = SELECT seq FROM sqlite_sequence WHERE name = 'evento'` (0 se não houver) e `menor = min(seq)` da tabela:
  - `desde > atual` → `event: resync` (`servidor_reiniciado`: backup restaurado ou banco novo) e segue ao vivo;
  - `desde < atual` e (tabela vazia ou `desde < menor − 1`) → `event: resync` (`historico_podado`) e segue ao vivo;
  - senão reenvia `seq > desde` da tabela, em ordem, e passa ao barramento ao vivo sem buraco.
  A poda diária (7 dias) nunca apaga o último evento.
- **Mensagens:** `id: <seq>` + `event: d` + `data: EventoTempoReal`; `event: ping` a cada 25 s (`EventoPing`), quando o
  servidor revalida a sessão: sessão revogada ou pessoa desativada → fecha; papel mudou → `event: resync`
  (`motivo: 'papel_alterado'`).
- **Filtro de público** (igual em `/api/eventos`, `/api/sync` e `/api/bootstrap`): `interno` → todos; `gestao` →
  atendimento e admin; `usuario` → só `usuario_id`; `usuario_admin` → `usuario_id` e admins; `admin` → admins.
- **Patch:** `p` traz o objeto inteiro quando `c` é nulo e só os campos de `c` numa alteração. `d` = demanda dona.
  O navegador aplica por `e`/`op` no cache do TanStack Query (os tratadores ficam em `web/src/extensoes/eventos`).
  - **Objeto inteiro também quando a demanda entra no conjunto do bootstrap** (criação, restaurar, reabrir de
    Entregue/Cancelada): as outras janelas não a têm. O tratador ignora patch parcial de id desconhecido.
  - Mudança de briefing sai como patch de `briefingAtualizadoEm`: o tratador invalida `['demanda', numero]` (o texto
    não viaja no evento).

### `GET /api/sync?desde=N` · núcleo
Alternativa ao SSE (polling 5 s → 60 s com backoff). Resposta `SyncSaida`: até 500 eventos `seq > N` com o mesmo filtro;
`resync: true` nas mesmas condições da retomada acima.

### `GET /api/bootstrap` · núcleo
- **Quem:** usuário com sessão. **Resposta:** `Bootstrap`.
- `seq` é lido **antes** das consultas (na mesma transação de leitura), então nada se perde entre o bootstrap e o SSE.
- Demandas: `arquivado_em IS NULL AND excluido_em IS NULL AND (status NOT IN ('concluido','cancelado') OR
  coalesce(concluida_em, status_desde) > agora − quadroEntregueDias)`. Tipos de peça: todos (inclusive inativos, para
  exibir demandas antigas). Feriados: ano corrente e o próximo. Ausências: vigentes e futuras.
- Meta: menos de 1 s com 500 demandas.

## 4. Endpoints

Cada rota diz o **dono** (agente do `docs/PLANO.md` que a implementa). `:id` é sempre o id (uuid ou slug do seed);
`:numero` é o número humano da demanda.

### 4.1 Saúde

#### `GET /api/saude` · núcleo
Público. `200 { ok: true, versao }`. Usado pelo health check do EasyPanel.

### 4.2 Autenticação e sessão · núcleo

#### `POST /api/auth/login`
- **Corpo:** `LoginEntrada`. **Resposta:** `200 Eu` + cookie de sessão (§1).
- **Erros:** `401 credenciais_invalidas` (e-mail inexistente, senha errada, pessoa sem senha ou inativa: mesma
  mensagem e mesmo tempo, porque sem usuário o scrypt roda contra um hash fictício), `429 muitas_tentativas`.
- **Limites** (falhas em `login_tentativa` com `tipo='login'`, somados; o primeiro que estourar responde 429 com espera
  progressiva): e-mail+IP 5 em 15 min; e-mail 20 em 1 h; IP 50 em 15 min. IP conforme §1 (`TRUST_PROXY_HOPS`).
  Atualiza `usuario.ultimo_acesso_em`.

#### `POST /api/auth/logout`
Revoga a sessão atual e apaga o cookie. `204`.

#### `GET /api/auth/eu`
`200 Eu` ou `401`. Renova a validade da sessão (deslizante).

#### `PATCH /api/auth/eu`
- **Corpo:** `EditarEuEntrada` (nome, apelido, cor, prefs; prefs é mesclado). **Resposta:** `200 Eu`.
- **Erros:** `409 conflito` apelido já usado por pessoa ativa. **SSE:** `usuario` (interno) se nome/apelido/cor mudaram.

#### `POST /api/auth/senha`
- **Corpo:** `TrocarSenhaEntrada`. **Resposta:** `204`. Revoga as outras sessões da pessoa.
- **Erros:** `401 credenciais_invalidas` (senha atual), `422 senha_fraca` (menos de 10 caracteres ou na lista de óbvias),
  `429 muitas_tentativas` (5 falhas em 15 min por pessoa; `login_tentativa` com `tipo='senha'`).

O link de convite e o de redefinição levam o token no **fragmento** (`/convite#<token>`, `/redefinir#<token>`): o
navegador não o envia ao servidor nem ao `Referer`, e ele não cai em log. A tela lê `location.hash`, apaga o fragmento
com `history.replaceState` e manda o token no corpo.

#### `POST /api/auth/convite/consultar` e `POST /api/auth/redefinicao/consultar`
Público. **Corpo:** `TokenEntrada`. `200 TokenAcessoInfo`. Não consome o token. `410 token_invalido` se usado,
revogado, expirado ou de pessoa inativa (`usuario.ativo = 0`). Limite: o do login por IP.

#### `POST /api/auth/convite` e `POST /api/auth/redefinicao`
- Público. **Corpo:** `DefinirSenhaEntrada` (`token` + `senha`). **Resposta:** `200 Eu` + cookie (já entra).
- Consome numa transação: `UPDATE token_acesso SET usado_em = ? WHERE token_hash = ? AND finalidade = ? AND usado_em IS
  NULL AND revogado_em IS NULL AND expira_em > ?`, exigindo `changes = 1` e `usuario.ativo = 1`; grava `senha_hash`
  (scrypt) e `senha_definida_em`. A redefinição revoga todas as sessões anteriores.
- **Erros:** `410 token_invalido` (inclusive pessoa inativa), `422 senha_fraca`.

### 4.3 Pessoas · núcleo (telas em cadastros)

#### `GET /api/pessoas`
- **Quem:** admin. **Resposta:** `Usuario[]` (com e-mail e convite pendente). Os outros papéis usam `bootstrap.usuarios`.

#### `POST /api/pessoas`
- **Quem:** admin. **Corpo:** `CriarPessoaEntrada`. **Resposta:** `201 CriarPessoaSaida` (com o link de convite, 7 dias).
- **Erros:** `409 conflito` e-mail ou apelido já usado. **SSE:** `usuario`, `equipe` das equipes afetadas (interno).

#### `PATCH /api/pessoas/:id`
- **Quem:** admin. **Corpo:** `EditarPessoaEntrada` (`equipes` substitui as participações). **Resposta:** `200 Usuario`.
- Mudar `papel` ou `ativo=false` revoga as sessões, fecha o SSE da pessoa e manda `resync` aos SSE dela. Desativar
  ou trocar o `email` também marca `revogado_em` em todos os tokens pendentes (convite e redefinição), na mesma
  transação. Desativar não mexe nas demandas: elas continuam com a pessoa até alguém reatribuir.
- **Erros:** `409 conflito` (e-mail/apelido repetido, ou desativar/rebaixar o último admin).
- **SSE:** `usuario`, `equipe` (interno).

#### `POST /api/pessoas/:id/convite`
- **Quem:** admin. Só para quem ainda não definiu senha e está ativo (`409 conflito` se já tem senha ou está inativo).
  Revoga o convite anterior na mesma transação (índice `token_acesso_pendente_uk`: um pendente por pessoa e finalidade).
- **Resposta:** `200 LinkAcesso` (`url` com o token no fragmento).

#### `POST /api/pessoas/:id/redefinicao`
- **Quem:** admin. Gera link de redefinição de 1 h (revoga o anterior). Pessoa inativa → `409 conflito`.
  **Resposta:** `200 LinkAcesso`.

### 4.4 Equipes · núcleo

#### `GET /api/equipes`
Qualquer usuário. `200 Equipe[]` (também vem no bootstrap).

#### `POST /api/equipes` / `PATCH /api/equipes/:id`
- **Quem:** admin. **Corpo:** `CriarEquipeEntrada` / `EditarEquipeEntrada`. **Resposta:** `201`/`200 Equipe`.
- Aprovador e distribuidor precisam ser membros ativos (`400 validacao`). Mudar o aprovador padrão **não** altera
  demandas existentes. **Erros:** `409 conflito` nome/slug. **SSE:** `equipe` (interno).

#### `PUT /api/equipes/:id/membros`
- **Quem:** admin. **Corpo:** `DefinirMembrosEntrada` (substitui). **Resposta:** `200 Equipe`.
- **SSE:** `equipe`, `usuario` de quem entrou ou saiu (interno).

### 4.5 Ausências · núcleo (tela em painéis)

#### `GET /api/ausencias`
Qualquer usuário. **Consulta:** `ListarAusenciasConsulta`. `200 Ausencia[]`.

#### `POST /api/ausencias`
- **Quem:** a própria pessoa; para outra pessoa, admin. **Corpo:** `CriarAusenciaEntrada`. **Resposta:** `201 Ausencia`.
- Substituto ativo e diferente da pessoa. Se começar hoje, notifica o substituto (`cobertura`).
- **Erros:** `409 conflito` sobreposta (gatilho `ausencia_sobreposta`). **SSE:** `ausencia` (interno).

#### `PATCH /api/ausencias/:id` / `DELETE /api/ausencias/:id`
- **Quem:** a pessoa ou admin. `DELETE` marca `cancelada_em` (`204`). **SSE:** `ausencia` (upsert ou delete, interno).

### 4.6 Clientes · núcleo (+ trilha em cadastros)

Quem edita: admin em todos; atendimento nos clientes da própria carteira (`atendimentoId` = eu) e nos sem AM;
qualquer atendimento **cria** (inclusive o "Criar cliente HE" dentro da Nova demanda e da criação rápida). Executor só lê.

- **Pendências** (`ClienteResumo.pendencias`, calculadas na leitura): `sem_am`, `sem_social`, `sem_criativo`,
  `sem_contato_padrao`. A lista e o cabeçalho do cliente mostram "Completar cadastro". Toda mutação que muda uma delas
  (AM, social, criativo, contato padrão) emite também `cliente` com `pendencias`.
- **Logo:** só por upload (`logoArquivoId`, imagem jpg/png/webp). No app, `logoUrl` = `/api/arquivos/:id?inline=1`; na
  página pública, URL assinada (§4.12). Não há logo por URL externa (a CSP não aceita imagem de host qualquer).

#### `GET /api/clientes`
Qualquer usuário. `200 ClienteNaLista[]` com contadores (abertas, com o cliente, atrasadas pelo `estadoPrazo`, §5.2).

#### `GET /api/clientes/:sigla`
Qualquer usuário. `200 Cliente` (contatos, links, apelidos, contadores). `404` se a sigla não existe.

#### `POST /api/clientes`
- **Corpo:** `CriarClienteEntrada` (sigla em maiúsculas, A–Z e 0–9, até 12). **Resposta:** `201 Cliente`.
- `atendimentoId` padrão = o ator, se o papel dele for atendimento (o cliente criado na hora já nasce com AM).
- Cria o apelido da sigla (`origem='sigla'`) e os `apelidos` normalizados (minúsculo, sem acento).
- **Erros:** `409 conflito` sigla ou apelido já usado por outro cliente (`detalhes.clienteId`).
- **Atividade:** `cliente.criado`. **SSE:** `cliente` (interno).

#### `PATCH /api/clientes/:id`
- **Corpo:** `EditarClienteEntrada`. Mudar a sigla troca também o apelido de origem `sigla`. **Resposta:** `200 Cliente`.
- Mudar o AM **não** reatribui demandas abertas. **Atividade:** `cliente.editado`. **SSE:** `cliente` (interno).

#### `PUT /api/clientes/:id/apelidos`
- **Corpo:** `DefinirApelidosEntrada` (substitui; a sigla fica). **Resposta:** `200 Cliente`.
- **Erros:** `409 conflito` apelido de outro cliente. **SSE:** `cliente` (interno; `apelidos` no patch).

#### `POST /api/clientes/:id/contatos` / `PATCH /api/clientes/:id/contatos/:contatoId`
- **Corpo:** `CriarContatoEntrada` / `EditarContatoEntrada`. `padrao: true` desmarca o anterior (mesma transação).
  "Excluir" = `ativo: false`. **Resposta:** `201`/`200 ClienteContato`. **SSE:** `cliente_contato` (interno).

#### `POST /api/clientes/:id/links` · `PATCH /api/clientes/:id/links/:linkId` · `DELETE /api/clientes/:id/links/:linkId`
- **Corpo:** `CriarLinkClienteEntrada` / `EditarLinkClienteEntrada` (só https). `DELETE` apaga de fato (`204`).
- **SSE:** `cliente_link` (upsert/delete, interno).

#### `GET /api/clientes/:id/aprovacoes` · cadastros
Qualquer usuário. `200 ItemTrilhaCliente[]` (mais novas primeiro), inclusive anuladas.

### 4.7 Configuração · cadastros (visões em lista)

#### `POST /api/config/tipos-peca` / `PATCH /api/config/tipos-peca/:id`
- **Quem:** admin. **Corpo:** `CriarTipoPecaEntrada` / `EditarTipoPecaEntrada`. **Resposta:** `201`/`200 TipoPeca`.
- "Excluir" = `ativo: false` (some da grade da Nova demanda; demandas existentes continuam). Mudar SLA/folga **não**
  recalcula prazos existentes. **Erros:** `409 conflito` nome/slug. **SSE:** `tipo_peca` (interno).

#### `PUT /api/config/tipos-peca/:id/campos`
- **Quem:** admin. **Corpo:** `DefinirCamposEntrada` (lista completa, na ordem). **Resposta:** `200 TipoPeca`.
- Até 3 obrigatórios (`400 validacao`; o gatilho também recusa). `selecao`/`multipla` exigem `opcoes`. Remover um campo
  não apaga valores já gravados em `briefing_campos`. **SSE:** `tipo_peca` (interno, objeto inteiro).

#### `GET /api/config/feriados?ano=2027` · `POST /api/config/feriados` · `DELETE /api/config/feriados/:data`
- **Quem:** GET qualquer usuário; POST/DELETE admin. **Corpo:** `CriarFeriadoEntrada`. **Resposta:** `Feriado[]`, `201 Feriado`, `204`.
- Prazos calculados (`prazoManual = false`) de demandas abertas com prazo depois da data são **recalculados** na mesma
  transação, e a rodada 1 junto quando ainda é a atual (§5.4). **Erros:** `409 conflito` data repetida.
  **SSE:** `feriado` (interno) + `demanda` e `rodada` das recalculadas.

#### `GET /api/config/app` · `PATCH /api/config/app`
- **Quem:** GET qualquer usuário; PATCH admin. **Resposta:** `200 ConfigAppSaida`.
- **Corpo:** `EditarConfigAppEntrada`: só os parâmetros listados, cada número dentro de `FAIXAS_CONFIG`
  (`shared/tipos/config.ts`; ex.: upload 1..10485760, URL assinada 1..15 min, convite 1..14 d, redefinição 1..24 h,
  sessão 1..30 d, link 1..90 d, retenção de evento ≥ 7 d); fora da faixa, `400 validacao`. `demandaNumeroInicial` só
  aceita valor maior que o maior número existente. `tiposRevisados: true` grava `tiposRevisadosEm = agora` (botão
  "Revisei os tipos" dos Primeiros passos).

#### `PATCH /api/visoes/:id` · lista
- **Quem:** admin (no MVP não existe "Salvar visão" pessoal). **Corpo:** `EditarVisaoEntrada`. **Resposta:** `200 Visao`.
- **SSE:** `visao` (interno).

### 4.8 Demandas: núcleo

#### `GET /api/demandas/:numero`
- **Quem:** qualquer usuário. **Resposta:** `200 DemandaDetalhe` (uma ida: briefing, checklists, rodadas, versões com
  itens, envios, aprovações, anexos, tempo; `linksPublicos` só para atendimento/admin). Arquivada também abre.
- **Erros:** `404` inexistente ou excluída. Meta: menos de 100 ms.

#### `POST /api/demandas`
- **Quem:** qualquer usuário; executor com as restrições de §2 ("Executor criando"). **Corpo:** `CriarDemandaEntrada`.
  **Resposta:** `201 CriarDemandaSaida`.
- **Destino:** com `destino: 'triagem'`, ou sem cliente ou sem tipo → Triagem. Com cliente e tipo → Na fila (o
  executor vira solicitante). Atendimento, admin e executor seguem a mesma regra (SPEC §7.1).
- **Padrões** (§5 de cada campo, SPEC §5.8): `equipeId` = tipo.equipeId (fila sem equipe → `400 validacao`
  "Escolha a equipe"; a criação rápida nunca dá 400, §4.14); `atendimentoId` = cliente.atendimentoId, senão eu se meu
  papel for atendimento;
  `aprovadorId` = equipe.aprovadorPadraoId; `responsavelSugeridoId` = criativo do cliente (equipe Criação) ou social
  do cliente (equipe Social); `rodadasInclusas` = tipo ?? cliente ?? 2; prazo calculado (§5.2) se `prazo` não vier;
  `numero` = max + 1 (ou `demanda.numero_inicial`); `posicao` = fim da lista global, ou a `posicao` relativa pedida.
- **Também cria:** rodada 1 (`inicial`, prazo = prazo da demanda); checklist "Checklist" com `tipo.checklistPadrao`
  (se houver); anexos dos `links`; menções do briefing.
- **`briefingCampos`** validados pelo tipo (§5.5).
- **Avisos:** `prazo_curto`, `briefing_incompleto`, `senha_detectada` (não bloqueiam).
- **Erros:** `400 validacao`; `403 campo_nao_permitido` (executor: §2); `404` cliente/tipo inexistentes.
- **Atividade:** `demanda.criada`. **SSE:** `demanda` (interno, objeto inteiro), `rodada`, `checklist`,
  `checklist_item`, `anexo`. **Notifica:** distribuidor da equipe (`fila_sem_responsavel`) se entrou em Na fila sem
  responsável; responsável (`atribuida`) se veio preenchido e não é o ator; se foi para a Triagem, o AM do cliente
  (`triagem`) e, sem AM (sem cliente ou cliente sem AM), **todos os usuários ativos de papel atendimento**, cada um
  resolvido para o substituto, sem repetir.

#### `PATCH /api/demandas/:id`
- **Quem:** §2 (tabela de campos). Header `If-Match: <rev>` obrigatório (`400 validacao` se faltar).
- **Corpo:** `EditarDemandaEntrada` (etapa não muda por aqui). **Resposta:** `200 EditarDemandaSaida`.
- **Efeitos:** responsável/aprovador/AM/bloqueio recalculam `bola` e `comQuemId` (§5.1.1); briefing recalcula
  `briefingCompleto`, as menções e `briefingAtualizadoEm` (§3); `briefingCampos` validados pelo tipo (§5.5); publicação
  ou tipo recalculam o prazo se `prazoManual = false`; `prazo` enviado torna `prazoManual = true`; `prazoManual: false`
  volta ao cálculo; a rodada acompanha o prazo pela regra de §5.4; `equipeId` troca `aprovadorId` para o aprovador
  padrão da nova equipe; `bloqueio` grava `bloqueioDesde`. Mudar o tipo para um sem aprovação do cliente com a demanda
  em Com o cliente/Aprovado: `409 conflito` ("Mova a demanda antes de trocar o tipo").
- **Erros:** `403 campo_nao_permitido`, `409 conflito_rev` (`detalhes.atual: ConflitoRevDetalhes`), `400 validacao`
  (prioridade sem motivo, campo do briefing inválido).
- **Atividade:** `demanda.editada` (campos) e as específicas: `demanda.responsavel_alterado`, `demanda.prazo_alterado`,
  `demanda.prioridade_alterada`, `demanda.bloqueio_alterado`, `demanda.equipe_alterada`, com `antes`.
- **SSE:** `demanda` (interno, campos alterados, incluindo `rev`). **Notifica:** `atribuida` ao novo responsável;
  `voltou` a quem passou a ter a bola; `mencao` às menções novas do briefing.

#### `POST /api/demandas/:id/mover`
O único caminho para trocar de etapa (arrastar, pílula, `,`/`.`); também reatribui e reordena na mesma transação.
- **Quem:** pela tabela `transicao` (§5.1). Reatribuir (`responsavelId`) segue §2: executor só para si mesmo e só se a
  demanda estiver sem responsável ou já for dele. `planejadaPara`: responsável, atendimento, admin.
- **Corpo:** `MoverEntrada`. **Resposta:** `200 MoverSaida`.
- **Erros:** `403 sem_permissao` (`mensagem` = `transicao.negado`); `409 requer_dialogo` (`DetalhesRequerDialogo`)
  quando a transição só acontece por um diálogo (versão nova, envio, retorno, rodada interna, anular aprovação) ou
  falta `motivo`/`confirmar`; `422 transicao_invalida` (sem linha na tabela, etapa que não se aplica ao tipo, falta
  cliente e tipo para sair da triagem); `409 conflito_rev` se `rev` veio e não bate.
- **Atividade:** `demanda.etapa_alterada` (+ `demanda.responsavel_alterado`). **SSE:** `demanda` (interno).
  **Notifica:** `voltou`/`atribuida` para a nova bola; `fila_sem_responsavel` ao entrar em Na fila sem responsável.

#### `POST /api/demandas/:id/pegar`
- **Quem:** qualquer usuário; executor só se a demanda estiver sem responsável (ou já for dele) e em fila ou produção.
  Atendimento e admin pegam qualquer uma.
- **Efeito:** `responsavelId` = eu; não muda a etapa. **Resposta:** `200 MoverSaida`.
- **Erros:** `409 conflito` ("Já está com Rafa"). **Atividade:** `demanda.pegada`. **SSE:** `demanda` (interno).

#### `POST /api/demandas/:id/arquivar` · `POST /api/demandas/:id/restaurar`
- **Quem:** atendimento, admin. Arquivar não muda a etapa (restaurar devolve à mesma etapa). **Resposta:** `200 MoverSaida`.
- **Erros:** `409 conflito` já arquivada / não arquivada. **Atividade:** `demanda.arquivada` / `demanda.restaurada`.
  **SSE:** arquivar: `demanda` (interno, `arquivadoEm`); restaurar: `demanda` (interno, **objeto inteiro**, §3).

#### `POST /api/demandas/arquivar-entregues`
- **Quem:** atendimento, admin. **Corpo:** `ArquivarEntreguesEntrada`. Só demandas em Entregue ou Cancelada.
- **Resposta:** `200 ArquivarEntreguesSaida`. **Atividade/SSE:** como arquivar, uma por demanda.

#### `POST /api/demandas/:id/excluir`
- **Quem:** admin. **Corpo:** `ExcluirDemandaEntrada` (o número confere). **Resposta:** `204`.
- **Bloqueado** (`409 conflito`) se houver qualquer versão, envio ou `aprovacao`: a trilha e os itens de versão são
  imutáveis. Nesses casos, cancele ou arquive.
- Anonimiza numa transação: título "Demanda excluída"; `briefing_md`, `briefing_campos`, `origem_texto`, `local`,
  `prioridade_motivo`, `bloqueio_motivo`, `cancelada_motivo` vazios; comentários com corpo vazio e `excluido_em`
  (e menções apagadas); textos de checklist e itens = "—"; anexos com `excluido_em`, nome "Anexo removido" e
  url/caminho/arquivo nulos (o arquivo vai para o lixo se ninguém mais usar, §4.9); `rodada.motivo_texto` e
  `apontamento.nota` nulos;
  `atividade.dados = '{}'` e `antes` nulo; `notificacao.resumo = 'Demanda excluída'`; `evento.patch = '{}'` dos eventos
  guardados da demanda. Revoga os links públicos ativos. Arquiva.
- Depois: detalhe, comentários e histórico → `404`. **Atividade:** `demanda.excluida`. **SSE:** `demanda` (delete, interno).

### 4.9 Arquivos · núcleo

#### `POST /api/arquivos`
- **Quem:** qualquer usuário. **Corpo:** `multipart/form-data` com o campo `arquivo` (um por chamada).
- `bodyLimit` recusa pelo `Content-Length` antes do parse (§1). Confere tamanho (`uploadLimiteBytes`, no máximo 10 MB)
  e magic number (jpg, png, webp, gif, pdf, zip); grava em `DATA_DIR/uploads/<2>/<id>` e o sha256. **Resposta:** `201 ArquivoInfo`.
- **Em uso** = referenciado por `versao_item.arquivo_id`, `cliente.logo_arquivo_id` ou `anexo.arquivo_id` sem
  `excluido_em` (inclusive o print de evidência). O gatilho `arquivo_em_uso` impede marcar `excluido_em` num arquivo em
  uso; o job de órfãos (24 h sem uso) e a exclusão de anexo usam a mesma lista.
- **Erros:** `413 arquivo_grande`, `415 tipo_arquivo`, `400 validacao` (sem campo).

#### `GET /api/arquivos/:id`
- **Quem:** qualquer usuário. `?inline=1` só vale para imagens. Headers: `X-Content-Type-Options: nosniff`,
  `Content-Disposition: attachment; filename*=` (exceto imagem inline), `Cache-Control: private, max-age=3600`.
- **Erros:** `404` inexistente ou excluído.

### 4.10 Modal da demanda · modal

Regra comum de checklists e anexos: atendimento e admin sempre; executor se for responsável ou estiver com a bola.

#### `GET /api/demandas/:id/comentarios`
Qualquer usuário. `200 Comentario[]` em ordem de criação (excluídos chegam com `corpoMd` vazio e `excluidoEm`).
Demanda excluída → `404`.

#### `GET /api/demandas/:id/historico`
Qualquer usuário. **Consulta:** `ListarHistoricoConsulta`. `200 Pagina<Atividade>` (mais novas primeiro).
Omite `tempo.lancado` de outra pessoa (só o próprio ator e o admin veem: horas individuais). Demanda excluída → `404`.

#### `POST /api/demandas/:id/checklists`
- **Corpo:** `CriarChecklistEntrada`. **Resposta:** `201 ChecklistComItens`.
- **Atividade:** `checklist.criado`. **SSE:** `checklist`, `checklist_item`, `demanda` (contadores; interno).

#### `PATCH /api/checklists/:id` · `DELETE /api/checklists/:id`
- **Corpo:** `EditarChecklistEntrada`. `DELETE` apaga com os itens (`204`); checklist de rodada ("Ajustes R2") só
  atendimento/admin apagam. **Atividade:** `checklist.removido`. **SSE:** `checklist` (upsert/delete), `demanda` (contadores).

#### `POST /api/checklists/:id/itens`
- **Corpo:** `CriarItensEntrada` (cada texto vira um item, na posição pedida ou no fim). **Resposta:** `201 ChecklistItem[]`.
- **SSE:** `checklist_item`, `demanda` (contadores).

#### `PATCH /api/checklist-itens/:id` · `DELETE /api/checklist-itens/:id`
- **Corpo:** `EditarItemEntrada` (`feito` grava `feitoEm`/`feitoPor`). **Resposta:** `200 ChecklistItem` / `204`.
- **Atividade:** `checklist.item_feito` / `checklist.item_desfeito`. **SSE:** `checklist_item`, `demanda` (contadores).

#### `POST /api/demandas/:id/comentarios`
- **Quem:** qualquer usuário. **Corpo:** `CriarComentarioEntrada`. **Resposta:** `201 ComentarioSaida`.
- `visivelCliente: true` só para atendimento, admin ou quem cobre o AM da demanda hoje; executor →
  `403 campo_nao_permitido` (`detalhes.campo = 'visivelCliente'`). O executor não fala com o cliente (SPEC §7.1).
- Menções `@[Nome](mencao:<id>)` extraídas e validadas contra usuários ativos (as inválidas viram texto).
  `anexoIds` precisam ser anexos da mesma demanda sem comentário.
- **Atividade:** `comentario.criado`. **SSE:** `comentario` (interno). **Notifica:** `mencao` aos mencionados (menos o autor).

#### `PATCH /api/comentarios/:id` · `DELETE /api/comentarios/:id`
- **Quem:** o autor; `DELETE` também admin. **Corpo:** `EditarComentarioEntrada` (`visivelCliente` com a mesma regra do
  POST). Editar só notifica menções novas. `DELETE` marca `excluido_em` e esvazia o corpo (`204`).
- **Atividade:** `comentario.editado` / `comentario.excluido`. **SSE:** `comentario` (interno).

#### `POST /api/demandas/:id/anexos`
- **Corpo:** `CriarAnexoEntrada` (link https, caminho de rede ou arquivo já enviado). Provedor detectado pelo host.
  **Resposta:** `201 Anexo`. **Atividade:** `anexo.adicionado`. **SSE:** `anexo`, `demanda` (`nAnexos`).

#### `PATCH /api/anexos/:id` · `DELETE /api/anexos/:id`
- **Quem:** editar: regra comum; excluir: quem enviou, atendimento, admin. `DELETE` marca `excluido_em` (e o do
  arquivo, se ninguém mais usar) (`204`). **Atividade:** `anexo.removido`. **SSE:** `anexo`, `demanda` (`nAnexos`).

#### `POST /api/demandas/:id/repetir`
- **Quem:** quem pode criar demanda. **Corpo:** `RepetirEntrada`. **Resposta:** `201 CriarDemandaSaida`.
- Copia título, cliente, tipo, equipe, briefing, campos, links e caminhos (anexos de referência não excluídos),
  checklist padrão do tipo, responsável e AM; `origem='repeticao'`, `repetidaDeId`. Destino pela regra de criação.
  Executor: só copia o responsável se for ele mesmo; AM e aprovador vêm dos padrões do servidor (§2).
- **Atividade:** `demanda.repetida` nas duas. **SSE/Notifica:** como `POST /api/demandas`.

#### `GET /api/apontamentos`
- **Consulta:** `ListarApontamentosConsulta`. **Resposta:** `ListarApontamentosSaida`.
- Executor: só os próprios. Atendimento: os próprios + `porCliente`. Admin: todos + `porPessoa`.
  Pedir `usuarioId` de outra pessoa sem ser admin: `403`.

#### `POST /api/demandas/:id/apontamentos`
- **Quem:** qualquer usuário (lança para si). **Corpo:** `CriarApontamentoEntrada`. **Resposta:** `201 Apontamento`.
- `clienteId` copiado da demanda. **Atividade:** `tempo.lancado` (o histórico só a mostra ao ator e ao admin).
  **SSE:** `apontamento` (dono+admin); `demanda` (`minutosRegistrados`, interno, com `a` e `t` **nulos**, para o total
  não dizer quem lançou).

#### `PATCH /api/apontamentos/:id` · `DELETE /api/apontamentos/:id`
- **Quem:** o dono ou admin. `DELETE` marca `excluido_em` (`204`). **SSE:** `apontamento` (dono+admin), `demanda`
  (como no POST, `a` e `t` nulos).

### 4.11 Ciclo da peça · ciclo

#### `POST /api/demandas/:id/versoes` (Entregar versão)
- **Quem:** responsável, atendimento, admin; a demanda em Na fila, Em produção ou Ajustes.
- **Corpo:** `EntregarVersaoEntrada` (pelo menos 1 item). **Resposta:** `201 EntregarVersaoSaida`.
- Cria Vn na rodada atual, com os itens; move para Revisão por `mover()` com `versao_nova` atendido (limpa
  `revisaoOkEm`). Depois do commit, testa em segundo plano os links do Drive e grava `driveStatus` (emite `versao` de novo).
- **Erros:** `403`, `422 transicao_invalida` (etapa errada). **Atividade:** `versao.entregue`, `demanda.etapa_alterada`.
- **SSE:** `versao` (com itens), `demanda` (interno). **Notifica:** `voltou` a quem ficou com a bola (§5.1.1: o
  aprovador, ou o AM quando não há aprovador próprio).

#### `POST /api/demandas/:id/liberar-envio` ("Liberar para envio")
- **Quem:** aprovador, atendimento, admin. Só em Revisão e com `tipo.aprovacaoCliente`.
- Grava `revisaoOkEm`/`revisaoOkPor` (o ok interno sobre a versão entregue). A bola passa ao AM e o card mostra
  "pronta para enviar" (§5.1.1). Não troca de etapa. **Resposta:** `200 MoverSaida`.
- Enviar ao cliente **não** exige a liberação (o AM decide); sem ela, o diálogo de envio avisa "Sem o ok de <aprovador>".
- **Erros:** `403 sem_permissao`, `409 conflito` (já liberada), `422 transicao_invalida` (fora de Revisão ou tipo sem
  aprovação do cliente). **Atividade:** `demanda.liberada`. **SSE:** `demanda` (interno). **Notifica:** `voltou` ao AM.

#### `PATCH /api/versoes/:id`
Autor da versão, atendimento, admin. **Corpo:** `EditarVersaoEntrada`. `200 VersaoComItens`. **SSE:** `versao`.

#### `POST /api/versoes/:id/itens`
- **Quem:** autor da versão, atendimento, admin. Só enquanto `enviadaClienteEm` for nulo (`409 conflito` depois).
- **Corpo:** `AdicionarItensEntrada` (pelo menos 1). **Resposta:** `201 VersaoComItens`. Testa o Drive dos itens novos
  em segundo plano, como a entrega. Usada pelo "[Enviar arquivo (até 10 MB)]" do diálogo de envio quando o Drive está
  privado (SPEC §5.3): o arquivo sobe por `POST /api/arquivos` e entra como item da mesma versão.
- **Atividade:** `versao.itens_adicionados`. **SSE:** `versao` (interno, com itens).

#### `POST /api/versoes/:id/testar-drive`
- **Quem:** qualquer usuário. Para cada link do Drive, busca `https://drive.google.com/thumbnail?id=<id>&sz=w400` sem
  credenciais (timeout 5 s): imagem 200 → `publico` (vira `previaUrl`); redirecionamento/403 → `privado`; pasta →
  `pasta` (só aviso); falha → `erro`. Grava em `versao_item`. **Resposta:** `200 TestarVersaoSaida`. **SSE:** `versao`.

#### `POST /api/drive/testar`
Qualquer usuário. **Corpo:** `TestarDriveEntrada`. **Resposta:** `200 TestarDriveSaida`. Não grava nada.

#### `POST /api/demandas/:id/enviar` (Enviar ao cliente)
- **Quem:** atendimento, admin (ou quem cobre o AM). Demanda em Revisão; tipo com aprovação do cliente.
- **Corpo:** `EnviarAoClienteEntrada`. **Resposta:** `200 EnviarAoClienteSaida`.
- O contato (`contatoId` ou o padrão) precisa ser ativo e do cliente da demanda (`400 validacao`; o gatilho
  `envio_contato_do_cliente` também recusa).
- `via: 'link'`: testa o Drive dos itens; algum `privado` → `422 drive_privado` (`detalhes.itens`). Reaproveita o
  link ativo da demanda para o mesmo contato; senão gera token de 32 bytes, grava `token_hash` (sha256) e
  `token_cifrado` (AES-256-GCM com chave derivada de `SEGREDO`), validade `linkPublicoValidadeDias`, e o `link_publico_item`.
  `via: 'fora'`: exige `canal`; sem link.
- Grava `envio`, marca o primeiro envio da versão (`enviadaClienteEm`, `enviadaVia`) e move para Com o cliente.
- **Erros:** `400 validacao`, `403`, `409 versao_desatualizada` (versão pedida não é a última entregue),
  `422 transicao_invalida`, `422 drive_privado`. **Atividade:** `versao.enviada` (+ `link.gerado`), `demanda.etapa_alterada`.
- **SSE:** `envio`, `versao`, `demanda` (interno); `link_publico` (gestão).

#### `POST /api/demandas/:id/retorno` (Registrar retorno, Shift+R)
- **Quem:** atendimento, admin. Demanda em Com o cliente.
- **Corpo:** `RegistrarRetornoEntrada`. **Resposta:** `200 RegistrarRetornoSaida`.
- Mesma função do link (`registrarRetorno()` em `server/src/servicos/ciclo.ts`), com `via='manual'`. O contato
  (`contatoId` ou o padrão) precisa ser ativo e do cliente da demanda (`400 validacao`). A `aprovacao` grava
  `responsavel_anterior_id` = o responsável antes da decisão.
  - **aprovado:** grava `aprovacao`, `aprovadaEm`/`aprovadaVersaoId`, fecha a rodada e move para Agendar (tipo com
    publicação; responsável = social do cliente, ou nulo + aviso ao distribuidor do Social, §5.1) ou Aprovado;
  - **ajuste:** grava `aprovacao` (`comentario` = linhas), abre a rodada N+1 (§5.4) com checklist "Ajustes R{N+1}",
    move para Ajustes; `sugerirExtra` se N+1 passou das inclusas.
  - Print (`evidenciaArquivoId`) vira anexo `evidencia` ligado à aprovação.
- **Erros:** `409 versao_desatualizada`, `409 ja_decidida` (decisão válida na versão), `409 conflito` (fora de Com o
  cliente), `400 validacao` (ajuste sem linhas).
- **Atividade:** `retorno.registrado` (+ `rodada.aberta`, `demanda.etapa_alterada`).
- **SSE:** `aprovacao`, `demanda`, `rodada`, `checklist`, `checklist_item`, `anexo` (interno).
  **Notifica:** responsável e AM (menos o ator): `aprovada` ou `ajuste_pedido`.

#### `POST /api/demandas/:id/aprovado-whatsapp`
- **Quem:** atendimento, admin. Atalho de 1 clique = retorno `aprovado`, `canal='whatsapp'`, contato padrão.
- **Corpo:** `AprovadoWhatsappEntrada`. **Resposta:** `200 RegistrarRetornoSaida`. Erros, atividade, SSE e notificação como o retorno.
  O aviso "Aprovação registrada · Desfazer" chama a anulação.

#### `POST /api/aprovacoes/:id/anular`
- **Quem:** atendimento, admin. Só decisão `aprovado` ainda válida, com a demanda em Aprovado ou Agendar.
- Marca `anuladaEm`/`anuladaPor`, limpa `aprovadaEm`/`aprovadaVersaoId`, reabre a rodada, restaura `responsavelId` =
  `aprovacao.responsavel_anterior_id` (o "Aprovado pelo WhatsApp" de um Post tinha passado ao social) e volta para Com o
  cliente (transição com `anular_aprovacao`). **Resposta:** `200 MoverSaida`.
- **Erros:** `409 conflito` (ajuste, já anulada ou a demanda andou). **Atividade:** `aprovacao.anulada`.
  **SSE:** `aprovacao`, `demanda`, `rodada` (interno).

#### `POST /api/demandas/:id/devolver` (rodada interna)
- **Quem:** aprovador, atendimento, admin. Demanda em Revisão. **Corpo:** `DevolverAjusteEntrada`.
- Abre a rodada N+1 com `origem='interna'` (§5.4) e move para Ajustes. **Resposta:** `200 DevolverAjusteSaida`.
- **Atividade:** `rodada.aberta`, `demanda.etapa_alterada`. **SSE:** `rodada`, `checklist`, `checklist_item`, `demanda`.
  **Notifica:** `voltou` ao responsável.

#### `POST /api/rodadas/:id/extra`
- **Quem:** atendimento, admin. Só rodada com número > 1. **Corpo:** `MarcarExtraEntrada`. **Resposta:** `200 Rodada`.
- **Atividade:** `rodada.extra_marcada` / `rodada.extra_desmarcada`. **SSE:** `rodada` (interno).

#### `GET /api/demandas/:id/whatsapp?modelo=envio|lembrete|aprovado|ajuste`
- **Quem:** atendimento, admin. **Resposta:** `200 TextoWhatsappSaida` (§6). O lembrete reusa o mesmo link.
- **Erros:** `409 conflito` sem envio (envio/lembrete) ou sem decisão (aprovado/ajuste).

#### `GET /api/demandas/:id/links`
Atendimento, admin. `200 LinkPublicoComUrl[]` (decifra o token para reexibir o link).

#### `POST /api/links-publicos/:id/revogar`
- **Quem:** atendimento, admin. **Resposta:** `200 LinkPublicoResumo`. **Erros:** `409 conflito` já revogado.
- **Atividade:** `link.revogado`. **SSE:** `link_publico` (gestão).
- Também revogam, na mesma transação: cancelar a demanda (§5.1) e excluir (§4.8).

### 4.12 Página pública · ciclo

Todas: sem sessão; `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store` (também no
HTML de `/a/:token`); `/a/*` e `/api/publico/*` mascarados nos logs. Token: `randomBytes(32)` em base64url (sha256 no banco).

- **Limites** (em memória, janela deslizante; um processo só): 30 por minuto por **IP+token** em
  `/api/publico/a/:token*` (clientes diferentes atrás do mesmo IP não se somam entre links); 300 por minuto por IP em
  `/api/publico/arquivos/*` (já protegidas pela HMAC; um carrossel de 10 imagens não estoura). Estouro: `429`.
- **"Enviada por este link"** = existe `envio` com aquela `versao_id` e `link_id` = o link. Nenhuma rota pública lê
  `demanda.versao_atual_id` (pode ser trabalho interno ainda não enviado).
- **Itens ignorados:** demanda excluída ou cancelada (cancelar e excluir também revogam o link). Sem item que sobre:
  `410 link_inativo`.

#### `GET /api/publico/a/:token`
- **Sem efeito colateral** (o robô de prévia do WhatsApp abre o link). **Resposta:** `200 PaginaAprovacao`.
- Por item: `versao` = a de maior número enviada por este link; anteriores só as enviadas por este link; comentários
  com `visivel_cliente = 1` e sem `excluido_em`. Arquivos e o logo do cliente (`logoUrl`) por URL assinada
  (`urlAssinada(id, linkPublicoArquivoMinutos)`).
- **Erros:** `404` token desconhecido; `410 link_inativo` expirado, revogado ou sem itens.

#### `POST /api/publico/a/:token/visto`
Chamado pelo JS da página. Soma `acessos`, grava `ultimoAcessoEm`; `link.visto` no máximo uma vez a cada 6 h. `204`.
**SSE:** `link_publico` (gestão).

#### `POST /api/publico/a/:token/decisao`
- **Header:** `Idempotency-Key` (obrigatório). **Corpo:** `DecisaoPublicaEntrada`. **Resposta:** `200 DecisaoPublicaSaida`.
- **Ordem:**
  1. sem chave → `400 validacao`; link expirado/revogado → `410 link_inativo`;
  2. `hash` = sha256 de `demandaId|versaoId|decisao|linhas unidas por \n|contatoId|nomeInformado`; busca
     (`link_id`, chave) **antes de qualquer outra validação**: achou com o mesmo `idempotency_hash` → `200` com o estado
     atual do item, sem efeito; achou com outro hash → `422 idempotencia`;
  3. a demanda é item do link; status Com o cliente **e** `versao_enviada_id` com envio por este link; senão
     `409 conflito` "Esta peça não aguarda mais sua decisão" (sem itens nem versão nos detalhes);
  4. `versaoId` = `versao_enviada_id`; senão `409 versao_desatualizada` com `versaoAtual` = a versão de maior número
     enviada por este link (`DetalhesVersaoDesatualizada`: "Chegou a V3");
  5. sem decisão válida na versão (`409 ja_decidida`);
  6. identidade: `contatoId` nulo ou igual a `link_publico.contato_id` (senão `400 validacao`); sem `contatoId`,
     `nomeInformado` obrigatório (1 a 120 caracteres, texto puro); ajuste com pelo menos 1 linha (`400 validacao`);
  7. grava a `aprovacao` com a chave, o hash, `ip_hmac` (HMAC-SHA256 com `SEGREDO`) e `user_agent`, e roda
     `registrarRetorno()` com `via='link'`, motivo `cliente_mudou` e prazo padrão (hoje + SLA de ajuste).
- **Atividade:** `retorno.registrado` (ator_tipo `cliente`). **SSE/Notifica:** como `POST /retorno`.

#### `GET /api/publico/arquivos/:id?exp=&sig=`
`sig` = HMAC-SHA256(`SEGREDO`, `${id}.${exp}`) em base64url; `exp` em segundos Unix. Inválida ou vencida: `403`.
Mesmos headers de `GET /api/arquivos/:id`.

### 4.13 Início, semana, triagem e notificações · painéis

#### `GET /api/inicio`
Qualquer usuário. `200 InicioSaida` (regras das listas: SPEC §5.5 e §6.4; "eu" inclui quem eu cubro; `atrasadas` e o
resumo pelo `estadoPrazo`, §5.2). `comClienteParado` só para quem tem papel atendimento (as do próprio AM).
`primeirosPassos` só para admin, nulo quando concluído. Critério de `feito` de cada passo:
- `convidar_equipe`: pelo menos 2 usuários ativos (o admin e mais alguém);
- `cadastrar_clientes`: pelo menos 1 cliente fora de `ex` e nenhum deles com a pendência `sem_am`;
- `revisar_tipos`: `config.tiposRevisadosEm` preenchido (botão "Revisei os tipos", `PATCH /api/config/app`);
- `aprovadores_distribuidores`: toda equipe ativa e executora com `distribuidorId`. O aprovador é opcional (sem ele,
  o AM da demanda aprova; com ele, o aprovador usa "Liberar para envio", §4.11). Rótulo: "Defina o distribuidor de
  cada equipe (e o aprovador, se houver)".

#### `GET /api/semana`
- **Quem:** qualquer usuário para si; `usuarioId` de outra pessoa: atendimento, admin. **Consulta:** `SemanaConsulta`.
- **Resposta:** `200 SemanaSaida`. Posição = `coalesce(planejadaPara, prazo)`; horário marcado no dia, no topo.
  Arrastar entre dias usa `POST /api/demandas/:id/mover` com `planejadaPara`.

#### `GET /api/triagem`
Qualquer usuário. `200 TriagemSaida` com sugestões (cliente por apelido, tipo pelo texto, equipe e responsável sugeridos).

#### `POST /api/triagem/:id/aceitar`
- **Quem:** atendimento, admin, ou o executor que é `aprovadorPadraoId` da equipe **do tipo escolhido** (`tipo.equipeId`,
  ou `demanda.equipeId` se o tipo não tiver equipe), nunca de uma `equipeId` vinda do corpo. **Corpo:** `AceitarTriagemEntrada`.
- Executor: `responsavelId` só nulo ou ele mesmo, e `equipeId` só omitida ou igual à resolvida
  (`403 campo_nao_permitido`). O mesmo critério de aprovador vale para `/mover` triagem → fila/cancelado (§2).
- Grava cliente, tipo, equipe, título e responsável e move Triagem → Na fila por `mover()`. **Resposta:** `200 MoverSaida`.
- **Atividade:** `triagem.aceita`. **SSE/Notifica:** como `mover`.

#### `POST /api/triagem/:id/recusar`
- **Quem:** como aceitar (aprovador da equipe do tipo/da demanda). **Corpo:** `RecusarTriagemEntrada`. Move para
  Cancelada com o motivo.
- **Atividade:** `triagem.recusada`. **SSE:** `demanda`. **Notifica:** solicitante (`voltou`, com o motivo).

#### `GET /api/notificacoes`
Só as minhas. **Consulta:** `ListarNotificacoesConsulta`. `200 ListarNotificacoesSaida`.

#### `POST /api/notificacoes/lidas`
- **Corpo:** `MarcarLidasEntrada`. `204`. **SSE:** `notificacao` (usuário; patch `lidaEm`) para cada uma marcada.

### 4.14 Entrada rápida e busca · entrada

#### `POST /api/entrada/rapida/previa`
Qualquer usuário. **Corpo:** `CriarRapidaEntrada`. `200 AnaliseRapida`. Sem efeito (a prévia ao vivo pode calcular no
front com `shared/logica/rapida.ts`; esta rota existe para conferir e para a v1).

#### `POST /api/entrada/rapida`
- **Quem:** qualquer usuário; executor com as restrições de §2 (`@outra pessoa` ou coluna de outra pessoa →
  `403 campo_nao_permitido`; a prévia avisa antes do Enter). **Corpo:** `CriarRapidaEntrada` (uma linha = uma demanda).
- Marcadores do MVP com casamento exato: `HE:`, `[HE]`, `HE -` (apelido em `cliente_alias`) e `@rafa` (apelido de
  usuário ativo). Sigla no formato de marcador que não casa (1 a 12 de A–Z/0–9) → `siglaNova` na análise (a interface
  oferece "Criar cliente XYZ"; o texto continua no título).
- Contexto (`ContextoRapida`, sem etapa): cliente = marcador ?? `contexto.clienteId`; tipo = `contexto.tipoPecaId` ??
  Outro (com briefing incompleto); responsável = marcador ?? `contexto.responsavelId`; **equipe** =
  `contexto.equipeId` ?? `tipo.equipeId` ?? equipe principal (executora, ativa) do responsável.
- Destino pela regra de `POST /api/demandas`, mas **nunca `400`**: falta cliente → Triagem (`falta: ['cliente']`); sem
  equipe resolvida (ex.: Outro na visão Meus clientes) → Triagem com `falta: ['tipo']`. O executor vê "Criada na
  Triagem como #4530".
- **Resposta:** `201 CriarRapidaSaida`. Atividade, SSE e notificações de `POST /api/demandas` (`origem='rapida'`).

#### `POST /api/entrada/analisar` (Colar do WhatsApp)
Qualquer usuário. **Corpo:** `AnalisarTextoEntrada` (até 50.000 caracteres). `200 AnaliseTexto`. Sem efeito.
Reconhece cabeçalhos `[14/10 15:32] Fulana:`; sugere cliente por apelido e tipo por palavras do nome/slug; sigla
desconhecida em maiúsculas vira `siglaNova`.

#### `GET /api/busca`
Qualquer usuário. **Consulta:** `BuscaConsulta`. `200 BuscaSaida` (até 20). `#4521`/`4521` → número exato primeiro;
primeira palavra igual a um apelido de cliente filtra o cliente; o resto vai ao FTS5 por prefixo, sem acento.
Meta: menos de 150 ms.

### 4.15 Mural e Arquivo · cadastros

#### `GET /api/mural/:slug`
Qualquer usuário. `:slug` de equipe ou `agencia`. `200 MuralSaida` (fixados primeiro, depois `pos`).

#### `POST /api/mural/:slug/avisos` · `PATCH /api/avisos/:id` · `DELETE /api/avisos/:id`
- **Quem:** atendimento e admin em qualquer mural; executor no mural da própria equipe (não no da agência).
- **Corpo:** `CriarAvisoEntrada` / `EditarAvisoEntrada`. **Resposta:** `201`/`200 AvisoSaida` (aviso
  `senha_detectada` sem bloquear) / `204` (`DELETE` arquiva). **SSE:** `aviso` (interno).

#### `GET /api/arquivo`
Qualquer usuário. **Consulta:** `ListarArquivoConsulta` (cliente, mês, tipo, texto). `200 Pagina<Demanda>`.
- Lista tudo o que **saiu do quadro**: `excluido_em IS NULL AND (arquivado_em IS NOT NULL OR (status IN
  ('concluido','cancelado') AND coalesce(concluida_em, status_desde) <= agora − quadroEntregueDias))`. Assim a entregue
  sem arquivar (arquivar é manual no MVP) não some: sai da coluna Entregue e aparece aqui ("ver no Arquivo").
- Mês e ordem (mais recentes primeiro) por `coalesce(arquivado_em, concluida_em, status_desde)`, com os índices
  `demanda_arquivo_ix`/`demanda_arquivo_cli_ix` (a consulta repete o `WHERE` deles).
- Não arquivadas vêm com `arquivadoEm` nulo: a tela mostra "Entregue · não arquivada" e oferece Arquivar. Restaurar
  (só arquivadas) usa `POST /api/demandas/:id/restaurar`.

## 5. Regras transversais

### 5.1 `mover()` e a tabela de transições (servidor e front usam a mesma lógica)
1. Destino: `etapaId` (do mesmo fluxo), ou `direcao`: `proxima`/`anterior` andam em `CAMINHO_FELIZ` pulando etapas
   que não se aplicam ao tipo (`aplicaSe`); de Ajustes, `.` vai para Revisão e `,` para Em produção; de Entregue ou
   Cancelada, `,` = `anterior`. **De Com o cliente**, `.` (Aprovado) e soltar em Aprovado ou Agendar dão
   `409 requer_dialogo` `registrar_retorno`: o front abre "Registrar retorno" com a decisão Aprovado (o serviço escolhe
   Aprovado ou Agendar pelo tipo); soltar em Ajustes abre o mesmo diálogo com Ajuste.
2. A etapa de destino precisa se aplicar ao tipo (`aprovacao_cliente` → `tipo.aprovacaoCliente`; `publicacao` →
   `tipo.publicacao`). Senão `422`.
3. Linha de `transicao` com `de` = status atual e `para` = categoria de destino; só sem ela vale a de `de = '*'`
   (a linha exata tem precedência e as duas nunca se combinam: triagem → cancelado usa a da Triagem, que aceita o
   aprovador). Reabrir: `para = 'anterior'` e destino = `etapaAnteriorId` (no front, `para.id === etapaAnteriorId` com
   status em Entregue/Cancelada é a linha `anterior`). Sem linha: `422 transicao_invalida`.
4. `quem`: admin ou atendimento pelo papel; responsavel ou aprovador pela relação (§2). Falhou: `403` com `negado`.
5. `requer`: `cliente_e_tipo` e os de tipo (`com_`/`sem_`) → `422`; `motivo` e `confirmacao` → `409 requer_dialogo`
   se o corpo não trouxer; `versao_nova`, `envio`, `retorno`, `rodada`, `anular_aprovacao` → sempre `409
   requer_dialogo` pela rota `/mover` (só os serviços do ciclo os atendem, chamando `mover()` com `atendidos`).
6. Efeitos: `etapa_id`, `etapa_anterior_id` = etapa de saída (gatilho `demanda_etapa_anterior` confere), `status`,
   `status_desde = agora`; `bola`/`comQuemId` (§5.1.1); entrar em Revisão limpa `revisaoOkEm`/`revisaoOkPor` (gatilho
   confere); `responsavel_regra = social_do_cliente` → responsável = `cliente.socialId`; **sem `socialId`**, responsável
   nulo e o distribuidor da equipe Social (`eq-social`) recebe `fila_sem_responsavel` ("Agendar sem social: <título>");
   entrar em Entregue grava `concluidaEm` e fecha a rodada; Cancelada grava `canceladaMotivo` e **revoga os links
   públicos ativos** da demanda (`link.revogado`); sair de Entregue/Cancelada limpa os dois e emite o objeto inteiro (§3).
7. O histórico de etapa é gravado pelo gatilho (o app sempre grava `atualizado_por` e `atualizado_em = agora()`).

#### 5.1.1 Bola
- Bloqueio manda: `cliente` → bola cliente; `fornecedor` → terceiro; `interno` → agência com o responsável (ou o AM).
- Senão pela categoria (`calcularBola(d, categoria, tipo)` em `shared/logica/bola.ts`):
  - fila, produção, ajuste e publicação → responsável;
  - triagem → `coalesce(aprovadorId, atendimentoId)`;
  - revisão, tipo **sem** aprovação do cliente (ou sem tipo) → `coalesce(aprovadorId, atendimentoId)`: o aprovador
    conclui ou devolve;
  - revisão, tipo **com** aprovação do cliente → o aprovador enquanto `revisaoOkEm` for nulo, se houver `aprovadorId`
    diferente de `atendimentoId`; depois do "Liberar para envio" (ou sem aprovador próprio) → `atendimentoId`, e o card
    mostra o sinal **"pronta para enviar"** (`prontaParaEnviar(d, tipo)`);
  - aprovado → `atendimentoId` (só o atendimento move a partir dali);
  - cliente → bola cliente; entregue e cancelada → agência, `comQuemId` nulo.
- `comQuemId` guarda a pessoa titular; quem cobre é resolvido na leitura (Início, notificações, relações).

### 5.2 Prazo
- Dias úteis = seg a sex fora de `feriado`. `prazoManual = false`: prazo = publicação − `folgaAprovacaoDias` dias
  úteis; sem publicação, criação + `slaDiasUteis`. Sem hora = 18:00.
- Recalcula quando mudam publicação, tipo ou feriados (só abertas com `prazoManual = false`).
- "Prazo curto": prazo a menos de `slaDiasUteis` dias úteis da criação (aviso, não bloqueia).
- **Estado do prazo** (`estadoPrazo()`; vale para o card, o Início, os contadores do cliente e o filtro `prazo`):
  - triagem, fila, produção e ajuste (rodada atual ainda sem versão): `prazo` + `prazoHora` (18:00) contra agora →
    `atrasada`, `hoje` ou `em_dia`; sem prazo → `sem_prazo`;
  - publicação (Agendar): compara `publicacaoData` + `publicacaoHora` (18:00) do mesmo jeito; sem data → `sem_prazo`;
  - revisão, cliente e aprovado → `pausado`: **nunca atrasada** (a peça foi entregue; com o cliente o SLA pausa,
    SPEC §3 item 3). O card mostra a data sem cor; "parado há" continua valendo;
  - entregue e cancelada → `concluida`.
- Funções puras em `shared/logica/prazo.ts` (dias úteis, somar, diferença, prazo calculado, prazo curto, estado).

### 5.3 Notificações e ausência
- Antes de gravar, o destinatário ausente hoje é trocado pelo substituto, com `cobrindoId` = titular.
- Nunca notifica o próprio ator. Tipos: `TIPOS_NOTIFICACAO` (`shared/tipos/notificacoes.ts`).
- Jobs diários (8h de São Paulo): `prazo` para quem está com a bola das demandas que vencem hoje; `cobertura` para o
  substituto no primeiro dia da ausência.
- Cada notificação gera `evento` `notificacao` com público `usuario`.

### 5.4 Rodadas
- A rodada 1 (`inicial`) nasce com a demanda (`prazo` e `prazo_original` = prazo da demanda).
- **Prazo da rodada:** com `rodadaAtual = 1`, toda mudança de `demanda.prazo`/`prazoHora` (manual no PATCH ou
  recalculada por publicação, tipo ou feriado) atualiza `prazo`/`prazo_hora` da rodada 1 na mesma transação; com
  `rodadaAtual > 1`, o PATCH de prazo atualiza a rodada atual (renegociação; os recálculos não a tocam, porque o prazo
  é manual). `prazo_original` nunca muda (gatilho `rodada_imutavel`): é a base do "no prazo por rodada".
- Abrir a rodada N+1 (retorno de ajuste ou devolução interna): fecha a atual, cria a nova com `prazo` e
  `prazoOriginal` (padrão: hoje + `tipo.slaAjusteDiasUteis`), `rodadaAtual = N+1`, `demanda.prazo = prazo`,
  `prazoManual = true`, checklist "Ajustes R{N+1}" com uma linha por item (linhas vazias e marcadores `-`, `•`, `1.`
  são limpos). Passou de `rodadasInclusas`: a resposta sugere marcar como extra (não marca sozinho).

### 5.5 Texto vindo de fora
- **Markdown** (componente `Markdown` do design system): markdown-it `{html:false}` + DOMPurify com a allowlist da SPEC
  §7.2 **mais só** `span[data-mencao]`; `ALLOWED_ATTR` = `href`, `data-mencao`; `ALLOW_DATA_ATTR: false`;
  `ALLOWED_URI_REGEXP = /^(https:|mailto:)/i`; hook `afterSanitizeAttributes` põe `rel="noopener noreferrer nofollow
  ugc"` e `target="_blank"` nos links.
- **Menção** `@[Nome](mencao:<id>)`: uma regra de renderização do markdown-it, **antes** do DOMPurify, troca o link por
  `<span data-mencao="<id>">@Nome</span>` quando `<id>` casa `^[A-Za-z0-9-]{1,64}$` (nome escapado); senão vira texto.
  Nunca afrouxe a regex de URI para aceitar `mencao:`.
- **`briefingCampos`** (POST e PATCH da demanda), pelo `tipo_peca_campo` do tipo: `url` → `https://` válida;
  `selecao` → uma das `opcoes`; `multipla` → subconjunto das `opcoes`; `numero` → finito; `data` → `YYYY-MM-DD` real;
  `sim_nao` → booleano; `texto` até 2.000 e `texto_longo` até 20.000 caracteres; `null` apaga. Chave que não é campo
  do tipo → `400 validacao`, exceto a que já estava gravada (campo removido, tipo trocado) e volta com o mesmo valor.
- `origemTexto`, texto do cliente, `nomeInformado` e `comentario` da aprovação: só texto puro. Detector de senha
  (`shared/logica/senha.ts`) avisa no briefing, comentário e mural, sem bloquear.

### 5.6 Desfazer (aviso "Desfazer")
Só para mutações sem efeito externo, sempre como a mutação inversa pela API: mover (se a transição inversa existir
para o ator), responsável e prazo (`PATCH`), arquivar (`restaurar`), aprovação manual (`anular`). Gerar link e enviar
ao cliente não entram.

## 6. Textos para WhatsApp

Tom da marca: direto, sem exclamação, com data no formato "qui, 16/10, 18h". `{contato}` = primeiro nome do contato
(ou "tudo bem" sem contato), `{peca}` = nome do tipo + título, `{v}` = número da versão.

| Modelo | Texto |
|---|---|
| envio (link) | Olá, {contato}. Segue {peca} (V{v}) para aprovação: {url} Prazo para retorno: {prazoRetorno}. |
| envio (por fora) | Olá, {contato}. Segue {peca} (V{v}) para aprovação. Prazo para retorno: {prazoRetorno}. |
| lembrete | Olá, {contato}. Passando para lembrar de {peca} (V{v}), que aguarda o seu retorno: {url} |
| aprovado | Obrigado, {contato}. Registramos a aprovação de {peca} (V{v}). |
| ajuste | Obrigado, {contato}. Recebemos os ajustes de {peca}. A V{v+1} fica pronta até {prazo}. |
