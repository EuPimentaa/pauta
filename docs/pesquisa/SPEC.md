# SPEC: sistema interno de demandas da Melt

Versão 0.2 · 14/10/2026 · autor: product lead. É a revisão da 0.1 com as críticas de operação, produto e engenharia. As críticas descartadas estão na §10.

**Fontes.** Esta especificação se apoia em seis relatórios da mesma pasta: `rea-ui.md`, `rea-bundle.md`, `rea-dados.md`, `trello-melt.md`, `mercado.md` e `marca.md`.

**Regras seguidas.** Estudamos só o comportamento do Trello e do Dmanda. Nenhum código, texto longo, asset ou marca deles foi copiado para cá. Identificadores curtos aparecem só como referência.

**Legendas:**
- ★ marca o que é diferencial frente ao Dmanda.
- Fases:
  - **MVP**: o mínimo para a equipe largar o Trello no dia 1. São cerca de 3 semanas de construção (4 itens M + 6 itens P, §4.1).
  - **v1**: primeiros 2 meses de uso, em ordem de prioridade.
  - **v2**: entra depois de validar o produto.
- Esforço:
  - **P**: até cerca de 1 dia;
  - **M**: 2 a 5 dias;
  - **G**: 1 a 3 semanas.

**O que mudou da 0.1 para a 0.2:**
1. **O MVP encolheu.** Calendário, visões salvas, ações em massa, edição inline, timer, API, etiquetas, Seguir, desdobramento e PIN foram para a v1. O assistente de importação virou um script com uma planilha revisada pelos AMs.
2. **O ciclo da peça fecha também fora do link.** Entram "Registrar retorno do cliente" (Shift+R), "Enviei por fora" e prazo novo em cada rodada.
3. **O fluxo continua único, mas com etapas condicionais por tipo.** Execução interna (auditoria, OP) não passa pelo cliente, e a etapa Agendar entrega a peça aprovada ao Social.
4. **A importação foi corrigida.** Ela não perde o responsável e não traz cards zumbis. O Trello só sai quando o Arquivo estiver importado.
5. **A segurança está definida:**
   - banco fechado ao PostgREST e login com allowlist;
   - link público protegido contra corrida entre versões e toque duplo;
   - sanitização do texto e uploads seguros.
6. **A integridade fica no banco:** tabela de transições, FKs compostas, trilha de auditoria imutável e `seq` sem buracos.
7. **A interface ficou mais leve:**
   - card de 72 a 88 px;
   - visões das equipes agrupadas por responsável;
   - cor com significado no topo das colunas;
   - atalhos que não brigam com o navegador.

---

## 1. Visão e nome

1. É um quadro tão rápido quanto o Trello, mas cada card é uma **demanda de agência**: tem cliente, tipo de peça, briefing, versões, rodadas e aprovação.
2. A demanda **passa pelas equipes em etapas, sem mudar de quadro**. Ela mostra sempre **com quem está a bola** e há quanto tempo.
3. O **cliente aprova por link, sem login**. Quando ele responde pelo WhatsApp, o AM registra o retorno em um passo. Toda decisão fica registrada, e cada pedido de ajuste conta como uma rodada, com prazo próprio.
4. **Cada pessoa tem o seu login.**
   - A tela "Minha semana" substitui os cards-cabeçalho SEGUNDA…SEXTA.
   - O atendimento vê a própria carteira sem precisar de planilha paralela.
5. **O sistema roda em Postgres, com os arquivos guardados fora do banco.**
   - No dia 0 importamos os cards ativos do Trello.
   - Na v1 entram a API para os agentes e um servidor MCP para o Claude.
   - O Dmanda, um Trello genérico em SQLite, não faz nada disso.

**Nome provisório.** A decisão é sua. Neste documento uso "Pauta".

| Nome | Por quê |
|---|---|
| **Pauta** | A agência já usa a palavra ("FURA PAUTA"). É curta, soa natural ("está na pauta?") e a URL fica fácil (`pauta.melt…`). |
| **Esteira** | Diz o essencial do produto: a demanda corre por etapas e não salta de quadro em quadro. |
| **Rodada** | Põe o maior diferencial (versões e aprovação) no próprio nome. |

---

## 2. Perfis de uso e fluxo real

### 2.1 Fluxo de hoje (medido no Trello da Melt, `trello-melt.md`)

```
Cliente (WhatsApp/reunião) ─► ATENDIMENTO escreve o briefing ("Atendimento: Pri", "Ei, Sebastião!", links, prazo 18h, etiqueta)
   └─► cria o card NO QUADRO da equipe (lista DEMANDAS ou direto na lista da pessoa)
        CRIAÇÃO/SOCIAL: o card fica sob o cabeçalho do dia (SEG…SEX)  ·  WEB: "Tempo gasto" em comentário; o Wesley confere
        TRÁFEGO: um agente cria "[OP]" na lista PEDRO (que aprova) → ARTHUR/GABRIEL → LIXO
        SOCIAL ⇄ CRIAÇÃO: o Social pede a peça; a Criação entrega com a etiqueta ENVIAR PARA SOCIAL E ATENDIMENTO
        PRODUÇÃO: orçamento → fornecedor → autorização → produção → entregue/desistência
   └─► entrega = comentário "[V2]" + caminho M:\…\CLIENTES\<X>\…\SAÍDA + link do Drive; marca concluído e volta ao ATENDIMENTO
        └─► "<AM> - FINALIZADAS" → o AM apresenta ao cliente (quase sempre pelo WhatsApp)
             ├─ ajuste: desmarca concluído, cola os pedidos como checklist (até 13 itens), etiqueta ALTERAÇÃO, prazo novo ↺
             ├─ esperando: "<AM> - AGUARDANDO"
             └─ aprovado: fica semanas parado → faxina em lote → CEMITÉRIO (uma lista por cliente)
```

| Número que guia o produto | Valor |
|---|---|
| Da Criação de volta ao Atendimento | mediana de 2,2 dias (p80 de 5) |
| Do Atendimento de volta à Criação com ajuste | mediana de 23 h (p80 de 40 h) |
| Do Social de volta ao Atendimento | mediana de 6,7 dias |
| Demandas de Criação que voltaram 2 vezes ou mais | 18% |
| Prazo pedido | mediana de 2,7 dias após a criação; 66% marcados às 18:00 |
| Demandas novas | 5 a 20 por dia útil (200 a 300 por mês) |
| Demandas realmente em andamento | cerca de 190 |
| Cards parados no ATENDIMENTO | 259 de 350 sem atividade há mais de 30 dias (LEONARDO - FINALIZADOS tem 152) |
| Contas e pessoas | 9 contas para cerca de 21 pessoas |
| Etiquetas | cerca de 500 objetos para uns 60 conceitos |
| @menções | 0 |
| Uploads no Trello | 359 links; até cerca de 34 MB por card |

### 2.2 Perfis

| Perfil | Hoje | Dor principal | Tela principal no Pauta |
|---|---|---|---|
| **Atendimento (AM)**, cerca de 7 | escreve o briefing, despacha, apresenta ao cliente pelo WhatsApp, abre ajustes; opera a produção gráfica | planilhas paralelas, pedido chegando pelo WhatsApp, nenhum contador de rodadas | **Início**, Nova demanda com "Colar do WhatsApp", Registrar retorno, visão "Meus clientes" |
| **Criação** (design e audiovisual), 5 | pega o card em DEMANDAS e leva para a própria lista, sob o cabeçalho do dia | sem agenda; o ajuste chega sem histórico | **Minha semana** (rota inicial), visão Criação por responsável, "Entregar versão" |
| **Social**, 2 | grids e relatórios; pede peças à Criação e agenda posts | a ida e volta leva 6,7 dias | Minha semana e a etapa **Agendar**, que recebe as peças aprovadas dos seus clientes |
| **Web**, 4 | sites, SEO e auditorias de agente; "Tempo gasto" em comentário; o Wesley confere | SLA e horas escritos em texto | visão Web; Revisão com o Wesley; lançar tempo |
| **Tráfego**, 3 + agente | o agente cria "[OP]"; o Pedro aprova antes de executar | aprovar é mover o card de lista | Triagem com o Pedro como aprovador; API na v1 |
| **Produção gráfica** (operada pelo AM) | mini-ERP com cerca de 40 etiquetas | 799 de 998 cards parados há mais de 1 ano | continua no Trello até a v1 |
| **Gestão** (Edson, admin) | demandas estratégicas, faxina do Cemitério, cadastro de clientes | não sabe "quem fez" nem "quanto cada cliente consome" | visão Geral, Clientes, Configurações; relatórios na v1 |
| **Agentes** | escrevem com contas de departamento | não há rascunho com aprovação | token de serviço que cria na Triagem (v1) |
| **Cliente** (externo) | aprova pelo WhatsApp | "qual versão foi aprovada?" | página de aprovação por link, sem conta |

### 2.3 Fluxo no Pauta

Uma demanda só, com número fixo (#4521). Ela anda pelas etapas e não muda de quadro.

```
Triagem ─► Na fila ─► Em produção ─► Revisão ─► Com o cliente ─► Aprovado ─► Agendar ─► Entregue ─► (arquivada: manual no MVP, 14 dias na v1)
 com quem:  equipe     responsável    aprovador  CLIENTE (o SLA    AM         social do
                          ▲           ou AM      pausa)                       cliente
                          │               │            │
                          └── Ajustes ◄───┴────────────┘   rodada N+1: itens do retorno + prazo novo + motivo
Etapas condicionais (pelo tipo de peça):
  Com o cliente e Aprovado → só se tipo.aprovacao_cliente  (auditoria, OP, peça interna: Revisão → Entregue)
  Agendar                  → só se tipo.publicacao         (post, carrossel, reels, stories)
Bloqueio (em qualquer etapa): aguardando cliente | interno | fornecedor → a bola muda e o card mostra o motivo
```

**Regras:**
- **Categorias fixas.** Cada etapa tem uma categoria: `triagem`, `fila`, `producao`, `revisao`, `cliente`, `ajuste`, `aprovado`, `publicacao`, `concluido` ou `cancelado`. As regras (bola, pausa do SLA, rodadas, transições) dependem da categoria, não do nome. A coluna `etapa.aplica_se` esconde as etapas que não valem para o tipo. Arrastar, `,`/`.` e a API passam pela mesma função `mover()` (§6.3).
- **Com quem está a bola:**
  - em fila, produção, ajuste e agendar, com o responsável;
  - em triagem, revisão e aprovado, com o aprovador. O aprovador padrão é o da equipe (Wesley no Web, Pedro no Tráfego); quando a equipe não tem um, é o AM da demanda;
  - em "com o cliente", com o cliente;
  - quando há bloqueio, ele decide a bola.

  Se a pessoa estiver ausente, o substituto dela recebe a bola e as notificações (§5.5).
- **"Entregar versão" leva sempre para Revisão.**
  - Se o tipo passa pelo cliente e a bola está com o AM, o card mostra "pronta para enviar".
  - Se o tipo não passa pelo cliente, o aprovador conclui (Entregue) ou devolve para Ajustes, o que abre uma rodada interna.
- **Só o atendimento leva a peça ao cliente.** O diálogo "Enviar ao cliente" gera o link ou registra "Enviei por fora".
- **Retorno do cliente.** Chega pelo link ou é lançado pelo AM em "Registrar retorno" (Shift+R).
  - **Ajuste:** abre a rodada N+1 com prazo novo, cujo padrão é hoje + `tipo.sla_ajuste_dias_uteis`. Também cria o checklist "Ajustes R{N+1}", com uma linha do retorno por item, e avisa o responsável e o AM.
  - **Aprovado:** vai para Agendar, com responsável = social do cliente, quando o tipo tem publicação. Nos outros casos, vai para Aprovado.
- **Prazos.**
  - Prazo interno = publicação − folga, em dias úteis. Sem data de publicação, é a criação + SLA.
  - O SLA só gera o aviso "prazo curto".
  - Cada rodada tem prazo próprio, e o "no prazo" é medido por rodada.
- **"Parado há X dias".** Conta em dias úteis desde a última troca de etapa (`status_desde`). Fica em destaque acima de 2 dias úteis.

---

## 3. Trello (REA) x Dmanda x Nosso

Como ler as colunas:
- **Trello:** o que o REA viu, com o Evidence ID resumido (os IDs completos estão nos relatórios `rea-*.md`). Abreviações: OBS = observado em execução; i18n = string no pacote de idioma pt-BR; DER = derivado do bundle; INF = inferência.
- **Dmanda:** o que diz a página de venda (`mercado.md` §2). Não usamos o produto em si.

| # | Funcionalidade | Trello (REA) | Dmanda (landing) | Nosso | Fase |
|---|---|---|---|---|---|
| 1 | Quadro kanban com DnD | listas e cards com `pos` float; Pragmatic DnD (INF) · `ev_fee07920`, `ev_c02e4327`, `ev_dd09e2f7` | sim, com colunas coloridas | colunas = etapas, pessoas ou clientes; ordem calculada no servidor; faixa de cor por categoria | MVP |
| 2 | ★ Agrupar por responsável ("pessoa = lista") | não existe: a lista é manual (é o hábito da Melt, `trello-melt.md`) | não | padrão das visões das equipes; arrastar entre pessoas reatribui (AM e admin) | MVP |
| 3 | Contador e limite WIP | "2 / 10" na lista (OBS `ev_127484b1`); `softLimit` nulo (OBS `ev_1df922bc`) | não citado | contador no MVP; limite por etapa e pessoa junto com a capacidade | MVP/v1 |
| 4 | Recolher colunas (`\`, Shift+`\`), estado salvo | OBS `ev_989ab06e`, `ev_a11c354f`; localStorage `collapsed-lists` `ev_557d195b` | não citado | igual, com colunas recolhidas por padrão em cada visão | MVP |
| 5 | Frente do card com badges | descrição, anexos, checklist x/y, prazo com estado (OBS `ev_fee07920`, `ev_736f1ab4`, `ev_18e9ae4e`); badges desnormalizados (OBS `ev_1df922bc`) | "card rico" | cliente, tipo, prazo e **no máximo 1 sinal** (atraso, parado, rodada extra…); de 72 a 88 px | MVP |
| 6 | Etiquetas | 30 cores; nomes aparecem e somem (`;`) · OBS `ev_557d195b`, i18n `ev_c7decd4c` | sim | **não existem**: cada conceito que era etiqueta virou campo | — |
| 7 | Verso do card com URL própria | `/c/<shortLink>` por cima do quadro · OBS `ev_9b98b3d2` | sim | `/d/<número>` por cima da visão; ←/→ abre o card vizinho | MVP |
| 8 | ★ Descrição e briefing | Markdown com editor ProseMirror (INF `ev_dd09e2f7`, `ev_57279d06`) | descrição | **campos por tipo de peça** (até 3 obrigatórios, com ajuda) + Markdown | MVP |
| 9 | Checklist | % e barra (OBS `ev_9b64d025`); item com responsável e prazo é **pago** (`advancedChecklists`, OBS `ev_218e5619`) | sim, com progresso | checklist de ajustes por rodada (MVP); item com responsável e prazo, sem custo (v1) | MVP/v1 |
| 10 | Anexos e visualizador | lista, prévia, baixar, anterior/próximo · OBS `ev_9b98b3d2`, `ev_0da551f2` | sim | link do Drive com teste de acesso público, caminho de rede `M:\` e arquivo de até 10 MB (MVP); até 200 MB e miniaturas (v1) | MVP/v1 |
| 11 | Comentários com @menção | i18n `ev_c7decd4c`; não carregaram para visitante anônimo (OBS `ev_ada4ac1f`) | sim | @ validada no servidor + interruptor "visível ao cliente" | MVP |
| 12 | Histórico | `action` = tipo + `data` + `old` · OBS `ev_c02e4327` | não citado | atividade tipada + histórico de etapa, bola e responsável | MVP |
| 13 | ★ Datas | início, entrega, lembrete, recorrência (i18n `ev_c7decd4c`; `recurrenceRule` DER) | início e prazo | **prazo interno calculado + data de publicação + prazo por rodada + horário marcado** (gravação, reunião) | MVP |
| 14 | Prioridade | não é nativa (no uso da Melt, vira etiqueta) | 4 níveis | 3 níveis (normal, urgente, fura-pauta); os dois últimos **exigem motivo** | MVP |
| 15 | ★ Cliente | não existe | campo "Cliente" | **cadastro próprio**: sigla, apelidos, AM, social, criativo, contatos que aprovam, pasta de saída | MVP |
| 16 | Campos personalizados | 5 tipos + `cardFront` · OBS `ev_36cdbf08` | não | campos por tipo de peça | MVP |
| 17 | Filtro | palavra, membro, prazo, etiqueta, atividade; vai para a URL e é guardado (OBS `ev_7dca7913`, `ev_557d195b`, `ev_09eb00e8`) | "Só as minhas" | filtros na URL + 6 visões da agência (MVP); salvar visão própria (v1) | MVP/v1 |
| 18 | Visões Tabela, Calendário, Painel, Cronograma e Mapa | **pagas**; sem login dão "Página não encontrada" (OBS `ev_ac022f49`, `ev_b1517f56`; upgrade em i18n `ev_c7decd4c`) | lista e calendário | Quadro, Lista e Semana (MVP); calendário editorial e Painel (v1); tudo **sem paywall** | MVP/v1 |
| 19 | Busca e paleta de comandos | `/` e B (OBS `ev_4129a633`) | Cmd+K | Cmd+K com busca e ações | MVP |
| 20 | ★ Criação rápida | colar linhas cria até 100 cards (i18n `ev_c7decd4c`) | Enter | `HE:` e `@rafa` com prévia ao vivo (MVP); `#tipo`, `^data` e `!!` (v1); "Colar do WhatsApp" no formulário | MVP/v1 |
| 21 | Atalhos de teclado | cerca de 36 atalhos, `?` abre a lista (OBS `ev_4129a633`, `ev_b8c66c49`) | não citado | cerca de 15 no MVP, sem conflito com o navegador; o conjunto completo na v1 | MVP/v1 |
| 22 | Tempo real | 2 WebSockets; assinatura por modelo; `ixLastUpdate`; `/deltas` (OBS `ev_218e5619`, `ev_1df922bc`, `ev_55ce9819`, `ev_0b9e5a1b`) | sim | SSE com `seq` **sem buracos** e `Last-Event-ID`; ressincronização por `/api/sync` | MVP |
| 23 | Interface otimista e desfazer | `optimisticResponse` em cerca de 120 pontos; desfazer, refazer e repetir (DER `ev_203b7d70`) | não citado | otimista + "Desfazer" no aviso (MVP); Z / Shift+Z (v1) | MVP/v1 |
| 24 | Offline | não tem (sem service worker; OBS `ev_e684e518`) | não citado | fila curta de gravações pendentes | v1 |
| 25 | Notificações | `notificationGroups` (DER) | sim | sino, só para quem está com a bola + menção + decisão do cliente (MVP); Web Push em 3 casos (v1) | MVP/v1 |
| 26 | ★ Início e agenda pessoal | Q = meus cartões; `upNext` (DER) | Início + agenda geral | Início com **Hoje**, "Com você" e "Fila sem responsável" + **Minha semana** | MVP |
| 27 | Tema claro e escuro | `global-theme` (OBS `ev_557d195b`) | sim, com vidro fosco | tokens da marca; vidro calculado para passar no AA | MVP |
| 28 | ★ Celular | layout fixo com rolagem horizontal a 390 px (OBS `ev_73623db2`) | sim | telas de uma coluna para as tarefas do AM e do cliente; quadro como lista com chips (MVP); PWA com "Compartilhar → Pauta" (v1) | MVP/v1 |
| 29 | ★ Arquivo | itens arquivados com busca (OBS `ev_989ab06e`) | não citado | Arquivo por cliente e mês (o fim do Cemitério manual) | MVP/v1 |
| 30 | Exportação | JSON, CSV e ZIP (i18n `ev_c7decd4c`); CSV é pago (`csvExport`, OBS `ev_218e5619`) | não citado | CSV de qualquer visão | v1 |
| 31 | Automação | Butler: 5 tipos, cerca de 700 tokens (DER `ev_cf09c4c1`) | não | regras do ciclo embutidas (MVP) + 3 automações por interruptor (v1) | MVP/v1 |
| 32 | Modelos | card-template (OBS `ev_127484b1`) | não | o tipo de peça é o modelo; "Repetir para outra data" | MVP |
| 33 | ★ **Aprovação do cliente sem login** | não existe; o quadro público é só leitura (OBS `ev_989ab06e`) | não | link por demanda (MVP), lote do mês (v1) | MVP |
| 34 | ★ **Versões e rodadas** | não existe | não | V1…Vn, "Rodada 2 de 2" com prazo e motivo, marcar como extra | MVP |
| 35 | ★ **Trilha de aprovação** | não existe | não | quem aprovou, qual versão, quando, por qual meio (link, WhatsApp com print) | MVP |
| 36 | ★ **Triagem** | o template de entrada usa Forms + Zapier + Butler (OBS `ev_127484b1`, `ev_18e9ae4e`) | não | só para o que chega incompleto + rascunhos de agente para aprovar | MVP |
| 37 | ★ Copiar para WhatsApp | não | não | mensagem pronta com link e prazo; lembrete com o mesmo link | MVP |
| 38 | Cronômetro e horas | campos de power-up (OBS `ev_127484b1`) | cronômetro no card | lançar tempo (MVP); timer de 1 clique e relatório por cliente (v1) | MVP/v1 |
| 39 | ★ Capacidade da equipe | não | não | estimado contra disponível por pessoa e dia | v1 |
| 40 | ★ Pacote mensal e recorrência | `recurrenceRule` (DER) | não | pacote do cliente que gera as demandas do mês | v1 |
| 41 | ★ Relatório do cliente | Painel com `history/cardsPer*` (DER; pago) | não | contratado x entregue, rodadas, tempo com o cliente, horas | v1 |
| 42 | ★ API e MCP | REST `/1` + GraphQL (DER); 0 ferramentas WebMCP (OBS `ev_6f4acb88`) | não | token de serviço e servidor MCP | v1 |
| 43 | ★ Importação do Trello | exporta JSON (OBS `ev_703af865`; i18n `ev_c7decd4c`) | não | script idempotente + planilha revisada pelos AMs | MVP |
| 44 | ★ Papéis | 4 níveis de visibilidade (OBS `ev_7dca7913`); comentários com 5 níveis (i18n) | não | 4 papéis + aprovador por equipe + cliente por token | MVP |
| 45 | Feed de calendário | `calendarKey` iCal (DER) | não | iCal por pessoa | v1 |
| 46 | ★ Infraestrutura | n/a | SQLite "na Vercel" (não persiste) | Postgres fechado + storage privado + backup diário | MVP |
| 47 | ★ Passagem para o Social | não (a Melt usa a etiqueta ENVIAR PARA SOCIAL) | não | etapa Agendar com o social do cliente | MVP |
| 48 | ★ Mural da equipe | listas de avisos (uso da Melt) | não citado | mural por equipe, fora das demandas | MVP |
| 49 | ★ Ausência com substituto | não | não | a bola e os avisos vão para o substituto, com o selo "cobrindo" | MVP |
| 50 | Comentário marcado na imagem e no tempo do vídeo | não | não | pino na imagem e marca de tempo no vídeo; V1 x V2 | v2 |
| 51 | Portal do cliente | não | não | login por link mágico, pedidos e calendário | v2 |
| 52 | IA | Atlassian Intelligence (pago, DER) | "feito com IA", mas a IA não opera o sistema | Claude via MCP: briefing, resumo, atas → demandas | v1/v2 |

**Por que ficamos melhores que o Dmanda:**
1. **Modelamos a agência, não um kanban genérico.** Cliente, tipo de peça com campos, prazo interno calculado pela publicação e etapas que mudam conforme o tipo (linhas 8, 13, 15 e 47).
2. **Fechamos o ciclo da peça:** versão, envio, aprovação sem login ou registro do "ok" do WhatsApp, rodada com prazo próprio, extra e trilha (linhas 33 a 35). Essa é a lacuna nº 1 do mercado.
3. **Com quem está a bola e há quanto tempo,** com o SLA que pausa enquanto a peça está com o cliente e o substituto que assume nas férias. A métrica fica justa e defende a agência.
4. **Respeitamos os hábitos da equipe e os organizamos em dados:**
   - "pessoa = lista" virou "Agrupar por responsável";
   - SEG…SEX virou "Minha semana";
   - o WhatsApp virou "Colar do WhatsApp", "Registrar retorno" e "Copiar para WhatsApp";
   - a pasta `M:\…\SAÍDA` virou um campo com o botão Copiar.
5. **Trazemos a operação real no dia 0:** ~190 demandas ativas com responsável, AM e tempo parado corretos, além do mural e da tabela de apelidos (369 grafias para cerca de 100 clientes).
6. **Os agentes e o Claude operam o sistema** (API e MCP na v1). O Dmanda é feito com IA, mas a IA não consegue operá-lo.
7. **A infraestrutura é segura de verdade:**
   - Postgres persistente, fechado ao acesso direto;
   - arquivos privados e trilha de auditoria imutável;
   - link público protegido contra corrida entre versões e força bruta;
   - nenhuma senha em card.

---

## 4. Escopo

### 4.1 MVP: o mínimo para largar o Trello no dia 1

| Área | Inclui | Esforço |
|---|---|---|
| Acesso e pessoas | login Google com allowlist (§7.2); sessão por cookie; papéis admin, atendimento e executor; ausência com substituto; tema claro/escuro | P |
| Cadastros | seed do dia 0 + telas simples para clientes (AM, social, criativo, contatos que aprovam, pasta de saída, links), pessoas, tipos de peça (até 3 obrigatórios, SLA, SLA de ajuste, aprovação do cliente, publicação, horário) e feriados; fluxo fixo por seed | P |
| Demanda | formulário com "Colar do WhatsApp"; criação rápida (`HE:`, `@pessoa`, prévia); briefing por tipo; prazo calculado; horário marcado; checklist; comentários com @; histórico; anexos (link do Drive testado, caminho de rede, arquivo até 10 MB); lançar tempo; "Repetir para outra data" | M |
| Ciclo da peça ★ | entregar versão; enviar ao cliente (link ou "enviei por fora"); página `/a/:token`; "Registrar retorno" e "Aprovado pelo WhatsApp"; rodadas com prazo e motivo; extra; trilha; Copiar para WhatsApp; Agendar para o Social | M |
| Quadro, Lista e Semana | um componente de quadro com agrupamento por etapa, responsável, cliente ou dia; 6 visões semeadas; filtros na URL; colunas recolhidas por visão; Lista ordenável só para leitura; Minha semana sem barra de carga | M |
| Início, Triagem e sino | Início (Hoje, Com você, Fila sem responsável, Com o cliente há mais de 2 dias, Atrasadas); Triagem; notificações no app; Cmd+K | P |
| Tempo real | SSE com `seq` sem buracos; interface otimista; "Desfazer" no aviso | P |
| Importação | script + planilha revisada pelos AMs (§7.4); idempotente | M |
| Mural e Arquivo | mural por equipe; arquivar, restaurar e buscar por cliente e mês | P |
| Segurança | §7.2: banco fechado, sanitização, CSP, uploads e link público | P |

**Fica de fora do MVP, de propósito** (está na v1):
- Calendário, visões salvas pessoais, edição inline e ações em massa;
- timer, API e agentes, upload grande e miniaturas;
- etiquetas, Seguir, desdobramento, colaboradores, checklist com responsável e prazo;
- PIN e valor da rodada extra;
- capacidade e limite WIP, pacote e recorrência, relatórios, automações e servidor MCP;
- fluxo de produção gráfica.

As tabelas do MVP não mudam de forma na v1. A v1 só acrescenta colunas e tabelas.

### 4.2 v1 (primeiros 2 meses, nesta ordem)

| Item | Esforço |
|---|---|
| **API** com token de serviço (`pauta_sk_…`, 60 requisições por minuto, sempre cria na Triagem). O Tráfego e as auditorias de agente do Web entram nesta etapa (semana 1–2). | P |
| **Saída do Trello:** download dos uploads para o storage (script do admin), importação do histórico como Arquivo (CEMITÉRIO, LIXO e FINALIZADAS antigas, cerca de 3.800 cards) e conferência das contagens (§4.6) | M |
| **Upload** de até 200 MB (resumível), vídeo e miniaturas | M |
| **Calendário editorial** (Prazo \| Publicação, semana começa na segunda) + **aprovação em lote** do mês num link | M |
| **Lista completa:** colunas configuráveis, edição inline, ações em massa, CSV; visões salvas pessoais | M |
| **Horas:** timer de 1 clique, horas por cliente x fee, lembrete no fim do dia | M |
| **Capacidade:** carga na Minha semana (estimativa do tipo como reserva, "~"), grade da equipe, limite WIP | G |
| **Pacote mensal** ("12 posts, 8 stories") com "gerar mês" e **recorrência** (RRULE) | M |
| **Celular:** PWA com `share_target` (WhatsApp → "Compartilhar → Pauta" cai na Triagem); folha de ações no toque longo; Web Push opcional em 3 casos (cliente aprovou, cliente pediu ajuste, demanda atribuída) | M |
| **Atalhos completos** (Z/Shift+Z e o resto); marcadores `#tipo`, `!!`, `^data` com parser de datas em pt-BR; fila offline curta | M |
| **3 automações por interruptor:** lembrete após 48 h com o texto para WhatsApp; checklist da etapa completo avança a etapa; arquivar 14 dias depois de Entregue | P |
| **Relatório mensal do cliente** + selo "em risco" de SLA | M |
| **Servidor MCP** (criar na triagem, atrasadas, resumo do cliente, registrar retorno, gerar mês) | M |
| **Fluxo de produção gráfica** (orçamento → fornecedor → prova → OP → produção → NF/frete → entregue) e projeto ANTARES | M |
| Desdobramento (demanda-mãe), colaboradores, checklist com responsável e prazo, PIN do link, valor da extra, iCal, resumo diário, presença | P cada |

### 4.3 v2

- Pino na imagem e comentário preso ao tempo do vídeo, com comparação V1 x V2. É crítico para a Melt, que trabalha com vídeo.
- Prévia do post como vai aparecer no feed.
- Portal do cliente.
- Plano com marcos e responsabilidade compartilhada com o cliente (ANTARES completo).
- IA no briefing via Claude.
- WhatsApp oficial e e-mail de entrada.
- Redistribuição automática de tarefas.

### 4.4 Não-objetivos

Financeiro, CRM, propostas e notas fiscais (o CSV basta). Power-ups. Construtor genérico de regras. Mapa, adesivos, votos e capas do Unsplash. Vários workspaces. Um quadro por cliente.

### 4.5 Base técnica

| Camada | Escolha | Por quê |
|---|---|---|
| Banco | **Postgres gerenciado** (Supabase, que já está conectado), no schema `pauta`, fechado ao PostgREST (§7.2) | persiste, tem backup e PITR; o volume é pequeno (cerca de 4 mil cards e 300 por mês) |
| Arquivos | bucket **privado** no Supabase Storage (acesso S3 com chave própria); a entrega final continua no Drive e na rede `M:\` | arquivo nunca entra no banco nem é servido pelo domínio do app |
| Servidor | Node 24 + TypeScript, **processo persistente** (Railway, Fly ou VPS) | é requisito: o SSE e o `LISTEN` precisam de conexão longa. Serverless está fora |
| Login | OIDC do Google feito pelo próprio Node (código + PKCE) | sem chave do Supabase no navegador |
| Front | React SPA (Vite); Pragmatic drag-and-drop (a mesma família do Trello, INF `ev_dd09e2f7`); Tiptap com Markdown e HTML desligado; markdown-it + DOMPurify; `cmdk`; lista virtualizada | velocidade com interface otimista e texto seguro |
| Tempo | fuso America/Sao_Paulo; **a semana começa na segunda** em todas as telas | o calendário e a semana falam a mesma língua |

**Metas de desempenho:**
- quadro com 500 cards em menos de 1 s;
- abrir uma demanda em menos de 100 ms a partir do cache (os detalhes chegam depois; o iframe do Drive só abre no clique);
- mover um card sem esperar a rede;
- busca em menos de 150 ms.

### 4.6 Do dia 0 ao dia 1, saída do Trello e métricas

1. **Dia 0, de manhã: seed.**
   - Entram as equipes (com aprovador e distribuidor), as pessoas (com ausências conhecidas), o fluxo e **até 12 tipos de peça com até 2 campos obrigatórios cada**, mais o tipo "Outro", sem obrigatórios.
   - O SLA do card "Prazos" (Web) já está em texto. O do card "S L A" (Criação) é uma imagem, então **uma pessoa nomeada o transcreve, com 1 h reservada na agenda**.
   - "EXPLICAÇÃO PARA RELATÓRIOS" e "MODELO PARA ADS - META" viram o texto de ajuda dos campos dos tipos Relatório e Anúncio Meta.
2. **Dia 0, à tarde: importação (§7.4).**
   - O script gera a planilha.
   - **Cada AM confere a própria carteira** (cerca de 1 h no total, em paralelo): responsável, etapa e "manter ativa" nos cards parados.
   - O script importa as ~190 demandas ativas e o mural.
3. **Dia 1.** Atendimento, Criação, Social e Web passam a usar o Pauta. O Tráfego entra com a API (v1, semana 1–2), e a Produção gráfica com o seu fluxo (v1).
4. **Saída do Trello: por condição, não por data.** O Trello fica só para leitura e **ninguém arquiva nem exclui quadros** até:
   - o Arquivo da v1 ser importado;
   - os uploads serem baixados para o storage;
   - a contagem por quadro bater com o JSON exportado.
5. **Regra da casa:** "se não está no Pauta, não existe". O "Colar do WhatsApp" e o "Registrar retorno" tornam a regra viável.

**Métricas de 30 e 60 dias:**
- mais de 90% das demandas nascidas no sistema;
- mais de 80% dos retornos do cliente registrados (pelo link ou manualmente);
- tempo médio "com o cliente" caindo;
- rodadas médias por peça e número de extras marcados (antes era 0);
- percentual de rodadas entregues no prazo interno;
- pessoas ativas por dia;
- aos 60 dias, com o timer: horas registradas sobre horas disponíveis acima de 80%.

---

## 5. Telas e interações

### 5.0 Estrutura

- **Barra superior** (escura também no tema claro; o canvas claro dá o respiro, §8):
  - logo e busca (Cmd+K);
  - **+ Nova demanda**, o único botão laranja da tela;
  - sino;
  - avatar (tema, ausência, sair).
- **Menu lateral** (recolhível com `[`):
  - Início, Minha semana, **Triagem (n)**;
  - as visões (Criação, Social, Web, Tráfego, Meus clientes, Geral);
  - Clientes, Mural, Arquivo, Configurações.
- **Rotas** (o estado fica na URL, como no Trello, OBS `ev_557d195b`):
  - `/inicio`, `/semana`, `/triagem`, `/v/:slug`, `/d/:numero` (demanda por cima da tela atual);
  - `/clientes/:sigla`, `/equipe/:slug/avisos`, `/arquivo`, `/config/*`;
  - pública: `/a/:token`;
  - filtros em `?f=`.
- **Rota inicial por papel:** executor → `/semana`; atendimento e admin → `/inicio`.

### 5.1 Quadro (`/v/:slug`)

**Visões semeadas** (no MVP não há "Salvar visão"):

| Visão | Agrupar por | Filtro | Colunas recolhidas por padrão |
|---|---|---|---|
| Criação, Social, Web, Tráfego | **Responsável**, com a etapa como chip; "Sem responsável" primeiro | equipe; etapas Na fila, Em produção, Ajustes, Revisão (+ Agendar no Social) | — |
| Meus clientes | Etapa | atendimento = eu (ou quem eu cubro) | Na fila, Em produção |
| Geral | Etapa | — | Entregue |

- Ao trocar uma visão de equipe para "Etapa", ficam recolhidas Com o cliente, Aprovado e Entregue.
- Com 4 colunas abertas e as outras como pílulas de 44 px, o quadro fica abaixo de 1.400 px.
- A Criação, com 5 pessoas + "Sem responsável", é a visão mais larga: cabe em 1.920 px com o menu recolhido.

**Cabeçalho:**
- nome da visão;
- seletor **Quadro | Lista | Semana**;
- **Agrupar por: Etapa | Responsável | Cliente**;
- chips de filtro: Cliente, Responsável, Tipo, Prioridade, Prazo (atrasado, hoje, 7 dias, sem prazo), Bola, texto;
- **Só as minhas** (Q), contador "34 demandas" e Limpar (X).

**Colunas:**
- largura de 296 px, com título e contador;
- **faixa de 3 px no topo, na cor da categoria:**
  - fila e produção em grafite;
  - revisão em roxo;
  - com o cliente em `--info`;
  - ajuste em `--warning`;
  - agendar em turquesa;
  - aprovado e concluído em `--success`.

  A cor tem significado, e o laranja fica de fora;
- menu da coluna: ordenar (manual, prazo, prioridade, cliente), recolher, "Arquivar entregues" (só na coluna Entregue);
- recolhida, a coluna vira uma pílula vertical de 44 px com nome e contagem;
- Entregue mostra só os últimos 7 dias, com o link "ver no Arquivo";
- a Triagem não aparece no quadro: tem tela própria.

**Arrastar:**
- **Antes de soltar.** No início do arraste, a interface calcula os destinos permitidos: transição (§7.1), papel, versão existente, `aplica_se`. Os destinos proibidos ficam esmaecidos e mostram o motivo ao passar o cursor ("Só o atendimento envia ao cliente").
- **Colunas com diálogo** (Com o cliente, Ajustes, Aprovado, Entregue sem aprovação):
  - o card fica "pendente" (fantasma) no destino;
  - Esc ou cancelar o devolve em 200 ms;
  - soltar em Ajustes ou Aprovado vindo de Com o cliente abre "Registrar retorno" (§5.3).
- **Ordem.** O navegador envia só `{depois_de_id}` (ou `antes_de_id` no topo), e o servidor calcula a chave (§6.1). Numa coluna ordenada por prazo ou prioridade, soltar o card só muda o grupo.
- **Agrupado por responsável.** Arrastar para outra pessoa reatribui, mas só para AM e admin. O executor só arrasta para a própria coluna (Pegar).
- **Tempo real durante o arraste.** Patches remotos ficam em fila e são aplicados ao soltar. Um card que chega de outra pessoa entra com um destaque `--accent-soft` que some em 1,2 s.
- A coluna rola sozinha nas bordas.
- Toda troca de etapa mostra o aviso "Movida para X · Desfazer".

**Card (frente), de 72 a 88 px:**

```
┌─────────────────────────────────────┐
│ [HE] Carrossel · #4521         (RA) │  chip do cliente · tipo · número · avatar (só se o agrupamento não for por responsável)
│ Carrossel Outubro Rosa              │  título, até 2 linhas
│ qui 16/10, 18h · Atrasada há 2d  3/5│  prazo com estado · no máximo 1 sinal · contadores maiores que 0
└─────────────────────────────────────┘
```

- **O sinal único segue esta precedência:** atrasada > parado acima do limite ("Cliente há 3d") > rodada extra ("R3/2") > briefing incompleto > bloqueio. O restante vai para o tooltip e o modal.
- **Contadores:** checklist e anexos, só quando forem maiores que 0. O contador de comentários não aparece.
- **Prioridade:** faixa de 3 px à esquerda, em perigo (fura-pauta) ou aviso (urgente).
- **Etapa como chip:** só quando o agrupamento não é por etapa (por exemplo, "Ajuste R2").
- **Horário marcado:** mostra "19/10, 10h · ICC" em vez do prazo.
- **Fora do MVP:** sem miniatura (v1, só nas visões do Social) e sem ponto de timer (v1).

### 5.2 Modal da demanda (`/d/:numero`)

O modal abre por cima da visão. Abrir é instantâneo porque usa o cache; comentários e versões chegam depois, como o Trello faz com os itens de checklist (OBS `ev_ebf9d372`). As setas ←/→ (ou J/K) abrem a vizinha e Esc fecha.

**Topo:**
- Cliente · #4521 · título editável;
- **pílula da etapa**: clique para escolher entre as etapas permitidas, ou `,` e `.` para voltar e avançar;
- chip da bola com "há 3 dias" (e "cobrindo Samara", quando for o caso);
- ações:
  - **Entregar versão** (responsável), **Enviar ao cliente** ou **Registrar retorno** (AM), conforme a etapa. É o primário laranja;
  - Copiar para WhatsApp;
  - ··· com "Repetir para outra data" (Shift+D), mudar de equipe, copiar link e arquivar.

**Coluna principal:**
1. **Briefing:**
   - campos do tipo em formulário inline, com a ajuda do campo; quando falta algo obrigatório, aparece "Briefing incompleto: falta Formato";
   - texto livre em Markdown com `@`;
   - "Texto original (WhatsApp)" recolhido, exibido como texto puro.
2. **Checklists:** porcentagem e barra; o checklist de ajustes leva o selo "Ajustes R2 · prazo sex, 17/10".
3. **Versões e aprovação**, em linha do tempo:
   - V1, V2…, cada uma com links, caminho de rede ou arquivos. A prévia é estática (imagem ou miniatura pública do Drive), e o iframe só abre no clique, em hosts conhecidos (§7.2). Cada versão mostra nota, autor e "enviada ao cliente em… (link | por fora)";
   - decisões: "Aprovada por Fulana · 14/10 14:03 · link" ou "Ajuste pedido pelo WhatsApp · registrado por Pri · print";
   - aviso quando passa das inclusas: "Rodada 3 · 2 inclusas" com [Marcar como extra].
4. **Links e anexos** de referência, fora das versões. O caminho `M:\…` aparece como texto, com o botão [Copiar caminho].
5. **Comentários | Histórico:**
   - compositor com `@` (autocompletar); Ctrl+Enter salva;
   - interruptor "Visível ao cliente", desligado por padrão;
   - o histórico é tipado ("Rafa entregou V2 · Em produção → Revisão · há 2 h").

**Painel lateral:** Cliente, Tipo, Responsável, Atendimento, Prioridade (+ motivo), Prazo interno ("calculado: 2 dias úteis antes da publicação" ou manual), Publicação, Horário e local (só nos tipos com horário), Estimativa, Tempo (total e [Lançar tempo]) e os links do cliente (Drive, pasta de saída com Copiar, marca, Acessos, que abre o cofre).

**Copiar para WhatsApp** gera um texto curto, no tom da marca, pronto para colar. Exemplo:

> Olá, Fulana. Segue o Carrossel Outubro Rosa (V2) para aprovação: https://…/a/… Prazo para retorno: qui, 16/10, 18h.

### 5.3 Enviar ao cliente e Registrar retorno ★

**Enviar ao cliente** (AM, a partir de Revisão; arrastar para "Com o cliente" abre este diálogo):
- **Versão:** a última entregue.
- **Destinatário:** o contato padrão do cliente, que pode ser trocado.
- **Forma de envio:**
  - **[Gerar link]** (padrão);
  - **[Enviei por fora]**: WhatsApp, e-mail ou reunião. Não gera link e registra `enviada_via='fora'`.
- **Teste de acesso** (só com link). Para cada link do Drive da versão, o servidor busca `drive.google.com/thumbnail?id=<id>&sz=w400` **sem credenciais**:
  - imagem com resposta 200: arquivo público, e a imagem vira a prévia;
  - redirecionamento ou 403: arquivo privado. O envio fica bloqueado com "O cliente verá uma tela de login" e os botões [Abrir compartilhamento] [Testar de novo] [Enviar arquivo (até 10 MB)];
  - pasta do Drive: só um aviso ("confira se a pasta está compartilhada").
- **Ao confirmar:** a demanda vai para Com o cliente, e o diálogo oferece **Copiar para WhatsApp**. O lembrete posterior reusa o mesmo link (§7.2).

**Registrar retorno do cliente** (Shift+R; também abre ao arrastar de Com o cliente para Ajustes ou Aprovado):

| Campo | Comportamento |
|---|---|
| Versão avaliada | a última enviada |
| Quem respondeu | contato padrão do cliente pré-selecionado |
| Decisão | **Aprovado** \| **Ajuste**. "Aprovado em parte" é um ajuste: as linhas listam só o que muda |
| Pedidos | área de texto: **cada linha ou marcador vira um item** de "Ajustes R{N+1}". O AM cola a lista que o cliente mandou |
| Motivo | `cliente_mudou` (padrão), `briefing_incompleto`, `erro_execucao`, `erro_atendimento`, `outro` |
| Prazo novo | hoje + `tipo.sla_ajuste_dias_uteis` (padrão 1), editável. Vale para a rodada e para a demanda |
| Print | opcional, com Ctrl+V (vira anexo de evidência) |

- O registro grava uma `aprovacao` com `via='manual'` e roda a mesma função do link (§6.3).
- **Atalho "Aprovado pelo WhatsApp":** botão de 1 clique na etapa Com o cliente, com o contato padrão. Mostra o aviso "Aprovação registrada · Desfazer" (desfazer anula a aprovação).
- **Devolver para ajuste (rodada interna):** o mesmo diálogo, aberto na Revisão pelo aprovador, com origem `interna`.

### 5.4 Página pública de aprovação (`/a/:token`)

- **Formato.** Pensada primeiro para o celular, porque o cliente chega pelo WhatsApp. Mostra o logo do cliente e "por Melt".
- **Item:**
  - prévia estática da última versão enviada (imagem com zoom ou miniatura pública; o Drive embutido só abre no toque);
  - número da versão e prazo de retorno;
  - botões **Aprovar** e **Pedir ajuste**.
- **Pedir ajuste.** Área de texto com a dica "um ajuste por linha". Cada linha vira um item de checklist.
- **Aprovar.** Abre uma folha de confirmação, para que um toque acidental não valha.
- **Identificação, no momento da decisão (não antes).**
  - Link gerado para um contato: "Você é Fulana? Sim / Sou outra pessoa".
  - Sem contato: o sistema pede o nome, que fica lembrado no aparelho.
- **Corrida entre versões.** A decisão leva o `versao_id`. Se chegou uma versão nova, o servidor responde 409, e a página mostra "Chegou a V3" e recarrega a prévia.
- **Depois da decisão:**
  - a tela diz o que acontece em seguida ("A equipe prepara a V3 até sex, 17/10" ou "Aprovado V2 por Fulana em 14/10 às 14:03");
  - ao reabrir, o link fica só leitura, com o selo da decisão.
- **O que o cliente vê:** só as versões enviadas pelo link e os comentários marcados como visíveis.
- **Link.** Expira em 30 dias e pode ser revogado. Regras de segurança na §7.2. PIN e lote ficam para a v1.

### 5.5 Início (`/inicio`)

As seções vêm com números, nesta ordem:
1. **Hoje:** planejada para hoje, prazo hoje ou com horário marcado hoje (horário primeiro).
2. **Com você agora:** a bola está com você ou com quem você cobre (selo "cobrindo Samara"). A ordem é prioridade, prazo, hora do prazo e ordem manual.
3. **Fila da minha equipe sem responsável**, com o botão **Pegar** (Espaço). O distribuidor da equipe é avisado quando chega demanda sem responsável.
4. **Com o cliente há mais de 2 dias úteis** (só para o AM). Cada item tem "Copiar lembrete para WhatsApp", com o mesmo link, e "Registrar retorno".
5. **Atrasadas.**

O cabeçalho mostra frases como "3 demandas atrasadas · 2 na triagem". As menções ficam no sino.

**Ausência.**
- Em Configurações ou no avatar, a pessoa marca "ausente de 20/10 a 31/10" e escolhe um substituto.
- Durante o período, "Com você", as notificações, a Triagem e o envio ao cliente das demandas dela vão para o substituto, com o selo "cobrindo Samara".
- Ao fim do período, tudo volta sozinho.

### 5.6 Minha semana (`/semana`)

- **Colunas:** **Atrasadas | Seg | Ter | Qua | Qui | Sex | (Sáb) | Sem dia**.
- **Posição do card:** `coalesce(planejada_para, prazo)`.
  - Um card posicionado pelo prazo aparece com **borda tracejada** ("pelo prazo").
  - Arrastar grava `planejada_para`, e o prazo não muda.
  - "Sem dia" fica só para quem não tem nenhuma das duas datas.
- **Horário marcado:** a demanda aparece no dia, no topo, com a hora ("10h · Gravação externa · ICC").
- **Cabeçalho do dia:** só a contagem ("5 demandas"). A barra de carga chega na v1, com a capacidade.
- **Navegação:** semana anterior e próxima. AM e admin podem ver a semana de outra pessoa.
- **Mudança de hábito:** isso substitui os cards-cabeçalho SEGUNDA…SEXTA da Criação e do Social.

### 5.7 Triagem (`/triagem`)

- **O que cai aqui:**
  - pedidos criados pelo executor sem cliente ou sem tipo reconhecidos;
  - "Salvar na triagem" do formulário;
  - rascunhos de agente (v1);
  - e-mail (v2).

  O "Colar do WhatsApp" reconhecido vai direto para Na fila.
- **Formato:** lista vertical com o texto original (texto puro), a origem e sugestões (cliente pelo apelido, tipo pelo texto, responsável sugerido).
- **Teclado:** J/K navegam, **Enter aceita** (vai para Na fila) e **Shift+Backspace recusa**, com motivo. Uma legenda fixa de teclas fica no rodapé.
- **Rascunhos de agente:** vêm com o selo "rascunho de agente" e o aprovador da equipe (o Pedro, no Tráfego). Ninguém executa até ele aceitar, o que substitui a lista PEDRO.

### 5.8 Nova demanda e criação rápida

**Nova demanda (Shift+N ou o botão laranja):**
1. **Colar do WhatsApp** (opcional, no topo). Preserva a mensagem original (`origem_texto`), reconhece "[14/10 15:32] Fulana:" e sugere cliente e tipo. Se ambos forem reconhecidos, **cria direto em Na fila**.
2. Cliente* (autocompletar com apelidos) e **Tipo de peça*** (grade de até 12 tipos + Outro).
3. Título*, os campos obrigatórios do tipo (até 3, com ajuda; os opcionais ficam recolhidos), **Publicação/entrega ao cliente**, que gera o **Prazo interno** (editável; se ficar menor que o SLA, aparece o aviso "prazo curto"). Tipos com horário pedem início, fim e local.
4. **Padrões:**
   - **Atendimento** = AM do cliente (ou quem cria, se for AM);
   - **Responsável sugerido** = o criativo do cliente (tipos da Criação) ou o social do cliente (tipos do Social);
   - prioridade, links.

Botões: **Criar** (Ctrl+Enter), Criar e abrir, Salvar na triagem.

**Rápida (N numa coluna):**
- uma linha vira uma demanda na coluna;
- **marcadores do MVP**, que só viram chip quando casam **exatamente**:
  - `HE:`, `[HE]` ou `HE -`: apelido em `cliente_alias`;
  - `@rafa`: apelido de usuário, com autocompletar.

  O que não casar continua como texto;
- uma **linha de prévia** ao vivo sob o campo mostra "HE · Carrossel · Rafa · sex, 17/10, 18h". Backspace desfaz o último chip;
- o cliente vem do marcador, da coluna (agrupamento por cliente) ou de um filtro de um cliente só. Se ainda faltar, o Enter para e abre o campo de cliente em linha;
- o tipo herda o filtro da visão, ou fica "Outro" com o selo "briefing incompleto";
- **para o executor:** se tiver cliente e tipo, a demanda vai para Na fila da equipe certa, com ele como solicitante. Se faltar algo, aparece o aviso "Criada na Triagem como #4530 · aguardando o atendimento [Abrir]";
- `#tipo`, `!!` e `^data` ficam para a v1. `#` não colide com hashtags (#OutubroRosa) porque exige casamento exato com um tipo.

**Repetir para outra data (Shift+D):** copia o briefing, os campos, os links, o checklist padrão e o responsável, e pede só a nova data de publicação ou prazo. Substitui o "copiar card" de hoje até a recorrência da v1.

### 5.9 Busca e comandos (Cmd+K ou `/`)

- **Busca difusa**, em seções:
  - Ações: Nova demanda, Ir para…, Alternar tema, Pegar;
  - Demandas: por #número, título e apelido do cliente ("he outubro" = cliente HE + título);
  - Clientes, Pessoas, Visões.
- **Navegação:** os recentes vêm primeiro; Enter abre; Ctrl+Enter abre em outra aba.

### 5.10 Lista (layout Lista de uma visão)

Tabela virtualizada, só para leitura, com colunas fixas: #, Cliente, Título, Tipo, Etapa, Com quem, Prazo, Publicação, Rodada, Atualizada. Dá para ordenar clicando no cabeçalho e agrupar por etapa, responsável ou cliente. Edição inline, colunas configuráveis, ações em massa e CSV ficam para a v1.

### 5.11 Clientes (`/clientes`, `/clientes/:sigla`)

- **Lista:** sigla e nome, status (recorrente, pontual, negociação, ex), nível de 1 a 3, AM, social, e os contadores abertas, com o cliente e atrasadas.
- **Página do cliente:**
  - **Cabeçalho:** logo, cor, AM, social e criativo; contatos que aprovam (o padrão marcado); pasta de saída com Copiar; links (Drive, marca, Acessos → cofre).
  - **Abas:** Demandas (quadro ou lista já filtrados), Aprovações (trilha completa) e Configurações (rodadas inclusas, apelidos, grupo, por exemplo Bosque → Bosque Vida, Bosque PET).

### 5.12 Mural (`/equipe/:slug/avisos`)

- Um mural por equipe, mais o da agência.
- **Avisos:** notas em Markdown com título, que podem ser fixadas e ordenadas. Exemplos: carteira de clientes por AM, "CLIENTE - DIA - HORÁRIO", BANCO DE IMAGENS, modelos.
- **Edição:** AM e admin editam. O executor edita o mural da própria equipe.
- **Proibido:** senhas e acessos. O detector de senha avisa e aponta para o cofre.

### 5.13 Arquivo (`/arquivo`)

Busca por cliente, mês, tipo e texto. Restaurar devolve a demanda à última etapa. Esta tela substitui o quadro CEMITÉRIO; o histórico chega na v1.

### 5.14 Configurações (`/config`)

| Seção | O que se configura |
|---|---|
| Pessoas | nome, apelido, papel, equipes, horas por semana, ausência e substituto, ativo (desativar derruba as sessões) |
| Equipes | membros, aprovador padrão, distribuidor |
| Tipos de peça | campos (tipo, opções, obrigatório até 3, ajuda), SLA, SLA de ajuste, folga de aprovação, estimativa, checklist padrão, rodadas inclusas, aprovação do cliente, publicação, horário |
| Feriados | lista anual (nacionais + municipais da sede) |
| Aparência | tema e atalhos ligados/desligados |

O fluxo e as transições vêm do seed e não têm tela no MVP.

### 5.15 Celular

- **Barra de abas por papel:**
  - **AM:** Início · Triagem · **+** · Busca · Sino. O "+" abre a Nova demanda já com o "Colar do WhatsApp" em foco;
  - **executor:** Início · Semana · **+** · Busca · Sino.
- **Quadro:** vira a Lista agrupada, com uma **barra de chips** no topo com as colunas e contagens (toque para pular). Não há gesto lateral, o que evita conflito com o "voltar" do iOS.
- **Mudar a etapa sem arrastar:** pela pílula da etapa no modal, que mostra só as etapas permitidas.
- **Telas de uma coluna:** Início, modal (tela cheia), Nova demanda, Registrar retorno e a página do cliente.
- **Fica para a v1:** PWA com "Compartilhar → Pauta", toque longo e Web Push.

### 5.16 Estados vazios, carregamento e erro

| Situação | Texto ou comportamento |
|---|---|
| Carregamento | esqueleto com as colunas, depois os cards (como o Trello, OBS `ev_127484b1`). Nada de spinner na tela toda. |
| Coluna vazia | "Nenhuma demanda aqui." |
| Filtro sem resultado | "Nenhuma demanda com estes filtros." [Limpar filtros] |
| Início vazio | "Nada com você agora. Veja a fila da equipe ou a sua semana." |
| Triagem vazia | "Triagem em dia." |
| Minha semana vazia | "Semana livre. Pegue uma demanda na fila da equipe." |
| Busca vazia | "Nada encontrado para "termo". Tente a sigla do cliente ou o número." |
| Demanda sem versão | "Nenhuma versão entregue. Cole o link do Drive ou o caminho da pasta de saída." |
| Drive privado | "O cliente verá uma tela de login." [Abrir compartilhamento] [Testar de novo] |
| Link expirado ou revogado | "Este link de aprovação não está mais ativo. Peça um novo ao seu atendimento." |
| Versão substituída (409) | "Chegou a V3. Veja a versão nova antes de decidir." |
| Sem permissão | "Você não tem acesso a esta ação." + o motivo |
| Erro ao salvar | o card volta ao estado anterior: "Não foi possível salvar." [Tentar de novo] (fila offline só na v1) |
| Sem conexão | faixa discreta "Sem conexão · tentando de novo"; ao voltar, ressincroniza |
| Arquivar | "Arquivada · Desfazer" |

### 5.17 Atalhos (MVP)

São compatíveis com o Trello onde não há conflito (OBS `ev_4129a633`, `ev_b8c66c49`). Podem ser desligados por usuário. A tecla aparece nos tooltips e nos menus de contexto, não só na lista do `?`.

| Tecla | Ação | Tecla | Ação |
|---|---|---|---|
| Ctrl/Cmd+K, `/` | busca e comandos | `?` | lista de atalhos |
| N | criação rápida na coluna | Shift+N | formulário "Nova demanda" (Ctrl+N é do navegador) |
| ←↓↑→ / J K | navegar entre cards | Enter / Esc | abrir / fechar |
| `,` `.` | etapa anterior / próxima | Espaço | Pegar (só com card em foco ou sob o cursor) |
| Shift+R | registrar retorno do cliente | Shift+D | repetir para outra data |
| Q | só as minhas | X | limpar filtros |
| `\` / Shift+`\` | recolher coluna / todas | `[` | recolher menu lateral |
| G depois I / S / T | ir para Início / Semana / Triagem | Ctrl/Cmd+Enter | salvar texto |
| Triagem: Enter | aceitar | Triagem: Shift+Backspace | recusar |

- **Acorde G:** tem 1,5 s de prazo e mostra o indicador "G…" no canto. Enquanto ele está pendente, os atalhos de card ficam desligados.
- **Sem letras ambíguas:** não há tecla de uma letra que arquive ou mude de sentido conforme a tela.

---

## 6. Modelo de dados (Postgres)

### 6.1 Convenções

**Identificadores**
- `uuid` em todas as tabelas, no schema `pauta`.
- A demanda tem também `numero` (sequência global). É a chave humana (#4521) e **não muda** quando a demanda troca de equipe. No Trello, o `idShort` muda a cada troca de quadro.

**Nada se apaga**
- Usuário, cliente e demanda só são desativados, arquivados ou anonimizados.
- Todas as FKs para eles são `restrict`.
- `aprovacao`, `versao`, `rodada`, `atividade` e `demanda_etapa_hist` só recebem INSERT. As poucas colunas atualizáveis estão listadas nos `grant`.

**Ordenação**
- **Demandas:** `ordem text COLLATE "C"`, um índice fracionário em base 62 (`chave_entre(a, b)`, com a < b).
  - A ordem é **global** e é **calculada no servidor**: o navegador envia `{depois_de_id}`, e o servidor usa `chave_entre(A.ordem, (select min(ordem) from demanda where ordem > A.ordem))`.
  - Isso preserva a posição dos cards escondidos pelo filtro.
  - O índice único em `ordem` faz duas soltas no mesmo vão colidirem. O servidor tenta de novo, e a chave definitiva volta no eco do SSE.
- **Listas curtas por pai** (itens de checklist, etapas, campos, anexos, avisos): `pos double precision`, com a regra observada no Trello (EST `ev_1df922bc`/`ev_ebf9d372`):
  - fim = último + 16384;
  - entre dois = média;
  - topo = primeiro − 16384, ou primeiro / 2 se ele for menor que 32768;
  - não grava se o item já está no lugar;
  - renormaliza o pai quando a diferença fica abaixo de 1e-6.

**Contexto de cada transação**
- Toda transação da API começa com `select set_config('pauta.ator', $uid, true), set_config('pauta.trace', $trace, true)`.
- Os gatilhos leem esses valores com `current_setting('pauta.ator', true)` e dão `raise` se faltarem.
- A importação usa `set_config('pauta.importando', 'on', true)` (§7.4).

**Outras**
- **Tempo:** `timestamptz` em UTC, exibido em America/Sao_Paulo. A conexão do app usa `timezone = 'America/Sao_Paulo'`, então `current_date` é o dia de São Paulo. Prazo sem hora (`prazo_hora` nulo) significa 18h, o padrão de 66% dos prazos de hoje.
- **Valores fechados:** `text` com `CHECK`, não `enum`.
- **Texto rico:** Markdown CommonMark nas colunas `*_md`. A menção é o token `@[Rafa](mencao:<uuid>)`.
- **Contadores e derivados:** os contadores `n_*` e os campos `status`, `bola` e `com_quem_id` são mantidos por gatilho. É o mesmo princípio dos `badges` do Trello (OBS `ev_1df922bc`): o quadro inteiro sai numa consulta.
- **URLs:** toda coluna de URL tem `check (col ~ '^https://')`.

### 6.2 DDL

```sql
create schema pauta;
revoke all on schema pauta from public, anon, authenticated;   -- "pauta" fica FORA dos Exposed schemas do Supabase
create role pauta_app login;                                   -- o Node conecta com ele; sem service_role
grant usage on schema pauta to pauta_app;
set search_path = pauta, public;

create extension if not exists pg_trgm;
create extension if not exists unaccent;
create text search configuration pauta.pt (copy = portuguese);
alter text search configuration pauta.pt alter mapping for hword, hword_part, word with unaccent, portuguese_stem;

-- ───────────── pessoas e sessões ─────────────
create table usuario (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  apelido       text,                                    -- "Rafa"; usado em @ e na importação
  email         text not null,                           -- autor sintético: importado+<slug>@pauta.invalid
  google_sub    text unique,                             -- nulo até o 1º login; ligado pelo e-mail verificado
  papel         text not null default 'executor' check (papel in ('admin','atendimento','executor','agente')),
  cor           text not null default 'azul',            -- token --label-* do avatar
  horas_semana  numeric(4,1) not null default 40,
  ausente_de    date,
  ausente_ate   date,
  substituto_id uuid references usuario,
  prefs         jsonb not null default '{}',             -- tema, atalhos, colunas recolhidas
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  check ((ausente_de is null) = (ausente_ate is null)),
  check (ausente_de is null or (substituto_id is not null and ausente_ate >= ausente_de))
);
create unique index usuario_email_uk on usuario (lower(email));

create table sessao (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references usuario,
  token_hash    bytea not null unique,                   -- cookie httpOnly; Secure; SameSite=Lax
  criada_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  ultimo_uso_em timestamptz,
  revogada_em   timestamptz,
  user_agent    text
);
create index sessao_usr_ix on sessao (usuario_id) where revogada_em is null;

-- ───────────── fluxo, transições, equipes ─────────────
create table fluxo (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,
  padrao boolean not null default false
);

create table etapa (
  id                uuid primary key default gen_random_uuid(),
  fluxo_id          uuid not null references fluxo,
  nome              text not null,
  categoria         text not null check (categoria in
                    ('triagem','fila','producao','revisao','cliente','ajuste','aprovado','publicacao','concluido','cancelado')),
  bola              text not null default 'agencia' check (bola in ('agencia','cliente','terceiro')),
  pausa_sla         boolean not null default false,       -- true em 'cliente'
  aplica_se         text not null default 'sempre' check (aplica_se in ('sempre','aprovacao_cliente','publicacao')),
  responsavel_regra text check (responsavel_regra in ('social_do_cliente')),   -- Agendar reatribui sozinho
  pos               double precision not null,
  unique (fluxo_id, nome),
  unique (id, fluxo_id)
);

create table transicao (                                  -- única fonte das regras de movimento (§7.1)
  de_categoria   text not null,
  para_categoria text not null,
  quem           text[] not null,                         -- admin | atendimento | responsavel | aprovador | cliente
  requer         text[] not null default '{}',            -- versao_nova | versao_enviada | retorno | motivo | sem_aprovacao_cliente | com_publicacao | confirmacao
  primary key (de_categoria, para_categoria)
);

create table equipe (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null unique,               -- Criação, Social, Web, Tráfego (Produção gráfica na v1)
  slug                text not null unique,
  cor                 text not null default 'grafite',
  fluxo_id            uuid not null references fluxo,
  aprovador_padrao_id uuid references usuario,            -- Wesley (Web), Pedro (Tráfego); nulo = o AM da demanda
  distribuidor_id     uuid references usuario,            -- avisado quando chega demanda sem responsável
  ativa               boolean not null default true
);

create table equipe_membro (
  equipe_id  uuid not null references equipe,
  usuario_id uuid not null references usuario,
  funcao     text,                                         -- design, video, redacao, social, dev, trafego, atendimento
  principal  boolean not null default false,
  primary key (equipe_id, usuario_id)
);

create table equipe_aviso (                                -- Mural
  id             uuid primary key default gen_random_uuid(),
  equipe_id      uuid references equipe,                   -- nulo = mural da agência
  titulo         text not null,
  corpo_md       text not null default '',
  fixado         boolean not null default false,
  pos            double precision not null,
  atualizado_por uuid references usuario,
  atualizado_em  timestamptz not null default now()
);

-- ───────────── clientes ─────────────
create table cliente (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  sigla            text not null unique,                   -- HE, ICC, CNSD
  pai_id           uuid references cliente,                -- grupo: Bosque → Bosque Vida; "Política 2026" → candidatos
  status           text not null default 'recorrente' check (status in ('recorrente','pontual','negociacao','ex')),
  nivel            smallint check (nivel between 1 and 3),
  cor              text not null default 'azul',           -- token --label-* (laranja não)
  logo_url         text check (logo_url ~ '^https://'),
  atendimento_id   uuid references usuario,                -- AM dono da conta
  criativo_id      uuid references usuario,
  social_id        uuid references usuario,                -- recebe a etapa Agendar
  rodadas_inclusas smallint not null default 2,
  drive_url        text check (drive_url ~ '^https://'),
  pasta_saida      text,                                   -- M:\…\CLIENTES\<X>\…\SAÍDA: texto com Copiar, nunca href
  marca_url        text check (marca_url ~ '^https://'),
  acessos_url      text check (acessos_url ~ '^https://'), -- link para o cofre; NUNCA a senha
  observacoes      text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table cliente_alias (
  alias_norm text primary key,                             -- minúsculo, sem acento: 'he', 'hospital evangelico'
  cliente_id uuid not null references cliente,
  origem     text not null default 'manual' check (origem in ('manual','importacao'))
);
create index cliente_alias_trgm on cliente_alias using gin (alias_norm gin_trgm_ops);   -- só para SUGERIR na triagem
create index cliente_alias_cli on cliente_alias (cliente_id);

create table cliente_contato (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente,
  nome       text not null,
  cargo      text,
  whatsapp   text,
  email      text,
  aprova     boolean not null default true,
  padrao     boolean not null default false,               -- pré-selecionado no envio e no retorno
  ativo      boolean not null default true
);
create index cliente_contato_cli on cliente_contato (cliente_id);
create unique index cliente_contato_padrao_uk on cliente_contato (cliente_id) where padrao;

-- ───────────── tipos de peça ─────────────
create table tipo_peca (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null unique,              -- Post, Carrossel, Reels, Anúncio Meta, LP, Relatório, Auditoria, OP, Gravação, Outro…
  slug                  text not null unique,
  equipe_id             uuid references equipe,            -- equipe executora padrão
  aprovacao_cliente     boolean not null default true,     -- false: auditoria, OP, interno → Revisão → Entregue
  publicacao            boolean not null default false,    -- true: Aprovado → Agendar (social do cliente)
  com_horario           boolean not null default false,    -- gravação, reunião, filmagem externa
  sla_dias_uteis        smallint not null default 2,       -- base sem publicação + aviso "prazo curto"
  sla_ajuste_dias_uteis smallint not null default 1,       -- prazo padrão de cada rodada de ajuste
  folga_aprovacao_dias  smallint not null default 1,       -- prazo interno = publicação − folga (dias úteis)
  estimativa_min        int check (estimativa_min >= 0),
  rodadas_inclusas      smallint,                           -- nulo = usa o do cliente
  checklist_padrao      jsonb not null default '[]',
  ativo                 boolean not null default true,
  pos                   double precision not null
);

create table tipo_peca_campo (
  id           uuid primary key default gen_random_uuid(),
  tipo_peca_id uuid not null references tipo_peca,
  chave        text not null,                               -- 'formato', 'rede', 'kpis'
  rotulo       text not null,
  tipo         text not null check (tipo in ('texto','texto_longo','numero','data','selecao','multipla','url','sim_nao')),
  opcoes       jsonb,
  obrigatorio  boolean not null default false,              -- API: até 3 por tipo; seed: até 2
  ajuda        text,                                        -- ex.: "EXPLICAÇÃO PARA RELATÓRIOS", "MODELO PARA ADS - META"
  pos          double precision not null,
  unique (tipo_peca_id, chave)
);

-- ───────────── demanda ─────────────
create sequence demanda_numero_seq;

create table demanda (
  id                      uuid primary key default gen_random_uuid(),
  numero                  bigint not null unique default nextval('demanda_numero_seq'),
  titulo                  text not null check (length(titulo) between 1 and 500),
  cliente_id              uuid references cliente,
  tipo_peca_id            uuid references tipo_peca,
  equipe_id               uuid references equipe,
  fluxo_id                uuid not null references fluxo,
  etapa_id                uuid not null,
  status                  text not null check (status in
                          ('triagem','fila','producao','revisao','cliente','ajuste','aprovado','publicacao','concluido','cancelado')),
  status_desde            timestamptz not null,             -- só muda com a etapa; na importação, a data real
  bola                    text not null check (bola in ('agencia','cliente','terceiro')),
  com_quem_id             uuid references usuario,          -- pessoa com a bola (gatilho); nulo se cliente/terceiro
  bloqueio                text check (bloqueio in ('cliente','interno','fornecedor')),
  bloqueio_motivo         text,
  responsavel_id          uuid references usuario,
  responsavel_sugerido_id uuid references usuario,
  atendimento_id          uuid references usuario,          -- padrão: cliente.atendimento_id
  aprovador_id            uuid references usuario,          -- padrão: equipe.aprovador_padrao_id; senão o AM
  solicitante_id          uuid not null references usuario,
  criado_por              uuid not null references usuario,
  briefing_md             text not null default '',
  briefing_campos         jsonb not null default '{}',
  briefing_completo       boolean not null default false,
  prioridade              smallint not null default 0 check (prioridade between 0 and 2),   -- normal, urgente, fura-pauta
  prioridade_motivo       text,
  prazo                   date,                             -- prazo interno (= prazo da rodada atual)
  prazo_hora              time,                             -- nulo = 18h
  prazo_manual            boolean not null default false,   -- abrir rodada torna true
  publicacao_em           timestamptz,
  planejada_para          date,
  agendada_inicio         timestamptz,                      -- tipos com_horario
  agendada_fim            timestamptz,
  local                   text,
  estimativa_min          int check (estimativa_min >= 0),
  minutos_registrados     int not null default 0,
  rodada_atual            smallint not null default 1,
  rodadas_inclusas        smallint not null default 2,
  aprovada_em             timestamptz,
  aprovada_versao_id      uuid,
  ordem                   text collate "C" not null,
  origem                  text not null default 'manual'
                          check (origem in ('manual','rapida','whatsapp','repeticao','agente','importacao','cliente')),
  origem_texto            text,                             -- exibido só como texto puro
  n_anexos                int not null default 0,
  n_check_total           int not null default 0,
  n_check_feitos          int not null default 0,
  concluida_em            timestamptz,
  arquivada_em            timestamptz,
  excluida_em             timestamptz,                      -- "excluir" = anonimizar título e briefing (LGPD)
  trello_card_id          text unique,
  trello_url              text,
  rev                     int not null default 1,           -- If-Match; sobe só com campos editados por pessoas
  criada_em               timestamptz not null default now(),
  atualizada_em           timestamptz not null default now(),
  busca                   tsvector generated always as
                          (to_tsvector('pauta.pt'::regconfig, titulo || ' ' || briefing_md)) stored,
  foreign key (etapa_id, fluxo_id) references etapa (id, fluxo_id),
  check (cliente_id is not null or status in ('triagem','cancelado')),
  check (prioridade = 0 or prioridade_motivo is not null),
  check (agendada_fim is null or agendada_fim > agendada_inicio)
);
create unique index demanda_ordem_uk  on demanda (ordem);
create index demanda_quadro_ix  on demanda (etapa_id, ordem)          where arquivada_em is null;
create index demanda_equipe_ix  on demanda (equipe_id, status)        where arquivada_em is null;
create index demanda_comquem_ix on demanda (com_quem_id, status)      where arquivada_em is null;
create index demanda_resp_ix    on demanda (responsavel_id, status)   where arquivada_em is null;
create index demanda_am_ix      on demanda (atendimento_id, status)   where arquivada_em is null;
create index demanda_cli_ix     on demanda (cliente_id, criada_em desc);
create index demanda_prazo_ix   on demanda (prazo)                    where arquivada_em is null and status not in ('concluido','cancelado');
create index demanda_semana_ix  on demanda (responsavel_id, (coalesce(planejada_para, prazo))) where arquivada_em is null;
create index demanda_agenda_ix  on demanda (agendada_inicio)          where agendada_inicio is not null;
create index demanda_arq_ix     on demanda (cliente_id, arquivada_em) where arquivada_em is not null;
create index demanda_busca_ix   on demanda using gin (busca);
create index demanda_titulo_trgm on demanda using gin (lower(titulo) gin_trgm_ops);

create table demanda_etapa_hist (                          -- tempo por etapa, bola e pessoa
  id             bigserial primary key,
  demanda_id     uuid not null references demanda,
  etapa_id       uuid not null references etapa,
  status         text not null,
  bola           text not null,
  com_quem_id    uuid references usuario,
  responsavel_id uuid references usuario,
  bloqueio       text,
  pausa_sla      boolean not null,                         -- copiado no momento: editar a etapa não reescreve o passado
  entrou_em      timestamptz not null,
  saiu_em        timestamptz,
  por            uuid references usuario,
  parcial        boolean not null default false            -- importado sem as ações mais antigas
);
create index demanda_etapa_hist_ix on demanda_etapa_hist (demanda_id, entrou_em);
create unique index demanda_etapa_hist_aberta_uk on demanda_etapa_hist (demanda_id) where saiu_em is null;

-- ───────────── rodadas, versões, anexos, aprovação ─────────────
create table rodada (
  id             uuid primary key default gen_random_uuid(),
  demanda_id     uuid not null references demanda,
  numero         smallint not null,
  origem         text not null check (origem in ('inicial','cliente','interna')),
  motivo         text check (motivo in ('cliente_mudou','erro_execucao','briefing_incompleto','erro_atendimento','outro')),
  extra          boolean not null default false,
  prazo          date,
  prazo_hora     time,
  prazo_original date,                                     -- gravado na abertura; mostra renegociação
  aberta_em      timestamptz not null default now(),
  aberta_por     uuid references usuario,
  fechada_em     timestamptz,
  unique (demanda_id, numero),
  unique (id, demanda_id),
  check (origem = 'inicial' or (motivo is not null and prazo is not null))
);

create table versao (
  id                 uuid primary key default gen_random_uuid(),
  demanda_id         uuid not null references demanda,
  numero             smallint not null,                    -- V1, V2…
  rodada_id          uuid not null,
  nota               text,
  criada_por         uuid not null references usuario,
  criada_em          timestamptz not null default now(),
  enviada_cliente_em timestamptz,
  enviada_via        text check (enviada_via in ('link','fora')),
  unique (demanda_id, numero),
  unique (id, demanda_id),
  foreign key (rodada_id, demanda_id) references rodada (id, demanda_id),
  check ((enviada_cliente_em is null) = (enviada_via is null))
);
alter table demanda add constraint demanda_aprovada_versao_fk
  foreign key (aprovada_versao_id, id) references versao (id, demanda_id);

create table anexo (
  id                    uuid primary key default gen_random_uuid(),
  demanda_id            uuid not null references demanda,
  versao_id             uuid,
  comentario_id         uuid,                               -- FK abaixo
  tipo                  text not null check (tipo in ('arquivo','link','caminho')),
  nome                  text not null,
  url                   text check (url ~ '^https://'),
  caminho               text,                               -- M:\Drives compartilhados\MELT\CLIENTES\…\SAÍDA
  provedor              text,                               -- drive, docs, figma, canva, wetransfer, youtube, trello, rede, outro
  publico_verificado_em timestamptz,                        -- teste sem credenciais do Drive passou
  storage_key           text,                               -- bucket privado; o arquivo nunca vai ao banco
  mime                  text,                               -- conferido pelo magic number
  bytes                 bigint,
  pos                   double precision not null,
  enviado_por           uuid references usuario,
  criado_em             timestamptz not null default now(),
  excluido_em           timestamptz,
  trello_attachment_id  text,
  foreign key (versao_id, demanda_id) references versao (id, demanda_id),
  check ((tipo = 'link' and url is not null) or (tipo = 'arquivo' and storage_key is not null)
      or (tipo = 'caminho' and caminho is not null))
);
create index anexo_dem_ix on anexo (demanda_id, pos);
create index anexo_ver_ix on anexo (versao_id);
create unique index anexo_trello_uk on anexo (trello_attachment_id) where trello_attachment_id is not null;

create table storage_lixo (                                -- job diário apaga do bucket após 30 dias
  storage_key text primary key,
  apagar_em   timestamptz not null
);

create table aprovacao_link (
  id               uuid primary key default gen_random_uuid(),
  token_hash       bytea not null unique,                  -- sha256 de 32 bytes aleatórios
  token_cifrado    bytea not null,                         -- AES-GCM, chave fora do banco: reexibir o link ao AM
  cliente_id       uuid not null references cliente,
  contato_id       uuid references cliente_contato,        -- "Você é Fulana?"
  titulo           text,
  expira_em        timestamptz not null,
  revogado_em      timestamptz,
  criado_por       uuid not null references usuario,
  criado_em        timestamptz not null default now(),
  ultimo_acesso_em timestamptz,                            -- só por POST /visto: o GET não tem efeito
  acessos          int not null default 0
);

create table aprovacao_link_item (                         -- 1 item no MVP; N itens = lote (v1)
  link_id    uuid not null references aprovacao_link,
  demanda_id uuid not null references demanda,
  pos        double precision not null,
  primary key (link_id, demanda_id)
);
create index aprovacao_link_item_dem on aprovacao_link_item (demanda_id);

create table aprovacao (
  id                 uuid primary key default gen_random_uuid(),
  demanda_id         uuid not null references demanda,
  versao_id          uuid not null,
  decisao            text not null check (decisao in ('aprovado','ajuste')),
  via                text not null check (via in ('link','manual')),   -- manual = retorno pelo WhatsApp/reunião
  link_id            uuid references aprovacao_link,
  contato_id         uuid references cliente_contato,
  nome_informado     text,                                 -- texto puro
  registrado_por     uuid references usuario,
  comentario         text,                                 -- as linhas do ajuste
  evidencia_anexo_id uuid references anexo,                -- print (opcional)
  idempotency_key    text unique,
  ip_hmac            bytea,                                -- HMAC com segredo; apagado após 12 meses
  user_agent         text,
  criada_em          timestamptz not null default now(),
  anulada_em         timestamptz,
  anulada_por        uuid references usuario,
  foreign key (versao_id, demanda_id) references versao (id, demanda_id),
  check (decisao = 'aprovado' or comentario is not null),
  check (via = 'link' or registrado_por is not null),
  check (via = 'manual' or link_id is not null)
);
create unique index aprovacao_uma_por_versao on aprovacao (versao_id) where anulada_em is null;
create index aprovacao_dem_ix on aprovacao (demanda_id, criada_em);

-- ───────────── checklists, comentários, menções ─────────────
create table checklist (
  id         uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demanda,
  titulo     text not null,
  rodada_id  uuid,                                          -- não nulo = "Ajustes R{N}"
  pos        double precision not null,
  criado_em  timestamptz not null default now(),
  foreign key (rodada_id, demanda_id) references rodada (id, demanda_id)
);
create index checklist_dem_ix on checklist (demanda_id, pos);

create table checklist_item (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklist on delete cascade,   -- único cascade: apagar um checklist
  texto        text not null,
  feito_em     timestamptz,
  feito_por    uuid references usuario,
  pos          double precision not null
);
create index checklist_item_ix on checklist_item (checklist_id, pos);

create table comentario (
  id              uuid primary key default gen_random_uuid(),
  demanda_id      uuid not null references demanda,
  autor_id        uuid references usuario,                 -- nulo = cliente via link
  autor_externo   text,
  link_id         uuid references aprovacao_link,
  versao_id       uuid,
  corpo_md        text not null,
  visivel_cliente boolean not null default false,
  editado_em      timestamptz,
  excluido_em     timestamptz,
  criado_em       timestamptz not null default now(),
  foreign key (versao_id, demanda_id) references versao (id, demanda_id),
  check (autor_id is not null or autor_externo is not null)
);
create index comentario_dem_ix on comentario (demanda_id, criado_em);
alter table anexo add constraint anexo_comentario_fk foreign key (comentario_id) references comentario (id);

create table comentario_mencao (                           -- extraída e validada no servidor
  comentario_id uuid not null references comentario,
  usuario_id    uuid not null references usuario,
  primary key (comentario_id, usuario_id)
);
create table demanda_mencao (                              -- @ no briefing
  demanda_id uuid not null references demanda,
  usuario_id uuid not null references usuario,
  primary key (demanda_id, usuario_id)
);

-- ───────────── horas ─────────────
create table apontamento (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuario,
  demanda_id uuid references demanda,
  cliente_id uuid references cliente,                       -- copiado da demanda
  inicio     timestamptz not null,
  fim        timestamptz,                                   -- nulo = timer rodando (v1)
  minutos    int,
  origem     text not null default 'manual' check (origem in ('manual','timer','importado')),
  nota       text,
  criado_em  timestamptz not null default now(),
  check (fim is null or fim > inicio)
);
create unique index apontamento_um_timer on apontamento (usuario_id) where fim is null;
create index apontamento_dem_ix on apontamento (demanda_id);
create index apontamento_cli_ix on apontamento (cliente_id, inicio);
create index apontamento_usr_ix on apontamento (usuario_id, inicio);

-- ───────────── histórico, notificações, visões ─────────────
create table atividade (
  id         bigserial primary key,
  demanda_id uuid references demanda,
  cliente_id uuid references cliente,
  ator_id    uuid references usuario,
  ator_tipo  text not null check (ator_tipo in ('usuario','cliente','sistema','agente','importacao')),
  tipo       text not null,   -- demanda.criada | etapa.alterada | responsavel.alterado | prazo.alterado | campo.alterado
                              -- prioridade.alterada | rodada.aberta | versao.entregue | versao.enviada | retorno.registrado
                              -- aprovacao.anulada | comentario.criado | anexo.adicionado | checklist.item_feito
                              -- arquivada | restaurada | importada | importada_sem_fechamento
  dados      jsonb not null default '{}',
  antes      jsonb,                                         -- valores anteriores (como o `old` do Trello)
  trace_id   uuid,
  criada_em  timestamptz not null default now()
);
create index atividade_dem_ix  on atividade (demanda_id, id desc);
create index atividade_tipo_ix on atividade (tipo, criada_em);

create table notificacao (
  id           bigserial primary key,
  usuario_id   uuid not null references usuario,           -- já resolvido para o substituto, se houver
  cobrindo_id  uuid references usuario,                    -- "cobrindo Samara"
  tipo         text not null check (tipo in ('atribuida','voltou','mencao','aprovada','ajuste_pedido','triagem','fila_sem_responsavel','prazo')),
  demanda_id   uuid references demanda,
  atividade_id bigint references atividade,
  resumo       text not null,
  lida_em      timestamptz,
  criada_em    timestamptz not null default now()
);
create index notificacao_nlida_ix on notificacao (usuario_id, criada_em desc) where lida_em is null;
create index notificacao_dem_ix on notificacao (demanda_id);

create table visao (                                       -- semeadas no MVP; pessoais na v1
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,
  equipe_id   uuid references equipe,                      -- abre por padrão para os membros
  layout      text not null default 'quadro' check (layout in ('quadro','lista','semana')),
  agrupar_por text not null default 'etapa' check (agrupar_por in ('etapa','responsavel','cliente')),
  filtros     jsonb not null default '{}',                 -- {equipe:[], status:[], atendimento:"eu", ...}
  recolhidas  text[] not null default '{}',                -- categorias recolhidas por padrão
  pos         double precision not null
);

create table feriado (data date primary key, nome text not null);

-- ───────────── tempo real e importação ─────────────
create sequence evento_sync_seq;
create table evento_sync (
  seq         bigint primary key,                          -- nextval sob pg_advisory_xact_lock(7001): ordem do seq = ordem de commit
  entidade    text not null,
  entidade_id text not null,
  demanda_id  uuid,
  op          text not null check (op in ('upsert','delete','resync')),
  patch       jsonb,
  campos      text[],
  publico     text not null default 'interno' check (publico in ('interno','usuario','gestao')),
  usuario_id  uuid,                                         -- quando publico = 'usuario'
  trace_id    uuid,
  ator_id     uuid,
  criado_em   timestamptz not null default now()
);
create index evento_sync_tempo_ix on evento_sync (criado_em);   -- poda diária: guarda 7 dias

create table importacao (
  id           uuid primary key default gen_random_uuid(),
  escopo       text not null,                              -- 'ativas', 'trafego', 'arquivo', 'producao'
  arquivos     jsonb not null default '[]',
  status       text not null default 'rascunho' check (status in ('rascunho','executada','falhou')),
  relatorio    jsonb,                                       -- criadas, já importadas, divergentes, puladas
  criada_por   uuid not null references usuario,
  criada_em    timestamptz not null default now(),
  executada_em timestamptz
);

create table importacao_ref (                              -- idempotência: toda linha criada tem a sua
  trello_tipo   text not null check (trello_tipo in ('card','list','label','member','action','checklist','checkItem','attachment')),
  trello_id     text not null,                             -- derivados de uma ação: '<actionId>#versao', '<actionId>#tempo'
  entidade      text not null,
  entidade_id   uuid not null,
  importacao_id uuid not null references importacao,
  primary key (trello_tipo, trello_id)
);

-- ───────────── permissões do papel da aplicação ─────────────
-- Em TODAS as tabelas: alter table X enable row level security;
--                      create policy app on X to pauta_app using (true) with check (true);
-- (RLS sem política para anon/authenticated = nega tudo; a política só libera o pauta_app.)
grant select, insert, update, delete on all tables in schema pauta to pauta_app;
grant usage on all sequences in schema pauta to pauta_app;
revoke update, delete on aprovacao, versao, rodada, atividade, demanda_etapa_hist from pauta_app;
grant update (anulada_em, anulada_por)                    on aprovacao to pauta_app;
grant update (enviada_cliente_em, enviada_via, nota)       on versao    to pauta_app;
grant update (extra, motivo, prazo, prazo_hora, fechada_em) on rodada   to pauta_app;
-- demanda_etapa_hist.saiu_em é fechado pelo gatilho (security definer, dono do schema)
```

**Autenticação.** O vínculo é `usuario.google_sub` (§7.2). A sessão fica na tabela `sessao` e chega ao navegador como cookie.

### 6.3 Funções e gatilhos

Todas as funções que mexem no ciclo começam com `select … from demanda where id = $1 for update`. Isso serializa duas pessoas agindo na mesma demanda e torna seguro o "max + 1" de versões e rodadas.

1. **`mover(demanda, etapa, ator)`.** É o único caminho para trocar de etapa: arrastar, `,`/`.`, pílula e API usam essa função.
   - Valida a linha de `transicao` (categoria de → para, `quem`, `requer`) e o `aplica_se` da etapa de destino contra o tipo.
   - O `.` pula as etapas que não se aplicam.
   - Ao entrar numa etapa com `responsavel_regra = 'social_do_cliente'`, faz `responsavel_id = cliente.social_id`.
   - Ao entrar em `fila` sem responsável (também na criação), notifica o `equipe.distribuidor_id`.
2. **`entregar_versao(demanda, nota, anexos)`.** Cria a Vn na rodada atual, move para Revisão e notifica o aprovador (ou o AM). A rodada 1 (`inicial`) nasce com a demanda; enquanto ela for a atual, `rodada.prazo` acompanha `demanda.prazo`.
3. **`enviar_ao_cliente(demanda, versao, via, contato)`.**
   - Exige a etapa Revisão e um tipo com `aprovacao_cliente`.
   - Com `via = 'link'`: faz o teste de Drive público (§5.3), gera o token, grava `token_hash` e `token_cifrado` e cria o item.
   - Grava `enviada_cliente_em` e `enviada_via` e move para Com o cliente.
4. **`registrar_retorno(demanda, versao, decisao, linhas, motivo, prazo, contato, via, link, idempotency_key)`.** É usada pelo link e pelo AM.
   - Exige `status = 'cliente'`, que `versao` seja a última com `enviada_cliente_em` (senão, **409**) e, se vier pelo link, que a demanda esteja em `aprovacao_link_item` daquele link.
   - O índice único `aprovacao_uma_por_versao` e a `idempotency_key` impedem decisão duplicada.
   - **Aprovado:** grava `aprovada_em` e `aprovada_versao_id` e move para Agendar (se `tipo.publicacao`) ou Aprovado.
   - **Ajuste:** chama `abrir_rodada`.
5. **`abrir_rodada(demanda, origem, motivo, prazo, linhas)`.**
   - Cria a rodada N+1 com `prazo` e `prazo_original`, atualiza `rodada_atual` e faz `demanda.prazo = prazo` e `prazo_manual = true`.
   - Cria o checklist "Ajustes R{N+1}", com uma linha por item, e move para Ajustes.
   - Quando N+1 passa das rodadas inclusas, sugere marcar como extra.
   - Notifica o responsável e o AM.
6. **Gatilho `before insert or update of etapa_id, bloqueio, responsavel_id, aprovador_id`.** Calcula `status` (= categoria), `bola` e `com_quem_id`:
   - o bloqueio manda: cliente → `cliente`; fornecedor → `terceiro`; interno → `agencia`;
   - categorias fila, produção, ajuste e publicação → responsável;
   - triagem, revisão e aprovado → `coalesce(aprovador_id, atendimento_id)`;
   - `status_desde = now()` só quando muda a etapa; `concluida_em` ao entrar em `concluido`.
7. **Gatilho `after`.** Quando muda qualquer um de `(etapa_id, bola, com_quem_id, bloqueio)`:
   - fecha a linha aberta de `demanda_etapa_hist` e abre outra, copiando `pausa_sla` (da etapa, ou true se o bloqueio for do cliente);
   - grava a `atividade`.
8. **`rev`.** Sobe só quando mudam campos editados por pessoas: título, briefing, cliente, tipo, responsável, prazos, publicação, planejada, prioridade, estimativa, bloqueio, horário e etapa. Contadores, `ordem` e minutos não contam. Assim, o comentário de outra pessoa não gera 409 em quem está editando o título.
9. **Contadores `n_*`.** São recalculados em INSERT, DELETE e `UPDATE OF excluido_em, feito_em` de anexo e de item de checklist. `minutos_registrados` = soma dos apontamentos fechados.
10. **Prazo.**
    - Para demandas abertas com `prazo_manual = false`: `prazo = publicação − folga_aprovacao_dias` (dias úteis, sem `feriado`). Sem publicação, `criação + sla_dias_uteis`.
    - O prazo é recalculado quando mudam a publicação, o tipo ou os feriados.
    - O aviso "prazo curto" aparece quando o prazo fica a menos de `sla_dias_uteis` da criação.
11. **`evento_sync`.**
    - Todo gatilho que emite um evento faz `perform pg_advisory_xact_lock(7001)` antes do `nextval`, grava o evento e chama `pg_notify('sync', seq)`.
    - Isso serializa os commits na ordem do `seq`, o que é aceitável para 21 pessoas.
    - Com `pauta.importando = 'on'`, nada é emitido. No fim, sai um único `resync`.
12. **Ausência.**
    - A notificação é resolvida no envio: se o destinatário estiver ausente hoje, vai para `substituto_id` com `cobrindo_id`.
    - As consultas de "Com você" incluem quem você cobre (§6.4).
13. **Regras de API** (não de gatilho):
    - até 3 campos obrigatórios por tipo;
    - lista de campos permitidos por papel no PATCH (§7.1);
    - detector de senha no texto: aviso, sem bloquear;
    - "excluir permanentemente" = `excluida_em` + anonimização, bloqueado quando existe `aprovacao`.

### 6.4 Consultas-chave

```sql
-- carga inicial: dicionários + demandas abertas com contadores + seq atual (mesmo filtro de público do SSE)
select * from demanda
where arquivada_em is null and excluida_em is null
  and (status not in ('concluido','cancelado') or concluida_em > now() - interval '7 days');
select coalesce(max(seq), 0) from evento_sync;

-- eu + quem eu cubro hoje (ausência)
create function eu_hoje(p uuid) returns setof uuid language sql stable as $$
  select p union select id from usuario
  where substituto_id = p and current_date between ausente_de and ausente_ate $$;

-- "Com você agora"
select d.* from demanda d
where d.arquivada_em is null and d.bola = 'agencia' and d.com_quem_id in (select eu_hoje($eu))
order by d.prioridade desc, d.prazo nulls last, d.prazo_hora nulls last, d.ordem;

-- "Hoje"
select d.* from demanda d
where d.arquivada_em is null and d.status not in ('concluido','cancelado')
  and (d.responsavel_id in (select eu_hoje($eu)) or d.com_quem_id in (select eu_hoje($eu)))
  and (coalesce(d.planejada_para, d.prazo) = current_date
       or (d.agendada_inicio at time zone 'America/Sao_Paulo')::date = current_date)
order by d.agendada_inicio nulls last, d.prioridade desc, d.prazo_hora nulls last, d.ordem;

-- "Fila da minha equipe sem responsável"
select d.* from demanda d join equipe_membro m on m.equipe_id = d.equipe_id and m.usuario_id = $eu
where d.arquivada_em is null and d.status = 'fila' and d.responsavel_id is null
order by d.prioridade desc, d.prazo nulls last, d.ordem;

-- rodadas no prazo (relatório, v1): 1ª versão de cada rodada entregue até o prazo da rodada
select r.demanda_id, r.numero, min(v.criada_em) <= (r.prazo + coalesce(r.prazo_hora, '18:00')) at time zone 'America/Sao_Paulo' as no_prazo,
       r.prazo <> r.prazo_original as renegociada
from rodada r join versao v on v.rodada_id = r.id group by r.id;
```

### 6.5 Se o banco for SQLite

Não é recomendado. Esta spec depende de recursos do Postgres:
- schema fechado e papéis com `grant` por coluna;
- `pg_advisory_xact_lock` e `LISTEN/NOTIFY`;
- FKs compostas com `aplica_se`;
- busca com `unaccent`.

Em SQLite, cada um precisaria ser refeito no app, num único processo com disco persistente e **nunca em serverless**. A tabela de equivalências está na versão 0.1 (`SPEC-v0.1.md` §6.5).

---

## 7. Permissões, segurança, tempo real e importação

### 7.1 Papéis e transições

| Ação | admin | atendimento | executor | agente (v1) | cliente (link) |
|---|---|---|---|---|---|
| Ver demandas internas | todas | todas | todas | conforme escopo | só os itens do link |
| Criar demanda | sim | sim | em Na fila de qualquer equipe, se cliente e tipo forem reconhecidos (vira solicitante); senão, na Triagem | só na Triagem | não |
| Aceitar da triagem | sim | sim | só o aprovador da equipe | não | não |
| Editar campos (PATCH) | todos | todos | sendo responsável: `briefing_md`, `briefing_campos`, `estimativa_min`, `planejada_para`, `bloqueio`, `bloqueio_motivo`. Fora disso, 403 com o nome do campo | não | não |
| Atribuir responsável | sim | sim | só a si mesmo (Pegar) | sugerir (`responsavel_sugerido_id`) | não |
| Urgente e fura-pauta | sim | sim, com motivo | não | não | não |
| Enviar ao cliente, registrar retorno, marcar extra | sim | sim | não | não | decidir pelo link |
| Comentar | sim | sim | sim | sim | não (o ajuste vai como linhas) |
| Horas | ver todas | as suas + total por cliente | as suas | não | não |
| Arquivar e restaurar | sim | sim | não | não | não |
| Excluir (anonimizar; bloqueado se houver aprovação) | sim | não | não | não | não |
| Cadastros | todos | clientes da carteira | o mural da própria equipe | não | não |
| Pessoas, ausências de outros, importação | sim | não | não | não | não |

O papel "gestor" virou admin e "leitor" saiu. O "aprovador" não é um papel: é uma relação (`equipe.aprovador_padrao_id` → `demanda.aprovador_id`).

**Transições** (seed da tabela `transicao`; o front e o servidor usam a mesma tabela):

| De → Para | Quem | Requer |
|---|---|---|
| triagem → fila | atendimento, admin, aprovador | cliente e tipo |
| triagem → cancelado | atendimento, admin, aprovador | motivo |
| fila → producao | responsável (ou quem pega), atendimento, admin | — |
| producao ou ajuste → revisao | responsável, atendimento, admin | versão nova ("Entregar versão") |
| ajuste → producao | responsável | — |
| revisao → ajuste | aprovador, atendimento, admin | motivo, itens e prazo (rodada interna) |
| revisao → cliente | atendimento, admin | versão + "Enviar ao cliente"; tipo com aprovação do cliente |
| revisao → concluido | aprovador, atendimento, admin | tipo **sem** aprovação do cliente |
| cliente → ajuste ou aprovado/publicacao | atendimento, admin, cliente | retorno (link ou "Registrar retorno") |
| cliente → concluido | atendimento, admin | confirmação "Entregar sem aprovação registrada?" |
| aprovado → publicacao | atendimento, admin | tipo com publicação |
| aprovado ou publicacao → concluido | atendimento, admin; o responsável em publicação | — |
| qualquer → cancelado | atendimento, admin | motivo |
| concluido ou cancelado → anterior | atendimento, admin | — |

Bloquear e desbloquear: quem está com a bola, atendimento e admin.

**Princípios:**
- Todo mundo da agência vê todas as demandas, porque a transparência evita pedido por fora.
- Ninguém vê as horas individuais de outra pessoa, exceto o admin: horas servem para precificar, não para policiar.
- O cliente vê só o que foi explicitamente enviado.

### 7.2 Segurança

**Login e sessão**
- **Login com o Google, feito pelo Node.** O fluxo é OIDC, com código e PKCE. O ID token é validado pelo JWKS do Google. O Supabase Auth não é usado, e nenhuma chave do Supabase vai ao navegador.
- **O acesso exige três coisas:** `email_verified`, a claim `hd` igual ao domínio da Melt (a claim do token, não o parâmetro, que é só dica) e uma linha `usuario` ativa **já cadastrada**. Faltando qualquer uma, a resposta é 403. Não existe cadastro aberto.
- **Primeiro login:** liga `google_sub` à linha pelo e-mail. As FKs continuam apontando para `usuario.id`, o que preserva o que a importação criou.
- **Reserva:** para quem não tem conta Google, o admin gera um link de login de uso único (15 min). Não há senha.
- **Sessão:**
  - `POST /api/sessao` emite o cookie `httpOnly; Secure; SameSite=Lax`, e o token fica como hash em `sessao`;
  - contra CSRF, toda mutação exige `X-Trace-Id` e `Origin` igual ao do app.
- **Desativar alguém ou mudar o papel:** revoga as sessões e fecha o SSE dessa pessoa.

**Banco**
- O schema `pauta` fica fora dos "Exposed schemas" do Supabase, com `revoke` para `anon` e `authenticated`.
- **RLS ligado em todas as tabelas, com política só para `pauta_app`.** RLS sem nenhuma política bloquearia também o app.
- O Node usa o papel `pauta_app`, que só tem DML, com as restrições de coluna da §6.2. A `service_role` fica só nas migrações.

**Texto vindo de fora** (ajuste do cliente, `desc` do Trello, texto colado do WhatsApp, auditorias de agente)
- **Renderização.** Markdown renderizado com markdown-it `{html: false}` + DOMPurify, com allowlist: p, br, strong, em, s, code, pre, blockquote, ul, ol, li, h1–h3, hr, a.
- **Links.** Só `https:` ou `mailto:`, com `rel="noopener noreferrer nofollow ugc"`.
- **Texto puro.** `origem_texto`, o texto do cliente e `nome_informado` são exibidos só com `textContent`.
- **CSP:**
  - `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
  - `frame-src` limitado a Drive `/preview`, youtube-nocookie e embed do Figma.
- **No código.** Uma regra de lint proíbe `dangerouslySetInnerHTML`.
- **Menções.** O servidor extrai as menções do Markdown, valida contra os usuários ativos e grava em `comentario_mencao` / `demanda_mencao`. Ao editar, só as menções novas notificam.

**Arquivos**
- **Upload do MVP:** até 10 MB (prints, PDFs, referências).
  - Vai direto ao bucket privado por URL assinada de upload, emitida pelo Node.
  - O `anexo` só é confirmado depois de ler o magic number e conferir a allowlist: jpg, png, webp, gif, pdf, zip (mp4 e mov na v1, com o limite de 200 MB).
- **Download:** sempre por URL assinada de 10 minutos, com `nosniff`. Qualquer tipo fora das imagens sai com `Content-Disposition: attachment`. Nada é servido pelo domínio do app.
- **Prévia embutida:** só para hosts conhecidos, com `sandbox`. O resto vira card de link.
- **Caminho `M:\`:** é texto com o botão Copiar, nunca `href`.
- **Exclusão:** marca `excluido_em` e entra em `storage_lixo`. O job diário apaga do bucket depois de 30 dias.

**Link público `/a/:token`**
- **Token:** 32 bytes aleatórios. No banco ficam só o hash (busca) e a versão cifrada (para "Copiar lembrete").
- **Decisão:** só por `POST /a/:token/decisao {demanda_id, versao_id}` com `Idempotency-Key`. As validações estão na §6.3 (item 4).
- **O GET não tem efeito colateral,** porque o robô de prévia do WhatsApp abre o link. O acesso conta por `POST /a/:token/visto`, disparado pelo JS da página.
- **Arquivos da página:** só os das versões enviadas naquele link, por URL assinada de 10 minutos.
- **Headers:** `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`.
- **Logs:** os caminhos `/a/*` são mascarados.
- **Limite:** 30 requisições por minuto por IP.
- **`ip_hmac`:** HMAC com segredo, apagado depois de 12 meses.
- **PIN (v1):** chega com `falhas` e `bloqueado_ate` (5 erros bloqueiam o link por 15 minutos).

### 7.3 Tempo real

**Protocolo:**
- **Canal:** `GET /api/eventos` (SSE), autenticado pelo cookie de sessão. O `id` de cada evento é o `seq`. Na reconexão, o navegador manda `Last-Event-ID` sozinho, o equivalente ao `ixLastUpdate` (OBS `ev_218e5619`, `ev_55ce9819`).
- **Sem buracos.** O `seq` segue a ordem de commit (§6.3, item 11), então nenhum evento fica para trás de um `Last-Event-ID` já recebido.
- **Mensagem:** `event: d`, com `{e: entidade, id, op, p: patch parcial, c: campos[], t: trace_id, a: ator}`.
- **Ping a cada 25 s.** Em cada ping, o servidor revalida a sessão, o `ativo` e o papel. Se o papel mudou, manda `event: resync`; se a pessoa foi desativada, fecha a conexão.
- **Dispatcher.** Usa uma conexão **direta** (porta 5432, não o pooler 6543) para o `LISTEN`. Ao reconectar, relê `seq > último_emitido`.
- **Ressincronização:**
  - se o `Last-Event-ID` for menor que o menor `seq` guardado (7 dias), o servidor responde `event: resync` e o cliente recarrega `/api/bootstrap`. É o caso do `syncError` do Trello, OBS `ev_0b9e5a1b`;
  - sem SSE, o cliente faz polling em `GET /api/sync?desde=N` com backoff de 5 s a 60 s;
  - `/api/eventos`, `/api/sync` e `/api/bootstrap` aplicam **o mesmo filtro de público**.
- **Mutações:** HTTP, com `X-Trace-Id` e `If-Match: rev`.
  - A interface aplica a mudança na hora e ignora o eco com o mesmo `trace_id`.
  - Um 409 devolve o estado atual. O cliente mescla campo a campo; a mudança de etapa é revalidada.
- **Desfazer.** Vale só para mutações sem efeito externo (etapa, responsável, prazo, arquivar, aprovação manual). O desfazer é uma mutação inversa pela API. Ações com efeito externo, como gerar link, pedem confirmação e não entram na pilha.
- **Reconexão:** começa em 1 s e chega a no máximo 30 s. Com a aba oculta, o intervalo multiplica por 4.

**Quem recebe o quê:**

| Entidade | Quem recebe | Campos |
|---|---|---|
| demanda | todos os internos | patch dos campos alterados |
| comentário, anexo, versão, aprovação, checklist | todos os internos; o navegador aplica o patch se a demanda estiver aberta ou em cache | objeto pequeno |
| cliente, tipo, etapa, visão, aviso do mural | todos os internos | objeto |
| notificação | **só o destinatário** | objeto |
| apontamento | **o dono + admin** | objeto (os outros recebem só `demanda.minutos_registrados`) |
| página do cliente | **não recebe tempo real** | a decisão é validada no servidor (409) |

### 7.4 Importação Trello → Pauta

**Como funciona** (script de uso único, na máquina do admin; o app web nunca pede credenciais do Trello):
1. **Exportação.** O admin exporta o JSON de cada quadro pelo menu do Trello.
2. **`node importar.ts preparar`.**
   - O script lê os JSONs.
   - Para as ~190 ativas, busca as ações completas de cada card pela API do Trello, com o token do próprio admin passado na hora e nunca gravado. Isso é necessário porque o JSON do quadro traz só as 1.000 ações mais recentes, e o ATENDIMENTO tem cerca de 12 mil.
   - Gera CSVs: `pessoas`, `clientes_apelidos`, `listas_etapas`, `demandas` (uma linha por card: cliente, tipo, etapa, responsável, AM, prazo, ação sugerida e motivo) e `mural`.
3. **Revisão.** Cada AM filtra a própria carteira e corrige o que for preciso. Os contadores no topo mostram "ativas sem responsável", "paradas há mais de 30 dias" e "cliente com confiança abaixo de 90%".
4. **`node importar.ts executar`.**
   - Roda numa transação, com `set_config('pauta.importando', 'on', true)`. Os gatilhos pulam histórico, notificações e `evento_sync`, e o script grava o histórico com as datas reais.
   - **Só insere, nunca sobrescreve.** Toda linha criada registra `importacao_ref` (`insert … on conflict do nothing returning`). O que já existe sai como "já importado", ou "divergente" quando foi editado no Pauta depois.
   - No fim, emite um único `resync` e um relatório.
5. **Reexecução.** O mesmo script roda de novo para o Tráfego, o Arquivo e a Produção (v1).

**Estrutura:**

| Trello | Pauta |
|---|---|
| quadros CRIAÇÃO, SOCIAL, WEB, TRÁFEGO | `equipe` (o Tráfego entra com a API) |
| quadro ATENDIMENTO | **não é equipe.** Cada card herda a equipe e o responsável de **onde estava antes** (abaixo) |
| PRODUÇÃO | fica no Trello até a v1 (fluxo "Produção gráfica") |
| CEMITÉRIO, LIXO, FINALIZADAS antigas | Arquivo, na v1. Até lá, o Trello fica legível |
| CLIENTES | `cliente`: status pela lista, nível pelas ⭐, criativo pela etiqueta com nome |
| SOCIAL › DEMANDAS, cards "LORENA" e "FERNANDA" | `cliente.social_id` |
| AVISOS › carteira por AM, "CLIENTES BRUNA/SAMARA" | `cliente.atendimento_id` |
| POLÍTICA 2026 | cada lista de candidato vira `cliente` com `pai_id` = "Política 2026" |
| ANTARES | fica no Trello até a v1 (projeto) |
| contas pessoais | `usuario` |
| contas de departamento | autor sintético "Equipe X (importado)", `email = importado+<slug>@pauta.invalid`, `ativo = false` |

**Listas → etapa e pessoas:**

| Padrão de lista | Etapa | Pessoas |
|---|---|---|
| DEMANDAS (Criação, Social, Web) | Na fila | equipe do quadro, sem responsável |
| `<PESSOA>` (ANA ALICE, SALTY, RAFA, RICK, SEBASTIÃO, LORENA, Fernanda, CARLOS, VINICUS, DIEGO, WESLEY, ARTHUR, GABRIEL) | Em produção | `responsavel_id` = pessoa (apelido) |
| PEDRO (Tráfego) | Triagem (rascunho) | `aprovador_id` = Pedro |
| `<AM> - FINALIZADAS/OS`, "Samuel Mayla OK", DEMANDAS CONCLUIDAS | **Com o cliente** (o `dueComplete` só diz que o executor entregou). A coluna "já aprovado?" da planilha leva para Entregue | AM = dono da lista; equipe e responsável vêm da origem |
| `<AM> - AGUARDANDO`, LEONARDO - DEMANDAS | etapa de origem + `bloqueio` (motivo pela etiqueta; padrão `cliente`) | idem |
| **qualquer lista de AM com `dateLastActivity` acima de 30 dias** | **arquivada**, etapa Entregue, atividade `importada_sem_fechamento`, mesmo sem `dueComplete`. A planilha tem a caixa "manter ativa" | idem |
| LIXO | arquivada (v1) | |
| AVISOS E RECADOS, DOCUMENTOS DE APOIO, MODELOS | `equipe_aviso` da equipe do quadro (título e descrição) | |
| PLANILHAS, CARD PARA REUNIÕES, COMERCIAL | só no relatório | |
| cards SENHAS, ACESSOS… (nome com senha, acesso ou login) | **não importar**; aviso para migrar ao cofre | |
| cabeçalhos SEGUNDA…SÁBADO, "↓↓ … ↓↓", ".", "-----" | descartar | |

**Origem dos cards do ATENDIMENTO:**
1. `equipe_id` = o quadro de origem, e `responsavel_id` = a lista de origem (`listBefore` de `<PESSOA>`). Ambos vêm da última ação `moveCardToBoard`/`updateCard` antes de o card entrar no ATENDIMENTO.
2. Na falta dessa ação, o responsável vem da saudação do briefing (`/^Ei,?\s+(\p{L}+)/u`), pela tabela de apelidos.
3. O que sobrar entra no contador "ativas sem responsável" da planilha.

**Campos do card:**

| Campo do Trello | Campo do Pauta | Regra |
|---|---|---|
| `id` | `trello_card_id` + `importacao_ref` | os 8 primeiros hex são o timestamp de criação → `criada_em` quando não houver `createCard` |
| `shortLink`/`url` | `trello_url` | link de origem |
| `idShort` | ignorado | muda a cada troca de quadro; o `numero` novo é sequencial |
| `name` | `titulo` + `cliente_id` | prefixo `^\[(.+?)\]` ou `^(.+?)\s[-–\|:_]` → apelido → cliente; o prefixo sai; "Entrega dd/mm" → `publicacao_em` |
| `desc` | `briefing_md` | "Atendimento: X" → `atendimento_id`; "Prioridade: Alta" → `prioridade`; "Solicitado por/Site/Plataforma/Previsto" → `briefing_campos`; `M:\\[^\n]+` → `anexo` tipo `caminho` |
| `due` | `prazo` + `prazo_hora` | de UTC para America/Sao_Paulo; 18:00 vira só a data |
| última mudança de lista ou quadro (actions) | `status_desde` + 1ª linha de `demanda_etapa_hist` | data real; `parcial = true` se o card for mais antigo que a ação mais antiga disponível |
| `dueComplete` | só informativo | marcado pelo executor ao entregar (não significa aprovado) |
| `labels` | vários campos (abaixo) | nenhuma etiqueta vira cliente |
| `checklists` | `checklist` + `checklist_item` | criado no mesmo dia de uma ALTERAÇÃO → `rodada_id` da rodada N |
| comentários "[Vn]"/"[AJUSTE]" + link do Drive ou caminho `M:\` | `versao` Vn (`importacao_ref` `'<actionId>#versao'`) + `anexo` | a rodada vem da sequência de ALTERAÇÃO. Cards "Com o cliente" sem versão ganham uma V1 "importada", `enviada_via = 'fora'` |
| comentário "Tempo gasto: 2h30" | `apontamento` (origem `importado`, ref `'<actionId>#tempo'`) | minutos = 150 |
| outros comentários | `comentario` | autor mapeado ou sintético; `visivel_cliente = false` |
| `attachments` com `isUpload=false` | `anexo` link | provedor pelo host (Drive, Docs, Figma, Canva, we.tl (expira), YouTube…) |
| `attachments` com `isUpload=true` | `anexo` link para o Trello (exige sessão) | baixados para o storage pelo script do admin antes de o Trello sair (v1) |
| `closed` | `arquivada_em` | |
| `dateLastActivity` | `atualizada_em` | também decide "parado há mais de 30 dias" |

**Etiquetas → campos:**

| Grupo de etiquetas (todas as grafias e cores) | Destino |
|---|---|
| FURA PAUTA, URGENTE | `prioridade` 2 e 1 + motivo "importado" |
| IMPORTANTE (cerca de 1.100 usos: ruído) | normal (0) |
| PRIMEIRA DO DIA, "até 11h/15h/18h", PARA HOJE, ENTREGAR HOJE | `prazo_hora` (PRIMEIRA DO DIA = 11h; "até Xh" = X), sem chip próprio |
| ALTERAÇÃO, AJUSTE, REFAÇÃO, revisão, Refação de Briefing | `rodada_atual` 2 ou mais + `rodada` (origem `cliente`; Refação de Briefing → `briefing_incompleto`) |
| ERRO D.A, ERRO ATENDIMENTO, DEMANDA INCOMPLETA | `rodada.motivo` (`erro_execucao`, `erro_atendimento`, `briefing_incompleto`) |
| Aguardando Informação(ões), Aguardando Aprovação, Aguardando Artes, Aguardando alinhamento, EM ESPERA, standby | `bloqueio` (`cliente` ou `interno`) + `bloqueio_motivo` |
| APROVADO, CONCLUÍDO, EM ANDAMENTO | confirmam a etapa |
| 5 MIN … 3 HORAS, 1H30MIN | `estimativa_min` |
| GRID, COPY, RELATÓRIO, CRIAR APRESENTAÇÃO, PREPARAR PARA IMPRESSÃO, TEMPLATE CANVA, AGENDAR POST, Filmagem Externa, REUNIÃO… | `tipo_peca_id` (Filmagem Externa e REUNIÃO: tipos `com_horario`; o horário vem do título, como em "19/10 às 10h") |
| ENVIAR PARA SOCIAL E ATENDIMENTO | tipo com publicação → a demanda segue para Agendar ao ser aprovada |
| DEMANDA RECORRENTE, SEMANAL, DIÁRIA | relatório (sugestão de recorrência, v1) |
| DEMANDA DIVIDIDA, DESDOBRAMENTOS, DEMANDA DIRECIONADA | relatório (vínculo mãe/filha, v1) |
| produção gráfica (EM COTAÇÃO, Aguardando Prova, ENVIAR OP…) | fluxo gráfico (v1) |
| CLIENTES: nome do criativo, ⭐ a ⭐⭐⭐ | `cliente.criativo_id`, `cliente.nivel` |
| DEMANDA, Demanda e etiquetas sem nome | descartar |

**Escopo do dia 0:** só o ativo, ou seja, cerca de 190 demandas abertas (138 com atividade nos últimos 90 dias), mais o mural, os clientes e as pessoas.

---

## 8. Direção visual

Os tokens completos, com claro e escuro e contraste calculado, estão em `marca.md` §7. Aqui ficam as decisões que guiam as telas.

**Princípios:**
- **O laranja `#FE5000` é acento** e ocupa no máximo uns 10% da tela.
  - Aparece em: um botão primário por tela ("Nova demanda", "Enviar ao cliente"), anel de foco, card selecionado e progresso.
  - Nunca vira fundo de coluna, chip de cliente ou avatar.
- **Claro com âncora escura, sem "parede preta" (`marca.md` §6).**
  - No tema claro, a barra superior usa `.chrome-dark`, e o canvas é `--bg` liso, **sem imagem por padrão**.
  - As imagens de fundo (`cover_dark`, `section_geo`, `section_marble`) ficam só no tema escuro, ou numa faixa de 160 px no topo da visão.
  - O escuro trabalha em camadas (`#0A0A0A` → `#111` → `#181818` → `#1F1F1F`), nunca preto chapado.
- **Cor com significado:**
  - faixa de 3 px no topo de cada coluna, pela categoria (§5.1);
  - chip do cliente na cor do cliente;
  - estados de prazo em `--warning`, `--danger` e `--success`.

  É a resposta às "colunas coloridas" do Dmanda, sem decoração.
- **Syne** hospedada no próprio app:
  - corpo em 400, títulos em 500/600, 700 só em micro-rótulos em CAIXA ALTA, **800 proibido**;
  - **nunca trocar o peso** em hover ou "não lido";
  - sem os glifos ≥ ≤ ≠ ± (escrever "até", "ou mais");
  - `tabular-nums` nos contadores.
  - **Teste no protótipo:** Syne em 12 px nos metadados do card e nas células da Lista. Se falhar na legibilidade, a Syne fica de `--fs-card` para cima, e metadados e células usam a fonte do sistema (Segoe UI). Essa troca precisa do aval da marca.
- **Respiro:**
  - colunas de 296 px, padding de 12 px, 16 px entre colunas e 8 px entre cards;
  - card de 72 a 88 px: em card apertado, corta-se conteúdo e nunca o espaçamento.
- **Vidro fosco** só em camadas grandes (barra superior, menu lateral, popovers, modal e colunas sobre imagem no escuro):
  - opacidade de 0,80 no claro e 0,82 no escuro, com blur de 24 px;
  - **nunca nos cards**;
  - cai para sólido com `prefers-reduced-transparency`, `prefers-contrast: more` ou sem suporte.

**Tokens principais:**

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#F3F3F3` | `#0A0A0A` | canvas |
| `--surface-sunken` | `#EBEBEB` | `#111111` | coluna |
| `--surface` | `#FFFFFF` | `#181818` | card, input |
| `--surface-raised` | `#FFFFFF` | `#1F1F1F` | popover, modal |
| `--text` / `--text-2` / `--text-3` | `#111111` / `#4A4A4A` / `#666666` | `#EDECEA` / `#B8B7B5` / `#8A8A8A` | texto |
| `--border` / `--border-control` | `#E6E6E6` / `#8A8A8A` | `#262626` / `#707070` | linhas / inputs (3:1 ou mais) |
| `--accent` / `--on-accent` | `#FE5000` / `#0A0A0A` | igual | CTA (texto escuro sobre laranja: 6,0:1) |
| `--accent-ink` | `#BD3900` | `#FE5000` | texto ou ícone laranja pequeno |
| `--success` / `--warning` / `--danger` / `--info` | `#33CC66` / `#FFCC33` / `#FF3366` / `#3399FF` (+ `-bg`/`-ink` AA) | idem | entregue e aprovado / vence hoje e ajuste / atrasada / com o cliente |
| clientes e avatares | âmbar, amarelo, rosa, magenta, roxo, berinjela, verde, turquesa, azul, grafite (`--label-*` com `-bg`/`-ink`) | ajustados | chip do cliente, avatar, faixa de categoria |
| raios | 6 chip · 8 botão · 10 card · 14 coluna/popover · 20 modal | | |
| movimento | 120, 200, 320 ms com `cubic-bezier(.2,.8,.2,1)`; zero com reduced-motion | | |

**Componentes:**
- **Card:**
  - `--surface`, borda 1 px `--border`, raio de 10 px, `--shadow-card`;
  - hover com `--shadow-hover`;
  - arrastando: `--shadow-drag` e rotação de 2°;
  - pendente (diálogo aberto): opacidade 0,6 e borda tracejada;
  - selecionado: `--accent-soft` com borda `--accent`.
- **Chip do cliente:** sigla em `--label-<cor>-ink` sobre `-bg`. É o elemento mais reconhecível do card e substitui o prefixo do título.
- **Bola:** Agência neutro, Cliente `--info`, Terceiro berinjela. "Parado há" em `--warning-ink` acima do limite.
- **Logo:**
  - laranja no claro (máscara CSS sobre `logo_dark.png` até chegarem os SVG oficiais);
  - `#EDECEA` no escuro;
  - "e" mark no menu recolhido e no favicon;
  - barra arco-íris só no login.
- **Microtexto:**
  - direto, sem exclamação, com números ("3 demandas atrasadas");
  - datas como "qui, 16/10, 18h" e "14 out";
  - números como "1.255" e "−12%".

**Pendências de marca:** SVG oficiais do logo, confirmação de `tnum` na Syne, resultado do teste de 12 px e suporte a `light-dark()` nos navegadores da agência (se não houver, o fallback é gerado no build).

---

## 9. Ledger REA

### 9.1 Conclusões que vieram do REA e como as usamos

As classificações seguem os relatórios: OBS = observado em execução ou tráfego; i18n = string do pacote pt-BR; DER/EST = lido no bundle; INF = inferência. Os IDs completos estão em `rea-ui.md` §1, `rea-bundle.md` §1 e `rea-dados.md` §1.

| # | Conclusão | Evidência | Tipo | Uso na SPEC |
|---|---|---|---|---|
| 1 | O quadro carrega com 2 requisições grandes em paralelo; os cards vêm com badges prontos; os itens de checklist só chegam ao abrir o card | `ev_1df922bc`, `ev_ebf9d372` | OBS | `/api/bootstrap` + contadores `n_*` + detalhes sob demanda (§6.4) |
| 2 | `pos` é float por pai: passo 16384, média, topo /2, sem gravar quando o item já está no lugar | `ev_c02e4327` + bundles `board-route`/`card-back` | OBS + EST | `pos double` em listas curtas; `ordem` lexo global calculada no servidor (§6.1) |
| 3 | Histórico = `action` com `type` + `data` + `old`; a mudança vem indicada pela chave em `old` | `ev_c02e4327` | OBS | `atividade(tipo, dados, antes)` (§6.2) |
| 4 | Tempo real: assinatura por modelo, `ixLastUpdate`, pushes com deltas parciais, `traceId` para casar o eco | `ev_218e5619`, `ev_1df922bc`, `ev_ebf9d372` | OBS + EST | SSE com `seq`, `patch`, `campos`, `trace_id` (§7.3) |
| 5 | Ressincronização por `/deltas?ixLastUpdate`; fila limitada (`syncError`) | `ev_55ce9819`, `ev_0b9e5a1b` | OBS | `evento_sync` com 7 dias + `resync` (§7.3) |
| 6 | Não há offline real; interface otimista em larga escala com desfazer, refazer e repetir | `ev_e684e518` (sem SW) + strings do app (`ev_203b7d70`) | OBS + DER | otimista + "Desfazer" no aviso (MVP); Z/Shift+Z e offline (v1) |
| 7 | Arrastar e soltar com Pragmatic DnD; editor ProseMirror com Markdown commonmark | `ev_dd09e2f7`, `ev_57279d06` | INF forte | escolha de bibliotecas (§4.5); Markdown como formato canônico |
| 8 | Visões Tabela, Calendário, Painel, Cronograma e Mapa são pagas e bloqueadas sem login | `ev_ac022f49`, `ev_b1517f56`, `ev_c7decd4c`; `premiumFeatures` em `ev_218e5619` | OBS + i18n | visões sem paywall (§3, linha 18) |
| 9 | Checklist com responsável e prazo por item é pago (`advancedChecklists`) | `ev_218e5619`; schema `CheckItem.idMember/due` | OBS + DER | incluído na v1, sem custo |
| 10 | Filtro rico, guardado na URL e no localStorage e reaplicado ao recarregar | `ev_7dca7913`, `ev_557d195b`, `ev_09eb00e8` | OBS | filtros na URL + visões semeadas (MVP) e pessoais (v1) |
| 11 | Limite WIP aparece como "n / limite" no contador | `ev_127484b1` | OBS | contador (MVP); limite com a capacidade (v1) |
| 12 | Colunas recolhíveis (`\`, Shift+`\`), com estado salvo | `ev_989ab06e`, `ev_a11c354f`, `ev_557d195b` | OBS | igual + recolhidas por padrão por visão |
| 13 | Catálogo de cerca de 36 atalhos; `?` abre a lista; atalhos podem ser desligados | `ev_4129a633`, `ev_b8c66c49` | OBS | cerca de 15 no MVP, sem conflito com o navegador (§5.17) |
| 14 | Verso do card em `/c/<short>` por cima do quadro; ←/→ navega; menu Compartilhar | `ev_9b98b3d2`, `ev_0da551f2` | OBS | `/d/<numero>` |
| 15 | Carregamento em esqueleto; lista vazia sem texto; filtro vazio por lista | `ev_127484b1`, `ev_557d195b` | OBS | §5.16, com estados vazios melhores |
| 16 | No celular (390 px) as listas ficam com largura fixa e rolagem horizontal; o modal ocupa quase a tela toda | `ev_73623db2` | OBS | quadro como lista com chips (§5.15) |
| 17 | Etiquetas: 30 cores; nomes aparecem e somem para o quadro inteiro | `ev_557d195b`, `ev_c7decd4c` | OBS + i18n | sem etiquetas: tudo virou campo |
| 18 | Campos personalizados com 5 tipos e `display.cardFront` | `ev_36cdbf08`, `ev_c7decd4c` | OBS + i18n | campos por tipo de peça |
| 19 | Butler com 5 tipos de automação e cerca de 700 tokens, por cota de plano | `ev_cf09c4c1` | DER | regras do ciclo embutidas + 3 automações por interruptor (v1), sem construtor |
| 20 | Template de entrada depende de Forms + Zapier + Butler | `ev_127484b1`, `ev_18e9ae4e` | OBS | Triagem nativa |
| 21 | O quadro público é só leitura; não existe aprovação externa | `ev_989ab06e` | OBS | página de aprovação por link |
| 22 | Exportação JSON pelo menu (CSV e ZIP pagos) | `ev_703af865`, `ev_c7decd4c`, `ev_218e5619` | OBS + i18n | o script de importação parte do JSON exportado |
| 23 | O pt-BR existe e a semana começa no domingo | `ev_dd09e2f7` | OBS/DER | nós começamos na segunda em todas as telas, para casar com a Minha semana |
| 24 | Não há ferramentas WebMCP | `ev_6f4acb88` | OBS | MCP próprio como diferencial (v1) |
| 25 | Limites de referência: 5000 cards por lista, 200 itens por checklist, 50 campos | `ev_1df922bc` | OBS | dimensionamento (o volume da Melt fica muito abaixo) |

### 9.2 O que ficou desconhecido e como tratamos

| Desconhecido | Relatório | Impacto / decisão |
|---|---|---|
| Formato real de um push incremental (`updateModels`, `next` do GraphQL) | rea-dados | baixo: o nosso protocolo é próprio (§7.3) |
| Renormalização de `pos` no servidor e retenção exata da fila de deltas | rea-dados | resolvido no desenho: `ordem` calculada no servidor + índice único + 7 dias de fila |
| Métodos e payloads de escrita da API | rea-bundle, rea-dados | irrelevante: a API é nossa |
| Layout do menu "Adicionar ao cartão" e das ações do verso em edição | rea-ui | desenhado do zero (§5.2) |
| Painel de comentários e atividade aberto | rea-ui, rea-dados | desenhado do zero, com abas Comentários / Histórico |
| Conteúdo das visões Tabela, Calendário, Painel, Cronograma e Mapa; Planner e Inbox | rea-ui, rea-bundle | as nossas visões vêm do uso da Melt, não do Trello |
| Comportamento real de arrastar e soltar | rea-ui | definido na §5.1 (destinos calculados no início, fantasma, Esc, rolagem automática); validar no protótipo |
| Gramática completa do Butler | rea-bundle | fora de escopo (sem construtor de regras) |
| Valores dos campos `number`, `checkbox` e `list`; `cardRole`; `list.color`/`softLimit` | rea-dados | baixo: o nosso tipo de campo é definido aqui |
| Fronteira exata entre grátis e pago | rea-ui | irrelevante: interno, sem plano |
| Tablet (768 px) e modo escuro do Trello | rea-ui | definimos os nossos breakpoints e tema (§8) |
| Grafo semântico do REA parcial (bundles grandes); `trace_application_feature` sem correspondência | rea-bundle (`ev_72868f4c`, `ev_41770bd7`), rea-dados (`ev_8e18961d`) | as conclusões de biblioteca e mecanismo são INF forte, vindas da varredura de strings; nada crítico depende delas |
| Do lado da Melt: cards arquivados não contados; cerca de 10 a 30 cards de "SAMUEL - FINALIZADAS" fora da leitura; o JSON do quadro traz só as 1.000 ações mais recentes | trello-melt | o script busca as ações completas das ativas e mostra as contagens reais na planilha |
| Do lado do Dmanda: só a página de venda foi vista | mercado | a comparação vale "segundo a landing" |

---

## 10. Críticas descartadas

Críticas descartadas no todo ou em parte. O restante das três críticas foi incorporado.

1. **Operação #5 (parte):** dois fluxos semeados. Um fluxo com etapas condicionais (`aplica_se`) tem o mesmo efeito e mantém uma única tabela de transições.
2. **Operação #6 (parte):** trocar `atendimento_id` por `solicitante_id`. Ficam os dois: o AM continua dono do envio ao cliente, e o solicitante registra quem pediu.
3. **Operação #8 (parte):** ordenar por `primeira_do_dia`. O campo saiu (produto #11); PRIMEIRA DO DIA vira `prazo_hora`, que já está na ordenação.
4. **Operação #4 (parte):** decisão "aprovado em parte". É uma rodada de ajuste: as linhas listam o que muda, sem um terceiro estado.
5. **Operação #11 (parte):** CEMITÉRIO leve no MVP. O Trello fica legível até o Arquivo da v1, então nada se perde, e evitamos importar 2.260 cards duas vezes.
6. **Operação #12 (parte):** substituto por cliente e leitura de "(nas minhas férias)". O substituto por pessoa cobre o caso com 3 colunas; o padrão no texto é raro e passageiro.
7. **Produto #5 (opcional):** Ajustes dentro de Na fila. Ajustes continua coluna própria, porque é o sinal visível do retrabalho, e é recolhível por visão.
8. **Produto #4 (parte):** barra de carga com a estimativa do tipo no MVP. Vai para a v1 com a capacidade; no MVP a coluna mostra a contagem.
9. **Produto #7 (parte):** PWA com `share_target` e Web Push no MVP. Vão para a v1; no MVP o "+" do celular já abre o "Colar do WhatsApp".
10. **Engenharia #7 (parte):** Minha semana na v1. Ela fica no MVP sem carga, porque é o mesmo componente do quadro agrupado por dia e substitui SEG…SEX no dia 1.
11. **Engenharia #7 (parte):** versões só por link do Drive. Aceitamos também o caminho de rede e arquivo de até 10 MB (prints e referências), com as regras de upload da §7.2.
12. **Engenharia #1 (parte):** Supabase Auth com hook "Before User Created". O OIDC do Google no Node aplica o mesmo controle (e-mail verificado, domínio, allowlist) sem chave do Supabase no navegador.
13. **Engenharia #1 (ajuste técnico):** RLS "sem nenhuma política" bloquearia também o `pauta_app`. Usamos RLS com política só para ele.
14. **Engenharia #3 (parte):** contador de falhas do PIN no MVP. O PIN foi para a v1 (produto #1), e `falhas`/`bloqueado_ate` chegam com ele. O token de 32 bytes já impede força bruta.
