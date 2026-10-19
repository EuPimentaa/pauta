# Pesquisa: API REST da Windsor.ai (Fase 2, §2 "Resultados")

Feita em 19/10/2026 para orientar a aba "Resultados" do cliente e o resumo do MCP (`docs/FASE2.md` §2). Fontes:
documentação oficial (links no fim), o MCP da Windsor desta conta usado **só para leitura** (`get_connectors`,
`get_options`, `get_fields`, `get_data`) e sondas na API REST **sem chave ou com chave inválida** (para ver o formato
dos erros). A chave real não foi usada nem lida; o que depende dela está em [§10](#10-a-verificar-com-a-chave-real).
Nada foi gravado na Windsor.

Sumário: [1 Recomendação](#1-recomendação) · [2 Conta da Melt](#2-a-conta-da-melt) · [3 Endpoint](#3-endpoint-de-dados) ·
[4 Resposta](#4-formato-da-resposta-medido) · [5 Contas](#5-listar-as-contas-de-cada-conector) ·
[6 Campos](#6-campos-por-conector) · [7 Limites](#7-limites-cota-e-frescor) · [8 Erros](#8-erros) ·
[9 Implementação](#9-como-implementar-no-pauta) · [10 Pendências](#10-a-verificar-com-a-chave-real) ·
[11 Fixtures](#11-fixtures)

---

## 1. Recomendação

1. **Usar a API REST de dados** `GET https://connectors.windsor.ai/{conector}` com `api_key` na query (único modo de
   autenticação aceito), sempre com `date_from`/`date_to` explícitos calculados no servidor em `America/Sao_Paulo`
   (não usar `date_preset`, que é relativo ao dia da Windsor e exclui hoje).
2. **Calcular as razões no Pauta** (CTR, CPC, custo por resultado, ROAS, taxa de engajamento) a partir das somas;
   nunca somar ou fazer média das razões que a Windsor devolve.
3. **Alcance (Meta) e usuários (GA4) não somam entre dias**: pedir o total do período numa chamada sem `date`
   (medido: soma dos dias 79.711 × total deduplicado 56.607 no alcance; 1.228 × 1.066 nos usuários).
4. **Até 8 chamadas por cliente** por atualização (§9.2). Com cache de 3 h, o pior caso fica perto de 1.000
   chamadas/dia, 10% da cota diária (10.000/dia, 600/min).
5. **Lista de contas** pelo endpoint `ds-accounts` com a chave (documentado, a confirmar com a chave real; §5). A
   alternativa medida e completa é o `get_connectors` do MCP da Windsor com a mesma chave. Não use o endpoint de dados
   para listar contas: medido, ele devolve só parte delas.
6. **Segurança:** a chave vai na URL e o erro de chave inválida **ecoa a chave no corpo** (medido). Nunca registrar a
   URL nem o corpo de erro sem trocar a chave por `***`.

## 2. A conta da Melt

- Plano **Basic** (`plan_id: BASIC`, pago). Limites do Basic na página de preços: **3 fontes de dados, 75 contas**,
  usuários ilimitados, sincronização agendada diária (para destinos).
- Em uso: as **3 fontes** (o plano não comporta uma 4ª, como Instagram orgânico, sem trocar de plano) e **42 contas**
  (Meta Ads 16, Google Ads 15, GA4 11), de 75.
- Formato dos ids (é o que vai em `select_accounts` e o que o Pauta guarda na ligação cliente ↔ conta):

| Conector (`{conector}`) | Exemplo de id | Observação |
|---|---|---|
| `facebook` (Meta Ads) | `1000000000000001` | numérico, sem `act_` (a API aceita com ou sem) |
| `google_ads` | `000-000-0001` | com hífens; `123` ≠ `0123` (comparação exata) |
| `googleanalytics4` | `100000001` | id da propriedade |

- Fuso das contas Meta: 13 em `America/Sao_Paulo`, 1 em `Brazil/East` (mesmo fuso) e **2 em `America/Noronha`**
  (UTC−2). Os dias vêm no fuso de cada conta; o Pauta só passa as datas e não converte.
- Moeda: todas em BRL.

## 3. Endpoint de dados

```
GET https://connectors.windsor.ai/{conector}?api_key=<CHAVE>&fields=<f1,f2,...>&date_from=AAAA-MM-DD&date_to=AAAA-MM-DD&select_accounts=<id1,id2>
```

| Parâmetro | Uso |
|---|---|
| `api_key` | obrigatório. **Só na query**: cabeçalho não é aceito (`{"error":"Not authorized"}`) |
| `fields` | obrigatório, separados por vírgula. Os campos de texto viram dimensões; os numéricos são somados pelas dimensões pedidas |
| `date_from` / `date_to` | `AAAA-MM-DD`; sem `date_to`, vale hoje. Sem nenhuma data, os últimos 3 dias (segundo o MCP) |
| `date_preset` | `last_7d`, `last_30d`, `last_90d`, `last_Xd/w/m/y`, `this_month`, `this_year`, `last_year`... Sufixo `T` inclui hoje (`last_7dT`, `this_monthT`). Medido em 19/10: `last_7d` = 12/10 a 18/10 |
| `select_accounts` | ids separados por vírgula, sem espaço. Ids desconhecidos são ignorados em silêncio; se **nenhum** estiver conectado, erro (que lista as contas conectadas: não mostrar ao usuário) |
| `filter` | JSON codificado na URL: `[["campaign","eq","X"]]`, combinável com `"and"`/`"or"` e aninhado. Operadores `eq neq gt gte lt lte contains ncontains null notnull` (o MCP também tem `in`) |
| `options` | JSON codificado na URL, aninhado pelo conector: `options={"facebook":{"attribution_window":"7d_click,1d_view"}}` (artigo de suporte; não testado na REST) |
| `_max_rows` | limite de linhas. **Não há paginação** (`page`, `offset`, `sort` não existem) |
| `_renderer` | `json` (padrão), `csv`, `googlesheets` |
| `refresh_since` / `refresh_interval` | quanto do fim do período é rebuscado na fonte (padrão `3d`) e com que frequência no máximo (padrão `6h`; mínimo `1h` no Standard/Plus, `15min` no Professional; o Basic não é citado) |

Outros endpoints úteis (sem chave funcionam e devolvem o catálogo público):
`GET /list_connectors` → `{"data":["activecampaign",...]}`; `GET /{conector}/fields` → lista de
`{id, name, type, description, table, aggregate_formula?}`; `GET /{conector}/options` → lista de opções do conector.
Há também `/{conector}/actions` (escrita na plataforma): **fora de escopo, nunca chamar**.

Exemplos (com `<CHAVE>` no lugar da chave):

```
https://connectors.windsor.ai/facebook?api_key=<CHAVE>&select_accounts=1000000000000001&date_from=2026-10-12&date_to=2026-10-18&fields=date,campaign_id,campaign,objective,spend,impressions,clicks,link_clicks,actions_lead,actions_onsite_conversion_messaging_conversation_started_7d
https://connectors.windsor.ai/facebook?api_key=<CHAVE>&select_accounts=1000000000000001&date_from=2026-10-12&date_to=2026-10-18&fields=account_id,reach,impressions
https://connectors.windsor.ai/google_ads?api_key=<CHAVE>&select_accounts=000-000-0001&date_from=2026-10-12&date_to=2026-10-18&fields=date,campaign_id,campaign,spend,impressions,clicks,conversions,conversions_value
https://connectors.windsor.ai/googleanalytics4?api_key=<CHAVE>&select_accounts=100000001&date_from=2026-10-12&date_to=2026-10-18&fields=event_name,conversions&filter=%5B%5B%22conversions%22%2C%22gt%22%2C0%5D%5D
```

## 4. Formato da resposta (medido)

- Corpo: `{"data":[{...},...]}`. Sem `meta`, sem total de linhas, sem paginação. (O MCP acrescenta `status` e
  `total_rows`; a REST, segundo a documentação, não.)
- Uma linha por combinação das dimensões pedidas. Ex.: `date` + `campaign_id` → uma linha por dia por campanha.
- Números são números JSON. Valores em **unidades da moeda** (o Google Ads já vem convertido de micros, com até 4
  casas: `35.3388`).
- **Razões vêm como fração com 4 casas**: `ctr: 0.0014` = 0,14%; `engagement_rate: 0.6127` = 61,27%; `cpc: 1.2469`.
- **Ausência ≠ zero:** na linha diária da Meta, ação que não aconteceu vem `null`; no agregado (sem `date`) vem `0`.
  `cost_per_conversion` do Google Ads vem `null` com 0 conversões. Tratar `null` como 0 nas somas.
- **Só aparecem campanhas com entrega** (impressões/gasto) no período; conta parada → `{"data":[]}` (estado "conta sem
  dados", não é erro). Medido: em 30 dias, 9 das 16 contas Meta tiveram gasto.
- **Totais sem `date` são deduplicados pela fonte** (alcance, frequência, usuários): use-os para o KPI do período.
- `objective` agrupado sem `campaign` vira `"MULTIPLE"` quando a conta tem campanhas de objetivos diferentes.
- `date` do GA4 chega `AAAA-MM-DD` (a descrição do campo diz `YYYYMMDD`, mas o medido é ISO).
- Conversões do Google Ads são fracionárias (atribuição baseada em dados): `5.994`, `0.9592`.
- `data_fetched_at` (UTC, sem `Z`) diz quando a Windsor buscou a linha na fonte, mas **desliga a agregação**: não pedir
  junto com os KPIs. Medido: consulta nova (conjunto de campos diferente) busca na hora na Meta.

## 5. Listar as contas de cada conector

| Caminho | Situação |
|---|---|
| `GET https://onboard.windsor.ai/api/common/ds-accounts?datasource={conector}` (+ `&api_key=<CHAVE>`) | Documentado; resposta `[{"datasource","account_name","account_id","status"}]`. A documentação não mostra a chave nesse exemplo. Medido: **sem chave ou com chave inválida devolve `[]` com 200**, então lista vazia não prova nada. Confirmar com a chave real (§10) |
| `GET https://connectors.windsor.ai/{conector}/options?api_key=<CHAVE>` | A documentação diz que traz "listas de contas" entre as opções. Sem chave devolve só as opções do conector. Confirmar |
| MCP da Windsor (`https://mcp.windsor.ai/`, Streamable HTTP, `Authorization: Bearer <CHAVE>`), ferramenta `get_connectors` | **Medido completo**: 16 + 15 + 11 contas com nome. Exige falar JSON-RPC do MCP (inicializar sessão, `tools/call`); é o plano B |
| Endpoint de dados com `fields=account_id,account_name` | **Não usar**: medido incompleto (Meta 8 de 16, Google Ads 11 de 15, GA4 10 de 11; só contas com dados no período) |

A lista muda pouco: guardar por 24 h e ter "Recarregar lista" na tela de contas. Aceitar também digitar um id que
ainda não esteja na lista (validação: a consulta de dados com esse id não pode dar o erro de "nenhuma conta
conectada").

## 6. Campos por conector

Nomes exatos conferidos no `get_fields` e no catálogo `/{conector}/fields`. "Somar" = somar as linhas; "calcular" = o
Pauta calcula das somas.

### Meta Ads (`facebook`)

| KPI do Pauta | Campo | Tipo | Como agregar |
|---|---|---|---|
| data | `date` | DATE | dimensão |
| conta | `account_id`, `account_name`, `account_currency` | TEXT | dimensão |
| campanha | `campaign_id`, `campaign`, `objective` (`campaign_status`, `campaign_effective_status` se precisar) | TEXT | dimensão |
| investimento | `spend` | NUMERIC | somar |
| impressões | `impressions` | NUMERIC | somar |
| alcance | `reach` (e `frequency`) | NUMERIC | **total do período sem `date`**; não somar dias |
| cliques | `clicks` (todos) e `link_clicks` (no link) | NUMERIC | somar |
| CTR | `ctr` existe (fração, `clicks/impressions`) | PERCENT | calcular `clicks / impressions` |
| CPC | `cpc` existe (`spend/clicks`) | NUMERIC | calcular `spend / clicks` |
| leads | `actions_lead` (= `actions_onsite_conversion_lead_grouped` formulário + `actions_offsite_conversion_fb_pixel_lead` pixel; conferido em 6 contas: não somar os três) | NUMERIC | somar |
| conversas (WhatsApp/Direct) | `actions_onsite_conversion_messaging_conversation_started_7d` | NUMERIC | somar |
| custo por lead | `cost_per_action_type_lead` existe | NUMERIC | calcular `spend / leads` |
| compras / valor / ROAS | `actions_omni_purchase`, `action_values_omni_purchase`, `purchase_roas_omni_purchase` | NUMERIC | somar contagem e valor; ROAS = `valor / spend`; mostrar só se valor > 0 |
| visitas à página | `actions_landing_page_view` | NUMERIC | somar (opcional) |

**Não existem** `results`, `cost_per_result`, `result_type`, `inline_link_clicks`: o "Resultado" do Gerenciador de
Anúncios (que muda com o objetivo) não vem pela Windsor. Recomendação para a v1: **Resultados = leads + conversas**,
mostrando os dois separados, e **custo por resultado = investimento / resultados**. Base: em 30 dias, das 9 contas
ativas, 6 tiveram leads, 7 tiveram conversas e só 2 tiveram compra (sem valor). Quem quiser o resultado por objetivo
(`OUTCOME_LEADS` → leads, `OUTCOME_ENGAGEMENT`/mensagens → conversas, `LINK_CLICKS`/`OUTCOME_TRAFFIC` → cliques no
link, `OUTCOME_AWARENESS` → alcance) pode fazer por campanha com `objective`; fica como melhoria.

Atribuição: opção `attribution_window` (padrão `default` = `7d_click,1d_view`) e `use_unified_attribution_setting`.
Medido numa conta com 112 leads em 7 dias: mesmo número com e sem `use_unified_attribution_setting`. Usar o padrão.
Outra opção útil: `include_objects_without_insights` (campanhas sem entrega aparecem com métricas `null`); não usar
nos KPIs.

### Google Ads (`google_ads`)

| KPI do Pauta | Campo | Tipo | Como agregar |
|---|---|---|---|
| data / conta | `date`, `account_id`, `account_name`, `currency` | — | dimensão |
| campanha | `campaign_id`, `campaign`, `advertising_channel_type` (`SEARCH`, `PERFORMANCE_MAX`, `DEMAND_GEN`...), `campaign_status` | TEXT | dimensão |
| investimento | `spend` (= `cost`; já em reais) | NUMERIC | somar |
| impressões / cliques | `impressions`, `clicks` | NUMERIC | somar |
| CTR / CPC | `ctr`, `cpc` (= `average_cpc`) existem | — | calcular |
| conversões | `conversions` (fracionário; `all_conversions` inclui as fora da coluna "Conversões") | NUMERIC | somar |
| valor | `conversions_value` (= `conversion_value`) | NUMERIC | somar |
| custo por conversão | `cost_per_conversion` existe | — | calcular `spend / conversions` |
| ROAS | `roas` (PERCENT, fórmula ×100) e `conversions_value_per_cost` (razão) | — | calcular `valor / spend`; mostrar só se valor > 0 |
| alcance | **não há** equivalente somável (`unique_users` não agrega) | — | mostrar "—" |

### GA4 (`googleanalytics4`)

| KPI do Pauta | Campo | Tipo | Como agregar |
|---|---|---|---|
| data / propriedade | `date`, `account_id`, `account_name` | — | dimensão |
| usuários | `active_users` (o "Usuários" dos relatórios do GA4; `users` é sinônimo), `totalusers`, `newusers` | NUMERIC | **total do período sem `date`**; não somar dias |
| sessões | `sessions` | NUMERIC | somar |
| sessões engajadas | `engaged_sessions` | NUMERIC | somar |
| taxa de engajamento | `engagement_rate` existe (fração) | PERCENT | calcular `engaged_sessions / sessions` |
| duração média | `average_session_duration` (segundos) | NUMERIC | média ponderada por `sessions` |
| visualizações | `screen_page_views` | NUMERIC | somar |
| eventos-chave | `conversions` ("count of key events"; não há `key_events`) | NUMERIC | somar |
| eventos-chave por nome | `event_name` + `conversions` com `filter=[["conversions","gt",0]]` | — | lista (ex.: `click_wpp`, `Lead_chatbot`) |
| canal | `session_default_channel_group`, `session_source_medium` | TEXT | dimensão (opcional) |
| receita | `totalrevenue`, `purchase_revenue` | NUMERIC | somar (opcional) |

## 7. Limites, cota e frescor

- **600 requisições/minuto e 10.000/dia**; acima disso, **429** com cabeçalhos de cota restante e de reinício (os
  nomes não estão documentados: registrar quais vierem na primeira vez).
- Basic: 3 fontes e 75 contas; dados históricos de até 10 anos.
- Frescor: a Windsor rebusca na fonte os últimos `refresh_since` (3 dias) no máximo a cada `refresh_interval` (6 h por
  padrão); dias mais antigos ficam no cache dela, separado por seleção de contas e campos. O "forçar atualização" do
  MCP exige plano com atualização por hora, que o Basic não tem. Consequência: **"Atualizar agora" no Pauta só relê a
  Windsor** e os 3 últimos dias podem ter até ~6 h de atraso (estimativa a partir da documentação; o Basic não é
  citado). Dias fechados há mais de 3 dias não mudam: o cache do Pauta pode durar mais para eles.
- Tempo de resposta: não documentado. As leituras pelo MCP voltaram em poucos segundos; o MCP avisa que consultas
  grandes podem levar de minutos até 1 h. Usar limite de 60 s por chamada.

## 8. Erros

Medidos (chave trocada por `<CHAVE>`):

| Caso | HTTP | Corpo |
|---|---|---|
| chave inválida (dados e `/options`) | 400 | `{"error":"Please check the API key used: <CHAVE>","code":"user_error"}` (**a chave volta no texto**) |
| sem `api_key` | 400 | `{"code":"unauthorized","error":"Not authorized"}` |
| `ds-accounts` sem chave ou com chave inválida | 200 | `[]` |

Documentados: `{"error":{"code","message"}}` com 400 `invalid_request`, 401 `authentication_error`, 403
`permission_denied`, 404 `not_found`, 429 `rate_limit_exceeded`, 500 `server_error`. Alguns endpoints devolvem
`{"error":"<texto>"}` (ex.: `"Linked account not found"`). **O leitor precisa aceitar `error` como texto ou como
objeto.** Nenhuma conta selecionada conectada → erro que lista as contas conectadas.

## 9. Como implementar no Pauta

### 9.1 Cliente HTTP

- Um serviço no servidor (sugestão: `server/src/servicos/windsor.ts`) com a **busca trocável** no mesmo padrão de
  `servicos/drive.ts` (`definirBuscaWindsor`), para os testes usarem as fixtures sem rede.
- Chave só de `config` (`WINDSOR_API_KEY`), montada na URL com `URLSearchParams` na hora da chamada. **Nunca** registrar
  a URL, e trocar a chave por `***` em qualquer texto de erro antes de logar ou devolver (`ErroHttp` com mensagem do
  Pauta, nunca a da Windsor).
- `fetch` com `AbortSignal.timeout(60_000)`, `Accept: application/json`, sem cookies; ler `data` e validar com zod
  (campos numéricos `number | null`).
- Mapear para os estados da tela: sem chave → "sem chave"; nenhuma conta ligada → "sem contas"; 400 `user_error`
  ou `unauthorized` → "chave inválida" (avisar o admin); 429 / 5xx / rede / tempo esgotado → "Windsor fora do ar"
  (mostrar o último cache com a data dele); `data: []` → "conta sem dados no período".

### 9.2 Chamadas por cliente e período

Todas as contas do cliente no mesmo conector vão juntas em `select_accounts`. Período atual A e anterior B (mesmo
número de dias, imediatamente antes; para "mês passado", o mês retrasado), datas calculadas em `America/Sao_Paulo`.

| # | Conector | `fields` | Datas | Para quê |
|---|---|---|---|---|
| 1 | `facebook` | `date,account_id,campaign_id,campaign,objective,spend,impressions,clicks,link_clicks,actions_lead,actions_onsite_conversion_messaging_conversation_started_7d,actions_omni_purchase,action_values_omni_purchase` | início de B → fim de A | série diária, campanhas, somas de A e B |
| 2–3 | `facebook` | `account_id,reach,impressions` | A; depois B | alcance e frequência deduplicados |
| 4 | `google_ads` | `date,account_id,campaign_id,campaign,advertising_channel_type,spend,impressions,clicks,conversions,conversions_value` | início de B → fim de A | tudo do Google Ads |
| 5 | `googleanalytics4` | `date,account_id,sessions,engaged_sessions,average_session_duration,screen_page_views,conversions` | início de B → fim de A | série e somas |
| 6–7 | `googleanalytics4` | `account_id,active_users,newusers` | A; depois B | usuários deduplicados |
| 8 | `googleanalytics4` | `event_name,conversions` + `filter=[["conversions","gt",0]]` | A | eventos-chave por nome |

Conector sem conta ligada não gera chamada. Volume: 90 dias com comparação = 180 dias × campanhas ativas (ex.: 10) =
1.800 linhas, menos de 1 MB; aceitável. Alcance e usuários de várias contas do mesmo cliente são somados entre contas
(aproximação: a sobreposição de pessoas entre contas não é descontada; dizer isso na dica do KPI).

### 9.3 Cálculos

```
ctr = cliques / impressões            cpc = investimento / cliques       cpm = investimento / impressões × 1000
resultados (Meta) = leads + conversas custo por resultado = investimento / resultados
roas = valor / investimento (só com valor > 0)
taxa de engajamento = sessões engajadas / sessões
duração média = Σ(duração × sessões) / Σ sessões
variação = (A − B) / B (B = 0 → "novo"; ambos 0 → "—")
```

Divisão por zero → `null` ("—" na tela). Arredondar só na exibição (BRL com 2 casas; conversões do Google com 1).

### 9.4 Cache

- Chave: cliente + conector + `date_from`/`date_to` (não o nome do período: "este mês" muda de datas a cada dia).
- Validade de 3 h (FASE2), "Atualizar agora" em segundo plano: devolve o cache na hora, busca, grava e avisa pelo SSE
  que o resultado do cliente mudou. Limitar "Atualizar agora" a 1 por cliente a cada poucos minutos.
- Períodos que terminaram há mais de 3 dias podem ficar em cache por 24 h ou mais (a Windsor não os rebusca).
- A lista de contas da Windsor (§5) em cache de 24 h.
- Guardar no cache as linhas já normalizadas (não o corpo bruto) e a hora da busca, para a tela dizer "dados de
  14:05".

### 9.5 Testes

Simular a Windsor com as fixtures (`docs/fase2/fixtures-windsor/`, ou cópias em `server/test/`): somas e razões
recalculadas, alcance/usuários vindos do total (não da soma), `null` como 0, `data: []`, erros 400/429/500 e tempo
esgotado, e que a chave nunca aparece em log, resposta ou mensagem de erro.

## 10. A verificar com a chave real

Antes de codificar, no terminal de quem tem a chave (com `WINDSOR_API_KEY` só no ambiente do shell; nada em arquivo
versionado):

1. `curl -s "https://onboard.windsor.ai/api/common/ds-accounts?datasource=facebook&api_key=$WINDSOR_API_KEY"`:
   devolve as 16 contas? (se sim, é o caminho da lista; se `[]`, tentar o item 2 ou o plano B do MCP)
2. `curl -s "https://connectors.windsor.ai/facebook/options?api_key=$WINDSOR_API_KEY"`: traz a lista de contas?
3. Uma chamada de dados igual à fixture (`meta-diario-campanha.json`) para confirmar que a REST devolve só
   `{"data":[...]}` e o mesmo arredondamento; anotar o tempo de resposta.
4. Cabeçalhos de cota: `curl -sD - -o /dev/null "<uma chamada de dados>"` e anotar os nomes dos cabeçalhos de limite.
5. `options` pela REST: `&options=` + `encodeURIComponent('{"facebook":{"attribution_window":"default"}}')` não dá
   erro.

## 11. Fixtures

Em `docs/fase2/fixtures-windsor/`, no formato da REST (`{"data":[...]}`), lidas pelo MCP em 19/10/2026 (período
12/10 a 18/10). **Anonimizadas:** ids, nomes de conta e de campanha trocados; dinheiro × 0,85, contagens × 1,1 e as
razões recalculadas como a Windsor faz (fração com 4 casas). Os formatos, tipos, `null` e relações entre campos são
os reais.

| Arquivo | O que mostra |
|---|---|
| `meta-diario-campanha.json` | Meta, 1 conta, `date` × campanha (28 linhas): `null` nas ações, `objective`, CTR em fração |
| `meta-total-periodo.json` | Meta, mesmo período sem `date`: alcance deduplicado (menor que a soma dos dias) |
| `meta-conversoes-por-conta-30d.json` | Meta, 9 contas, 30 dias por conta+objetivo: `MULTIPLE`, `0` no agregado, leads = formulário + pixel |
| `google-ads-diario-campanha.json` | Google Ads, 1 conta, `date` × campanha (35 linhas): conversões fracionárias, `cost_per_conversion: null` |
| `ga4-diario.json` | GA4, 1 propriedade, por dia: sessões, usuários, engajamento, eventos-chave |
| `ga4-total-periodo.json` | GA4 sem `date`: usuários deduplicados (menor que a soma dos dias) |
| `ga4-eventos-chave.json` | GA4 `event_name` + `conversions` com filtro `conversions > 0` |
| `contas-ds-accounts.json` | formato **documentado** do `ds-accounts` (não medido; §10) |
| `erros.json` | corpos de erro medidos (chave trocada por `<CHAVE>`) e documentados |

## Fontes

- Documentação da API: <https://windsor.ai/api-documentation/> e <https://windsor.ai/api-information/>
- Preços e limites dos planos: <https://windsor.ai/pricing/> e <https://windsor.ai/pricing/data-sources-and-accounts/>
- Opções da Meta na URL (`options`): <https://support.windsor.ai/portal/en/kb/articles/how-to-fix-attribution-setting-discrepancies-in-facebook-ads-data>
- MCP da Windsor (Bearer com a chave): <https://mcp.windsor.ai/>
- Agendamento e frescor: <https://windsor.ai/documentation/how-to-schedule-automated-reporting-and-data-refreshing/>
- Catálogos públicos: `https://connectors.windsor.ai/{facebook,google_ads,googleanalytics4}/fields` (858, 2.542 e 482
  campos)
