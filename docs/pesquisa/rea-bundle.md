# Trello web: bundle JavaScript, rotas, API e mecanismos internos (engenharia reversa com REA)

**Frente:** bundle JS e rotas · **Data:** 2026-10-14 · **Alvo:** trello.com, sem login, quadro público `https://trello.com/b/FK3MvDhj` (template "Marketing Requests", achado em `trello.com/templates/marketing`), além de um card público (`/c/tZ8d8ekP`), das sub-rotas `/table`, `/calendar`, `/butler` e da página `/shortcuts`.
**Regras seguidas:** nenhum login, nenhuma credencial, nenhuma escrita no Trello. Só o comportamento e os identificadores curtos (nomes de rotas, campos, operações e flags) entram no relatório. Nenhum trecho de código-fonte, texto longo ou asset foi copiado para cá.

---

## 0. Resumo executivo

1. **Stack (observado):** SPA em **React**, empacotada com webpack, que usa **1.530 chunks nomeados** carregados sob demanda. Os dados vêm por **Apollo Client** (InMemoryCache, sem persistência) de duas fontes: a **API REST legada `/1/...`** e a **GraphQL Gateway da Atlassian** (`/gateway/api/graphql`). Componentes são do **Atlaskit** (design system da Atlassian). As flags vêm do **Statsig**, a telemetria é do Sentry e o i18n é do **FormatJS/react-intl**.
2. **Tempo real (observado em execução):** a página abre **dois WebSockets** ao mesmo tempo:
   - `wss://trello.com/1/Session/socket`: protocolo próprio com `ping` e `subscribe` por `modelType`/`idModel`/`tags`.
   - `wss://trello.com/gateway/api/graphql/subscriptions`: protocolo graphql-ws (`connection_init` → `connection_ack` → `subscribe` → `next`), com a assinatura `TrelloBoardUpdated` devolvendo um campo `_deltas` que diz quais caminhos mudaram.

   Quando o cliente fica "muito atrás", ele refaz a sincronia via REST `/1/{modelo}/{id}/deltas?ixLastUpdate=…`.
3. **Offline/otimista:** não há modo offline real. Nenhum service worker foi visto e o cache Apollo não é persistido. A UI é **otimista**: `optimisticResponse` aparece em ~120 pontos e há **desfazer/refazer** (`TrelloUndoAction`, teclas Z/Shift+Z). Uma flag `trello_web_take_trello_offline` funciona como "modo manutenção" vindo do servidor.
4. **Drag-and-drop (inferido):** a biblioteca principal é **Pragmatic drag-and-drop**, da Atlassian. Os marcadores `application/vnd.pdnd`, `honey-pot`, `data-drop-target-for-element` e `closestEdge` aparecem no quadro, no calendário e no renderer. Restos de **react-beautiful-dnd** (`data-rbd-`) aparecem no vendor, no verso do card e em filtros.
5. **Editor (inferido com forte apoio):** o editor é o **Atlassian Editor (ProseMirror)**. A descrição é guardada em **Markdown** e convertida com **markdown-it (preset commonmark, html desligado)**. Ao redor dele vêm emoji-mart, menções `@`, "smart links" e comandos **`/` (slash)** no compositor de cards.
6. **i18n:** o **pt-BR existe e é completo**. O bundle `locale.pt-BR` tem cerca de 1 MB e foi carregado automaticamente, junto com pt_BR do editor e dos smart cards. O app tem 24 locais. pt-BR começa a semana no domingo.
7. **Visualizações:** Quadro, **Tabela**, **Calendário**, **Linha do tempo**, **Painel (Dashboard)** e **Mapa** por quadro. Também há visões de **workspace** (tabela e calendário com vários quadros), **Planner** (agenda Google/Outlook com "tempo de foco") e **Inbox** (captura rápida), além de tela dividida entre Inbox, Planner e Quadro.
8. **Butler/automação:** há 5 tipos: **regras**, **botões de card**, **botões de quadro**, **comandos agendados** e **comandos por data de entrega**. Completam o pacote relatórios por e-mail, logs, "executar agora", bibliotecas compartilháveis, sugestões e **criação por IA a partir de prompt**, com cotas por plano. A gramática do Butler expõe cerca de 700 tokens de gatilhos, condições e ações (ver §13).
9. **API:** foram extraídos **~250 caminhos REST `/1/...`** e **303 operações GraphQL** (151 queries, 141 mutations, 11 subscriptions).
10. **Atalhos de teclado:** catálogo completo com 36 entradas (§11).

---

## 1. Método e Evidence IDs

As Evidências abaixo são todas desta sessão REA. **Obs.** quer dizer observado pelo REA. **Der.** quer dizer derivado: análise de strings feita localmente sobre os bytes que o REA exportou, com scripts próprios que só listam identificadores. **Inf.** quer dizer inferência do analista.

| ID | Operação | O que dá suporte |
|---|---|---|
| `ev_2df37f727ea63ac1cd46775a85892bee076b651d314fc5bbf44b64dca2e45e6d` | inspect_web_page `/templates/marketing` | slugs de templates. O sufixo do slug é o shortLink do quadro público (ex.: `marketing-requests-FK3MvDhj`) |
| `ev_dd09e2f7c712f6352a6c15d6b45b8be2035e15c3c2c17deaf3838e962b29a22d` | analyze_web_bundle `/b/FK3MvDhj` | 32 scripts, 140 queries, 70 mutations e 11 subscriptions GraphQL, fingerprint React, rotas `/` |
| `ev_e684e51893029eef4cc03fae60cd9e8fe9540ae9d6ad2232356f9ec319a99c5d` | inspect_web_page (quadro, com fontes) | bytes dos scripts, chaves de storage (Statsig, tema) e IndexedDB só de analytics |
| `ev_203b7d7077358406e64343f2be3f61eba3f774e212d7b1ace766f6dd7b5f287b` | export_web_scripts (quadro) | 30 scripts exportados com digest verificado |
| `ev_72868f4c53b7a09116cda61e4fc8fa58847430c90eccc6e4cd8733871e2bf1a4` (view `ev_0ceaa354a1e6f69fd43309969a29c48528cb5776d9af9670e5bf3004299270d9`) | analyze_javascript_application | 3.688 módulos webpack recuperados e 2,04 M nós AST. A cobertura semântica é **parcial**, porque os arquivos grandes estouraram o orçamento |
| `ev_b8c66c49e7346993e34865926e173f2127acc336b6431bc849d1f177fd52e085` | analyze_web_bundle `/shortcuts` | chunks `shortcuts` e `shortcuts-route` e a mutation `TrelloUpdateKeyboardShortcutsPref` |
| `ev_57279d0684f64469046a2b2592da52df872353d6503d28103299a1a4b83348d7` | analyze_web_bundle `/c/tZ8d8ekP` | chunk `card-back` (1,8 MB) e cerca de 50 operações de card, checklist, comentários e anexos |
| `ev_64b7dcae8b89d3c3dab331b9081bf2d462212fd7727aaf4d323dbf738d9c06a2` | analyze_web_bundle `/table` | chunk `table-view` e operações de tabela |
| `ev_cf09c4c1d8201d6c315b2a6776c41bb486f7cac5de1c3d0a1d11d691632b4de1` | analyze_web_bundle `/butler` | chunks `board-butler-view` e `automation-dashboard` (0,56 MB) e 25 operações de automação |
| `ev_e7f52479175f465d4c65e4b642a0eeac5b38889d92536a2fd2798d188e5aafcb` | analyze_web_bundle `/calendar` (redirecionou para `/calendar/2026/10`) | chunk `calendar-view` (1,2 MB) e operações em massa e de agenda |
| `ev_b4db73c4…c40d`, `ev_c3e9f7c9…f24b`, `ev_a2c807ef…d380`, `ev_bfc3d44e…cdba`, `ev_408a30c9…54a4` | inspect_web_page com fontes (shortcuts, card, butler, calendar, table) | bytes dos chunks preguiçosos |
| `ev_05fa580b…4c9c`, `ev_46f43d56…0b72`, `ev_77871e79…3ac5`, `ev_3529105d…e2c`, `ev_18b40241…2bea` | export_web_scripts (idem) | os arquivos usados na análise de strings. Ao todo, 46 scripts únicos e 14,8 MB |
| `ev_218e5619423137f9305e0a3ecc37e29cd533c99e2b1560818c49f9daf1d7cb94` | capture_browser_scenario (connect, goto do quadro e 9 s de espera) | **execução observada**: os 2 WebSockets, os frames `ping`/`subscribe`, graphql-ws e o payload de `TrelloBoardUpdated` com `_deltas` e `premiumFeatures` |
| `ev_6f4acb880a827caad77e880862fdbc6de16159c112a827fc0c4eeeb3f98c8f5f` | discover_webmcp_tools | **0** ferramentas WebMCP declaradas |
| `ev_41770bd701e449ee1b97559977879d6a932b2338d97926620df7fe625e9d56d3` | trace_application_feature (seed `Session/socket`) | **sem correspondência** no grafo parcial. Isso é limitação do grafo e não prova ausência |

Houve também uma observação fora do REA: `GET https://trello.com/1/boards/FK3MvDhj?...`, sem autenticação e só de leitura. Ela retornou o quadro com `prefs.switcherViews`, listas, labels e 23 cards. É a prova de que a REST pública funciona para quadros públicos.

Artefatos de trabalho, como listas de identificadores e índice de corpus, estão em `pesquisa/bundle-work/`. Os scripts de extração estão em `pesquisa/tools/`. Os bytes dos bundles ficam ali só como insumo e não são reproduzidos neste relatório.

---

## 2. Arquitetura do front-end

| Aspecto | Achado | Tipo / evidência |
|---|---|---|
| Framework | React (detector `react-runtime` no vendor `ltp.js`) | Obs. `ev_dd09…` |
| Empacotamento | Webpack com runtime inline no HTML (~144 KB) e mapa id→nome de **1.530 chunks** (689 `@atlaskit*`, 94 `icon-*`, ~450 de produto) | Der. `ev_e684…` |
| Carregamento | Bundles iniciais: `bootstrap`, `quickload` (pré-carrega quadro, card e membro por GraphQL e REST `/1/board/:idBoard?fields=id`), `app` (1,4 MB), `ltp` (vendor, 1,9 MB), `trello-renderer` (1,7 MB), `board-route`, `board-list-view` e o locale. O resto é preguiçoso: `card-back`, `calendar-view`, `table-view`, `automation-dashboard`, `shortcuts`… | Obs. |
| Dados | Apollo Client com `InMemoryCache`, mais um **schema cliente embutido** de 493 tipos e 84 enums que modela a REST `/1` como se fosse GraphQL. Também há gateway GraphQL nativo (`/gateway/api/graphql`) | Der. (§15) |
| Design system | Atlaskit (tokens light e dark, tipografia, motion), além de "Smart Cards" para links | Obs. (nomes de chunks) |
| Feature flags | Statsig (`featureGates-<id>`, `statsig.session_id.*` e `dynamicConfigClient` em localStorage), mais `/gateway/api/flags` | Obs. `ev_e684…` (chaves de storage); Der. |
| Telemetria | Sentry (`sentry.*`), UFO e web-vitals da Atlassian, `/gateway/api/gasv3/api/v1` | Der. |
| Cabeçalhos próprios | `X-Trello-Client-Version`, `X-Trello-Operation-Source`, `X-Trello-Operation-Name`, `X-Trello-TraceId`, `X-Trello-Task`, `X-Trello-Resync`, `X-B3-TraceId`/`SpanId` | Der. (app) |
| Service worker / PWA | Nenhum registro encontrado. `cache_names` vazio e IndexedDB só com `analytics-web-client` | Obs. `ev_e684…` |
| WebMCP | Nenhuma ferramenta declarada | Obs. `ev_6f4a…` |

---

## 3. Rotas do app (SPA)

Fonte: a tabela de rotas do bundle `app`, com IDs de rota e padrões. É derivado de `ev_203b…` e coerente com as URLs que navegamos (observadas).

**Núcleo**

| Padrão | ID da rota | Observação |
|---|---|---|
| `b/:shortLink/*` | `board` | quadro. Sub-segmentos vistos no bundle: `calendar` (`/calendar/AAAA/MM`), `calendar-view`, `table`, `timeline`, `dashboard`, `map`, `butler` (com `new`, `copy`, `edit`, `log`, `reports`), `power-up(s)`, `member`, `category` |
| `c/:shortLink/*` | `card` | card aberto (verso). Carrega o quadro por trás |
| `w/:orgname`, `w/:orgname/home` | workspace | página do workspace |
| `w/:name/members`, `…/members/guests`, `…/members/multi-board-guests`, `…/members/requests` | membros, convidados e pedidos de acesso | |
| `w/:name/account`, `w/:name/billing`, `w/:name/export`, `w/:orgname/free-trial`, `w/:name/power-ups`, `w/:name/tables` | admin do workspace | |
| `w/:orgname/views/table`, `w/:orgname/views/calendar`, `v/:shortLink/*` | visões de workspace (vários quadros) | `OrganizationView` |
| `u/:username/boards`, `u/:username/cards/*`, `u/:username/activity`, `u/:username/profile?`, `u/:username/account`, `u/:username/account/applications`, `u/:username/ai-settings`, `u/:username/labs` | área do membro | |
| `e/:name/admin/*` | admin Enterprise | |
| `org/:id` | redireciona workspace por id | |
| `power-ups/:idPlugin/edit/:subsection?`, `apps/:idPlugin/edit/:subsection?`, `/power-ups/admin` | admin de Power-Ups/apps | |

**Outras rotas** (IDs da tabela): `shortcuts`, `search`, `templates`, `templatesRecommend`, `inbox` (`/my/inbox`), `planner`, `welcomeToTrello`, `getApp`, `inviteAcceptBoard` (`/invite/accept-board`), `inviteAcceptTeam`, `inviteAcceptReferral`, `redeem`, `appKey`, `selectOrgToUpgrade`, `selectTeamToUpgrade`, `openSourceAttributionsPage`, `errorPage`, `blank`.

**Identificadores:** os quadros e cards usam um `shortLink` de 8 caracteres alfanuméricos na URL e um `id` de 24 caracteres hexadecimais (ObjectId). No gateway, os ids são **ARIs** no formato `ari:cloud:trello::board/workspace/<idOrg>/<idBoard>`. Isso foi observado no payload WS de `ev_218e…`.

---

## 4. API REST `/1/...` (candidatos extraídos do bundle)

**Tipo:** Der. (literais e templates normalizados para `{x}` em `app`, `card-back`, `calendar-view` e `board-list-view`). Um único GET foi **observado** fora do REA (`/1/boards/{shortLink}`), sem auth, e funcionou para quadro público. Os métodos HTTP não são visíveis em todos os casos e ficam como **desconhecidos** onde não estão explícitos.

**Quadros**

`/1/boards`, `/1/boards/{x}`, `…/actions`, `…/members`, `…/members/{x}`, `…/myPrefs/{x}`, `…/markAsViewed`, `…/mentions`, `…/stats`, `…/boardPlugins`, `…/boardPlugins/{x}`, `…/sharedPluginData/{x}`, `…/prefs/hiddenPluginBoardButtons/`, `…/idTags` (coleções), `…/invitationSecret`, `…/exports/{x}`, `…/cards/closed`, **`…/cards/bulk/move`**, **`…/cards/bulk/copy`**, **`…/calendarKey/generate`** (feed iCal), **`…/emailKey/generate`** e `…/emailKey/message` (e-mail para o quadro), **`…/dashboardViewTiles`** e `…/dashboardViewTiles/{x}`, **`…/history/cardsPerList | cardsPerLabel | cardsPerMember | cardsPerDueDateStatus`** (gráficos do Dashboard), `…/butlerButtonOverrides`, `/1/boards/templates/gallery`, `/1/board/{x}/privatePluginData/{x}`.

**Listas**

`/1/lists`, `/1/lists/{x}`, **`…/sort`**, **`…/archiveAllCards`**, **`…/moveAllCards`**, `…/datasource/filter` e `…/datasource/link` (listas "inteligentes" ligadas ao Jira).

**Cards**

- Básico: `/1/cards`, `/1/cards/{x}`, `…/actions/comments`, `…/attachments`, `…/attachments/{x}`, `…/idMembers`, `…/idMembers/{x}`, `…/membersVoted`, `…/stickers`.
- Checklist: `…/checkItem/{x}`, `…/checklist/{x}/checkItem`, `…/checklist/{x}/checkItem/{x}`, **`…/checkItem/{x}/convertToCard`**.
- Estado e ciclo de vida: `…/markAsViewed`, `…/markAssociatedNotificationsRead`, **`…/recurrenceRule`** (cards recorrentes), **`…/possibleCardRole`**, `…/ai/{x}`.
- Campos personalizados: `/1/card/{x}/customField/{x}/item`.

**Checklists, labels e ações**

`/1/checklists`, `/1/checklists/{x}`, `/1/labels/{x}`, `/1/actions/{x}`, `/1/actions/{x}/reactions`, `/1/actions/{x}/reactions/{x}`.

**Genéricos por modelo** (`/1/{modelo}/{id}/…`)

`deltas?ixLastUpdate=…&tags=…` (**re-sincronização**), `labels`, `pluginData`, `butlerButtons`, `butlerButton/{x}`, `accessRequests`, `requestAccess`.

**Membro**

`/1/members/me`, `…/notificationsCount`, `…/notificationGroups`, `…/notificationChannelSettings`, `…/campaigns`, `…/tokens/{x}`, `/1/members/{x}/cards`, `…/cards/query`, `…/actions`, **`…/upNext`** ("a seguir"), `…/highlights`, `…/customEmoji`, `…/editing` (indicador de "está editando"), `…/messagesDismissed`, `…/oneTimeMessagesDismissed`, `…/agreements`, `/1/member/{x}/savedSearches`, `/1/member/{x}/customBoardBackgrounds`, `/1/member/{x}/customStickers`, `/1/member/{x}/privatePluginData/{x}`.

**Workspace / Organization**

- Cadastro e membros: `/1/organizations`, `/1/organizations/{x}`, `…/boards`, `…/cards`, `…/members`, `…/members/{x}/deactivated`, `…/invitationSecret`, `…/logo`.
- Uso e conteúdo: `…/tags`, `…/stats/cards`, `…/stats/labelNames/`, `…/exports`.
- Restrições: `…/prefs/boardVisibilityRestrict/{public|org|private|enterprise}`, `…/prefs/boardDeleteRestrict/*`, `…/prefs/permissionLevel`, `…/prefs/atlassianIntelligenceEnabled`.
- Cobrança (fora do escopo da Melt): `…/paidAccount/*`, `…/freeTrial`.
- Visões de workspace: `/1/organizationViews`, `/1/organizationViews/{x}`, `/1/organizationViews/{x}/views/{x}`.

**Notificações:** `/1/notificationGroups`, `/1/notifications/all/read`.

**Power-Ups**

`/1/plugin`, `/1/plugin/{x}`, `…/jwt`, `…/listings`, `…/collaborators`, `…/application`, `/1/plugins/public`, `/1/plugins/categories`, `/1/organizations/{x}/plugins/{x}/oauth2/accessToken|exchangeToken`, `/1/authorize?…` e `/1/token/approve` (fluxo de token para apps).

**Utilidades**

**`/1/batch?urls=…`** (vários GETs numa só chamada), `/1/search/members`, `/1/emoji`, `/1/customActionTypes?locale=…`, `/1/share/qrcode`, `/1/resources/templates/categories`.

**Enterprise:** `/1/enterprises/{x}/…`, com cerca de 45 caminhos (assentos, auditlog, restrições, tokens, seatautomation). Está fora do escopo da Melt.

**Butler (proxy):** `/proxy/butler/powerup-commands`, `…/powerup-run-command`, `…/powerup-resume-command`, `…/powerup-library-enable|rename|share/`, `/proxy/butler/settings`, `/proxy/butler/settings/pup`. A UI do Butler mostra referências a `app.butlerfortrello.com` (iframe `ButlerFrame`).

**Outros gateways:** `/gateway/api/graphql`, `/gateway/api/object-resolver` (smart links), `/gateway/api/flags`, `/gateway/api/gasv3/api/v1` (analytics) e Media API (`/file/upload`, `/upload/createWithFiles`, `/v2/file/copy`, `x-media-region`) para os anexos.

---

## 5. GraphQL (gateway)

**Tipo:** Obs. (o analisador do REA reconhece os nomes das operações nos AST: `ev_dd09…`, `ev_57279…`, `ev_64b7…`, `ev_cf09…`, `ev_e7f5…`, `ev_b8c6…`). **Totais nas 6 páginas: 151 queries, 141 mutations e 11 subscriptions.** Os conjuntos completos estão em `bundle-work/graphql-ops.json`.

**Subscriptions (tempo real):**

| Subscription | Escopo |
|---|---|
| `TrelloBoardUpdated` | quadro |
| `TrelloBoardUpdatedAttachments` | anexos do quadro |
| `TrelloMemberUpdated` | membro |
| `TrelloWorkspaceUpdated` | workspace |
| `TrelloMirrorCards` | cards espelho |
| `TrelloBoardPlannerEventCards` | eventos do Planner no quadro |
| `TrelloProposedEventsUpdated` | eventos propostos (Planner) |
| `TrelloOnProposePlannerEventsJobUpdated` | job de proposta de eventos |
| `TrelloBoardCardRecommendationsUpdated` | recomendações de cards |
| `TrelloOnGenerateBoardBackgroundJobUpdated` | geração de fundo por IA |
| `TrelloAgentSessionUpdated` | sessão de agente de IA |

**Mutations por área (amostra representativa):**

- **Card:**
  - Criar e mover: `AddCardToList`, `MoveCard`, `CopyCard`, `BulkMoveCards`.
  - Arquivar e excluir: `ArchiveCard`, `DeleteCard`, `UndoAutoArchivedCard`.
  - Conteúdo: `TrelloCardBackUpdateCardName`, `CardBackUpdateCardDesc`, `UpdateCardDates`, `UpdateDueComplete`, `TrelloMarkCardComplete`/`Incomplete`, `SetCardCover`.
  - Labels e membros: `UpdateCardLabels`, `TrelloAddLabelsToCard`, `AddMemberToCardShortcut`, `SubscribeToCardShortcut`.
  - Outros: `AddStickerToCard`, `AddMemberVoted`, `ChangeCardRole`, `UpdateCardLocation`, `TrelloMergeCards`, `MarkCardAsViewed`.
- **Checklist:** `CardBackAddCheckItem`, `CardBackUpdateCheckItemState`, `CardBackEditCheckItemIdMember` (responsável por item), `CardBackEditCheckItemDueDate` (prazo por item), `CardBackConvertCheckItemToCard`, `CardBackUpdateCheckItemPos`, `CardBackChecklistUpdatePos`, `TrelloGenerateCheckItemsForCard` (IA).
- **Comentários e reações:** `UpdateCardComment`, `DeleteCommentFromCard`, `AddReaction`, `DeleteReaction`, `UploadCommentAsAttachment`.
- **Anexos:** `AddCardAttachment`, `UpdateCardAttachment`, `TrelloUpdateAttachmentName`, `TrelloUpdateAttachmentUrl`, `TrelloUpdateAttachmentPosition`, `RemoveAttachmentFromCard`, `ClipboardAddCardFromFile` (colar arquivo vira card).
- **Lista:** `AddList`, `UpdateListName`, `UpdateListPosition`, `UpdateListDatasourceFilter`.
- **Em massa:** `TrelloBulkSetCardsClosed`, `TrelloBulkMarkCardsDone`, `TrelloBulkDeleteArchiveCards`, `BulkMoveCards`.
- **Quadro:** `TrelloUpdateBoardName`, `TrelloUpdateBoardVisibility`, `TrelloUpdateBoardBackground`, `TrelloBoardHeaderAddBoardStar`, `TrelloCardCoversSectionShow/HideCardCovers`, `UpdateCalendarFeedEnabledPreference`, `UpdateCalendarKey`.
- **Automação:** `CreateAutomation`, `TrelloCreateAutomationFromPrompt`, `ToggleAutomation`, `DeleteAutomation`, `RunAutomationNow`, `ImportAutomationLibrary`, `Share`/`Unshare`/`RenameAutomationLibrary`, `EnableAllLibraryAutomations`, `UpdateAutomationSuggestion`, `UpdateAutomationTimezone`, `SetButlerButtonOverride`, `DeleteButlerButton`, `ChangeButtonAutomationBoardVisibility`/`MemberVisibility`.
- **Desfazer:** `TrelloUndoAction`.
- **IA:** `TrelloEditBoardWithAi`, `TrelloRevertEditBoardWithAi`, `TrelloUpdateCardManifestPrompt`, `TrelloRefreshCardManifest`, `TrelloRejectCardRecommendation`, `TrelloEnqueueProposePlannerEventsJob`.
- **Preferências:** `TrelloUpdateKeyboardShortcutsPref`, `MemberSettingsUpdateColorBlindPrefs`.

**Padrão de cache "patcher"** (Obs.: `BoardCardsPatcher`, `BoardListsPatcher`, `CardChecklistsPatcher`, `ChecklistCheckItemsPatcher`, `MemberCardsPatcher`…). São fragmentos usados para aplicar as atualizações em tempo real ao cache local.

---

## 6. Tempo real (websocket e subscriptions)

**Observado em execução** (`ev_218e…`, quadro público, sem login):

1. **Canal legado, `wss://trello.com/1/Session/socket?clientVersion=build-…`:**
   - O cliente envia `{"type":"ping","reqid":0}` e recebe `{"reqid":0,"result":true}`.
   - Depois envia `{"type":"subscribe","modelType":"Board","idModel":"<id>","tags":["clientActions","updates"],"invitationTokens":[],"reqid":1}`.
   - Envia também `subscribe` para `modelType:"Organization"` com `tags:["allActions","updates"]`.
   - O servidor responde `{"reqid":N,"result":<número>}`. **Inf.:** o número parece ser o cursor `ixLastUpdate` corrente do modelo.
2. **Canal GraphQL, `wss://trello.com/gateway/api/graphql/subscriptions`:**
   - Usa o protocolo graphql-ws: `connection_init` → `connection_ack` → `subscribe` (`TrelloBoardUpdated`, variável `nodeId` = ARI do quadro, diretiva `@optIn(to:"TrelloOnBoardUpdated")`) → `next`.
   - O primeiro `next` traz o estado do quadro, com `_deltas` listando os caminhos alterados (ex.: `["lists","enterprise","prefs.background.color",…]`), além de labels, prefs e `premiumFeatures`.
   - Extensões trazem `tags:["public_updates","card-all"]` e um `channel` de agregação.

**Comportamento de conexão** (Der., strings de estado e eventos no `app`):

- **Estados:** `connecting`, `connected`, `disconnected`, `delayed`, `waiting_to_reconnect`, `unhealthy`, `closed`.
- **Eventos:** `Ping Timeout`, `ServerPingTimeout`, `Connection Acknowledgement Timeout`.
- **Reconexão com limite** (`dailyFailures`, `windowFailures`, `rate_limited`, `Reconnection blocked`). Também há `force_disconnected` e "Waiting until online" (espera `navigator.onLine`).
- **Atividade da aba:** `visibilitychange` e estados `idle`/`active`. As flags `trello_web_max_first_idle_delay` e `trello_web_max_first_active_delay` sugerem que abas inativas reconectam mais devagar.
- **Re-sync:** em `too_far_behind` ou erro de sequência, o cliente faz um GET em `/1/{modelo}/{id}/deltas?ixLastUpdate=…&tags=…` com o cabeçalho `X-Trello-Resync`. Erros aparecem como `syncError`/`SyncError`/`BatchError`.
- **Flags relacionadas** (Der.): `goo_send_ws_ping`, `goo_disconnect_retry_wait`, `goo_slower_client_reconnects`, `goo_update_reconnect_windows`, `goo_resubscribe_on_error`, `goo_sequence_number_on_error`, `goo_notify_network_status`, `goo_graphql_connectivity_flags`, `useGraphqlWebsocketPings`, `trello_web_disconnect_active_clients`, `tplat_gql_client_subscriptions_sse` (alternativa por **SSE**; o caminho `/graphql/sse/subscription` existe no bundle).

**Inf.:** o Trello está no meio de uma migração do socket legado para GraphQL subscriptions e mantém os dois em paralelo.

---

## 7. Offline e UI otimista

| Pergunta | Resposta | Tipo |
|---|---|---|
| Funciona offline (PWA)? | **Não há indício.** Não há service worker nem Cache Storage, e o IndexedDB só tem analytics. O cache Apollo não é persistido (não há `apollo3-cache-persist`, `localforage` nem `idb-keyval`) | Obs. `ev_e684…` + Der. |
| Detecta falta de rede? | Sim: `navigator.onLine`, eventos `online`/`offline`, "Internet Unhealthy" e "Waiting until online". Com isso, ele **pausa e reconecta**, mas não enfileira edições offline | Der. (app) |
| UI otimista? | **Sim, em larga escala.** `optimisticResponse` aparece em card-back (43), board-list-view (27), calendar-view (22), board-route (7), table-view (6), automation (5)… | Der. |
| Desfazer? | Sim: `TrelloUndoAction`, atalho Z (desfazer), Shift+Z (refazer) e R (repetir última ação); "undo" em fusão de cards e arquivamento automático | Der. |
| "Modo manutenção" | Flag `trello_web_take_trello_offline` (dinâmica, via Statsig) | Der. |
| Atualização forçada de versão | `trello_web_forcefully_reload_to_exact_version`, `trello_web_passively_reload_to_minimum_version`, `trello_web_update_nudge_*` | Der. |
| Limites duros (alimentam UX de erro) | Ver §15: cards abertos ou totais por quadro e por lista, campos personalizados, anexos e checklists por quadro, reações únicas e totais | Der. (IDs `card_limits_error.*`, `limits_error.*`) |

---

## 8. Drag-and-drop

- **Pragmatic drag-and-drop (Atlassian)** é a biblioteca principal (**Inf. com boa confiança**). Os marcadores estão em `board-route`, `trello-renderer`, `calendar-view` e no vendor `ltp`:
  - o tipo MIME `application/vnd.pdnd`;
  - a correção `honey-pot`;
  - os atributos `data-drop-target-for-element`;
  - o hitbox `closestEdge`, também presente em `card-back` (7) e `table-view` (2).
- **react-beautiful-dnd** (`data-rbd-`) ainda aparece no vendor, no `card-back`, no `calendar-view` e no `filter-popover`. **Inf.:** são componentes antigos do Atlaskit ou listas internas, como a reordenação de itens.
- Comportamentos ligados a DnD encontrados:
  - arrastar card externo ou URL para o quadro (`trello_xf_use_card_drag_external`, `trello_enterprise_card_urls_on_drop`);
  - arrastar entre quadros na tela dividida;
  - mover dentro do Planner (`TrelloUpdateCardPositionOnPlannerEvent`);
  - mudar de lista pela célula da tabela (`ListCellMoveCard`);
  - as mensagens "pode mover/copiar só dentro do quadro/enterprise".
- **Posição:** listas, cards, checklists e itens têm `pos` do tipo **Float** (Der., schema). **Inf.:** é ordenação fracionária, em que se insere entre dois vizinhos sem renumerar a lista. Também existe `/1/lists/{x}/sort` para ordenar uma lista inteira.

---

## 9. Editor de texto

- **Atlassian Editor, baseado em ProseMirror.** Os marcadores `ProseMirror`, `prosemirror-model`, `ProseMirror-gapcursor` e `EditorView` estão no `trello-renderer`. Há chunks `trello-editor`, `atlaskit-composable-editor`, `editor-plugin-ai`, `editor-plugin-ai-trello-prebuilt`, `atlaskit-mention-typeahead`, `atlaskit-emoji-typeahead`, `editor-image-picker-dialog` e as mensagens do editor em 26 idiomas, com pt_BR carregado. **Obs.** (nomes de chunks) e **Der.**
- **Formato salvo:** **Markdown.** O campo `desc` é string e `descData` guarda emojis. O parser é **markdown-it**, preset `commonmark`, com HTML desligado e linkify ligado. Há uma flag `platform_editor_use_markdown_plus_parser`. **Inf.:** o texto entra e sai em Markdown e o ProseMirror é só a camada WYSIWYG.
- **Recursos de texto:**
  - menções `@` com autocompletar (notificam a pessoa mencionada);
  - emojis (emoji-mart, mais emoji customizado por membro: `/1/members/{x}/customEmoji`);
  - **smart links** e "Smart Cards", que viram cartões de preview via `/gateway/api/object-resolver`;
  - colar URL vira anexo;
  - Ctrl/Cmd+Enter salva;
  - indicador de "está editando" (`/1/members/{x}/editing`).
- **Comandos `/` no compositor de card** (`templates.slash-commands.*`): `separator` (alias `divider`), `link` (alias `url`), `widget` (alias `custom`, `prompt`, `manifest`; card gerado por IA), `weather`, `flight` e `news` (widgets). O compositor também aceita criar vários cards colando várias linhas ("create-multiple-cards").
- **Datas em linguagem natural:** a lib `chrono-node` está no mapa de chunks, junto com a flag `phx_nlp_due_dates_suggestion`.

---

## 10. i18n

- **pt-BR existe e é completo:**
  - `locale.pt-BR` com cerca de 1 MB de mensagens;
  - `atlaskit-editor-messages-pt_BR`;
  - `smart-card-messages-pt_BR`;
  - `browser-storage-controls-i18n-pt_BR`.

  Todos foram carregados automaticamente pelo idioma do navegador (Obs., `ev_dd09…`).
- **Locais do app** (mapa de primeiro dia da semana; Der.): cs, de, en-AU, en-GB, en-US, es, fi, fr, fr-CA, hu, it, ja, nb, nl, pl, **pt-BR** (semana começa no **domingo**), ru, sv, th, tr, uk, vi, zh-Hans e zh-Hant.
- **Biblioteca:** FormatJS / react-intl (`IntlProvider`, `formatMessage({id, defaultMessage, description})`). Os IDs seguem o padrão `templates.<área>.<chave>`. Foram vistos **1.924 IDs** só nos chunks carregados.
- **Datas relativas:** formatador próprio com padrões "Hoje às …", "Ontem às …" por locale. O calendário usa date-fns. Não usa moment.

---

## 11. Atalhos de teclado (catálogo completo)

Fonte: chunk `shortcuts` (`ev_b8c6…`, exportado em `ev_05fa…`). As teclas são observadas. As descrições são paráfrases curtas nossas.

| Tecla(s) | Ação |
|---|---|
| ← ↓/J ↑/K → | navegar entre cards (J = abaixo, K = acima) |
| ←/K e →/J (com card aberto) | ir para o verso do card vizinho |
| Ctrl/Cmd + C, depois V | copiar card (passando o mouse) e colar numa lista |
| Ctrl/Cmd + X, depois V | recortar e mover card para outra lista |
| Ctrl/Cmd + V | colar texto como novo card; com card aberto, colar URL como anexo |
| Shift + clique / clique direito | seleção múltipla de cards / menu de ações em massa |
| B | abrir menu de quadros do cabeçalho (com busca) |
| / | focar a busca |
| C | arquivar card |
| D | abrir seletor de data de entrega |
| - (hífen) | adicionar checklist |
| E | edição rápida do card (título e atributos) |
| Esc | fechar diálogo ou popover e cancelar edição |
| Ctrl/Cmd + Enter | salvar texto (comentário, descrição, título) |
| Enter / Shift + Enter | abrir card selecionado / criar e já abrir |
| F | abrir filtro de cards (foco na busca por título) |
| L | popover de etiquetas |
| 1–0 | aplicar ou remover etiqueta por cor (verde, amarelo, laranja, vermelho, roxo, azul, céu, lima, rosa, preto) |
| ; | mostrar ou ocultar nome das etiquetas no quadro |
| M | adicionar ou remover membros |
| N | inserir novo card após o selecionado |
| \ | recolher ou expandir a lista atual |
| Shift + \ | recolher ou expandir todas as listas |
| , . < > | mover card para a lista à esquerda ou à direita |
| Q | filtro "meus cards" |
| S | seguir ou deixar de seguir o card |
| Espaço | atribuir ou desatribuir a si mesmo |
| T | editar título (card aberto) |
| V | votar (se a votação estiver ativa) |
| X | limpar todos os filtros |
| ? | abrir página de atalhos |
| @ | autocompletar membros em comentários |
| Z / Shift + Z | desfazer / refazer |
| R | repetir a última ação |
| Shift + rolagem | rolar o quadro na horizontal |

Os atalhos podem ser **ligados e desligados por usuário** (`TrelloUpdateKeyboardShortcutsPref`).

---

## 12. Tipos de visualização

| Visão | Evidência | Notas |
|---|---|---|
| **Quadro (listas)** | chunk `board-list-view`, Obs. | listas coloridas (`List_Color`: blue, green, lime, orange, magenta, purple, red, teal, yellow), **listas recolhíveis**, **listas fixadas** (`trello-pinned-lists-v2`), limite flexível (`softLimit`), cards de vários tipos (§15) |
| **Tabela** | `table-view` carregou sem login, Obs. `ev_64b7…` | colunas card, lista, labels, membros e data. Ordena asc/desc, filtra, edita o nome inline, troca a lista pela célula e cria card pela tabela. Usa virtualização. A **versão de workspace** junta vários quadros (`multi_board_table_view`) com limite de quadros e de cards |
| **Calendário** | `calendar-view` carregou, Obs. `ev_e7f5…` | URL `/calendar/AAAA/MM`. Horizontes: dia, semana, mês, trimestre, ano e contínuo (`CalendarView_TimeHorizons`). Arrastar muda a data. Tem ações em massa, **feed iCal** por URL secreta (`calendarKey/generate`, `UpdateCalendarFeedEnabledPreference`) e versão de workspace |
| **Linha do tempo** | rota `timeline` e chunk `timeline-view`, Der. | agrupa por lista, label, membro ou nenhum (`views.*`) |
| **Dashboard** | rota `dashboard`, `board-dashboard-view`, tiles `Board_DashboardViewTile` (`From`, `Graph`) e `/history/cardsPer*`, Der. | gráficos por lista, label, membro e status de prazo |
| **Mapa** | rota `map`, `map-view`, `Card.coordinates`/`address`/`locationName`/`staticMapUrl`, Der. | cards com localização |
| **Visões de workspace** | `w/:orgname/views/{table,calendar}`, `v/:shortLink/*`, `OrganizationView` com filtros e opções salvos, Der. | |
| **Planner** | `planner-wrapper`, `TrelloPlannerValidAccounts`, flags `trello-planner-google-calendar` e `trello-planner-outlook-calendar`, Der. | conecta agendas Google ou Outlook, "tempo de foco" e "smart schedule" com IA |
| **Inbox** | `inbox-route`, `moveCardToInbox`, origens de captura rápida (e-mail, Slack, Teams, Google Chat, extensão Chrome, voz), Der. | caixa de entrada pessoal |
| **Tela dividida** | `split_screen.*`: Inbox, Planner e Quadro, com redimensionamento por setas, Der. | |
| **Modo foco** | chunk `focus-mode-overlay`, Der. | |

**Observado no quadro testado:** `prefs.switcherViews` = Board ✓, Table ✓, Calendar ✗, Dashboard ✗, Timeline ✗, Map ✗. Isso mostra que **cada quadro escolhe quais visões aparecem no seletor**. Mesmo com o Calendar desligado, a rota `/calendar` carregou o chunk. Se os dados foram renderizados ficou **desconhecido**.

---

## 13. Butler (automação)

**Observado:** a rota `/b/…/butler` carrega `board-butler-view` e `automation-dashboard` mesmo sem login (`ev_cf09…`). As operações GraphQL estão listadas em §5.

**Tipos de automação** (IDs `templates.automation_dashboard.*`, Der.):

1. **Regras** (gatilho → ações).
2. **Botões de card**, que aparecem no verso do card.
3. **Botões de quadro**, que aparecem no cabeçalho.
4. **Comandos agendados** (diário, semanal, mensal…).
5. **Comandos por data de entrega**, relativos ao prazo.

Cada tipo tem a sua tela vazia com exemplos e vídeo.

**Gestão:**

- buscar, filtrar por biblioteca, ativar e desativar, excluir, copiar, editar;
- **executar agora** (só para agendados);
- **logs/atividade** por automação;
- visibilidade dos botões (privado ou compartilhado, por quadro e por membro, mais "overrides");
- **bibliotecas de automação** que podem ser importadas, compartilhadas e renomeadas, com "ativar todas";
- **sugestões automáticas**;
- **criar por prompt de IA** (`TrelloCreateAutomationFromPrompt`);
- **fuso horário** da automação;
- **relatórios por e-mail** (migraram para dentro do dashboard).

**Cotas por plano:** `butlerStandard`, `butlerBC`, `butlerPremium`, `butlerEnterprise`, mais avisos de cota próxima ou estourada. Botões têm `butlerButtonLimit`. Também existe allowlist só para admin enterprise.

**Como funciona (Der. e Inf.):** um comando do Butler é uma **frase em linguagem estruturada** (inglês canônico). O cliente localiza a frase com `localizeCommandToButlerEnglish` e `getButlerLocalizationKeys` e tem erros como `CANT_PARSE_COMMAND` e `COMMAND_TOO_LONG`. O modelo `ButlerButton` tem os campos `cmd`, `label`, `image`, `close`, `enabled`, `pos` e `type`. A execução passa pelo proxy `/proxy/butler/powerup-run-command`. **Inf.:** existe uma **gramática** cujos tokens estão no bundle (cerca de 700). Categorias, com exemplos de tokens:

- **Gatilhos:**
  - Card: `CARD_INTO_LIST`, `CARD_OUTOF_LIST`, `CARD_MOVED`, `CARD_ARCHIVED`, `CARD_COMPLETED`.
  - Datas: `DUE_DATE_ADDED`, `DUE_DATE_COMPLETED`, `DUE_DATE_MOVED`, `START_DATE_ADDED`.
  - Labels e membros: `LABEL_ADDED`/`REMOVED`, `MEMBER_ADDED`/`REMOVED`, `MEMBER_MENTIONED`.
  - Checklist: `CHECKLIST_COMPLETE`, `ITEM_CHECKED`.
  - Atividade no card: `COMMENT_ADDED`, `ATTACHMENT_ADDED`, `VOTE_ADDED`.
  - Campos e listas: `CUSTOM_FIELD_SET`, `FIELD_CHECKED`, `LIST_CREATED`, `LIST_ARCHIVED`.
  - Quadro e workspace: `BOARD_CREATED`, `MEMBER_ADDED_TO_BOARD`, `POWERUP_ENABLED`.
  - Quem disparou: `WHO_I`, `WHO_ANYONE`, `WHO_ANYONE_BUT`.
- **Agendamento:** `EVERY_DAY`, `EVERY_WEEKDAY`, `EVERY_WEEK`, `EVERY_MONTH`, `EVERY_YEAR`, `EVERY_HOUR`, `NTH_WEEK_DAY`, `FIRST_MONTH_DAY`, `LAST_MONTH_DAY`, `CERTAIN_DAYS`, `ON_DUE_DATE`, `DAYS_BEFORE`, `DAYS_AFTER`, `HOURS_BEFORE`, `X_WORKING_DAYS`.
- **Condições:**
  - Labels e checklist: `WITH_LABEL`, `WITHOUT_LABEL`, `WITH_CHECKLIST`, `WITH_ALL_CHECKLISTS`.
  - Datas: `WITH_DUE_DATE`, `WITH_OVERDUE_DATE`, `WITH_DUE_COMPLETE`, `DUE_IN_LESS_THAN_DAYS`, `DUE_THIS_WEEK`.
  - Campos e descrição: `CUSTOM_FIELD_VALUE_CONDITION`, `CUSTOM_FIELDS_COMPLETE`, `EMPTY_DESCRIPTION`.
  - Pessoas: `ASSIGNED_TO`, `NOT_ASSIGNED_TO`.
  - Lista e tempo: `IN_LIST`, `NOT_IN_LISTS`, `TIME_IN_LIST_CONDITION`, `INACTIVITY_CONDITION`.
  - Texto e tipo: `EXACT_NAME_CONDITION`, comparações de texto (`_STARTS_WITH`, `_CONTAINS`, `_ENDS_WITH`, `MATCH_*`), `CARD_ROLE_CONDITION`.
  - Números: `NUMBER_CONDITION`, `OP_CMP_*`.
- **Ações:**
  - Mover e copiar: `MOVE_CARD_ACTION`, `COPY_CARD_ACTION`, `MIRROR_CARD_ACTION`, `ARCHIVE_CARD_ACTION`, `UNARCHIVE_CARD_ACTION`, `DELETE_CARD_ACTION`.
  - Conteúdo do card: `RENAME_CARD_ACTION`, `SET_DESCRIPTION_ACTION`, `ADD_LABEL_ACTION`, `ADD_MEMBER_ACTION`, `JOIN_CARD_ACTION`, `ADD_COMMENT_ACTION`, `ADD_LINK_ACTION`, `ADD_STICKER_ACTION`.
  - Datas: `ADD_DUE_DATE_ACTION`, `ADJUST_DUE_DATE_ACTION`, `ADD_START_DATE_ACTION`, `MARK_DUE_COMPLETE_ACTION`, `MARK_CARD_COMPLETE_ACTION`.
  - Checklist: `ADD_CHECKLIST_ACTION`, `ADD_CHECKLIST_ITEM_ACTION`, `CHECK_ITEM_ACTION`, `ASSIGN_ITEM_ACTION`, `SET_ITEM_DUE_DATE_ACTION`, `CONVERT_ITEM_ACTION`, `RESET_CHECKLIST_ACTION`.
  - Campos: `SET_CUSTOM_FIELD_ACTION`, `INCREASE_FIELD`, `CLEAR_FIELD`.
  - Listas e quadros: `CREATE_CARD_ACTION`, `CREATE_LIST_ACTION`, `SORT_LIST_ACTION` (`SORT_BY_DUE_DATE`, `SORT_BY_LABEL`, `SORT_BY_VOTES`, `SORT_BY_TIME_IN_LIST`…), `MOVE_ALL_CARDS_ACTION`, `ARCHIVE_ALL_CARDS_ACTION`, `CREATE_BOARD_ACTION`, `COPY_BOARD_ACTION`, `CLOSE_BOARD_ACTION`, `INVITE_MEMBER_TO_BOARD_ACTION`, `SUBSCRIBE_TO_CARD_ACTION`.
  - Comunicação e integrações: `SEND_EMAIL_ACTION`, `HTTP_REQUEST_ACTION` (GET/POST/PUT), `APP_SLACK_POST_MESSAGE_ACTION`, `APP_JIRA_CREATE_ISSUE_ACTION`, `APP_BITBUCKET_CREATE_PR_ACTION`.
  - Relatórios e diversão: `CREATE_REPORT_ACTION`, `COUNT_CARDS_ACTION`, `SUM_AVERAGE`, `RANDOM_MEMBER_LIST`, `THROW_CONFETTI_ACTION`.
- **Controle de fluxo e variáveis:** `IF_ACTION`, `ELSE_ACTION`, `IF_EXISTS_ACTION`, `FOR_EACH_CARD`, `FOR_EACH_CHECKLIST_ITEM`, `FOR_EACH_MEMBER`, `FIND_CARD_ACTION` (`BY_TITLE`, `BY_ID`, `BY_POSITION`), `FIND_OR_CREATE_CARD`, `SET_VARIABLE_ACTION`, `INCREASE_VARIABLE_ACTION`, `PRINT_VARIABLES`, `SET_SILENT_ACTION`, `SET_TIMEZONE_ACTION`.

**Desconhecido:** a gramática completa (precedência e sintaxe exata), os limites de execução e a semântica do servidor. A UI de edição de regra roda em iframe (`ButlerFrame`, `app.butlerfortrello.com`) e não foi capturada.

---

## 14. Power-Ups

- Os modelos têm `pluginData` com `scope` (board, card, member, organization) e `access` (shared ou private). Endpoints: `/1/{modelo}/{id}/pluginData`, `/1/board/{x}/privatePluginData/{x}`, `/1/member/{x}/privatePluginData/{x}`, `SetPluginData` e `UpdatePluginData`. **Der.**
- **Superfícies:**
  - botões no quadro (`PluginBoardBar`, `board-header-plugin-buttons-modernized`);
  - seções no verso do card (`card-back-plugins`, `cardback-powerup-popover`);
  - badges no card;
  - popovers e modais (`PluginPopover`, `PluginModal`, `PluginPopoverDatetime`);
  - anexos ("save to plugin");
  - configurações (`PowerUpSettingsPopover`).

  Tudo roda em iframe com `postMessage`. **Der.**
- **Autenticação de Power-Up:** `/1/plugin/{x}/jwt`, OAuth2 (`/oauth2/accessToken`, `/exchangeToken`), `/1/authorize` e `/1/token/approve`. **Der.**
- **Diretório:** `/1/plugins/public`, `/1/plugins/categories`, `powerUpPublicDirectory`, listagens e atualizações de listagem. Há um banner de **depreciação** de power-ups (`power-ups-deprecation-banner`). **Der.**

---

## 15. Modelo de dados (schema cliente embutido)

**Der.:** é um blob de schema com 493 tipos dentro do `app`. Abaixo estão só os nomes de campos.

- **Board:** `id`, `shortLink`, `name`, `desc`, `closed`, `idOrganization`, `prefs`, `labels`, `lists`, `cards`, `members`, `memberships`, `customFields`, `pluginData`, `boardPlugins`, `idTags` (coleções), `starred`, `pinned`, `subscribed`, `dateLastActivity`, `dateLastView`, `limits`, `premiumFeatures`, `dashboardViewTiles`, `privateButlerButtons`, `sharedButlerButtons`, `butlerButtonOverrides`, `templateGallery`, `idBoardSource`, `creationMethod`, `stats`, `history`, `exports`.
- **Board_Prefs:**
  - Acesso e colaboração: `permissionLevel` (private, org, enterprise, public), `comments`, `invitations`, `selfJoin`, `voting`, `hideVotes`.
  - Exibição: `cardCovers`, `cardAging` (`regular` ou desbotar com o tempo), `showCompleteStatus`, `switcherViews`, `hiddenPluginBoardButtons`, `background*`.
  - Comportamento: `autoArchive`, `calendarFeedEnabled`, `isTemplate`.
- **List:** `id`, `name`, `pos` (Float), `closed`, `color`, `idBoard`, `softLimit`, `limits`, `subscribed`, `type`, `datasource` (lista ligada ao Jira).
- **Card:**
  - Identidade e posição: `id`, `idShort`, `shortLink`, `name`, `desc`, `pos` (Float), `idList`, `idBoard`.
  - Pessoas e labels: `idMembers`, `idLabels`, `idMembersVoted`, `subscribed`.
  - Datas e estado: `start`, `due`, `dueReminder`, `dueComplete`, `dateMarkedComplete`, `closed`, `dateClosed`, `dateLastActivity`, `dateViewedByCreator`.
  - Visual: `cover` (cor, tamanho, brilho, imagem), `stickers`.
  - Conteúdo associado: `badges`, `checklists`, `checkItemStates`, `attachments`, `customFieldItems`.
  - Local: `coordinates`, `address`, `locationName`.
  - Tipo e origem: **`cardRole`** (`separator`, `board`, `link`, `mirror`, ou nulo para card normal), `mirrorSourceId`, `isTemplate`, **`recurrenceRule`** (`rule`, `triggers`), `manifest` (card widget de IA), `creationMethod`, `urlSource`.
  - Integrações e limites: `pluginData`, `limits`.
- **Card_Badges:** `attachments`, `checkItems`, `checkItemsChecked`, `checkItemsEarliestDue`, `comments`, `description`, `due`, `dueComplete`, `start`, `votes`, `viewingMemberVoted`, `location`, `subscribed`, `externalSource`, `lastUpdatedByAi`.
- **Checklist:** `id`, `name`, `pos`, `idCard`, `idBoard`, `checkItems`.
- **CheckItem:** `id`, `name`, `pos`, `state`, **`idMember`**, **`due`**, **`dueReminder`**. Ou seja, cada item tem responsável e prazo próprios (recurso "advanced checklists", pago).
- **Label:** `id`, `name`, `color`. São 10 cores e cada uma tem as variantes `_light` e `_dark` (30 valores).
- **CustomField:** `id`, `name`, `type`, `options`, `pos`, `display.cardFront`, `fieldGroup`, `isSuggestedField`.
- **CustomFieldItem:** `idCustomField`, `idModel`, `idValue`, `value`. **Inf.:** os tipos são texto, número, data, checkbox e lista. Os valores do enum `CustomField_Type` não estão no blob.
- **Action** (histórico/atividade): `id`, `type`, `date`, `data`, `display`, `idMemberCreator`, `reactions`, `appCreator`, `agenticIdentity`. Foram vistos 200+ tipos de ação, como `createCard`, `updateCard`, `commentCard`, `addMemberToCard`, `updateCheckItemStateOnCard`, `addAttachmentToCard`, `moveCardToBoard`, `copyCard`, `updateCardRecurrenceRule`, `updateCardRole`…
- **Attachment:** `name`, `url`, `bytes`, `mimeType`, `isUpload`, `previews`, `edgeColor`, `pos`, `aiSummary`, `isMalicious`.
- **Notification:** `type`, `data`, `unread`, `dateRead`, `reactions`. Notificações são agrupadas por card (`notificationGroups`).
- **Outros:** `Reaction` (emoji em comentário/ação), `SavedSearch` (`name`, `query`, `pos`), `Tag` (coleções), `ButlerButton`, `OrganizationView`, `UpNext`/`UpNextCard`/`UpNextEvent`, `SmartScheduleCard`.
- **Limites** (`Board_Limits`): attachments, boards, cards, checkItems, checklists, customFieldOptions, customFields, labels, lists, reactions e stickers. Cada um tem status. `LimitStatus` emite avisos de "perto do limite" e "limite atingido".

---

## 16. Feature flags e experimentos (o que revelam)

**Der.** As flags vêm de strings no formato `prefixo_nome`. Os prefixos `goo_` e `tplat_` são de plataforma, `phx_` de produto e `trello_web_` de operação.

| Grupo | Flags | O que indicam |
|---|---|---|
| Produto | `phx_bulk_archive`, `phx_bulk_delete_archived_cards`, `phx_archive_cards_checklists`, `phx_card_front_date_picker`, `phx_pinned_lists_experiment_v2`, `phx_trello_member_board_backgrounds` | ações em massa, data na frente do card, listas fixadas, fundos personalizados |
| Captura e voz | `phx_voice_capture_entry_point`, `phx_voice_capture_ga`, `trello_web_voice_capture_filter` | captura de cards por **voz** |
| Cards "manifest" e widget (IA) | `phx_manifest_cards`, `phx_manifest_card_back`, `phx_widget_cards_ga_web` | cards gerados por IA (clima, voo, notícias, prompt livre) |
| IA | `phx_ai_attachment_summaries`, `phx_nlp_due_dates_suggestion`, `phx_trello_rovo_chat`, `goo_ai_board_builder_task_updates`, `goo_aibb_persist_refinement`, `trello_goo_aibb_m2`, `trello_agent_m1`, `trello_agent_poc`, `trello-ai-board-background-image-generation`, `trello-ai-card-cover-image-generation` | resumo de anexos, datas por linguagem natural, chat Rovo, **gerador de quadro por IA**, agentes, geração de imagens |
| Migração REST→GraphQL | `goo_migrate_card_back_scalar_fields`, `goo_migrate_card_location`, `goo_migrate_template_banner`, `goo_gql_migrate_board_labels_fragments_queries`, `tplat_migrate_board_name`, `trello_web_native_gql_labels`, `goo_cache_based_on_object_id`, `tplat_remove_class_components` | migração gradual por campo, também de classes para hooks |
| Conectividade | ver §6 | |
| Operação e release | `trello_web_take_trello_offline`, `trello_web_forcefully_reload_to_exact_version`, `trello_web_passively_reload_to_minimum_version`, `trello_web_update_nudge_time_interval`, `trello_web_somethings_wrong`, `trello_web_error_handling_rrs`, `trello_web_enable_ufo`, `trello_web_ufo_sampling_rate`, `trello_web_enable_web_vitals`, `tplat_sentry_browser_tracing`, `trello_web_graphql_compress_agg_responses` | kill-switch, atualização forçada, observabilidade |
| Integrações | `trello-ms-teams-integration`, `trello-planner-google-calendar`, `trello-planner-outlook-calendar`, `trello-smart-lists` (Jira), `trello_xf_use_card_drag_external`, `trello_jira_co_users_vnext` | Teams, agendas e Jira |
| Enterprise | `trello_enterprise_*`, `butler_ent_admin_only_allowlist`, `trello-web-seat-automation-member-blocklist` | fora de escopo |
| Editor | `platform_editor_use_markdown_plus_parser`, mais cerca de 180 flags `platform_*` do Atlaskit | |

Strings `trello_ui_*`, `trello_track_*`, `trello_has_used_*` e `trello_viewed_*` são **eventos e marcadores de analytics/onboarding**, não flags.

**Recursos pagos** (Obs., `premiumFeatures` no payload WS do quadro, `ev_218e…`):

- Atividade e exportação: `activity`, `boardExport`, `csvExport`, `export`, `shortExportHistory`.
- Personalização: `additionalBoardBackgrounds`, `customBoardBackgrounds`, `additionalStickers`, `customStickers`, `customEmoji`, `listColors`, `collapsibleLists`.
- Cards e checklists: `advancedChecklists`, `largeAttachments`, `premiumMirrorCards`.
- IA: `aiBoardBuilder`, `aiQuickCapture`, `atlassianIntelligence`.
- Automação: `butlerBC`, `butlerPremium`.
- Membros e convites: `inviteBoard`, `inviteOrg`, `multiBoardGuests`, `observers`, `goldMembers`, `superAdmins`, `deactivated`, `removal`.
- Plano: `isBc`, `isPremium`.
- Power-ups: `plugins`, `paidCorePlugins`.
- Organização e privacidade: `privateTemplates`, `readSecrets`, `restrictVis`, `savedSearches`, `starCounts`, `tags`.
- Visões: `views`, `workspaceViews`.

---

## 17. O que isso significa para o sistema da Melt (design, não observação)

Estas são recomendações nossas, derivadas do comportamento observado:

1. **Tempo real simples e robusto.**
   - Um WebSocket por sessão, com `subscribe {modelType, idModel}` por quadro e por workspace.
   - Cada evento traz o objeto alterado e uma lista `_deltas` com os caminhos mudados.
   - Um **cursor monotônico por quadro** (`ixLastUpdate`) e um endpoint `GET /quadros/:id/deltas?desde=N` para re-sincronizar depois de quedas.
   - Backoff com limite, ping e uma reconexão mais lenta em aba inativa.
2. **Otimismo + desfazer** em toda mutação: aplicar localmente, reconciliar com a resposta e oferecer "desfazer" (Z). É o que dá a sensação de velocidade do Trello.
3. **Ordenação fracionária (`pos` Float)** para listas, cards e itens de checklist. Ela evita renumerar e simplifica o drag-and-drop concorrente. Também convém ter `sort` por critério.
4. **Drag-and-drop:** Pragmatic drag-and-drop (open source, Atlassian) é a mesma família usada pelo Trello e é leve. Uma alternativa madura é o dnd-kit.
5. **Descrição em Markdown** com um editor WYSIWYG (ProseMirror/Tiptap) e parser commonmark. Incluir menções `@`, emojis, colar URL como anexo e **comandos `/`**, como separador, link e "card de briefing" de agência.
6. **Atalhos:** adotar o mesmo conjunto (§11). É memória muscular de quem já usa Trello e reduz a curva de adoção.
7. **pt-BR primeiro**, com chaves de i18n no padrão `área.chave` e datas relativas em pt-BR com semana começando no domingo.
8. **Visões:** quadro, tabela e calendário são o mínimo. Para agência valem também a **visão de workspace** multi-quadro (todas as demandas de todos os clientes) e um **dashboard** por lista, label, membro e status de prazo.
9. **Automação estilo Butler,** sem uma gramática em linguagem natural:
   - um **construtor visual** com catálogo de gatilhos, condições e ações (o vocabulário de §13 serve de checklist);
   - **botões de card e de quadro**;
   - **comandos agendados e por prazo**;
   - logs e "executar agora";
   - cotas internas para evitar laços.
10. **Itens de checklist com responsável e prazo,** cards recorrentes, cards modelo, campos personalizados e limites claros. No Trello, os itens com responsável e prazo são pagos (`advancedChecklists`), e isso diferencia bem para a Melt.
11. **Feed iCal por quadro** com URL secreta e **e-mail para quadro**, para receber demandas por e-mail, ou a alternativa de formulário público, como a JotForm faz no quadro analisado.

---

## 18. Lacunas e desconhecidos

| Item | Situação |
|---|---|
| Métodos HTTP e corpos dos endpoints REST | **Parcial.** Os caminhos são estáticos e muitos são montados por template. O verbo e o payload não foram observados (sem login e sem escrita) |
| Semântica do servidor (permissões, validação, limites numéricos exatos) | **Desconhecida.** Só os nomes dos limites e as mensagens de erro foram vistos |
| Gramática completa do Butler e editor de regras | **Parcial.** Os tokens foram vistos. O editor roda em iframe de `app.butlerfortrello.com`, que não foi capturado |
| Visões Timeline, Dashboard e Mapa | **Parcial.** Só nomes de chunks, rotas e tipos. Os chunks não foram carregados porque estão desligados no quadro testado |
| Visões de workspace, Planner e Inbox | **Não exercitadas.** Exigem login. Vale só a evidência estática |
| Frequência e forma dos eventos em tempo real após edições | **Desconhecida.** Não houve edição; vimos só o primeiro `next` e as respostas a `subscribe` |
| Valores dos enums (`CustomField_Type`, `Action_Type`, `Automation_Type`…) | **Desconhecidos** no blob (só os nomes dos enums). Os tipos de ação foram inferidos de strings |
| Grafo semântico do REA | **Parcial.** Arquivos grandes estouraram o orçamento (`ev_72868…`), e `trace_application_feature` não achou o seed (`ev_4177…`), o que não é prova de ausência. As conclusões de biblioteca e mecanismo vêm da varredura de strings sobre os bytes exportados |
| Source maps | **Não buscados** (`fetch_source_maps=false`, conforme instrução). Os nomes de módulos originais não foram recuperados |
| `trace_web_module_imports` / `inspect_web_event_listeners` | **Não usados.** Os bundles são webpack não-ESM (imports por id numérico), e os listeners do React são delegados na raiz. Nenhum dos dois agregaria |

### Checklist da frente

| Pergunta | Status |
|---|---|
| Rotas do app (b/, c/, u/, w/, templates…) | **Respondida** (§3) |
| Endpoints REST `/1/*` | **Respondida** para caminhos. Verbos e payloads **parciais** (§4) |
| GraphQL | **Respondida** (303 operações, §5) |
| Feature flags e experimentos | **Respondida** (§16) |
| Atalhos de teclado | **Respondida**, catálogo completo (§11) |
| Power-ups e Butler (regras, botões, agendado, por data) | **Respondida** nos tipos e no vocabulário. Gramática e servidor **parciais** (§13–14) |
| Tipos de visualização | **Respondida** (§12). Timeline, Dashboard e Mapa parciais |
| Tempo real | **Respondida, com execução observada** (§6) |
| Offline e otimista | **Respondida** (§7) |
| Biblioteca de DnD | **Respondida por inferência forte** (§8) |
| Editor de texto | **Respondida por inferência forte** (§9) |
| i18n e pt-BR | **Respondida** (§10) |
