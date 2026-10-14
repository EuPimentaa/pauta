# Como a Melt usa o Trello hoje

Leitura do workspace "MELT COMUNICAÇÃO" em 14/10/2026 (America/Sao_Paulo), feita só com as ferramentas de leitura do MCP do Trello. Nada foi gravado no Trello.

**Método.** Li todos os cards abertos de 10 quadros: 4.047 em arquivos, mais 22 do SOCIAL que vieram direto na resposta. Também li listas, etiquetas, campos personalizados e membros. A atividade recente veio de 13 lotes de 100 eventos por quadro, cobrindo de 17/09 a 14/10 conforme o quadro. Acompanhei o histórico completo de 5 cards e li checklists e anexos de uma amostra.

**Limitações.**
- Cards arquivados (*closed*) não foram contados, porque a leitura em massa não traz o total.
- Na lista "SAMUEL - FINALIZADAS", um card com conteúdo grande quebra a paginação. Li 57 cards dela; o restante, estimado em 10 a 30, ficou de fora.
- Nas leituras em massa, os campos `comments` e `checklists` vêm vazios. Para saber o uso real, recorri à atividade e à leitura card a card.
- As durações abaixo vêm de uma janela de 2 a 4 semanas. Servem para ter ordem de grandeza, não como métrica oficial.

Arquivos brutos (com dados pessoais, **não** distribuir): `scratchpad/trello-raw/`. Scripts usados: `scratchpad/scripts/`.

---

## 0. Resumo em 12 linhas

1. O Trello da Melt é um **sistema de "pessoa = lista"**. Cada quadro é um departamento, e cada lista é uma pessoa ou um estado. As contas são **compartilhadas por departamento**: "Atendimento Melt", "Criação Melt", "melt socialmidia", "Webers" e "Melt Trello". São 9 contas para cerca de 21 pessoas.
2. O fluxo central é **Atendimento → equipe executora → Atendimento → (ajuste ↺) → Cemitério**. O card muda de **quadro**, não só de lista. Uma mesma demanda passa por 2 a 6 quadros.
3. **Nenhuma etiqueta é cliente.** O cliente aparece no **prefixo do título** (97% dos cards, mas com 369 grafias diferentes), nas **listas do CEMITÉRIO** (uma por cliente) e no quadro **CLIENTES**.
4. As etiquetas codificam **prioridade, rodada (nova ou alteração), bloqueio, estimativa de esforço, tipo de peça e recorrência**. Somam cerca de 500 objetos de etiqueta para uns 60 conceitos, com a mesma etiqueta em até 7 cores.
5. **Zero campos personalizados.** Quem pediu, quem atende, a prioridade, as horas gastas e a janela prevista vão escritos no texto do card.
6. A **entrega fica no Google Drive**. O card recebe um comentário com "[V2]", o caminho `M:\…\CLIENTES\<CLIENTE>\…\SAÍDA` e o link. Comunicação por @menção é praticamente nula.
7. A **rodada de alteração** funciona assim: o Atendimento desmarca "concluído", cria um checklist com os pedidos do cliente, aplica a etiqueta ALTERAÇÃO e devolve o card. Cerca de 18% das demandas de Criação voltaram 2 ou mais vezes em 4 semanas.
8. Tempos típicos:
   - Criação → Atendimento: mediana de cerca de 2,2 dias (p80 de cerca de 5 dias).
   - Prazo pedido: mediana de 2,7 dias a partir da criação do card.
   - 66% dos prazos estão exatamente às **18:00**, o horário padrão.
9. Volume: de 10 a 20 demandas novas por dia útil saem do Atendimento, ou seja, de 200 a 300 por mês. Há cerca de 190 demandas realmente em andamento hoje.
10. O **CEMITÉRIO** é um arquivo por cliente: cerca de 95 listas e 2.260 cards. A conta "Melt Trello" alimenta o quadro em **faxinas em lote**, com cerca de 25 cards em 12 minutos.
11. O **PRODUÇÃO** é um mini-ERP de gráfica, com orçamento, fornecedor, prova, OP, pagamento, NF e frete. Funciona por listas e cerca de 40 etiquetas de status. Hoje só atende os clientes Bosque e Ramacrisna.
12. Já existem **agentes automáticos escrevendo no Trello**:
    - No TRÁFEGO, cards "[AGENTE] Rodada dd/mm" e "[OP][cliente]" com rascunho e fluxo de aprovação.
    - No WEB, cards "Auditoria - site" muito estruturados.

    O sistema novo precisa de API e aprovação de primeira classe.

---

## 1. Inventário: quadros, listas, etiquetas, membros

O workspace tem 13 quadros: 10 abertos e 3 arquivados (FESTIVAL BRASIL, Rotina Website, Dezembro 2024). Além dos 8 citados no pedido, há mais dois abertos: **CLIENTES** e **ANTARES · Plano de Marca Out26–Mar27**, este criado em 14/10/2026.

**Campos personalizados: nenhum, em nenhum quadro.**

Membros do workspace (9, todos com papel admin no workspace):

| Conta | Tipo | Uso real |
|---|---|---|
| Melt Trello | genérica (admin dos quadros) | gestão: cria demandas, faz faxina no Cemitério, aprova |
| Atendimento Melt | departamento | ~7 atendimentos (Bruna, Fabiana, Leonardo, Pri, Pablo, Samara, Samuel) |
| Criação Melt | departamento | designers e audiovisual (Ana Alice, Salty, Rafa, Rick, Sebastião) |
| melt socialmidia | departamento | social media (Lorena, Fernanda) |
| Webers | departamento | web (Carlos, Vinicius, Diego, Wesley); também opera no TRÁFEGO |
| Samuel, Edson, Arthur, Carlos | pessoais | Samuel é atendimento/planejamento; Edson ("Edinho") é gestão/copy; Arthur é tráfego; Carlos aparece só no workspace |

Nos quadros, os papéis são "admin" (Melt Trello, mais Edson no CRIAÇÃO e Atendimento/Webers no POLÍTICA) e "member" (o restante). **Ninguém é observador e não existem convidados de cliente.**

### 1.1 ATENDIMENTO: a mesa dos atendimentos

Listas em ordem, com o nº de cards abertos:

| Lista | Cards |
|---|---|
| AVISOS E RECADOS | 8 |
| PLANILHAS DE DEMANDAS | 5 |
| BRUNA - FINALIZADAS | 17 |
| BRUNA - AGUARDANDO | 2 |
| FABIANA - FINALIZADAS | 19 |
| FABIANA - AGUARDANDO | 0 |
| LEONARDO - DEMANDAS | 8 |
| LEONARDO - FINALIZADOS | 152 |
| PRI - FINALIZADAS | 16 |
| PRI - AGUARDANDO | 2 |
| Pablo - Aguardando | 0 |
| PABLO - FINALIZADAS | 5 |
| SAMARA - FINALIZADAS | 9 |
| SAMARA - AGUARDANDO | 13 |
| SAMUEL - AGUARDANDO | 12 |
| SAMUEL - FINALIZADAS | ≥57 |
| Samuel Mayla OK | 3 |
| FABIANA - FINALIZADAS (2ª lista com o mesmo nome) | 32 |
| BRUNA - FINALIZADAS (2ª lista) | 13 |
| PRISCILLA - FINALIZADAS | 4 |

- **Padrão:** cada atendimento tem um par "<NOME> - AGUARDANDO" (aguardando cliente, informação ou execução) e "<NOME> - FINALIZADAS" (voltou da produção e está em aprovação ou já entregue). Há listas duplicadas por pessoa e emojis no nome.
- **Volume:** pelo menos 357 cards abertos. A numeração interna chega a **12.157** desde mar/2024; ela conta cada entrada de card no quadro, inclusive retornos.
- **AVISOS E RECADOS:** a carteira de clientes por atendimento, "ACESSOS OBRIGATÓRIOS WEB-TRÁFEGO" e um card **"SENHAS"** (não li o conteúdo).
- **PLANILHAS DE DEMANDAS:** um card por atendimento com a lista dos seus clientes e links para planilhas Google de demandas por cliente. Ou seja, existe um **controle paralelo em planilha**.
- **Etiquetas:** 100 ou mais objetos (a leitura paginou). As mais usadas:

| Etiqueta (cor) | Usos |
|---|---|
| ALTERAÇÃO (laranja-claro) | 586 |
| IMPORTANTE (amarelo) | 506 |
| IMPORTANTE (vermelho-escuro) | 250 |
| URGENTE (vermelho-escuro) | 243 |
| IMPORTANTE (vermelho) | 236 |
| DEMANDA (verde) | 231 |
| ALTERAÇÃO (laranja-escuro) | 215 |
| PRIMEIRA DO DIA | 185 |
| FURA PAUTA | 172 |

### 1.2 CRIAÇÃO: design e audiovisual

| Lista | Cards |
|---|---|
| AVISOS E RECADOS | 21 |
| DEMANDAS | 6 |
| ANA ALICE | 8 |
| SALTY | 7 |
| RAFA | 9 |
| RICK | 5 |
| SEBASTIÃO (vídeo e gravações) | 14 |
| COMERCIAL | 3 |

- **Numeração** até 6.848. A lista DEMANDAS é a **caixa de entrada**; daí o card vai para a lista do designer.
- Cada designer tem **cards-cabeçalho SEGUNDA…SEXTA (e SÁBADO)**, vazios e sem checklist. Os cards de demanda são arrastados para baixo do dia em que serão feitos, o que funciona como **agenda semanal improvisada**.
- AVISOS tem modelos de briefing ("MODELO PARA ADS - META", com formatos e proporções), o card "S L A" (tabela de SLA em imagem), "BANCO DE IMAGENS" e "CLIENTE - DIA - HORÁRIO" (agenda de reuniões).
- Etiquetas: 77 objetos. ALTERAÇÃO tem 241 usos, IMPORTANTE 102, PRIMEIRA DO DIA 69. Há ainda URGENTE em 6 cores, ENTREGAR HOJE, ENVIAR PARA SOCIAL E ATENDIMENTO, DEMANDA EM ATRASO, ERRO D.A, CRIAR NO GPT e TREINAMENTO.

### 1.3 SOCIAL: social media

| Lista | Cards |
|---|---|
| AVISOS E RECADOS | 5 |
| DEMANDAS | 3 |
| LORENA | 9 |
| Fernanda | 5 |

- A numeração chega a cerca de 3.084. Houve uma lista "Mariana (Mari)", já removida.
- Em DEMANDAS, os cards "LORENA" e "FERNANDA" listam os **clientes de cada social**, separados em GRID e RELATÓRIOS.
- O padrão SEGUNDA…SEXTA se repete aqui.
- Há recorrências fixas, como "[CNSD] Site - Atualização Notícias - Toda Sexta", com as etiquetas DEMANDA RECORRENTE e 30 MIN.
- AVISOS traz "EXPLICAÇÃO PARA RELATÓRIOS", um manual que diz o que o atendimento precisa informar para pedir um relatório e quais KPIs entram nele.
- Etiquetas: 58 objetos, incluindo RELATÓRIO, AGENDAR POST, REAGENDAMENTO, REUNIÃO, PLANEJAMENTO CONTEÚDO e estimativas de 5 MIN a 1H30MIN.

### 1.4 WEB: sites, SEO e manutenção

| Lista | Cards |
|---|---|
| AVISOS E RECADOS | 4 |
| CARD PARA REUNIÕES | 1 |
| DEMANDAS | 0 |
| CARLOS | 27 |
| VINICUS | 20 |
| DIEGO | 13 |
| WESLEY | 1 |

- A numeração chega a 2.393.
- O card **"Prazos"** traz o **SLA por tipo**:
  - Figma (só a home): 5 dias
  - Site institucional: 15 dias
  - Landing page: 10 dias
  - E-commerce: 45 dias
  - Alterações simples: 3 dias; alterações complexas: 7 a 15 dias
- Os cards **"Auditoria - <site>"** são gerados automaticamente: descrição mediana de **11.600 caracteres**, nota da auditoria e itens por prioridade. O cabeçalho imita campos: *Solicitado por*, *Web*, *Previsto: de… até…*, *Site*, *Plataforma*.
- Regras escritas no próprio card: "Terminou → comente `Tempo gasto: 2h30`, arquive e avise o Wesley". A auditoria seguinte confirma a correção. Separadores "↓↓ Auditoria ↓↓" organizam as listas.
- Etiquetas: 38 objetos. As principais são AJUSTE (50), DEMANDA (47), URGENTE e "Aguardando Informação".

### 1.5 PRODUÇÃO: produção gráfica e fornecedores

| Lista | Cards |
|---|---|
| MODELOS DE DEMANDA | 1 |
| RESOLVER ISSO | 2 |
| PEDIDOS DE ORÇAMENTO | 1 |
| PEDIDOS EM ANDAMENTO - Retorno do fornecedor | 2 |
| AGUARDANDO INFORMAÇÕES | 3 |
| ENVIADOS PARA PRODUÇÃO | 5 |
| BOSQUE - CONCLUÍDOS | 57 |
| RAMACRISNA - CONCLUIDOS | 107 |
| AGUARDANDO AUTORIZAÇÃO | 4 |
| PRODUÇÃO CONCLUÍDA - ENTREGUE | 614 |
| DESISTÊNCIA CLIENTE - CONCLUÍDA | 202 |

- São 998 cards abertos, dos quais **799 estão sem atividade há mais de 1 ano**. Nada é arquivado.
- Toda a atividade recente vem da conta "Atendimento Melt": o atendimento opera a produção.
- Modelo do card: o que, quantidade, medida, material, arte em anexo, data de entrega.
- Etiquetas: 72 objetos. As de status são Entregue Cliente (436), Aguardando Retorno Cliente (286 + 76), EM PRODUÇÃO (153), Aguardando Arquivo Saída (48), EM COTAÇÃO, Aguardando Prova, Prova com Cliente, ENVIAR OP / Gerar OP, Aguardando Pagamento, Falta Boleto, Enviar NF, Agendar Frete, Falta Instalar, Aguardando Visita Técnica, VER COMISSÃO e AGUARDANDO VERBA.
- O título costuma trazer a data de entrega, como em "Bosque - Finados Banner Entrada - Entrega 07/10".

### 1.6 TRÁFEGO: mídia paga

| Lista | Cards |
|---|---|
| AVISOS E RECADOS | 6 |
| DEMANDAS | 8 |
| PEDRO | 8 |
| ARTHUR | 14 |
| GABRIEL | 6 |
| RELATÓRIOS MENSAIS | 0 |
| LIXO | 41 |

- A numeração chega a 2.201.
- **Fluxo de aprovação por lista:** cards "[OP][cliente] …", criados por agente, chegam como **rascunho na lista PEDRO**. A regra está escrita no card: "Enquanto este card estiver na lista PEDRO, ninguém executa. Aprovado: o Pedro move para a lista GABRIEL". Os cards "[AGENTE] Rodada dd/mm — N proposta(s)" registram cada rodada do agente. Há 17 cards [OP]/[AGENTE] abertos.
- **LIXO** é onde terminam os cards concluídos ou descartados.
- AVISOS tem "MODELO PARA ADS - META", "MODELO DE RELATÓRIO" e "ACESSOS (Onboarding)".
- Etiquetas: 37 objetos.

### 1.7 CEMITÉRIO DE DEMANDAS: arquivo morto por cliente

- Cerca de 95 listas, quase todas com **nome de cliente**: ABV MINERAÇÃO, AGROROCH, ASPEC… até Dubai Suites.
- Há também listas de **pessoas que saíram** (LUCAS, GABI) e **duplicadas**: MINAS PELA PAZ 2×, FERNANDA SOARES 2×, TOMAZ AQUINO e Tomáz Aquino DF, MÔNICA e MÔNICA CAMPANHA, ALÊ FISCALIZA.
- São 2.260 cards abertos (numeração até 2.488). Os maiores clientes: HOSPITAL EVANGÉLICO 434, CASA DO CAMINHO 282, TTG 140, Alê Fiscaliza 122, PETRA 101, MOST 86, AXIS 80.
- Os cards chegam por **faxina em lote** da conta "Melt Trello". Em 02/10, por exemplo, foram cerca de 25 cards entre 17:37 e 17:49. A mediana entre a criação do card e a última atividade (a ida ao Cemitério) é de **91 dias**; o p80 é de 494 dias.
- 272 cards estão com prazo vencido e não concluído: entram no Cemitério sem fechamento.
- Etiquetas: 82 objetos, herdados dos outros quadros. Mover um card entre quadros recria a etiqueta no destino.

### 1.8 POLÍTICA 2026: campanha eleitoral, hoje dormente

- Listas: DOCUMENTOS DE APOIO, DEMANDAS - FERNANDA, DEMANDAS CONCLUIDAS e **uma lista por candidato** (7, mais um separador "-----"). São 35 cards.
- Última atividade em 24/08/2026.
- Etiquetas próprias: "FEITO EM <MÊS>" (março a outubro) e "NÃO REALIZADO". Na prática, é um **cronograma mensal improvisado**.

### 1.9 CLIENTES: cadastro de clientes

| Lista | Cards |
|---|---|
| CLIENTES RECORRENTES | 21 |
| CLIENTES PONTUAIS | 15 |
| STAND BY - Negociação | 2 |
| EX-CLIENTES | 35 |

- Os cards são só o nome do cliente; 72 de 73 não têm descrição.
- Este é o **único lugar onde etiquetas descrevem cliente**: CRIAÇÃO, nomes do criativo responsável (CAROL, SALTY, RAFAEL, GABRIEL, "RAFAELLA _ NA PONTA") e **nível ⭐ / ⭐⭐ / ⭐⭐⭐**.
- Está desatualizado: 55 cards sem mexer há mais de 1 ano.

### 1.10 ANTARES · Plano de Marca Out26–Mar27: plano de cliente

- Listas: Rotina e referências (4), Esta semana (22), Aguardando aprovação da Antares (0) e uma lista por mês com as semanas S1…S25. São 109 cards, todos com prazo (a sexta da semana).
- O título traz a semana e o **responsável entre parênteses**: "(Melt)", "(Antares)" ou "(Juntos)".
- Rituais escritos no quadro: segunda, mover os cards da semana; sexta, revisão e atualização da **planilha espelho compartilhada com o cliente**.
- É um **projeto com fases, marcos e responsabilidade compartilhada com o cliente**, uma coisa que os quadros por departamento não comportam.

---

## 2. Mapa do fluxo da agência

```
 CLIENTE (WhatsApp / reunião / e-mail; não entra no Trello)
    │
    ▼
 ATENDIMENTO (AM) escreve o briefing no card:
   - "Atendimento: <AM>" na 1ª linha
   - saudação ao executor ("Ei, Sebastião!")
   - links do Drive, Docs e referências do Instagram
   - prazo (padrão 18:00) + etiqueta de prioridade
    │  cria o card JÁ no quadro do executor (lista DEMANDAS ou direto na lista da pessoa)
    │  ou cria no ATENDIMENTO e move de quadro (mediana de minutos)
    ▼
 ┌────────────── EXECUÇÃO (um quadro por equipe) ─────────────────────────┐
 │ CRIAÇÃO : DEMANDAS → <designer>  (o AM às vezes já distribui)          │
 │           o card fica sob o cabeçalho do dia (SEGUNDA…SEXTA)           │
 │ SOCIAL  : <social> + cabeçalhos de dia; recorrências semanais          │
 │ WEB     : <dev>; auditorias geradas; "Tempo gasto" em comentário       │
 │ TRÁFEGO : agente cria [OP] → lista PEDRO (aprovação) →                 │
 │           ARTHUR/GABRIEL (execução) → LIXO                             │
 │ PRODUÇÃO: orçamento → fornecedor → info → autorização →                │
 │           produção → entregue | desistência                            │
 └───────────────────────────────────────────────────────────────────────┘
    │ entrega = comentário "[V2] …" + caminho M:\…\CLIENTES\<CLIENTE>\…\SAÍDA
    │           + link do Drive (anexo-link) + marcar "concluído"
    ▼  o executor move o card de volta para o quadro ATENDIMENTO
 ATENDIMENTO (lista "<AM> - FINALIZADAS") → apresenta ao cliente
    │
    ├── Ajuste: desmarca concluído + checklist com os itens do cliente
    │           + etiqueta ALTERAÇÃO + novo prazo → volta ao executor  ↺
    ├── Aguardando cliente: lista "<AM> - AGUARDANDO" / etiqueta "Aguardando…"
    └── Aprovado: fica em FINALIZADAS por semanas ou meses
            │
            ▼  faxina periódica em lote ("Melt Trello")
 CEMITÉRIO DE DEMANDAS → lista do CLIENTE (arquivo morto)
```

Fluxos laterais:
- O **SOCIAL pede peça à CRIAÇÃO** (SOCIAL→CRIAÇÃO, 3 casos na janela).
- A **CRIAÇÃO entrega direto ao SOCIAL** para agendar, com a etiqueta "ENVIAR PARA SOCIAL E ATENDIMENTO".
- **Demanda dividida:** uma demanda vira várias, com as etiquetas DEMANDA DIVIDIDA e DESDOBRAMENTOS.

**Quem faz o quê.**
- O AM cria e despacha. Na janela de 30/09 a 14/10, 68 criações no ATENDIMENTO vieram da conta Atendimento Melt; 18 criações na CRIAÇÃO também foram feitas pelo Atendimento.
- O executor entrega e devolve.
- A gestão ("Melt Trello") cria demandas estratégicas e faz a faxina.
- No TRÁFEGO, o Pedro aprova.
- No WEB, o Wesley solicita e confere.

**Tempos medidos.** As medidas vêm da atividade de 17/09 a 14/10. Contei apenas mudanças de quadro; mudanças dentro do mesmo quadro ficam invisíveis.

| Trecho | n | Mediana | p80 |
|---|---|---|---|
| Entrada na CRIAÇÃO → volta ao ATENDIMENTO | 38 | **52 h (~2,2 dias)** | 121 h (~5 dias) |
| Volta ao ATENDIMENTO → reenvio à CRIAÇÃO (ajuste) | 26 | 23 h | 40 h |
| Criado pelo AM → devolvido ao ATENDIMENTO (qualquer equipe) | 91 | 20 h | 94 h |
| WEB → ATENDIMENTO | 9 | 21 h | 136 h |
| SOCIAL → ATENDIMENTO | 7 | 6,7 dias | 14 dias |

- **Retrabalho:** 17 de 92 cards (18%) que passaram pela CRIAÇÃO na janela entraram nela 2 ou mais vezes.
  - Exemplo "Bosque Vida - Campanha Lançamento": criado em 23/09 e entregue em 29/09. Voltou em 13/10 com checklist de 13 itens de ajuste.
  - Exemplo "Bosque - Adesivo Flora": entregue em 1,5 h, voltou com checklist de 3 itens e foi reentregue 4 dias depois.
- **Prazo pedido** (prazo menos data de criação): mediana de 2,7 dias; p20 de 0,9 dia; p80 de 8,2 dias (n = 3.063).
- **Horário do prazo:** 66% exatamente às 18:00 BRT (padrão "fim do dia"). Horários específicos (09h–17h) são minoria e aparecem também como etiquetas ("até 11h", "até 15h").
- **Ritmo:** o ATENDIMENTO cria de 5 a 20 cards por dia útil (média de cerca de 10,5); a CRIAÇÃO recebe de 2 a 12 entradas por dia útil (média de cerca de 5).
- **Recorrência:** é manual. Usa "copiar card" (1 a 5 cópias por quadro por janela) e títulos como "Toda Sexta"; o recurso de recorrência do Trello não é usado.
- **Comentários e @:** cerca de 45 comentários em 2 semanas nos quadros principais e **0 @menções reais**. Os comentários servem para registrar entrega (link e versão), observações do agente e "Tempo gasto". A conversa acontece fora do Trello.
- **Prazos e conclusão:** o "concluído" do card (`dueComplete`) é marcado pelo executor ao entregar e **desmarcado pelo AM** quando há ajuste.

---

## 3. Entidades implícitas e onde aparecem hoje

| Entidade | Onde está hoje | Exemplo / observação |
|---|---|---|
| **Cliente** | prefixo do título `[CLIENTE] …` ou `CLIENTE - …` (97% dos cards); listas do CEMITÉRIO; listas "X - CONCLUÍDOS" da PRODUÇÃO; listas do POLÍTICA; quadro CLIENTES; cards "CLIENTES <AM>" e "PLANILHAS DE DEMANDAS"; pasta `CLIENTES\<CLIENTE>` no Drive | 369 grafias para cerca de 100 clientes: ALE / ALE FISCALIZA; HE = Hospital Evangélico; ICC = Casa do Caminho; MM = Maurício Magalhães; CNSD / CSND; MÔNICA / MÔNICA BONILHA / MÔNICA CAMPANHA |
| **Marca / unidade do cliente** | dentro do prefixo | Bosque / Bosque Vida / Bosque PET; CNSD / Angelorum (mesmo grupo); Tomáz Aquino / Tomáz Aquino DF; ADCE MG / ADCE BR |
| **Status do cliente e nível** | listas e etiquetas do CLIENTES | recorrente, pontual, stand-by ou ex; ⭐ a ⭐⭐⭐; criativo responsável por etiqueta |
| **Carteira do AM** | cards "CLIENTES BRUNA/SAMARA" e "PLANILHAS DE DEMANDAS" | o AM dono de cada cliente também está numa planilha ("com quem está cada conta") |
| **Responsável (executor)** | **nome da lista** + saudação no briefing | o campo membros não serve: são contas de departamento |
| **Solicitante (AM)** | 1ª linha "Atendimento: Pri" + lista "<AM> - …" | às vezes "Atendimento: Samara/Samuel (nas minhas férias)", ou seja, um substituto |
| **Aprovador interno** | texto ("envie para o Samuel aprovar") e listas de aprovação (PEDRO no TRÁFEGO) | |
| **Equipe / departamento** | quadro | Criação, Social, Web, Tráfego, Produção, Atendimento |
| **Tipo de entrega / peça** | texto livre no título + algumas etiquetas | Grid, Post, Reels, Carrossel, Banner de site, Crachá, Flyer, LP, Site, Apresentação, Relatório, Auditoria, Roteiro, Captação ou edição de vídeo; etiquetas GRID, COPY, RELATÓRIO, CRIAR APRESENTAÇÃO, PREPARAR PARA IMPRESSÃO, TEMPLATE CANVA |
| **Canal / plataforma** | texto do briefing | Instagram, Facebook, Reels, TikTok, YouTube, Kwai, Site/WordPress, Meta Ads, Google Ads, LinkedIn, painel de LED, impresso |
| **Campanha / projeto** | título e pasta do Drive; quadros temporários | "Campanha Finados 2026", "Campanha Matrículas", POLÍTICA 2026, ANTARES (fases, semanas) |
| **Prioridade** | etiquetas | FURA PAUTA > URGENTE > IMPORTANTE; PRIMEIRA DO DIA; PARA HOJE / ENTREGAR HOJE; "até 11h" |
| **Prazo** | due (padrão 18:00) + "Entrega dd/mm" no título (PRODUÇÃO) + "Previsto: de… até…" (WEB) | prazo do cliente diferente do prazo interno não é distinguido |
| **Estimativa de esforço** | etiquetas azuis 5 MIN … 3 HORAS (novas, desde cerca de ago/2026) | |
| **Tempo gasto** | comentário "Tempo gasto: 2h30" (WEB) | |
| **Rodada / versão** | etiqueta ALTERAÇÃO / AJUSTE / REFAÇÃO / revisão; "[V2]" ou "[AJUSTE]" no comentário de entrega; checklist de feedback | não há contador de rodadas |
| **Feedback do cliente** | checklist adicionado pelo AM na volta | itens do tipo "Mudar a trilha sonora do spot" |
| **Aprovação do cliente** | etiquetas APROVADO / Aguardando Aprovação / "Aguardando aprovação do cliente copy"; lista "Aguardando aprovação da Antares" | |
| **Bloqueio / espera** | listas AGUARDANDO + etiquetas Aguardando Informação(ões) / Artes / alinhamento equipe MELT / standby / EM ESPERA | |
| **Entregável / arquivo** | anexo-link do Drive + comentário com caminho `M:\Drives compartilhados\MELT\CLIENTES\…\SAÍDA`; uploads no Trello (prints, PDF, HTML) | |
| **Recorrência** | etiquetas DEMANDA RECORRENTE (+ MANHÃ), SEMANAL, DIÁRIA; card copiado à mão | |
| **Demanda-mãe e filhas** | etiquetas DEMANDA DIVIDIDA, DESDOBRAMENTOS, DEMANDA DIRECIONADA | sem vínculo real entre os cards |
| **Qualidade / causa de retrabalho** | etiquetas ERRO D.A, ERRO ATENDIMENTO, DEMANDA INCOMPLETA, Refação de Briefing, DEMANDA EM ATRASO | uso raro (1 a 20 vezes cada) |
| **Planejamento semanal** | cards-cabeçalho SEGUNDA…SEXTA/SÁBADO por pessoa | |
| **Agenda (reunião, gravação, evento)** | cards "Cliente - Dia - Hora", "[ICC] Gravação externa 19/10 às 10h", etiquetas Filmagem Externa e REUNIÃO | |
| **Pedido de compra / produção gráfica** | quadro PRODUÇÃO | fornecedor, cotação, prova, OP, pagamento, boleto, NF, frete, instalação, comissão, verba |
| **SLA por tipo** | card "Prazos" (WEB) e card "S L A" (CRIAÇÃO, em imagem) | |
| **Modelo de briefing** | etiqueta MODELO + cards modelo (Ads Meta, Produção, relatório) | |
| **Base de conhecimento / acessos** | listas AVISOS E RECADOS / DOCUMENTOS DE APOIO | inclui "SENHAS" e "ACESSOS", sensíveis |
| **Agente / automação** | cards "[AGENTE] Rodada…", "[OP]…" e auditorias WEB | escreve com contas de departamento ou pessoais |

---

## 4. Dores visíveis

1. **Identidade fraca.** São 9 contas para cerca de 21 pessoas, e a atividade aparece como "Atendimento Melt" ou "Criação Melt". O campo membros não identifica ninguém: "Criação Melt" está em 864 cards do Cemitério e "Melt Trello" em 1.911. Não há como responder "quem fez" nem "carga por pessoa" sem ler nomes de lista.
2. **Etiquetas em caos.**
   - São cerca de 500 objetos para uns 60 conceitos. No ATENDIMENTO, URGENTE aparece em 7 cores, ALTERAÇÃO em 6 e IMPORTANTE em 4.
   - Há variações de grafia: PRIMEIRA DO DIA / PRIMEIRO DO DIA / PRIMERA; DEMANDA DIVIDIDA / DIVIDA / DIVIDIDA; "Demada".
   - Existem etiquetas sem nome. Causa principal: ao mover um card de quadro, o Trello recria a etiqueta no destino.
3. **Urgência inflada.** Somando cores, o ATENDIMENTO tem mais de 1.100 usos de IMPORTANTE, mais de 700 de URGENTE e cerca de 500 de FURA PAUTA. A prioridade deixou de ordenar a fila.
4. **Retrabalho sem métrica.** Cerca de 18% das demandas de Criação voltam. A rodada é feita "desmarcando concluído" e o histórico se perde na troca de quadro. A causa (ERRO D.A, ERRO ATENDIMENTO, briefing) quase nunca é registrada.
5. **Trocas de quadro fragmentam a demanda.** Cada mudança de quadro troca o número do card, recria etiquetas e espalha a atividade. Para ver o ciclo é preciso ler 2 a 6 quadros. O agendamento do Social fica num quadro e a peça noutro.
6. **Cards parados e acúmulo.**

   | Quadro / lista | Situação |
   |---|---|
   | ATENDIMENTO | 259 de 350 sem atividade há mais de 30 dias (FINALIZADAS não arquivadas; LEONARDO - FINALIZADOS tem 152) |
   | SAMUEL - AGUARDANDO | cards de fev a out/2025 |
   | CRIAÇÃO | 31 de 73 há mais de 30 dias (20 há mais de 1 ano, quase todos avisos ou cabeçalhos) |
   | TRÁFEGO | LIXO com 41 cards |
   | PRODUÇÃO | 966 de 998 há mais de 30 dias |
   | CLIENTES | 55 de 73 há mais de 1 ano |
7. **Prazos vencidos e pouco informativos.**
   - Vencidos e não concluídos: ATENDIMENTO 18, WEB 17, CRIAÇÃO 9, TRÁFEGO 6, CEMITÉRIO 272.
   - 66% dos prazos ficam no padrão 18:00.
   - Não há separação entre prazo interno e prazo do cliente, nem entre data planejada e prazo.
   - Na CRIAÇÃO, só 14 de 73 cards têm prazo (os cabeçalhos puxam a conta para baixo).
8. **Sem capacidade nem agenda.** O planejamento é feito arrastando cards para baixo de cabeçalhos de dia. A estimativa só existe como etiqueta e é recente. "Tempo gasto" é texto.
9. **Cemitério como arquivo.** São cerca de 95 listas, com clientes duplicados, ex-funcionários e cards vencidos jogados sem fechamento. A faxina é manual e em lote, e não há relatório por cliente e mês.
10. **Cliente cadastrado em 6 lugares**, sem chave única: título, listas do Cemitério, quadro CLIENTES, cards de carteira, planilhas por AM e Drive.
11. **Informação fora do sistema.** A conversa acontece no WhatsApp (0 @menções), as entregas no Drive e os controles de demanda em planilhas Google por AM. O cliente Antares tem uma planilha espelho do quadro.
12. **Campos simulados em texto:** "Atendimento:", "Prioridade: Alta", "Solicitado por / Web / Previsto / Site / Plataforma", "Entrega 07/10" no título, "Tempo gasto". Nenhum campo personalizado é usado.
13. **Recorrência manual** (copiar card a cada semana ou mês).
14. **Segurança:** os cards "SENHAS" e "ACESSOS" ficam em listas visíveis a todas as contas compartilhadas.
15. **Gambiarras de layout:** cabeçalhos de dia, separadores "↓↓ Auditoria ↓↓" e "-----", cards "." e listas duplicadas com emoji.
16. **Briefings vazios:** 47 de 350 no ATENDIMENTO e 44 de 73 na CRIAÇÃO (muitos são cabeçalhos). O tamanho dos briefings varia de nada a 15 mil caracteres, sem estrutura comum.
17. **Quadros temporários** (POLÍTICA 2026, FESTIVAL BRASIL, Dezembro 2024, ANTARES) suprem a falta de uma entidade "Projeto/Campanha".

---

## 5. Mapeamento de importação: Trello → sistema novo

**Recomendação de fonte.** Usar o **export JSON por quadro** do Trello ou a API REST (`/boards/{id}/cards?filter=all`, `/actions`, `/checklists`, `/attachments`). Assim entram os cards arquivados e os eventos de mudança de quadro, inclusive as saídas (`moveCardFromBoard`), que a leitura via MCP não mostra. Guardar `trello_card_id` e `shortLink` em todo registro, para rastreabilidade e redirecionamento.

### 5.1 Estrutura

| Trello | Sistema novo |
|---|---|
| Workspace MELT COMUNICAÇÃO | Organização "Melt" |
| Quadro ATENDIMENTO, CRIAÇÃO, SOCIAL, WEB, TRÁFEGO | **Equipe** (o atendimento é um papel, não um quadro: a demanda tem `solicitante_am`) |
| Quadro PRODUÇÃO | Equipe "Produção gráfica" com **pipeline próprio** (orçamento → fornecedor → autorização → produção → entregue / desistência) |
| Quadro CEMITÉRIO | **Não vira quadro.** Os cards viram demandas com status `arquivada` e `cliente` = nome da lista |
| Quadro CLIENTES | Tabela **Clientes** (status pela lista; nível pelas ⭐; criativo responsável pela etiqueta de nome) |
| Quadro POLÍTICA 2026 | **Projeto** "Eleições 2026" (cada lista de candidato vira cliente; segmento "Política") |
| Quadro ANTARES | **Projeto/Plano** do cliente Antares (lista mensal vira marco; "S#" vira semana; "(Melt/Antares/Juntos)" vira responsável de lado) |
| Quadros arquivados | importar como somente leitura, se necessário |
| Contas Trello | **Usuários individuais**. As contas de departamento viram autor sintético "Equipe X (importado)" |

### 5.2 Listas → status, responsável e solicitante

| Padrão de lista | Status | Atribuição |
|---|---|---|
| DEMANDAS (CRIAÇÃO, SOCIAL, WEB, TRÁFEGO) | `na_fila` / triagem | equipe do quadro, sem responsável |
| `<PESSOA>` (ANA ALICE, SALTY, RAFA, RICK, SEBASTIÃO, LORENA, Fernanda, CARLOS, VINICUS, DIEGO, WESLEY, ARTHUR, GABRIEL) | `em_producao` (ou `planejada`, se houver data) | responsável = pessoa (tabela de apelidos lista → usuário) |
| PEDRO (TRÁFEGO) | `rascunho_aguardando_aprovacao` | aprovador = Pedro |
| `<AM> - AGUARDANDO` | `aguardando` (motivo pela etiqueta) | solicitante = AM |
| `<AM> - FINALIZADAS/FINALIZADOS`, "Samuel Mayla OK", DEMANDAS CONCLUIDAS | `entregue` se o card estiver concluído, senão `em_aprovacao_cliente` | solicitante = AM |
| LEONARDO - DEMANDAS | `aguardando` | solicitante = Leonardo |
| LIXO (TRÁFEGO) | `arquivada` (concluída ou descartada) | |
| Listas do CEMITÉRIO | `arquivada` | cliente = lista (com tabela de apelidos); "LUCAS", "GABI" viram responsável histórico |
| PRODUÇÃO: PEDIDOS DE ORÇAMENTO / PEDIDOS EM ANDAMENTO / AGUARDANDO INFORMAÇÕES / AGUARDANDO AUTORIZAÇÃO / ENVIADOS PARA PRODUÇÃO / PRODUÇÃO CONCLUÍDA - ENTREGUE / DESISTÊNCIA / "X - CONCLUÍDOS" / RESOLVER ISSO | etapas `orcamento` / `aguardando_fornecedor` / `aguardando_info` / `aguardando_autorizacao` / `em_producao` / `entregue` / `cancelada` / `entregue` (cliente = X) / `com_problema` | |
| ANTARES: Esta semana / Aguardando aprovação da Antares / meses | marco + `esta_semana` / `aguardando_cliente` | |
| AVISOS E RECADOS, DOCUMENTOS DE APOIO, MODELOS DE DEMANDA, CARD PARA REUNIÕES, COMERCIAL, PLANILHAS DE DEMANDAS, Rotina e referências | **Base de conhecimento / Modelos**, não demandas | os modelos viram **templates de briefing por tipo** |
| Cards "SENHAS" e "ACESSOS…" | **Não importar.** Migrar para um cofre de senhas | |
| Cabeçalhos SEGUNDA…SÁBADO, "↓↓ … ↓↓", ".", "-----" | **descartar** | |

### 5.3 Campos do card

| Campo Trello | Campo novo | Regra |
|---|---|---|
| `id` | `trello_card_id` | a data de criação = timestamp embutido no id (8 primeiros hex) |
| `shortLink` / `url` | `trello_url` | link de origem |
| `idShort` | ignorar | muda a cada troca de quadro |
| `name` | `titulo` + `cliente` + `entrega_prevista` | extrair o cliente de `^\[(.+?)\]` ou `^(.+?)\s[-–|:_]`, normalizar e passar pela tabela de apelidos; tirar o prefixo do título; extrair "Entrega dd/mm" |
| `desc` (markdown) | `briefing` (markdown) | extrair as linhas "Atendimento:" → `solicitante_am`, "Prioridade:" → `prioridade`, "Solicitado por / Web / Previsto / Site / Plataforma" → campos; os links viram anexos-link (o texto fica intacto) |
| `list` | `status` + `responsavel` / `solicitante` | ver 5.2 |
| `board` | `equipe` | |
| `labels` | vários campos | ver 5.4 |
| `due` | `prazo` | converter de UTC para America/Sao_Paulo; se for 18:00, tratar como prazo **só de data** |
| `start` | `inicio_planejado` | quase não é usado |
| `dueComplete` / `complete` | `concluida_em` | data do evento "marked complete" (atividade); na falta, `lastActivityAt` |
| `members` | `observadores` | ignorar as contas de departamento; manter as pessoais |
| `checklists` | `subtarefas`; se criados junto da etiqueta ALTERAÇÃO, viram **itens de feedback da rodada N** | |
| `comments` | `comentarios` | autor = conta (as de departamento como "Equipe X"); detectar "[Vn]"/"[AJUSTE]" e links do Drive para criar **versões de entrega**; "Tempo gasto: Xh" vira **apontamento de horas** |
| `attachments` com `isUpload=false` | anexos-link | hosts: Drive, Docs, Figma, Canva, WeTransfer (we.tl expira!), Dropbox, YouTube, SharePoint |
| `attachments` com `isUpload=true` | arquivo no storage novo | baixar e regravar (imagens coladas de 1 a 10 MB; um card chega a 9 PNGs e cerca de 34 MB) |
| `cover` | capa (opcional) | |
| `actions` (create, moveCardToBoard/FromBoard, updateCard listBefore/After, due) | `historico` | permite reconstruir o **tempo em cada etapa** e as **rodadas** de forma retroativa |
| `lastActivityAt` | `atualizada_em` | |
| `closed` | `arquivada` | |

### 5.4 Etiquetas → destino (nenhuma é cliente)

| Grupo | Etiquetas (todas as cores e grafias) | Destino |
|---|---|---|
| Prioridade | FURA PAUTA · URGENTE / URGENTE! / Urgente · IMPORTANTE · PRIMEIRA DO DIA / PRIMEIRO DO DIA / PRIMERA / primeira do dia · PARA HOJE · ENTREGAR HOJE · até 11h / até 15h / até 18hrs | `prioridade` (Fura-pauta > Urgente > Importante > Normal) + sinalizador "primeira do dia"; o "até Xh" vira a hora do prazo |
| Natureza / rodada | DEMANDA / Demanda / Demada · ALTERAÇÃO / Alteração · AJUSTE / Ajuste · REFAÇÃO · revisão · DESDOBRAMENTOS · Refação de Briefing | `natureza` (nova / alteração / desdobramento) + `rodada` ≥ 2 |
| Status / espera | Aguardando Informação(ões) / infos / informação do cliente · Aguardando Aprovação · Aguardando aprovação do cliente copy · Aguardando Artes (Institucional) · Aguardando alinhamento equipe MELT · AGUARDANDO · EM ANDAMENTO · EM ESPERA · standby / STAND - BY · APROVADO · CONCLUÍDO · AGUARDANDO RETORNO DE DÚVIDA … | `status` + `motivo_bloqueio` (cliente / interno / fornecedor) |
| Esforço | 5 / 10 / 15 / 20 / 30 / 45 MIN · 1 HORA · 1H30MIN · 2 HORAS / 2HORAS · 3 HORAS · 30 min · 15 MINUTOS | `estimativa_min` |
| Tipo de entrega | GRID · COPY · RELATÓRIO · CRIAR APRESENTAÇÃO · PREPARAR PARA IMPRESSÃO · PREPARAR PACKAGE · TEMPLATE CANVA · CRIAR NO GPT · AGENDAR POST · REAGENDAMENTO · Filmagem Externa · EVENTO · REUNIÃO · PLANEJAMENTO CONTEÚDO · ASSINATURA MELT · TREINAMENTO · CONSULTA | catálogo `tipo_entrega` (com SLA padrão, puxado de "Prazos"/"S L A") |
| Recorrência | DEMANDA RECORRENTE (+ MANHÃ) · SEMANAL · DEMANDA DIÁRIA · DEMANDA SEMANAL · Lembrete | `regra_recorrencia` (sugerir a regra a partir do histórico de cópias) |
| Encaminhamento | DEMANDA DIRECIONADA · DEMANDA DIVIDIDA / DIVIDA / DIVIDIDA · ENVIAR PARA SOCIAL E ATENDIMENTO | vínculo mãe/filhas + "notificar equipe X ao entregar" |
| Qualidade | ERRO D.A · ERRO ATENDIMENTO · DEMANDA INCOMPLETA · DEMANDA EM ATRASO · OLHAR ISSO | `motivo_retrabalho` / sinalizador |
| Produção gráfica | EM COTAÇÃO / Em Cotação · EM PRODUÇÃO / Em Produção / Enviado Produção · Aguardando Retorno Cliente / Fornecedor / Atendimento · Aguardando Arquivo (Saída / Fornecedor) / Falta Arquivo / Enviar Arquivo / Ajustar Arquivo · Aguardando Prova / Porva / Prova com Cliente / Atendimento / Aguardando Cliente Pegar a Prova · ENVIAR OP / Gerar OP / Aguardando OP · Aguardando Pagamento / Falta Boleto / Enviar NF · Agendar Frete / Falta Instalar / Aguardando Visita Técnica / Medidas Fornecedor · Aguardando Mockup / Layout / Falta Grade · Orçamento / Concluído Orçamento / Enviar / Refazer / Atualizar Orçamento · VER COM O FORNECEDOR · VER COMISSÃO · AGUARDANDO VERBA · Entregue Cliente · Aguardando Criação | etapa do pipeline + **checklist do pedido** (OP, NF, boleto, frete, instalação) + `fornecedor` |
| Política | FEITO EM <MÊS> · NÃO REALIZADO · Política | `executada_em` (mês) / `cancelada`; tag de segmento |
| Quadro CLIENTES | CRIAÇÃO · CAROL · SALTY · RAFAEL · GABRIEL · RAFAELLA _ NA PONTA · ⭐ / ⭐⭐ / ⭐⭐⭐ | `cliente.criativo_responsavel`, `cliente.nivel` (1 a 3) |
| Modelos | MODELO · Modelo de Demanda | template |
| Avulsas e sem nome | "" (cores padrão) · "Aumentar Verba dia 1 de Outubro" · "AGUARDANDO RETORNO DE DÚVIDA SKEMA" | descartar ou converter em lembrete ou comentário |

**O que fazer com o cliente**, já que nenhuma etiqueta o representa:

1. Montar a tabela `clientes` a partir do quadro CLIENTES (73 registros, com status e nível).
2. Somar as listas do CEMITÉRIO (cerca de 95), as listas de PRODUÇÃO e POLÍTICA e os prefixos de título (369 grafias).
3. Gerar uma **tabela de apelidos** para revisão humana, com cerca de 100 clientes canônicos e seus apelidos. Exemplos: HE→Hospital Evangélico, ICC→Casa do Caminho, MM→Maurício Magalhães, ALE→Alê Fiscaliza, CSND→CNSD, TOMAZ/Tomáz Aquino (DF) como cliente e unidade.
4. Separar **cliente × marca/unidade × campanha**: "Mônica Campanha" é a cliente Mônica Bonilha com o projeto "Campanha"; "Bosque PET" é o cliente Bosque com a marca PET.
5. Só 1.387 de 2.213 títulos do Cemitério casam com a lista pelo método ingênuo. O resto precisa da tabela de apelidos.

**Pessoas.** Tabela lista → usuário, só com primeiros nomes:
- Atendimento: Bruna, Fabiana, Leonardo, Pri/Priscilla, Pablo, Samara, Samuel.
- Gestão: Edson ("Edinho") e "Melt Trello".
- Criação: Ana Alice, Salty, Rafa/Rafinha, Rick, Sebastião. Histórico: Carol, Gabriel, Rafaella, Lucas, Gabi.
- Social: Lorena, Fernanda. Histórico: Mariana.
- Web: Carlos, Vinicius, Diego, Wesley.
- Tráfego: Pedro (aprovador), Arthur, Gabriel.

**O que importar como "vivo":** cerca de 190 demandas em andamento, das quais 138 com atividade nos últimos 90 dias. O resto (cerca de 3.800 cards) entra como **histórico arquivado**: 2.260 do Cemitério, 816 entregues ou desistidos da PRODUÇÃO e cerca de 300 das listas FINALIZADAS.

---

## 6. Volumes para dimensionamento

| Métrica | Valor |
|---|---|
| Quadros | 13 (10 abertos, 3 arquivados); 6 operacionais + CEMITÉRIO + CLIENTES + 2 de projeto (POLÍTICA, ANTARES) |
| Cards abertos | **cerca de 4.070** (4.047 lidos + 22 do SOCIAL + resto de SAMUEL - FINALIZADAS) |
| Por quadro | CEMITÉRIO 2.260 · PRODUÇÃO 998 · ATENDIMENTO ≥357 · ANTARES 109 · TRÁFEGO 83 · CRIAÇÃO 73 · CLIENTES 73 · WEB 66 · POLÍTICA 35 · SOCIAL 22 |
| Demandas realmente em andamento | cerca de 190 (138 com atividade há menos de 90 dias) |
| Numeração máxima por quadro (entradas acumuladas desde mar/2024) | ATENDIMENTO 12.157 · CRIAÇÃO 6.848 · SOCIAL cerca de 3.084 · CEMITÉRIO 2.488 · WEB 2.393 · TRÁFEGO 2.201 · PRODUÇÃO 1.190 · POLÍTICA 61 |
| Cards arquivados | **não medidos.** Usar o export JSON; os números acima sugerem dezenas de milhares de entradas e alguns milhares de cards arquivados |
| Ritmo | 5 a 20 demandas novas por dia útil no ATENDIMENTO (cerca de 200 a 300 por mês); CRIAÇÃO cerca de 5 entradas por dia útil; CEMITÉRIO recebe 30 a 140 cards por mês |
| Cards abertos por mês de criação | ~100 a 200/mês desde abr/2024; 217 em set/2026 |
| Contas Trello | 9 (5 genéricas ou de departamento + 4 pessoais) |
| Pessoas reais | cerca de 21 ativas (7 no atendimento, 5 na criação, 2 no social, 4 no web, 3 no tráfego, mais a gestão) |
| Etiquetas | cerca de 500 objetos para cerca de 60 conceitos |
| Campos personalizados | 0 |
| Checklists | usados como lista de ajustes do cliente (até 13 itens) e nas auditorias; nos cards comuns, raros |
| Comentários | baixo volume (cerca de 45 em 2 semanas nos 4 quadros principais); 0 @menções |
| Links nas descrições | 6.763 no total: docs.google.com 1.509, drive.google.com 1.201, instagram.com 668, trello.com (uploads) 359, we.tl 273, youtube 91, além de sites dos clientes, figma, canva, dropbox e sharepoint |
| Uploads no Trello | imagens coladas e PDFs de 1 a 10 MB por arquivo (um card chega a cerca de 34 MB). A entrega final mora no Google Drive |
| Tamanho do briefing (mediana) | ATENDIMENTO cerca de 520 caracteres · CEMITÉRIO cerca de 470 · TRÁFEGO cerca de 680 · PRODUÇÃO cerca de 120 · WEB cerca de 11.600 (auditorias geradas) |
| Prazo | 81% dos cards de demanda têm prazo; 66% exatamente às 18:00; mediana de 2,7 dias após a criação |

---

## 7. Implicações diretas para o produto, tiradas do comportamento observado

1. **Usuários individuais e papéis** (AM, executor, aprovador, gestor) no lugar das contas de departamento. A lista deixa de ser a pessoa.
2. **A demanda é um objeto único** que atravessa as equipes por **etapas** (briefing → fila da equipe → produção → entrega interna → aprovação do cliente → ajuste N → aprovada → arquivada), sem "mudar de quadro".
3. **Cliente como entidade de primeira classe**, com marcas/unidades, AM dono, nível, status e pasta do Drive. O cliente é obrigatório na criação da demanda.
4. **Rodadas e versões nativas:** contador, checklist de feedback por rodada, link do Drive por versão e motivo do retrabalho.
5. **Prioridade com regra.** Limitar FURA PAUTA e URGENTE (com justificativa); separar prazo do cliente e prazo interno, e prazo com hora.
6. **Capacidade e agenda.** Estimativa em minutos, data planejada por pessoa (substitui os cabeçalhos SEGUNDA…SEXTA) e apontamento de horas.
7. **Tipos de entrega com template de briefing e SLA padrão** (já existem em "Prazos", "S L A" e "MODELO PARA ADS - META").
8. **Recorrência nativa** (grids mensais, notícias toda sexta, relatórios semanais).
9. **Pipeline de produção gráfica** com fornecedor, orçamento, prova, OP, NF e frete.
10. **Projetos e planos** (ANTARES, POLÍTICA): marcos semanais, responsável Melt/Cliente/Juntos e **visão compartilhável com o cliente**, que substitui a planilha espelho.
11. **API e "rascunho com aprovação"** para os agentes que já criam [OP] e auditorias.
12. **Arquivamento automático** (fim do Cemitério manual) e relatório por cliente e mês.
13. **Cofre de acessos** fora das demandas.
