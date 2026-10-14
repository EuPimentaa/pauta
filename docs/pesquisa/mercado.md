# Mercado: o que torna um sistema de demandas de agência excelente

Pesquisa de 14/10/2026 para o sistema interno de demandas da Melt Comunicação. Objetivo: ficar claramente melhor que o Dmanda (publi.academy/dmanda).
Método: landing do Dmanda, páginas de produto, documentação e avaliações (G2/B2B Stack/fóruns) de Operand, Runrun.it, ClickUp, Asana, Monday, Teamwork, Wrike, Basecamp, Linear, Trello/Butler, Productive, Filestage e ferramentas de social media com aprovação por link. Estudamos só comportamento e funcionalidade; nada de código, texto longo ou marca copiados.
Ressalva: boa parte das fontes é de fornecedores. Os números (escopo extra, precisão de timesheet, utilização) servem como direção, não como dado auditado.

---

## 1. Tese em 5 linhas

1. O Dmanda é um **Trello bonito e genérico**: kanban, card rico, lista/calendário, Cmd+K, tempo real, tema. Serve para qualquer equipe e não tem nada específico de agência.
2. O que trava agência não é organizar cards. É o **ciclo da peça**: pedido mal briefado → produção → revisão interna → **cliente demora para aprovar** → rodadas de ajuste sem limite → horas que ninguém cobra.
3. Mesmo as ferramentas grandes deixam esse ciclo pela metade. **Aprovação do cliente sem login** é pedido recorrente no ClickUp. No Monday ela depende de add-on pago. Nas avaliações do Operand, usuários pedem para "trazer o cliente para dentro". No Runrun.it não existe nativa.
4. Para ser melhor que o Dmanda, então, o caminho não é mais acabamento visual. É **modelar a operação da agência**: cliente, tipo de peça, briefing, versão, rodada, aprovação, SLA, horas e capacidade.
5. Ao mesmo tempo é preciso manter o sistema **leve como o Linear**. O que mata ferramenta interna é atrito (campos demais, notificação demais, trabalho duplicado), não falta de recurso.

---

## 2. Linha de base: o que o Dmanda tem e o que falta

**Tem (pela landing):** kanban com colunas coloridas e drag-and-drop; card com descrição, checklist com progresso, prazo, prioridade (4 níveis), responsáveis, anexos e comentários com @menção; campos Cliente, Pessoas, Etiquetas, Início, Prazo, Estimativa e cronômetro; visões lista e calendário (arrastar muda o prazo); Cmd+K; criação rápida com Enter; página Início ("minhas demandas") e agenda geral; tempo real; tema claro/escuro com vidro fosco; celular; filtro "Só as minhas"; favoritos; notificações; SQLite local ou Vercel; pessoas ilimitadas. Stack Next.js + SQLite. É vendido como curso (R$197 no lançamento) para quem não programa.

**Não menciona:** aprovação do cliente, versões/rodadas, briefing estruturado por tipo de peça, templates, recorrência, SLA, capacidade/carga, relatórios por cliente, timesheet consolidado (só o cronômetro no card), automações, portal do cliente, importação de dados, API/integrações, permissões/papéis.

**Ponto técnico frágil:** SQLite "na Vercel". O sistema de arquivos das funções serverless é efêmero, então um arquivo SQLite gravado ali não persiste de forma confiável. Na prática é preciso um banco gerenciado (libSQL/Turso, Postgres) ou um servidor próprio. Anexos de vídeo também não cabem no banco. Para a Melt, que trabalha com vídeo, armazenar arquivos é requisito de primeira linha.

---

## 3. Panorama: o que cada ferramenta faz bem e o que vale aproveitar

| Ferramenta | Ponto forte para agência | Lacuna relevante | Ideia para aproveitar (comportamento) |
|---|---|---|---|
| **Operand** (BR) | Feito para agência: jobs por cliente, templates de job recorrente, timesheet, financeiro, Kanban/Gantt | Avaliações pedem cliente dentro da ferramenta (status/aprovação); sem API pública citada | "Jobs do mês por cliente" gerados por template |
| **Runrun.it** (BR) | Timer "play" na tarefa que aloca horas a cliente/projeto; timesheet automático; visão de quem está sobrecarregado; formulários de entrada | Sem aprovação externa nativa; avaliação cita app móvel ruim para horas | Horas caem no cliente sem ninguém precisar classificar |
| **ClickUp** | Forms → tarefa, status customizados, Workload por estimativa (verde/laranja/vermelho), agentes de IA | Proofing para cliente sem conta é um pedido aberto; recorrentes somem da carga (relato) | Barra de capacidade colorida por pessoa |
| **Asana** | Tarefa vira "aprovação" (Aprovar / Pedir ajuste / Rejeitar); proofing em imagem/PDF cria subtarefa por marcação | Regras não criam aprovação; subtarefas de proofing se acumulam a cada versão | Botões de decisão no lugar de "concluir" |
| **Monday** | Widget de carga por pessoa (horas ou pontos), automações | Proofing só via add-on (PageProof, Ziflow, Filestage…); convidado vê demais | Capacidade com rateio entre corresponsáveis |
| **Teamwork.com** | Usuários-cliente gratuitos e ilimitados, retainer com orçamento recorrente, rentabilidade, planejamento por função | Pesado e caro; foco em gerente | Retainer: "contratado x consumido" por mês |
| **Wrike** | Formulário dinâmico que atribui por tipo de pedido, blueprints, proofing com versões, agentes de triagem (2026) | Complexo; recursos só nos planos altos | Formulário que muda conforme o tipo de peça |
| **Basecamp** | Cliente convidado vê só o que você libera; link público de quadro sem login | Sem horas, sem carga, sem relatórios | Separar o que é interno do que é visível ao cliente |
| **Linear** | Velocidade (UI otimista), tudo por teclado, **Triagem** separada do backlog | Feito para software | Fila de triagem + atalhos; cor só para status/prioridade |
| **Trello + Butler** | Regras por gatilho (mover para lista X → checklist + prazo + responsável), cards recorrentes via calendário | Recorrência não é nativa; regras de prazo falham em casos de borda | Automações prontas, não um construtor genérico |
| **Productive** | Portal do cliente gratuito, orçamento por fase, previsão de estouro, fatura a partir das horas | Ferramenta de ERP, ampla demais | Alerta de "vai estourar o fee" |
| **Filestage** | Rodadas e versões, comparação entre versões, grupos de revisores em sequência (interno → jurídico → cliente), prazos e lembretes, **sem conta** | Só revisão, não gestão | Etapas de aprovação em sequência e destaque do que mudou entre V1 e V2 |
| **SocialPilot / Pallyy / Vista Social / mLabs** | Calendário de posts compartilhado por link; cliente aprova ou pede ajuste sem login; link com senha/validade; registra quem aprovou | Só social | Aprovar o **mês inteiro** de posts numa única tela |

---

## 4. Práticas de operação de agência (e o que cada uma exige do sistema)

- **Briefing estruturado.** Briefing ruim gera refação. Um caso relatado pela Pipefy (fornecedor) mostra o tempo por pedido caindo de cerca de 3h para 45min com formulário de campos obrigatórios. → *Exige* formulário por tipo de peça e selo de "briefing incompleto".
- **A aprovação é o gargalo.** Segundo Reportei e ClickUp, o atraso costuma estar na validação do cliente, não na criação: peças prontas paradas por dias e feedback perdido em e-mail ou WhatsApp. → *Exige* status "com o cliente" visível, relógio de espera e lembrete automático.
- **Rodadas de alteração / escopo extra.** Na pesquisa Ignition 2025 (273 agências), 57% das agências perdem de US$1k a 5k por mês em escopo extra não cobrado e só 1% cobra tudo. As causas citadas são desconforto em cobrar e falta de sistema para rastrear. → *Exige* contador de rodadas, limite do contrato e marcação "extra".
- **SLA por tipo de peça.** Não há tabela de mercado. Contratos públicos usam, por exemplo, 2 a 8 dias úteis para peça gráfica simples, 2 a 5 dias para vídeo e antecedência mínima de briefing de cerca de 10 dias úteis. → *Exige* prazo-padrão por tipo, contagem em dias úteis e prazo interno separado do prazo do cliente.
- **Timesheet.** Registro feito no mesmo dia acerta em torno de 2/3 das horas; registro semanal cai para cerca de 35–55% (números de fornecedor, direção consistente). Lembrete automático é o que mais eleva a adesão. → *Exige* timer de 1 clique no card, lembrete de fim de dia e horas ligadas ao cliente automaticamente.
- **Capacidade.** O alvo saudável de utilização faturável fica em 70–85% para quem produz (cerca de 30–40% para diretores). Acima disso vem burnout e serviço além do contratado. → *Exige* estimativa padrão por tipo de peça e carga semanal por pessoa e por função.
- **Calendário editorial.** Social media trabalha com mês de conteúdo aprovado em lote. → *Exige* visão por **data de publicação** (não só prazo de produção), com miniatura e legenda.
- **Entregáveis recorrentes (fee mensal).** "12 posts + 8 stories + 1 relatório por mês". → *Exige* pacote do cliente que gera as demandas do mês e o comparativo contratado x entregue.
- **Portal do cliente.** Teamwork, Basecamp e Productive oferecem; ClickUp e Monday não resolvem bem sem login. → *Exige* link de aprovação primeiro e portal completo depois.
- **Templates e automações.** Trello/Butler e Wrike mostram o padrão "entrou na etapa X → checklist da etapa, responsável e prazo". → *Exige* poucas automações prontas e confiáveis.
- **WhatsApp no Brasil.** Pedidos e aprovações se perdem em grupos e conversas individuais. → *Exige* um caminho de WhatsApp → triagem e de link de aprovação → WhatsApp, sem brigar com o hábito do cliente.

---

## 5. Diferenciais priorizados (o que o Dmanda não tem e a Melt usaria toda semana)

Esforço: **P** = até ~1 dia com Claude Code · **M** = 2–5 dias · **G** = 1–3 semanas.
Prioridade: **MVP** = sem isso não vale trocar o Trello · **v1** = primeiro mês de uso · **v2** = depois de validar.

### MVP

**D1. Cliente como entidade, não como etiqueta**
- *Problema:* no Dmanda/Trello, "Cliente" é um campo de texto. Não dá para guardar contrato, aprovadores, SLA nem cor por cliente, nem filtrar o mês de um cliente.
- *UI:* cadastro do cliente (logo, cor, contatos aprovadores, pacote mensal, links de marca/drive). Avatar do cliente no card e filtro por cliente em todas as visões. Página do cliente com as demandas abertas, as que estão com ele e as entregues no mês.
- *Esforço:* P–M · *Prioridade:* MVP

**D2. Nova demanda por tipo de peça (briefing estruturado + template)**
- *Problema:* briefing incompleto gera refação, e o atendimento reescreve as mesmas perguntas toda semana.
- *UI:* "Nova demanda" → escolher o tipo (Post, Carrossel, Reels/Vídeo, Stories, Anúncio, Landing, Relatório…). Cada tipo traz no máximo 5 campos obrigatórios (objetivo, formato/rede, data de publicação, copy/texto-base, referências), um checklist padrão, uma estimativa padrão e um prazo calculado pelo SLA. Enter rápido continua existindo, mas o card nasce com o selo **"briefing incompleto"** até o atendimento completar.
- *Esforço:* M · *Prioridade:* MVP

**D3. Fluxo de agência pronto + "com quem está a bola"**
- *Problema:* colunas livres viram bagunça, e ninguém sabe se o atraso é da equipe ou do cliente.
- *UI:* fluxo padrão (Triagem → Briefing ok → Produção → Revisão interna → **Com o cliente** → Ajustes → Aprovado → Agendado/Entregue). Cada card mostra um selo de responsabilidade (Agência / Cliente / Terceiro) e o contador **"parado há 3 dias"**. O relógio de SLA pausa enquanto a peça está com o cliente, então a métrica fica justa.
- *Esforço:* P · *Prioridade:* MVP

**D4. Aprovação do cliente por link, sem login**
- *Problema:* é o maior gargalo de agência e a maior lacuna das ferramentas genéricas. O cliente aprova pelo WhatsApp e ninguém sabe depois qual versão foi aprovada.
- *UI:* botão "Enviar para aprovação" no card gera um link (com validade e, opcionalmente, senha). O cliente vê a peça (imagem, vídeo, PDF ou texto/legenda) e responde com **Aprovar** ou **Pedir ajuste** (comentário obrigatório). Pede só o nome, sem conta. O card muda de status sozinho e notifica o responsável. Existe também o **link de lote**, com todos os posts da semana/mês de um cliente numa página só, aprovados um a um.
- *Esforço:* M · *Prioridade:* MVP

**D5. Versões e rodadas contadas (controle de refação)**
- *Problema:* ajuste infinito sem cobrança (escopo extra é o principal vazamento de margem de agência).
- *UI:* cada entrega anexada vira **V1, V2, V3…** O card mostra "Rodada 2 de 2 inclusas". Na 3ª rodada aparece um aviso e um botão "marcar como extra" (com valor opcional, que alimenta o relatório mensal). O cliente sempre vê a versão mais recente no link.
- *Esforço:* M · *Prioridade:* MVP (contador e versões); comparação lado a lado fica para v1

**D6. Trilha de aprovação (prova)**
- *Problema:* "eu não aprovei isso", ou a arte errada é publicada.
- *UI:* histórico no card com quem aprovou, quando, qual versão e o comentário, e um selo "Aprovado V2 por Fulana em 12/10 14:03". Exportável.
- *Esforço:* P (sai junto com D4) · *Prioridade:* MVP

**D7. Fila de triagem (entrada única)**
- *Problema:* pedidos chegam por WhatsApp, e-mail, reunião e corredor, e o quadro nunca é a verdade.
- *UI:* toda demanda nova cai em **Triagem** (separada do quadro, como no Linear). O atendimento classifica cliente, tipo, responsável e prazo com atalhos de teclado e solta no fluxo. Botão "colar mensagem do WhatsApp": cola o texto e o card nasce com o texto original e a data.
- *Esforço:* P · *Prioridade:* MVP

**D8. Dois prazos: publicação e produção**
- *Problema:* o prazo do card é ambíguo. É quando o designer entrega ou quando o post vai ao ar?
- *UI:* o campo **Data de publicação/entrega ao cliente** calcula o **Prazo interno** (publicação − folga de aprovação − ajustes). Calendário e "Minha semana" usam o prazo interno, e o calendário editorial usa a publicação.
- *Esforço:* P · *Prioridade:* MVP

**D9. "Copiar para WhatsApp"**
- *Problema:* o cliente vive no WhatsApp, e integrar a API oficial tem custo e burocracia.
- *UI:* um botão gera a mensagem pronta ("Oi, Fulana! Seguem os posts da semana para aprovação: [link]. Prazo: quinta 18h") e copia para colar no grupo do cliente.
- *Esforço:* P · *Prioridade:* MVP

### v1

**D10. Pacote mensal + entregáveis recorrentes**
- *Problema:* todo mês alguém recria à mão os 12 posts de cada cliente, e o "contratado x entregue" fica numa planilha.
- *UI:* no cliente, um pacote ("12 posts, 8 stories, 1 relatório/mês"). No dia X o sistema gera as demandas do mês seguinte com prazos distribuídos (ou um botão "gerar mês"). O cabeçalho do cliente mostra **"8/12 posts entregues"**.
- *Esforço:* M · *Prioridade:* v1

**D11. Calendário editorial por cliente (compartilhável)**
- *Problema:* o calendário do Dmanda mostra prazos de produção, mas a reunião com o cliente é sobre o que vai ao ar e quando.
- *UI:* mês por data de publicação, com miniatura da arte, rede e status de aprovação. Arrastar muda a data de publicação (e recalcula o prazo interno). O mesmo calendário vira o link de aprovação em lote (D4).
- *Esforço:* M · *Prioridade:* v1

**D12. Capacidade da equipe (carga semanal)**
- *Problema:* o atendimento promete prazo sem saber quem está livre. Uns ficam afogados, outros ociosos.
- *UI:* visão "Equipe": linhas por pessoa, colunas por dia/semana, horas estimadas (padrão do tipo de peça) contra horas disponíveis (descontando folgas), cor verde/laranja/vermelha. Arrastar card de uma pessoa para outra reatribui. Filtro por função (design, redação, vídeo). As recorrentes entram na conta, que é a falha relatada no ClickUp.
- *Esforço:* G · *Prioridade:* v1

**D13. Timesheet sem fricção + horas por cliente**
- *Problema:* o cronômetro do Dmanda existe, mas não vira informação de gestão, e horas registradas no fim da semana são chute.
- *UI:* timer de 1 clique (no card, no Cmd+K e no celular), só um ativo por vez. Lembrete no fim do dia ("timer aberto há 6h" / "hoje: 2h registradas"). Edição rápida de blocos. Relatório **horas por cliente x fee**, mostrando quais clientes consomem mais do que pagam.
- *Esforço:* M · *Prioridade:* v1

**D14. Etapas com responsáveis em sequência (handoff)**
- *Problema:* uma peça passa por redação → design → revisão → atendimento. O Dmanda tem "responsáveis" sem ordem, então ninguém sabe quando é a sua vez.
- *UI:* o tipo de peça define etapas, cada uma com responsável e prazo. Ao concluir uma etapa, a próxima pessoa recebe a demanda em "Minha semana". O card mostra a etapa atual.
- *Esforço:* M · *Prioridade:* v1

**D15. SLA por tipo de peça + alerta de risco**
- *Problema:* o atraso só é descoberto no dia.
- *UI:* tabela de SLA editável (dias úteis por tipo, com feriados). Selo **"em risco"** quando o prazo interno se aproxima e a demanda não chegou à revisão. Painel "o que vai atrasar esta semana".
- *Esforço:* P · *Prioridade:* v1

**D16. Automações prontas (poucas e confiáveis)**
- *Problema:* trabalho repetitivo de mover, avisar e cobrar cliente.
- *UI:* lista de interruptores, sem construtor genérico:
  - (a) foi para "Com o cliente": gera link e avisa o atendimento;
  - (b) cliente sem resposta em 48h: lembrete ao atendimento (com o texto para WhatsApp pronto);
  - (c) aprovado: vai para Agendado e avisa o social media;
  - (d) checklist da etapa concluído: avança a etapa;
  - (e) gerar o mês do pacote.
- *Esforço:* M · *Prioridade:* v1

**D17. Relatório mensal do cliente**
- *Problema:* a reunião de status é montada à mão no PowerPoint.
- *UI:* por cliente e mês: contratado x entregue, peças por tipo, rodadas médias, tempo médio de aprovação do cliente (a métrica que defende a agência), horas e extras. Exporta como link ou PDF.
- *Esforço:* M · *Prioridade:* v1

**D18. API + servidor MCP (Claude opera o sistema)**
- *Problema:* a Melt já trabalha com Claude/MCP. Criar demanda a partir de e-mail, transcrição de reunião ou print de WhatsApp é trabalho de IA, não de pessoa.
- *UI:* ferramentas MCP enxutas (criar demanda na triagem, listar atrasadas/em risco, resumo do cliente X, registrar aprovação, gerar mês). Exemplos: "Claude, transforma essa ata em demandas do cliente Y" ou "o que está parado com cliente há mais de 3 dias?".
- *Esforço:* M · *Prioridade:* v1 (diferencial único frente ao Dmanda, que é feito com IA mas não é operável por IA)

**D19. Ficha da marca do cliente acessível do card**
- *Problema:* o designer procura o manual, a fonte e o logo em pastas.
- *UI:* aba "Marca" no cliente (manual, paleta, fontes, logos, tom de voz, links), visível no card em um clique. Nada de senhas no card: só referência a um cofre.
- *Esforço:* P · *Prioridade:* v1

**D20. Ações em massa + teclado em tudo**
- *Problema:* reprogramar 12 posts por causa de um feriado é clique demais.
- *UI:* seleção múltipla (shift/ctrl) para mudar responsável, prazo (+N dias úteis), status ou cliente. Atalhos visíveis nos menus, no estilo do Linear.
- *Esforço:* P · *Prioridade:* v1

### v2

**D21. Anotação na peça e comentário com minutagem em vídeo**
- *Problema:* "o logo está grande" sem dizer onde; "corta aquela parte" sem dizer qual. Para a Melt, que edita vídeo, isso é crítico.
- *UI:* no link de aprovação e no card, clicar na imagem cria um pino com comentário. No vídeo, o comentário fica preso ao tempo (00:42). Cada pino vira item de checklist do ajuste. Comparação V1 x V2 lado a lado.
- *Esforço:* G · *Prioridade:* v2 (começar só por imagem, no fim da v1, se D4 pegar)

**D22. Prévia do post como no feed**
- *Problema:* o cliente aprova a arte solta e reclama quando vê no feed.
- *UI:* no link de aprovação, mockup simples de feed/stories com arte + legenda + perfil do cliente.
- *Esforço:* M · *Prioridade:* v2

**D23. Portal do cliente completo**
- *Problema:* o cliente quer abrir pedidos e acompanhar sem perguntar no WhatsApp.
- *UI:* login simples por cliente (link mágico). Abrir solicitação pelo formulário do tipo de peça (cai na triagem), ver status, histórico de aprovações e o calendário do mês. Só o que for marcado como visível ao cliente.
- *Esforço:* G · *Prioridade:* v2 (antes, provar valor com o link de aprovação)

**D24. IA no briefing e no card**
- *Problema:* briefing raso e threads longas.
- *UI:* "o que falta neste briefing?" (checagem contra o tipo de peça), gerar checklist/subetapas a partir do texto, resumir comentários ("o que o cliente pediu nas 3 rodadas"), rascunho de legenda. Sempre como sugestão, nunca automático.
- *Esforço:* M · *Prioridade:* v2 (via MCP/Claude, sem custo de licença por usuário)

**D25. Integração WhatsApp oficial e e-mail de entrada**
- *Problema:* copiar e colar (D7/D9) ainda é manual.
- *UI:* um e-mail encaminhado ou uma mensagem para um número da agência cai na triagem. O link de aprovação vai pelo WhatsApp Business API.
- *Esforço:* G · *Prioridade:* v2 (avaliar custo da API)

**D26. Folgas e redistribuição**
- *Problema:* férias e feriados quebram a carga.
- *UI:* calendário de ausências. A carga desconta automaticamente e sugere para quem passar as demandas da pessoa ausente.
- *Esforço:* M · *Prioridade:* v2

### Ordem sugerida de construção

D1 → D3 → D2 → D7 → D8 → D4+D6 → D5 → D9 (MVP). Depois D10 → D11 → D13 → D15 → D16 → D18 → D12 → D14 → D17 (v1).
Ao lado: importação do Trello (JSON do quadro → cards ativos, sem arquivo morto), backup automático do banco e armazenamento de anexos fora do banco.

---

## 6. Armadilhas (o que deixa ferramenta assim pesada e abandonada)

1. **Trabalho duplicado.** Se o status precisa ser atualizado no quadro, repetido no WhatsApp e falado na reunião, o quadro é o primeiro a morrer. *Antídoto:* a reunião usa o relatório gerado pelo sistema (D17), e o link de aprovação substitui o "aprovado?" no WhatsApp.
2. **Campos e configurações demais.** É o caminho do ClickUp: plugins, campos e permissões viram "monstro de manutenção". *Antídoto:* no máximo 5 campos obrigatórios por tipo de peça, campos opcionais recolhidos e fluxo de status padrão difícil de bagunçar.
3. **Timesheet como policiamento.** Exigir minuto exato gera dado inventado. Registro semanal acerta metade ou menos. *Antídoto:* timer de 1 clique, lembrete gentil no fim do dia e relatório usado para precificar cliente, não para punir pessoa.
4. **Notificação demais.** Todo mundo silencia e perde o que importa. *Antídoto:* notificar só quem está com a bola, resumo diário por e-mail/WhatsApp e @menção como único alerta imediato.
5. **Exigir conta do cliente.** O cliente não cria login e volta para o WhatsApp. *Antídoto:* link sem login (D4) e portal só depois.
6. **Liderança fora do sistema.** Se o gestor pede coisas por direct, o quadro deixa de ser a verdade. *Antídoto:* regra "se não está no sistema, não existe" e entrada sem atrito (triagem + colar do WhatsApp) para que a regra seja viável.
7. **Proliferação de quadros.** Um quadro por cliente e por pessoa fragmenta a visão e a carga. *Antídoto:* um fluxo de produção com filtro por cliente e visões salvas, não quadros duplicados.
8. **Automação genérica que quebra calada.** Regras de prazo do Butler falham em casos de borda (card concluído não move, por exemplo). *Antídoto:* poucas automações fixas e testadas (D16), com registro no histórico do card do que a automação fez.
9. **Lentidão.** Ferramenta lenta perde para o WhatsApp. *Antídoto:* UI otimista (aplica na hora e sincroniza depois), lista virtualizada e orçamento de performance (abrir o card em menos de 100 ms).
10. **Celular só de enfeite.** Uma avaliação do Runrun.it reclama de não conseguir registrar horas pelo app. *Antídoto:* no celular funcionam bem 4 coisas: ver "minha semana", iniciar/parar timer, comentar e aprovar.
11. **Capacidade mentirosa.** Se recorrentes ou etapas não entram na conta, o gráfico de carga perde credibilidade e é ignorado. *Antídoto:* toda demanda tem estimativa (padrão do tipo) e as geradas pelo pacote entram na carga.
12. **Querer virar ERP.** Financeiro, CRM, propostas e notas fiscais (escopo do Operand) multiplicam o esforço. *Antídoto:* parar em "horas e extras por cliente" e exportar CSV para o financeiro.
13. **Infra improvisada.** SQLite em serverless não persiste; vídeo no banco estoura; sem backup, um erro apaga a operação. *Antídoto:* banco persistente, arquivos em armazenamento de objetos ou links do Drive, backup diário automático.
14. **Senhas de cliente em card/comentário.** É prática comum em agência e é risco real. *Antídoto:* campo "acesso" que só aponta para o cofre de senhas.
15. **Migração big-bang.** Importar 5 anos de Trello traz lixo junto. *Antídoto:* importar só os cards ativos, rodar 2 semanas em paralelo com 1–2 clientes piloto e depois virar.

---

## 7. Como saber se deu certo (métricas, 30/60 dias)

- % de demandas que nasceram no sistema (meta >90%) contra as pedidas "por fora".
- Tempo médio "com o cliente" por cliente (deve cair com o link e o lembrete).
- Rodadas médias por peça e nº de extras marcados (antes era zero, por definição).
- % de entregas no prazo interno.
- Horas registradas / horas disponíveis por pessoa (adesão ao timesheet, meta >80%).
- Uso diário: pessoas ativas/dia sobre o total da equipe.

---

## 8. Fontes consultadas

- Dmanda: https://publi.academy/dmanda/
- Operand: https://www.operand.com.br/ · https://www.b2bstack.com.br/product/operand/avaliacoes
- Runrun.it: https://us.fitgap.com/products/012460/runrun-it · https://landing.runrun.it/en-GB/how-runrun-it-works · https://www.b2bstack.com.br/produto/runrun-it · https://www.getapp.com/collaboration-software/a/runrun-dot-it
- ClickUp: https://clickup.com/blog/how-agencies-can-optimize-approval-workflows/ · https://feedback.clickup.com/feature-requests/p/client-proofing-without-account · https://feedback.clickup.com/feature-requests/p/have-recurring-subtask-time-estimates-appear-in-the-resourcing-workload-view · https://processdriven.co/hub/clickup-workload-view
- Asana: https://help.asana.com/s/article/proofing · https://forum.asana.com/t/rules-automation-include-add-approval/73107 · https://cirface.com/blog/asana-approvals-best-practises
- Monday: https://monday.com/efficiencyimpact/use-case/simplify-approval-process · https://community.monday.com/t/help-on-setting-up-monday-com-for-approval-process/2069 · https://support.monday.com/hc/en-us/articles/360010699760-The-Workload-View
- Teamwork: https://www.teamwork.com/solutions/agencies/ · https://teamwork.com/compare/clickup-vs-teamwork/
- Wrike: https://www.wrike.com/templates/creative-asset-proofing-and-approvals/ · https://wrike.com/templates/creative-asset-production
- Basecamp: https://basecamp.com/features · https://makerstack.co/reviews/basecamp-review/
- Linear: https://www.resumelens.org/blog/linear/linear-automations-and-triage · https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026
- Trello/Butler: https://www.atlassian.com/blog/trello/butler-power-up-trello-automation · https://community.developer.atlassian.com/t/automation-butler-due-date-trigger-sometimes-not-firing/55984
- Productive: https://productive.io/client-portal/ · https://project-management.com/productive-software-review/
- Filestage: https://filestage.io · https://www.g2.com/survey_responses/filestage-review-13362120
- Aprovação social por link: https://www.socialpilot.co/product-update/share-socialpilot-calendar · https://pallyy.com/help/shared-calendar · https://support.vistasocial.com/hc/en-us/articles/18158890067355 · https://mlabs.com.br/funcionalidades/calendario
- Aprovação como gargalo / briefing: https://reportei.com/aprovacao-de-conteudo/ · https://socialk.it/pt/blog/team-content-approval-workflow-guide · https://www.pipefy.com/blog/marketing-briefing-automation/
- Escopo extra: https://www.thedrum.com/news/2025/05/22/cash-flow-crunch-us-agencies-struggle-grow-late-payments-and-scope-creep-bite · https://www.bandt.com.au/93-of-agencies-are-raising-prices-but-why-are-so-many-still-leaking-profit/
- SLA (contratos públicos como referência): https://sebrae.com.br/Sebrae/Portal%20Sebrae/UFs/MT/11%20ESCLARECIMENTOS%20CONCORRENCIA%20005%202013%20_7.pdf · https://www.ifb.edu.br/attachments/article/25914/Fluxo%20de%20solicita%C3%A7%C3%A3o%20de%20cria%C3%A7%C3%A3o%20multimidia%20do%20IFB.pdf
- Utilização/capacidade: https://everhour.com/calculators/utilization-rate-calculator-for-marketing-agencies · https://www.teamwork.com/glossary/utilization-rate/ · https://www.ravetree.com/blog/how-to-improve-resource-utilization-in-your-agency-a-complete-guide-to-maximizing-billable-hours
- Timesheet: https://www.memtime.com/blog/insights-time-tracking · https://www.apps365.com/case-studies/marketing-agency-timesheet-reminders/
- Abandono de ferramentas: https://www.breeze.pm/articles/why-teams-resist-project-management-tools · https://morningmate.com/m/blog/why-teams-abandon-task-management-tools · https://ones.com/blog/why-high-cost-projects-fail-at-pm-adoption-in-2026/
- WhatsApp em agências: https://gosmarter.com.br/whatsapp-business-para-agencia-marketing-digital-guia/ · https://www.wati.io/geo-brazil-pt/api-do-whatsapp-para-agencias-que-gerenciam-varias-contas-no-b
- IA em gestão de projetos 2026: https://dupple.com/learn/best-ai-for-project-management · https://www.eesel.ai/blog/clickup-vs-asana
