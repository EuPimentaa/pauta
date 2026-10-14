# Trello: modelo de dados e tempo real (pesquisa REA)

Frente: **modelo de dados + tempo real** do Trello web, estudado em quadros **públicos** de templates, sem login,
sem escrita. Data: 2026-10-14. Navegador: Chromium 154 headless via CDP (aba própria, já fechada).
Só formas, tipos e comportamento. Nenhum valor pessoal, texto longo, código ou asset foi copiado.

Legenda de confiança: **[OBS]** observado em tráfego real · **[EST]** lido no bundle JS publicado (análise
estática, não prova execução) · **[INF]** inferência minha · **[?]** desconhecido / não observado.

---

## 0. Resumo (leia isto primeiro)

1. **Tudo é documento com id de 24 hex** (formato ObjectId do MongoDB) mais um `nodeId` no formato
   `ari:cloud:trello::<tipo>/workspace/<idOrg>/<id>` para a camada GraphQL. Cards e quadros têm ainda um `shortLink`
   de 8 caracteres usado nas URLs `/b/<shortLink>` e `/c/<shortLink>`. [OBS]
2. **Carga do quadro = 2 requisições REST grandes em paralelo** ("quickload"): uma com o quadro (prefs,
   labelNames, labels, members, memberships, customFields, organization) e outra com listas e cards. Os cards já vêm com
   **badges desnormalizados** (contadores de checklist, comentários, anexos, due) para desenhar a frente do card
   sem buscar mais nada. Os itens de checklist **não** vêm na carga do quadro: só ao abrir o card. [OBS]
3. **Ordenação = `pos` numérico de ponto flutuante** por lista (cards), por quadro (listas), por checklist (itens)
   e também em anexos e campos personalizados. Passo padrão **16384**. Inserir entre dois itens usa a **média**.
   Inserir no fim usa `último + 16384`. Inserir no topo usa `primeiro − 16384` ou `primeiro / 2`. Daí surgem valores
   fracionários como `32767.5` e `7056129.18…`. [OBS + EST]
4. **Histórico = coleção `actions`** (tipo + `data` com "fotos" mínimas das entidades + `old` com os valores
   anteriores). Observamos **24 tipos**, entre eles `createCard`, `updateCard` (subtipos pela chave em `old`:
   `idList` = mover, `closed` = arquivar, `pos`, `due`, `desc`, `name`, `dueComplete`, `dueReminder`, `cover`),
   `commentCard`, `updateCheckItemStateOnCard`, `updateCustomFieldItem` e `addMemberToCard`. [OBS]
5. **O tempo real tem dois canais WebSocket:**
   - **Legado (principal):** `wss://trello.com/1/Session/socket`, um RPC JSON com `reqid`. O cliente manda
     `subscribe {modelType, idModel, tags}` e recebe como `result` o **número de sequência atual do modelo**
     (`ixLastUpdate`). Depois chegam pushes `{idModelChannel, ixLastUpdateChannel, notify:{event:"updateModels"|"deleteModels", typeName, deltas[]}}`.
     Cada delta é um **objeto parcial com `id`**, mesclado no cache local. [OBS + EST]
   - **GraphQL subscriptions:** `wss://trello.com/gateway/api/graphql/subscriptions`, protocolo
     `connection_init / connection_ack / subscribe / next`. A assinatura `TrelloBoardUpdated(nodeId)` devolve o board
     parcial com o campo `_deltas`. [OBS]
6. **Recuperação após queda:** `GET /1/{Model}/{id}/deltas?ixLastUpdate=N&tags=…` devolve as mensagens perdidas
   (`{modelIxUpdate:{id:N}, messages:[...]}`). Se N for antigo demais, devolve `syncError` (a fila do servidor é
   limitada) e o cliente recarrega tudo. Sem socket, o cliente cai para **polling** desse mesmo endpoint com backoff
   exponencial de 5 s a 60 s. [OBS + EST]

**Lição para o sistema da Melt [INF]:** o desenho do Trello cabe em Postgres com estas peças: tabelas `board`, `list`,
`card`, `checklist`, `check_item`, `label`, `custom_field`, `custom_field_item`, `attachment`, `action` e `member`;
`pos double precision`; um contador `ix_update` por quadro; e uma fila de deltas com retenção curta. O canal de tempo
real pode ser Supabase Realtime ou um WebSocket próprio usando o mesmo protocolo "assinar modelo → receber deltas
parciais com número de sequência → reconciliar via `/deltas`".

---

## 1. Evidências (ledger)

| Evidence ID | O que é | Autoridade |
|---|---|---|
| `ev_1df922bc7a94ea027b61ffdd7a8982379e63ba60943fbb44e97bb0a3a57682bb` | `capture_browser_scenario` (connect): abrir o quadro público `FK3MvDhj`. Traz REST/GraphQL quickload e 3 WebSockets com frames. O clique no card falhou (seletor ambíguo). | observed |
| `ev_ad0b6012a7e914c1edcd709e91463297cc864c23a6e2a7aa5300f80852e1e3d7` | Captura do quadro `P5pfGKu8`. O clique no card expirou porque o diálogo "Sobre este quadro" cobria a página. | observed |
| `ev_ebf9d372d2f99b1dc2956c70362e7602c9dff05091ada41510e96b41b3c4fbaa` | Captura principal: `P5pfGKu8` → card `fKLbuTii` e depois `GDz7Wd53` → card `GuSBnzlv`. Traz detalhe do card, checklist sob demanda, assinaturas WS (inclusive `unauthorized`) e os bundles JS. | observed |
| `ev_ada4ac1fb2e5e3867f6dde867c6cadea6f9c62c71a3ecd6d2f0c823ab8e15836` | Tentativa de abrir "Comentários" no card. O botão não respondeu para o visitante anônimo e não gerou rede. | observed |
| `ev_b2bac458d7868251ad63f6f95b7b3eac6c55adf5529521e18dad7a70e3b16fcc` | `inspect_web_page` passivo (JSON e WS shapes ligados) durante um clique em "Comentários": 0 requisições. | observed |
| `ev_c02e43273e8809143ff022f1d3e3f35e556ace68da92a0b3d70aee97487902c5` | GETs públicos à REST `/1/` (mesma API usada pelo app): actions de 3 quadros e de 1 card, `customFields`, `checklists?checkItems=all`, `cards?customFieldItems=true`. | controlled-replay |
| `ev_0b9e5a1b57d9c36a644057ea0688992e8292e0bda3baf761d19c08fcef2dc4ef` | `GET /1/Board/{id}/deltas` com `ixLastUpdate` antigo → `syncError` ("message missing"). | controlled-replay |
| `ev_55ce98196f89e386e76cafd3dbf98289d74e6c941cd059cb3d1a65dd487a57cc` | `GET /1/Board/{id}/deltas` com o `ixLastUpdate` atual → `{modelIxUpdate:{<id>:605}, messages:[]}`. | controlled-replay |
| `ev_36cdbf0886094af9f357485b6599b380382c0d4227274a54eb1881f69fed6bb4` | `customFieldItems` com valores `date` e `text`, e definições com `display.cardFront`. | controlled-replay |
| `ev_8e18961d60fe7509b94e198eaa97797784929b71f9e5538eecec9e5e7e5565b9` | `analyze_javascript_application` em `app.a86b01e4d521f9aaf4a8.js` (sha256 `86b31e7a8ac149dc…`), resumo em `ev_daa9c1a4366f…`. Os traces `ev_ba122d76…` e `ev_e3ae5103…` não acharam correspondência: o grafo é parcial e o bundle é minificado. | shipped-artifact |
| (estático, sobre bundles de `ev_ebf9d372…`) | Leitura dirigida de `app.a86b01e4…js` (socket, deltas, polling), `board-route.ba85497015df…js` (sha256 `06a8aef17d1bf791…`, cálculo de `pos`), `card-back.ef161dce10bb…js` (`57c9abec57044264…`, pos de checklist/anexo/itens) e `board-list-view.5c287a2e44e7…js` (`b5f708b8f39eedf4…`, pos de lista). | shipped-artifact |

Quadros usados (templates públicos): `FK3MvDhj` (pedidos de marketing, 5 listas, 23 cards, anexos e capas),
`P5pfGKu8` (produção de conteúdo SEO: checklists, campos `text`, 1 comentário), `GDz7Wd53` (campos `number`, `list`,
`text`, `date`; checklists; anexos) e `HlewVP58` (valores de campo `date`).

Os dados brutos ficaram fora da pasta de pesquisa, em `scratchpad/rea-dados-bruto/`. Contêm corpos JSON
decodificados, frames WS e bundles.

---

## 2. Rotas e carga inicial (como o app busca dados)

### 2.1 Abrir quadro `/b/<shortLink>` [OBS `ev_1df922…`, `ev_ebf9d372…`]

Requisições disparadas em paralelo:

| Requisição | Conteúdo |
|---|---|
| `GET /1/board/<shortLink>?fields=…&labels=all&members=all&memberships…&customFields=true&boardPlugins=true&organization=true&myPrefs=true&pluginData=true&operationName=quickload:CurrentBoardInfo` | Metadados do quadro (≈10–13 KB) |
| `GET /1/board/<shortLink>?cards=visible&card_fields=…&card_attachments=true&card_checklists=all&card_checklist_checkItems=none&card_customFieldItems=true&card_pluginData=true&card_stickers=true&lists=open&list_fields=…&operationName=quickload:CurrentBoardListsCards` | Listas abertas + cards visíveis (≈29–78 KB) |
| `POST /gateway/api/graphql` `quickload:TrelloCurrentBoardInfo`, `…ListsCards`, `…BoardMirrorCards`, `…MemberBoards` | Espelho GraphQL dos mesmos dados (ids `ari:`, `position`, labels) |
| `GET /1/board/<id>?boardPlugins=true&plugins=enabled` | Power-ups |
| `GET /1/organization/<id>?…` | Workspace: plano (`offering`), `premiumFeatures` |

Observações:
- Um mesmo quadro é carregado por **REST v1 e GraphQL ao mesmo tempo** [OBS]. Isso indica uma migração gradual para
  GraphQL [INF]. O bundle cita o flag `goo_migrate_card_back_scalar_fields` [EST].
- `cards=visible` e `lists=open` deixam itens arquivados (`closed:true`) fora da carga [OBS].
- `card_checklist_checkItems=none`: a carga do quadro traz checklists sem itens. Ao abrir o card, chega
  `GET /1/checklist/<id>?fields=id,name,pos&checkItems=all&checkItem_fields=id,due,dueReminder,idChecklist,idMember,name,nameData,pos,state`
  [OBS `ev_ebf9d372…`]. O progresso "3/8" da frente do card vem de `badges.checkItems` e `badges.checkItemsChecked`.

### 2.2 Abrir card `/c/<shortLink>` (clique dentro do quadro) [OBS `ev_ebf9d372…`]

- `GET /1/card/<shortLink>?fields=id,nodeId,idBoard&board=true…` resolve o quadro do card.
- `GET /1/card/<shortLink>?fields=<≈45 campos>&attachments=true&attachment_fields=…,previews,…&customFieldItems=true&list=true&pluginData=true&stickers=true`.
- `POST graphql TrelloPreloadCard(shortLink)`: lista, labels, `closed`, `isTemplate`, `aiMetadata`.
- `GET /1/card/<id>?fields=id,address,coordinates,locationName,staticMapUrl` traz a localização separada.
- `GET /1/cards/<id>?fields=id&actions=mergeCards&actions_display=true&action_reactions=true&actions_limit=1` verifica se o card resultou de uma mesclagem.
- `GET /1/checklist/<id>?…checkItems=all` sai uma vez por checklist.
- **Nenhuma assinatura de tempo real nova ao abrir o card.** A assinatura do quadro cobre os cards dele [OBS + INF].
- Comentários e atividade **não carregaram** para o visitante anônimo: o botão "Comentários" não gerou rede
  [OBS `ev_ada4ac1f…`, `ev_b2bac458…`]. A forma de `action` veio pela REST pública (seção 3.8).

---

## 3. Shapes (campos e tipos)

Notação: `id24` = string hex de 24 chars · `ari` = `ari:cloud:trello::…` · `iso` = data ISO-8601 UTC ·
`T|null` = anulável · `[]` = array. Valores de enumeração listados só quando são do sistema (não pessoais).

### 3.1 Board [OBS `ev_1df922…` corpo seq 108; `ev_ebf9d372…`]

```
Board {
  id: id24; nodeId: ari; name: string; desc: string; descData: {emoji:{}}|null
  closed: boolean; shortLink: string(8); shortUrl: string; url: string
  idOrganization: id24; idEnterprise: id24|null; enterpriseOwned: boolean; idMemberCreator: id24|null
  idTags: id24[]; type: null; subscribed: boolean|null
  dateLastActivity: iso; dateLastView: iso|null; datePluginDisable: iso|null
  creationMethod / creationMethodLoadingPhase / creationMethodLoadingStartedAt: null   // criação por IA
  labelNames: { green, yellow, orange, red, purple, blue, sky, lime, pink, black,
                <cor>_dark ×10, <cor>_light ×10 : string }        // 30 cores fixas -> nome
  prefs: {
    permissionLevel: "private"|"org"|"public"(|"enterprise")  // visto: private, org, public
    voting: "disabled"|…; comments: "members"|…; invitations: "members"|…; selfJoin: boolean
    hideVotes, cardCovers, showCompleteStatus, cardCounts, isTemplate, calendarFeedEnabled: boolean
    cardAging: "regular"|…; autoArchive: null|?
    switcherViews: [{viewType:"Board"|"Table"|"Calendar"|"Dashboard"|"Timeline"|"Map", enabled:boolean}]
    background: id24; backgroundColor: string|null; backgroundImage: url|null; backgroundImageScaled: [{width,height,url}]
    backgroundTile: boolean; backgroundBrightness: "dark"|"light"; backgroundTopColor/BottomColor: "#hex"
    backgroundDarkColor/DarkImage: null; sharedSourceUrl: url
    canBePublic, canBeOrg, canBePrivate, canBeEnterprise, canInvite: boolean
    hiddenPluginBoardButtons: []
  }
  limits: { <recurso>: { <escopo>: { status:"ok"|…, disableAt:number, warnAt:number } } }
  powerUps: string[]; premiumFeatures: string[]          // ~40 flags de plano (ex.: "views","listColors","advancedChecklists")
  templateGallery: { language, category, precedence:number, blurb, featured:boolean, byline, avatarUrl, avatarShape,
                     stats:{viewCount:number, copyCount:number} } | null
  labels: Label[]; customFields: CustomField[]; boardPlugins: [{id,idBoard,idPlugin,promotional:boolean}]
  members: Member[]; memberships: Membership[]; myPrefs: {...}; pluginData: PluginData[]
  organization: {...}  // id, nodeId, name, displayName, offering:"trello.business_class"|…, prefs, memberships[], tags[]
}
```

Limites observados (`disableAt`/`warnAt`, com `warnAt` = 80%) [OBS]: listas abertas/quadro 500; cards abertos/lista
5000; cards abertos/quadro 5000; checklists/card 500; itens/checklist 200; campos personalizados/quadro 50; opções/campo
50; labels/quadro 1000; anexos/card 1000; anexos/quadro 36000; stickers/card 70; reações/action 900 (17 únicas).
Esses números servem de **referência de dimensionamento** para nós.

### 3.2 List [OBS seq 110]

```
List { id: id24; nodeId: ari; idBoard: id24; name: string; pos: number; closed: boolean
       color: string|null; softLimit: number|null   // limite WIP "suave" (só aviso)
       type: null|?; datasource: {filter:boolean}; subscribed: boolean|null; creationMethod: null
       limits: { cards: { openPerList, totalPerList } } }
```
`color` e `softLimit` vieram `null` nos quadros vistos. Os tipos e valores possíveis são **[?]**.

### 3.3 Card [OBS seq 110 (carga do quadro), seq 865/1493 (detalhe), `ev_c02e43…` (REST /cards)]

```
Card {
  id: id24; nodeId: ari; idBoard: id24; idList: id24; idShort: number   // nº sequencial por quadro (#2, #175…)
  shortLink: string(8); shortUrl; url                                     // url = /c/<shortLink>/<idShort>-<slug>
  name: string; originalName: string; desc: string (markdown); originalDesc; descData: {emoji:{}}|null
  pos: number; closed: boolean; dateClosed: iso|null; dateLastActivity: iso; dateViewedByCreator: iso|null
  start: iso|null; due: iso|null; dueComplete: boolean; dueReminder: number|null   // minutos antes (visto 1440)
  recurrenceRule: null|?                                                   // cards recorrentes (power-up nativo)
  idLabels: id24[]; labels: Label[] (embutidos, com uses)                  // redundantes de propósito
  idMembers: id24[]; idMembersVoted: id24[]; idMemberCreator: id24|null
  idChecklists: id24[]; checkItemStates: [{idCheckItem, state}]            // só em /cards
  idAttachmentCover: id24|null; manualCoverAttachment: boolean
  cover: { idAttachment: id24|null; color: string|null; idUploadedBackground: id24|null; idPlugin: id24|null
           size: "normal"|"full"?; brightness: "light"|"dark"; yPosition: number; edgeColor; sharedSourceUrl
           scaled: [{id,_id,scaled:boolean,url,bytes,height,width}] }
  badges: { checkItems, checkItemsChecked, comments, attachments, votes, maliciousAttachments: number
            description, dueComplete, location, viewingMemberVoted, subscribed, lastUpdatedByAi: boolean
            due: iso|null; start: iso|null; checkItemsEarliestDue: iso|null; externalSource: null
            attachmentsByType: { trello: { board:number, card:number } }; fogbugz: "" }
  isTemplate: boolean; cardRole: null | "separator"|"link"|"board"|"mirror"(?)   // [EST] literais no bundle
  mirrorSourceId: id24|null; manifest: null; pinned: boolean; email: null
  address / coordinates / locationName / staticMapUrl: null   // "location" (power-up Mapa)
  urlSource / urlSourceText / faviconUrl: null                 // card criado a partir de link
  creationMethod / creationMethodError / creationMethodLoadingStartedAt: null; singleInstrumentationId: null
  agent: null; lastSummaryChangeEventAt: null                  // IA
  limits: { attachments:{perCard}, checklists:{perCard}, stickers:{perCard} }
  attachments: Attachment[]; checklists: Checklist[]; customFieldItems: CustomFieldItem[]
  stickers: Sticker[]; pluginData: PluginData[]
  // detalhe do card: list: {id,nodeId,closed}
}
```
Notas:
- `idLabels` é igual a `labels.map(id)` [OBS]. O card carrega os dois formatos.
- `cover.idAttachment == idAttachmentCover` em 6/6 cards com capa [OBS]. A capa pode ser um anexo, uma cor ou um
  fundo enviado.
- `location` aparece só como `badges.location` e nos campos `address/coordinates/locationName`. Nenhum card visto
  tinha local, então o tipo de `coordinates` é **[?]**.
- O título tem `maxLength` 16384 e a descrição avisa acima de 16384 chars [EST card-back].

### 3.4 Checklist e CheckItem [OBS `ev_c02e43…` checklists-campos; `ev_ebf9d372…` seq 882/1515]

```
Checklist { id: id24; idBoard: id24; idCard: id24; name: string; pos: number; checkItems?: CheckItem[] }
CheckItem { id: id24; idChecklist: id24; name: string; nameData: {emoji}|null; pos: number
            state: "complete"|"incomplete"; due: iso|null; dueReminder: number|null; idMember: id24|null }
```
O item de checklist tem **prazo e responsável próprios** (`due`, `idMember`). Em `/cards`, o card também expõe
`checkItemStates[{idCheckItem,state}]` [OBS].

### 3.5 Label [OBS]

```
Label { id: id24; idBoard: id24; idOrganization?: id24; nodeId?: ari; name: string
        color: string|null   // 10 bases × {"", _dark, _light} = 30; visto: green,yellow,orange,red,purple,blue,lime,pink,black
        uses?: number }       // quantos cards usam
```

### 3.6 CustomField e CustomFieldItem [OBS `ev_c02e43…`, `ev_36cdbf08…`]

```
CustomField { id: id24; idModel: id24 (board); modelType: "board"; name: string; pos: number
              type: "text"|"number"|"date"|"list"|"checkbox"   // vistos: text, number, date, list. checkbox [?]
              display: { cardFront: boolean }                    // aparece na frente do card?
              fieldGroup: string (hash 64 hex); isSuggestedField: boolean
              options?: [{ id: id24; idCustomField: id24; value: {text:string}; color: string ("none"|…); pos: number }] } // só type=list

CustomFieldItem { id: id24; idCustomField: id24; idModel: id24 (card); modelType: "card"
                  value: {text:string} | {date:iso} | {number:string}? | {checked:"true"}? | null
                  idValue: id24|null }   // para type=list aponta para options[].id
```
Os formatos `{text}` e `{date}` foram observados. Os formatos `{number}` e `{checked}` e o uso de `idValue` em listas são
**[INF]**: nenhum card com esses valores foi encontrado nos templates. Na action `updateCustomFieldItem`, `data.old.value`
guarda o valor anterior [OBS].

### 3.7 Attachment [OBS seq 1493]

```
Attachment { id: id24; name: string; fileName: string; url: string; bytes: number; mimeType: string|null
             date: iso; idMember: id24; isUpload: boolean; isMalicious: boolean; edgeColor: string; pos: number
             aiSummary: null; previews: [{id,_id,scaled:boolean,url,bytes,height,width}] }
```
As miniaturas saem de `/1/cards/<idCard>/attachments/<idAtt>/previews/<idPreview>/download/<arquivo>` [OBS].

### 3.8 Action (histórico e comentários) [OBS `ev_c02e43…`: 302 + 152 + 80 actions de quadro e 16 de card]

```
Action { id: id24; type: string; date: iso; idMemberCreator: id24
         memberCreator: MemberMini; member?: MemberMini        // member = alvo (ex.: quem foi adicionado)
         data: { board?: {id,name,shortLink,(prefs),(desc)}, list?: {id,name}, card?: {id,name,idShort,shortLink,(campo alterado)},
                 listBefore?/listAfter?: {id,name}, checklist?, checkItem?: {id,name,state,(textData)},
                 customField?: {id,name,type}, customFieldItem?: {id,value,idCustomField,idModel,modelType},
                 attachment?: {id,name}, organization?, boardSource?, cardSource?, idMember?, idMemberAdded?,
                 memberType?, method?, text? (comentário), old?: {<campo>: <valor anterior>} }
         limits: { reactions: { perAction, uniquePerAction } } | null   // comentários aceitam reações
         appCreator: null; agenticIdentity: null }                       // origem: app/integração ou agente de IA
```
A lista vem ordenada por `date` decrescente [OBS].

**Tipos observados (24):** `createCard`, `updateCard`, `copyCard`, `commentCard`, `addMemberToCard`,
`removeMemberFromCard`, `addChecklistToCard`, `removeChecklistFromCard`, `updateChecklist`,
`updateCheckItemStateOnCard`, `deleteAttachmentFromCard`, `createCustomField`, `updateCustomField`,
`updateCustomFieldItem`, `createList`, `updateList`, `createBoard`, `copyBoard`, `updateBoard`,
`addToOrganizationBoard`, `addMemberToBoard`, `makeAdminOfBoard`, `deactivatedMemberInBoard`,
`reactivatedMemberInBoard`.

Não vistos neste conjunto **[?]**: `addAttachmentToCard`, `deleteCard`, `moveCardToBoard`, `addLabelToCard`,
`convertToCardFromCheckItem` e outros.

`updateCard` codifica o tipo de mudança pela chave em `data.old` [OBS, n=355]. `closed` (159) = arquivar; todas as 159
foram false→true. `idList` (56) = mover de lista e vem com `listBefore`/`listAfter`. `pos` (48) = reordenar. `desc` (37),
`due` (22), `name` (13), `dueReminder` (11), `dueComplete` (7), `cover` (2).

`updateBoard` usa `old.prefs` para mudanças de visibilidade ou template, `old.desc` e `old.name` [OBS].

### 3.9 Member e Membership [OBS seq 108; actions]

```
Member (no quadro) { id; username; fullName; initials; avatarUrl; bio; bioData; confirmed:boolean; activityBlocked:boolean
                     memberType:"normal"|…; nonPublic:{}; nonPublicAvailable:boolean; url; idEnterprise; idPremOrgsAdmin; idMemberReferrer }
MemberMini (em actions) { id; username; fullName; initials; avatarHash; avatarUrl; activityBlocked; nonPublic; nonPublicAvailable }
Membership { id; idMember; memberType: "admin"|"normal"(|"observer"?); unconfirmed:boolean; deactivated:boolean; orgMemberType: string|null }
```
Para visitante anônimo, `/1/member/me` responde com corpo de 13 bytes, ou seja, sem usuário [OBS].

---

## 4. Como o `pos` funciona

**Observado [OBS seq 110, `ev_c02e43…`]:**
- Listas em `FK3MvDhj`: 8192, 20480, 32768, 49152, 114688. Os valores são múltiplos de 4096/16384 com buracos.
- Cards: valores inteiros grandes e espaçados (gaps de 2048 a 9 milhões) e um fracionário (`7056129.183593392`).
- Valores do tipo `2^n − 1` (65535, 1179647, 131071) indicam um algoritmo antigo [INF].
- Em `updateCard` com `old.pos`: `131071 → 32767.5` (subir para o topo divide por 2, gera meio) e `65535 → 131071`.
- Itens de checklist: ≈ n·16384 + ruído (17032, 33763, 50237, 67190…), mais 8516 e 42000 de reordenações.
- Campos personalizados: 16384, 32768, 49152, 65536. Anexos: 16384, 32768. Opções de lista: 16384, 32768, 49152.

**Regra no cliente [EST, `board-route…js`, `board-list-view…js`, `card-back…js`]** (descrição minha, sem copiar código).
O cálculo recebe `anterior`, `próximo` e opcionalmente a posição atual do item:
1. Lista vazia: usa uma constante grande no meio do espaço (2^47). Os limites declarados são 2^47 e 2^48.
2. Sem próximo (soltar no fim): `anterior + 16384`. Se o item já está depois do anterior, mantém o pos atual.
3. Se o pos atual já cai entre anterior e próximo, **não muda nada** (evita escrita).
4. Sem anterior (soltar no topo): `próximo − 16384` se próximo ≥ 32768, senão `próximo / 2`.
5. Buraco ≥ 32768: `anterior + 16384`, ou `próximo − 16384` quando anterior já passou do meio do espaço.
6. Caso geral: `(anterior + próximo) / 2`.

Variações: criar lista no fim usa `último + 16384` e no meio usa a média. Criar item de checklist usa `max(pos) + 16384`
por item. Mover checklist ou anexo usa `ceil(média)` e no fim `+16384`. Colar card na lista usa
`pos do último ou 16384`. "Card relativo" (inserir abaixo de um card) usa a média com o seguinte, ou `+16384`.

**Implicações [INF]:**
- `pos` é `double`. A ordem é só `ORDER BY pos` dentro do pai (`idList`, `idBoard`, `idChecklist`).
- Mover um card grava **uma linha** (o `pos` dele, e o `idList` se mudou de lista). Os vizinhos não são reescritos.
- Após muitas médias, a precisão se esgota (≈50 bisseções no mesmo ponto). O Trello deve renormalizar no servidor
  quando os valores colidem. **[?]** Não observado.
- **Para nós:** manter o passo de 16384 e a média, com renormalização da lista quando `próximo − anterior < 1e-6`.
  Uma alternativa é o fractional indexing com strings (lexorank), que não esgota a precisão.

---

## 5. Tempo real

### 5.1 Canal legado `wss://trello.com/1/Session/socket?clientVersion=build-…` [OBS `ev_1df922…`, `ev_ebf9d372…`]

Sequência observada (só formas):
```
→ {"type":"ping","reqid":0}                          ← {"reqid":0,"result":true}
→ {"type":"subscribe","modelType":"Board","idModel":<id24>,"tags":["clientActions","updates"],"invitationTokens":[],"reqid":1}
← {"reqid":1,"result":605}                           // número = ixLastUpdate atual do quadro
→ {"type":"subscribe","modelType":"Organization","idModel":<id24>,"tags":["allActions","updates"],...,"reqid":2}
← {"reqid":2,"error":"unauthorized"}                 // anônimo não pode assinar workspace privado (num caso: result 1733)
→ {"type":"subscribe","modelType":"Enterprise",...}  ← {"reqid":3,"error":"unauthorized"}
```
- **Assinatura por modelo:** `modelType` ∈ {Board, Organization, Enterprise, e Member para usuário logado [INF]}.
  As `tags` filtram a classe de mensagens: `updates` = mudanças de dados; `clientActions` = actions do quadro;
  `allActions` = actions do workspace [INF pelo nome]. O cliente assina o **quadro**, não o card [OBS].
- **Push [EST app.js]:** mensagem sem `reqid`, com `idModelChannel`, `ixLastUpdateChannel` e
  `notify: { event, typeName, deltas[] }`. O cliente:
  1. guarda `ixLastUpdateChannel` como novo `ixLastUpdate` da assinatura;
  2. dispara `event`. Os eventos tratados são `updateModels` (`deltas` = objetos parciais do tipo `typeName` com `id`)
     e `deleteModels` (`deltas` = `[{id}]`, transformados em `{id, deleted:true}`). O evento local `invalidModel`
     cobre quadro ou organização que ficaram inacessíveis;
  3. mescla cada delta no **cache normalizado por `typeName`+`id`** (o cache GraphQL do app). Há regras de
     relacionamento pai-filho: ao arquivar um card, ele sai das listas `board.cards` e `member.cards`.
  Os `typeName` citados no bundle incluem Board, Card, List, Action, Checklist, CheckItem, CustomField,
  CustomFieldItem, Label, Member, Organization, Attachment, Reaction, PluginData, Sticker, BoardPlugin e
  Notification [EST, contagem de literais].
- **Eco das próprias edições [EST]:** o delta pode trazer `traceId` e `spanId`. O cliente usa esses campos para marcar
  como concluída a própria mutação otimista ("send-message").
- **Timeout de inatividade [EST]:** a cada `updateModels`/`deleteModels` do quadro atual, um timer de 5 min é
  reiniciado. Isso parece "marcar ativo" ou atualizar a visualização [INF].

### 5.2 Ressincronização `GET /1/{Model}/{id}/deltas?ixLastUpdate=N&tags=a,b` [OBS `ev_0b9e5a1b…`, `ev_55ce9819…`; EST]

- Resposta OK: `{ modelIxUpdate: { <id>: number }, messages: string[] }`. Cada item de `messages` é um JSON
  serializado no mesmo formato do push. Visto: `{"modelIxUpdate":{"<id>":605},"messages":[]}`.
- N antigo demais: HTTP 200 com `{ name: "Publisher::QueueError", idModel, syncError: "ixSinceUpdate too low. N message missing for (<id>)" }`.
  Conclusão: o servidor guarda **uma fila limitada de deltas por modelo** e o cliente precisa recarregar o quadro
  quando ela não cobre mais o intervalo. O bundle registra isso como `too_far_behind`.
- O cliente envia os cabeçalhos `X-Trello-Resync: true` e `X-Trello-Client-Version` [EST].

### 5.3 Fallback por polling [EST app.js]

Sem socket ("unhealthy"), o cliente faz polling em lote (`batch`) de `/{Model}/{id}/deltas?...` para todas as
assinaturas, com o cabeçalho `X-Trello-Polling: true`. O intervalo é 5 s × (1 se ativo, 4 se ocioso) × 2^(rate limits
consecutivos), com teto de 60 s. Uma resposta inválida remove a assinatura (`invalidModel`).

### 5.4 Canal GraphQL `wss://trello.com/gateway/api/graphql/subscriptions` [OBS]

```
→ {"type":"connection_init"}            ← {"id":null,"type":"connection_ack","payload":{}}
→ {"id":<uuid>,"type":"subscribe","payload":{"operationName":"TrelloBoardUpdated","variables":{"nodeId":<ari do board>},"query":"subscription …"}}
← {"id":<uuid>,"type":"next","payload":{"data":{"trello":{"onBoardUpdated":{...}}},"extensions":{"tags":["public_updates","card-all"],...}}}
```
- `onBoardUpdated` seleciona (lista de campos, sem copiar a query): `id`, `objectId`, `_deltas`, `closed`, `name`,
  `description.text`, `prefs{background{…}, permissionLevel, comments, voting…}`, `labels{edges{node{id,color,name}}}`,
  `customFields{edges{node{name,type,position,display.cardFront,options{color,position,value.text}}}}`,
  `powerUpData`, `premiumFeatures`, `tags`, `workspace`, `enterprise`. Também seleciona
  `lists{edges{node{cards{edges{node{complete, description.text, due{at,reminder}, startedAt, attachments{…}, aiMetadata}}}}}}`
  e os eventos de remoção `onLabelDeleted{id}`, `onCustomFieldDeleted{id}` e `onMembersAdded{member, membership}`.
- A primeira mensagem `next` chega logo após a assinatura com o estado atual. `_deltas` trazia caminhos como
  `["lists","enterprise","prefs.background.color","prefs.background.darkImage"]`, exatamente os campos que vieram
  `null`. Num quadro em que `enterprise` não era nulo, ele ficou fora de `_deltas` [OBS].
  **[INF]** `_deltas` lista os caminhos que foram "tocados ou zerados" na mensagem, para distinguir "virou null" de
  "não veio".
- Nenhum delta real foi recebido porque não havia ninguém editando os quadros públicos. **[?]** O formato de um
  `next` incremental (ex.: card movido) não foi observado.
- **[INF]** O canal GraphQL cobre só parte dos campos (descrição, due, start, complete, anexos, labels, campos
  personalizados). Movimentos de card (`idList`/`pos`), membros e checklists continuam pelo socket legado.

### 5.5 Tipos GraphQL vistos (`__typename`) [OBS]

`TrelloBoard`, `TrelloList`, `TrelloCard`, `TrelloLabel`, `TrelloCustomField`, `TrelloCustomFieldOption`,
`TrelloBoardPrefs`, `TrelloBoardLimits` (+ `…CardsLimits`, `…ChecklistsLimits` etc.), `TrelloBoardMembershipsConnection`,
`TrelloWorkspace`, `TrelloEnterprise`, `TrelloPowerUp`, `TrelloTemplateGallery*`, `TrelloBoardUpdated`,
`TrelloLabelConnectionUpdated`, `TrelloCustomFieldConnectionUpdated`, `TrelloPlannerEventCardConnection`,
`TrelloMirrorCardConnection` e `PageInfo` (paginação Relay com `edges/node/cursor`).

---

## 6. O que levar para o sistema da Melt (escolhas de design, não observações)

1. **Esquema relacional enxuto** com as mesmas entidades. `pos double` em list/card/checklist/check_item/attachment/
   custom_field/option. `closed` + `date_closed` para arquivar. Nada é apagado no fluxo normal.
2. **Badges desnormalizados no card** (`check_items`, `check_items_checked`, `comments`, `attachments`), mantidos por
   trigger. A tela do quadro sai em 2 consultas, como no quickload deles.
3. **Tabela `action` como fonte do histórico e dos comentários**, no formato `type` + `data` (jsonb com "fotos"
   mínimas) + `old` (jsonb com o valor anterior). O mesmo registro alimenta a atividade do card, os relatórios
   (tempo em cada lista, via `updateCard` com `old.idList`) e as notificações.
4. **Campos personalizados** com os mesmos 5 tipos e `display.cardFront`. O valor fica em `{text|number|date|checked}`
   ou `idValue` para listas. Para a agência: "Cliente" (list), "Tipo de peça" (list), "Data de postagem" (date),
   "Link aprovado" (text).
5. **Tempo real com número de sequência por quadro.** Cada escrita incrementa `board.ix_update` e grava o delta numa
   fila curta (ex.: 24 h). O push leva `{ix, typeName, delta parcial}`. Na reconexão, o cliente pede `/deltas?since=ix`;
   se a fila não cobre o intervalo, recarrega tudo. Usar `traceId` para casar o eco com a atualização otimista.
6. **Checklist com prazo e responsável por item** (o Trello oferece isso como recurso pago), útil para fluxos de
   aprovação de peças.

---

## 7. Lacunas e limites

| Questão | Status |
|---|---|
| Shapes de board/list/card/checklist/checkItem/label/customField/attachment/member | **Respondida** [OBS] |
| Tipos de action | **Parcial**: 24 vistos. Faltam add/remove label, addAttachment, delete/move card etc. |
| Valores `number`/`checkbox`/`list` em customFieldItem | **Parcial**: só `text` e `date` vistos |
| `cardRole`, `list.type`, `list.color`, `softLimit`, `location.coordinates` | **[?]**: tudo nulo nos quadros vistos. `cardRole` só por literais do bundle |
| Formato de um push `updateModels` real (socket legado) | **Parcial**: estrutura lida no bundle [EST], sem push real capturado (ninguém editava) |
| `next` incremental do GraphQL (card movido etc.) | **[?]** só a mensagem inicial foi vista |
| Comentários na UI do card (anônimo) | Botão não carregou nada. Forma de `commentCard` obtida pela REST pública |
| Renormalização de `pos` no servidor | **[?]** não observável sem escrever |
| Retenção exata da fila de deltas | **[?]**: sabemos só que é limitada (`syncError` com N alguns pontos abaixo do atual) |
| Mutações (create/move/update) e payloads de escrita | **Não estudadas**: regra de não escrever. O bundle mostra mutações GraphQL com ids otimistas (`generateOptimisticId`) [EST] |

Limitações das ferramentas: as capturas REA de quadro excederam o limite de resposta MCP (10 MB, por causa dos bundles
JS). A evidência completa foi exportada e lida localmente. O grafo estático do REA (`ev_8e18961d…`) ficou parcial no
bundle minificado e os traces não acharam sementes, por isso o socket foi lido por busca textual dirigida no mesmo
artefato. O Chrome compartilhado estava em pt-BR (rótulos como "OK, entendi"). Os templates públicos são antigos e
copiados, então o histórico de actions reflete a criação e a cópia dos templates, não uso real.
