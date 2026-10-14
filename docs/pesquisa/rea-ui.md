# REA — Superfície de UI do Trello (quadros públicos, sem login)

Data: 2026-10-14 · Frente: superfície de UI · Ferramenta: REA (MCP `rea`) · Navegador: Chrome 154 headless (CDP 127.0.0.1:9222, perfil temporário, anônimo) + 1 execução em modo *launch* (Chrome local, perfil próprio do REA) para responsividade.

Regras seguidas: só comportamento/funcionalidade; nenhum código-fonte, texto longo, asset ou marca copiados; nenhum login; nada gravado no Trello. Rótulos curtos de UI (1–6 palavras), chaves de i18n, nomes de campos e rotas aparecem como identificadores.

---

## 0. Resumo (leia primeiro)

1. **Visitante anônimo vê o quadro em modo leitura**: cabeçalho reduzido (nome, selo "Template", Visualizações, avatares, Filtro, Visibilidade, Menu), listas com contador e botão de recolher, cartões com etiquetas/badges/capas, e o verso do cartão (modal) com campos desabilitados. Edição, comentários, power-ups e automações aparecem **desabilitados ou ausentes** (`ev_9b98b3d2…`, `ev_9b64d025…`).
2. **Visões (Tabela, Calendário, Painel, Cronograma, Mapa)** estão listadas no seletor, com rotas `/board/<id>/<visão>`, mas **sem login retornam "Página não encontrada"** (`ev_7dca7913…`, `ev_ac022f49…`, `ev_b1517f56…`). O bundle tem a string "Faça o upgrade para ter acesso às visualizações" → visões são recurso pago (estático-i18n).
3. **Filtro** é rico e funciona anônimo: palavra-chave, membros, status concluído, data de entrega (sem data/atrasado/1 dia/1 semana/1 mês), etiquetas, atividade (1/2/4 semanas, inativo 4 semanas), "recolher listas sem correspondência" e modo "Qualquer correspondência". O filtro **vai para a URL (`?filter=`) e persiste em localStorage**, sendo reidratado ao recarregar (`ev_557d195b…`, `ev_09eb00e8…`).
4. **Atalhos de teclado**: diálogo completo aberto com `?` (rota `?overlay=shortcuts`), ~35 atalhos (`ev_4129a633…`). É o mapa mais completo das ações de edição que o anônimo não vê.
5. **Limite WIP** observado na frente da lista como "2 / 10" e "3 / 10" (`ev_127484b1…`); o bundle confirma o popover "Definir limite da lista → Máximo de cartões" com destaque quando ultrapassa (estático-i18n).
6. **Badges de cartão observados**: descrição, anexos (n), checklist (x/y), prazo (com estado: concluído verde, "Em Atraso"), template, adesivos, campos de power-up na frente; capa normal e capa cheia; cartão-link de quadro. **Não observados em runtime** (só no bundle): comentários, votos, seguindo, local, data de início, notificações não lidas, membros na frente do cartão.
7. **Ações de edição do verso do cartão e do menu da lista não aparecem para anônimo**; foram mapeadas pelo arquivo de idioma pt-BR que o próprio Trello carrega (`locale.pt-BR…js`, Evidence `ev_c7decd4c…`) — classificadas como "estático-i18n" (existem no produto; layout/visibilidade por plano não observados).
8. **Responsivo (390×844, modo launch, `ev_73623db2…`)**: cabeçalho vira hambúrguer; cabeçalho do quadro compacta (nome truncado, ícones de visão/filtro/"…"); listas mantêm largura fixa com rolagem horizontal; modal do cartão quase tela cheia; barra inferior do cartão vira só ícones.

Legenda de status: **observado** = visto em runtime nesta sessão · **estático-i18n** = string de UI presente no bundle de idioma carregado pela página (prova que a função existe; não prova layout nem plano) · **inferido** = dedução a partir de evidência indireta · **desconhecido** = não verificado.

---

## 1. Registro de evidências

| Alias | Evidence ID completo | Operação | Alvo | O que sustenta |
|---|---|---|---|---|
| E01 | ev_00fb72f3e01612812fb1922910de6d030006127acec8ad2afd0039c5b28ca77c | inspect_web_page (passivo, a11y) | /templates/marketing | galeria de templates, categorias, banner de cookies |
| E02 | ev_3aa1ac89356654fbf15836d08ee3f3206d00841189eb4bc774da51edb06ce820 | capture_browser_scenario | /templates/marketing → template | página do template, link "Ver template" → /b/FK3MvDhj |
| E03 | ev_fee0792048178ff788b5b95c38508b5eb672986c642f42650661f8375473ca5f | capture (a11y) | /b/FK3MvDhj "Marketing Requests" | cabeçalho, listas, frente dos cartões, diálogo "Sobre este quadro" |
| E04 | ev_7dca79136465361e34d80ba8d2b9f7fdc8e0940425e65819f9171d4bc990ed84 | capture (cliques) | idem | popovers Visualizações, Filtrar, Alterar visibilidade, Menu; screenshot |
| E05 | ev_703af8652ea6e5675b2e5b28780c0edd751a97af14c3fce5ecc79ca785f6e6a7 | capture | idem | Menu → Imprimir, exportar e compartilhar |
| E06 | ev_6351cf19156934c0c1f1d63337b5f59958c26565ced99920025abafac8024be0 | capture | idem | Menu → Etiquetas (busca, lista) |
| E07 | ev_989ab06e2cb36d03eeeb2d1803cc11952578cf096e7ee7dd0b70c5b5f487f017 | capture | idem | Itens arquivados, Sobre este template, Recolher todas as listas; screenshot |
| E08 | ev_9b98b3d20b5d92794f7ac1ed043b6ba634c7f9c57a59e80698feaa25c21cea14 | capture | /c/rgPKi2O1 | verso do cartão: etiquetas, prazo concluído, descrição, anexos, barra inferior |
| E09 | ev_e9dd9578eef7e20d5eab3879d99bef54cc444d16f7d6b5fab487c83f6ee8b261 | capture | /templates/project-management | URLs de templates de gestão |
| E10 | ev_736f1ab4327882683ad00206fb5343185783cf5aeddfa82d66fd5855afe28c3f | capture | /b/1x4Uql2u "Project Management" | checklist 0/6, 5 etiquetas, capa cheia, cartão de quadro; screenshot |
| E11 | ev_9b64d0253942893777bb8db42f841aecc578e2a82437b166d452646d5061a54f | capture | /c/DQcKXo3O | verso com checklist (0%, barra de progresso); screenshot |
| E12 | ev_4129a633dc533c7334ac9836ac01c45a4f15b3a336cc832062ae3f937ee74275 | capture (tecla ?) | /b/1x4Uql2u | diálogo de atalhos, `?overlay=shortcuts` |
| E13 | ev_ac022f49f7ab3affbd3ac77123c7849c0a5069cfb9c1b15df86ad3d36999e15a | capture | /board/…/table | visão Tabela anônima → "Página não encontrada" |
| E14 | ev_b1517f567e8cd887ea3f8621b3d41eeb567f0652f6203317f949cae8cc5207d3 | capture | Visualizações → Calendário | idem para Calendário (via clique) |
| E15 | ev_a11c354f8fbd961d3e176f4457044512706509373e30e2d80123ac6f6f72d7f4 | capture | /b/FK3MvDhj | Shift+\ expande todas; popover de membro |
| E16 | ev_557d195be10a32782e4b9016b48010fd046fd7f709c2e91a71685ef8c26a5f54 | capture | /b/FK3MvDhj | clique em etiqueta; tecla F; filtro sem resultado; chaves de localStorage; screenshot |
| E17 | ev_0da551f2cea785d863379e58c049b56ba6a4c0213a2fac5992068cba79d89b21 | capture | /c/rgPKi2O1 | popover "Compartilhar e mais…"; visualizador de anexo |
| E18 | ev_d2ea3ad5189b41cdae66c25469674fdc357c0fc4e0badf9e73a8070a9ac0174e | capture (connect, 390px) | /b/1x4Uql2u | etiquetas com nome (toggle persistido); viewport **não** relayout em modo connect |
| E19 | ev_78ffcc3fed25c2055b8b393d60efd56c5434a846b7ffa62d09715644324ef486 | capture (connect, 390px) | /c/DQcKXo3O | idem (descartado p/ responsividade) |
| E20 | ev_21dd8896fce35081044b4c234ea49aa9efc825badf40eb3b60c55f4d1978ba9d | capture (connect, 768px) | /c/DQcKXo3O | idem (descartado p/ responsividade) |
| E21 | ev_73623db2299f282bc2da2a6829083718e746493139f8503ba18cb17c846fa5d8 | capture (**launch**, 390×844, pt-BR, America/Sao_Paulo) | /b/1x4Uql2u e /c/DQcKXo3O | responsividade real; screenshots por passo |
| E22 | ev_127484b1941ff431a1d7c0c3d72ae4f07bb2bc21311d5979a4f77d5857bb9d56 | capture (4 quadros) | /b/WHOzj88m, /b/BGbKiKKA, /b/2Hsb5dPy, /b/GHFaoLVc | limite WIP "n / 10", cartão template, adesivos, campos de power-up na frente, lista vazia, esqueleto de carregamento |
| E23 | ev_18e9ae4eff5845950e8d51448ab2e1f2c8554d9acef35777170db21bd2ed6883 | capture (4 cartões) | /c/t3QKuq4q, /c/9Sqfh8RE, /c/OtKI0axW, /c/yCQh7tq9 | prazo "Em Atraso", cartão-template, campos de power-up no verso |
| E24 | ev_a5f7d0596f8b2be7f6a4518368b7f90338d7bd7259df94801480b6d3877bbdfb | capture (eventos de rede, só URLs) | /c/DQcKXo3O | chunks carregados (card-back, card-composer, filter-popover, locale.pt-BR) e rotas de API |
| E25 | ev_c7decd4c7d49826680652a3f86f1e6f731e5d15469e1dbdba0df16b91152e77d | inspect_web_page (script sources) | /c/DQcKXo3O | texto do `locale.pt-BR.fa251f27906d078965b4.js` (sha256 5b688e77cd83…ec75) → strings de UI de edição |
| E26 | ev_09eb00e85e6664ca7f15139b945677ee2c8eee0cb2de17fa6d5ded88a473b7fb | capture | /b/FK3MvDhj | filtro reidratado de localStorage para `?filter=` após recarregar |
| E27 | ev_f5746c554f5b35580824ba2096a6386d76a32b3236c0c181a99f6f8acf4b36db | capture | /b/FK3MvDhj | limpeza: "Limpar tudo" remove filtro; etiquetas voltam a barras |

Screenshots salvos (nome = 8 primeiros hex do Evidence ID + passo): `pesquisa/rea-ui-shots/`. Bundle completo exportado: `scratchpad/evidencia-ui/rea-ui-bundle.json` (370 MB, inclui registros de outros agentes da mesma sessão REA).

Quadros públicos usados: Marketing Requests `/b/FK3MvDhj` (id 5d840c03e5d25234bc44d105), Project Management `/b/1x4Uql2u` (id 5c3e2fdb0fa92e43b849d838), Amazing Kanban `/b/WHOzj88m`, Work request and intake process `/b/BGbKiKKA`, Advanced Project Budgeting `/b/2Hsb5dPy`, Client Workflow Management `/b/GHFaoLVc`.

---

## 2. Cabeçalho do quadro

| Item | Comportamento | Evidence | Status |
|---|---|---|---|
| Nome do quadro | `textbox "Nome do quadro"` com h1; editável para membros (inferido pelo papel textbox) | E03 | observado (leitura) / inferido (edição) |
| Selo "Template" | ao lado do nome quando o quadro é template | E03, E10 | observado |
| Seletor de visões | botão ícone + chevron "Visualizações" → popover com Quadro, Tabela, Calendário, Painel, Cronograma, Mapa | E04 | observado |
| Avatares de membros | botões por membro; o admin tem indicador "Este membro é administrador deste quadro"; clique abre popover com nome, @usuário, "Ver perfil", "Exibir Atividades do Quadro do Membro" (`?overlay=member-activity&u=<user>`) | E03, E10, E15 | observado |
| Filtrar cartões | botão com tooltip "Filtrar cartões F"; com filtro ativo vira "Filtrar cartões 0" (contagem de resultados) + botão "Limpar tudo" | E04, E16, E26 | observado |
| Visibilidade | botão "Público" → popover "Alterar visibilidade": Privado / Área de trabalho / Organização / Público (rádios, desabilitados p/ anônimo) com explicação de quem vê/edita | E04 | observado |
| Mostrar Menu | abre painel lateral direito "Menu" (atalho `]` alterna) | E04, E12 | observado |
| Estrela/favoritar | string "Inserir ou Remover Estrela do Quadro" | E25 | estático-i18n |
| Botão Power-Ups (cabeçalho) | popover com "Power-ups habilitados", "Adicionar power-ups", "Botões" (mostrar/ocultar no quadro) | E25 | estático-i18n |
| Automação (Butler) no cabeçalho | botões de quadro com modelos: "Instantâneo do quadro", "Entregar em breve", "Meus cartões", "Cartões Em Atraso" | E25 | estático-i18n |
| Compartilhar | "Compartilhar quadro"; spotlight de pedidos de acesso | E25 | estático-i18n |
| "Ingressar no Quadro" | para membros da área de trabalho | E25 | estático-i18n |
| Diálogo "Sobre este quadro" | modal na 1ª visita com descrição do quadro e admin; "OK, entendi"; reabrível pelo menu | E03, E07 | observado |
| Links de pular ("Ir para: Quadro / Alternador de quadro") | skip-links de acessibilidade (#trello-board-root, #island-nav) | E03 | observado |

### 2.1 Filtro (popover "Filtrar")

| Seção | Opções | Evidence | Status |
|---|---|---|---|
| Palavra-chave | textbox; busca em cartões, membros, etiquetas "e muito mais"; ao digitar, as demais seções somem e fica só "Recolher listas sem cartões correspondentes" | E04, E16 | observado |
| Membros | "Sem membros" + combobox multi-seleção de membros | E04 | observado |
| Card status | Marcado como concluído / Não marcado como concluído | E04 | observado |
| Data de entrega | Sem datas, Atrasado, A ser entregue em um dia / uma semana / um mês | E04 | observado |
| Etiquetas | Sem etiquetas + 3 primeiras etiquetas + combobox "Selecionar Etiquetas" | E04 | observado |
| Activity | Ativo na semana passada / 2 semanas / 4 semanas / Sem atividade nas últimas 4 semanas | E04 | observado |
| Combinação | combobox "Qualquer correspondência" (alternativa provável: todas) | E04 | observado / inferido (opção alternativa) |
| Recolher listas sem correspondência | checkbox | E04 | observado |
| Atalhos | F abre; Q = "Cartões atribuídos a mim"; X limpa | E12 | observado |
| Persistência | URL `?filter=<kw>` + localStorage `boardCardFilterSettings-<boardId>-notLoggedIn`; reaplicado ao recarregar | E16, E26 | observado |

### 2.2 Menu do quadro

| Item | Visto anônimo | Evidence | Status |
|---|---|---|---|
| Sobre este template/quadro (admins, contadores de cópias/visualizações, descrição, "Este quadro público é somente para visualização", templates relacionados) | sim | E07 | observado |
| Visibilidade: Público | sim | E04 | observado |
| Imprimir, exportar e compartilhar → link do quadro, texto de permissão, "Imprimir", "Mostrar código QR" | sim | E05 | observado |
| Exportar JSON / CSV / ZIP (cartões, anexos, comentários; limite 20.000 cartões) | não | E25 | estático-i18n |
| Etiquetas → busca "Buscar etiquetas...", lista, "Mostrar mais etiquetas"; voltar com "Voltar para a tela anterior" | sim | E06 | observado |
| Itens arquivados → busca, alternar "Listas", agrupado por tempo ("Há mais de 14 dias"), cada item com etiquetas/prazo/badges e "Arquivado", "Carregar mais cartões" | sim | E07 | observado |
| Restaurar / Excluir permanentemente (só a partir de arquivados) | não | E25 | estático-i18n |
| Recolher todas as listas ↔ Expandir todas as listas | sim | E07, E15 | observado |
| Denunciar abuso | sim | E04 | observado |
| Configurações, Alterar plano de fundo, Automação, Power-Ups, Adesivos, Seguir, Atividade (Tudo/Comentários), Copiar quadro, E-mail para quadro, Criar template, Fechar quadro, Sair do quadro, Coleções, Cores | não | E25 | estático-i18n |
| Permissão de comentário (5 níveis: ninguém → admins+membros → +observadores → +área de trabalho → qualquer usuário do Trello) | não | E25 | estático-i18n |

### 2.3 Visões

| Visão | Rota | Anônimo | Evidence | Status |
|---|---|---|---|---|
| Quadro | /board/<id> (alias de /b/<short>) | funciona | E04 | observado |
| Tabela | /board/<id>/table | "Página não encontrada… pode ser particular… fazendo login" | E13 | observado |
| Calendário | /board/<id>/calendar-view | idem (testado por clique no popover) | E14 | observado |
| Painel | /board/<id>/dashboard | não testado | E04 | observado (rota) / desconhecido (conteúdo) |
| Cronograma | /board/<id>/timeline | não testado | E04 | observado (rota) |
| Mapa | /board/<id>/map | não testado | E04 | observado (rota) |
| Paywall | "Faça o upgrade para ter acesso às visualizações" | — | E25 | estático-i18n |
| Calendário (recursos) | navegação mês/semana/dia, "Ir para a data", "Adicionar um cartão" inline, estado vazio "Não há nada agendado", sincronizar com calendário pessoal (URL iCal regenerável) | — | E25 | estático-i18n |
| Cronograma (recursos) | agrupar por lista/etiqueta/membro, "(n) Não agendado", "Clique e adicione datas" | — | E25 | estático-i18n |

---

## 3. Listas (colunas)

| Item | Comportamento | Evidence | Status |
|---|---|---|---|
| Cabeçalho | h2 com botão do nome (edição inline para membros — inferido), contador de cartões, botão recolher (ícone →← com dica "Recolher lista \\") | E03 | observado |
| Limite WIP | contador vira "atual / limite" (ex.: "2 / 10", "3 / 10") | E22 | observado |
| Definir limite | popover "Máximo de cartões"; "Nenhum limite definido"; a lista é destacada quando ultrapassa | E25 | estático-i18n |
| Recolher lista | vira pílula vertical com nome + contagem e botão "Expandir lista"; tecla `\`; Shift+`\` todas | E07, E12, E15 | observado |
| Persistência do recolhimento | localStorage `collapsed-lists` (estado sobreviveu a recarregamentos) | E14, E16 | observado (chave) / inferido (associação) |
| Lista vazia | lista com contador 0 e `list` vazio, sem placeholder textual | E22 | observado |
| Lista filtrada sem resultado | parágrafo "0 cartão corresponde aos filtros" por lista | E16 | observado |
| Menu da lista ("Mais ações em {lista}") | Adicionar cartão · Copiar lista · Mover lista (quadro/posição) · Mover todos os cartões · Ordenar por (nome A–Z, criação mais nova/antiga, data de entrega, mais votos, campo personalizado asc/desc) · Seguir · Alterar cor da lista · Definir limite da lista · Fixar lista / "Fixar na tela" · Arquivar lista · Arquivar todos os cartões · Arquivar cartões concluídos · Criar uma regra ("Quando um cartão for adicionado à lista", "Todo dia / Toda segunda-feira, ordenar a lista por") | E25 | estático-i18n |
| Cores de lista | cinza/preto (padrão), azul, verde, verde-limão, magenta, laranja, roxo, vermelho, azul-petróleo, amarelo | E25 | estático-i18n |
| Adicionar cartão (composer) | "Adicionar um cartão" → "Insira um título, cole um link ou digite / para comandos"; colar várias linhas oferece criar N cartões (máx. 100); "Adicionar template de cartão"; Shift+Enter abre o cartão criado | E12, E25 | estático-i18n / observado (atalho) |
| Adicionar lista | "Adicionar outra lista" → "Digite o nome da lista…" | E25 | estático-i18n |
| Lista arquivável/restaurável | aba "Listas" em Itens arquivados | E07 | observado |
| Limites de plataforma | mensagens de "muitos cartões abertos" por lista/quadro, "muitas listas" | E25 | estático-i18n |

---

## 4. Frente do cartão (badges e decorações)

| Elemento | Representação | Evidence | Status |
|---|---|---|---|
| Etiquetas | barras coloridas sem texto por padrão; acessível como "Cor: amarelo, título: “Design Request”"; clique em qualquer etiqueta (ou `;`) alterna nomes visíveis em todo o quadro; estado salvo (`labelState`) | E03, E16, E18, E27 | observado |
| Etiqueta sem título | "Cor: roxo, título: nenhua" (erro de tradução do Trello) | E22 | observado |
| Descrição | ícone "Este cartão tem uma descrição." | E03 | observado |
| Anexos | ícone clipe + número ("1 anexo", "2 anexos") | E03 | observado |
| Checklist | botão "Itens do checklist concluídos: 0 de 6" com "0/6" | E10, E22 | observado |
| Prazo concluído | selo verde com check + data ("4 de jun. de 2019"), título do cartão com check "Concluído" | E03, E04 | observado |
| Prazo (estados) | concluído; entregar em breve; < 24 h; < 1 h; um pouco atrasado; "Em Atraso"; mais tarde | E23 (Em Atraso no verso), E25 | observado (concluído/atrasado) / estático-i18n (demais) |
| Data de início | "Começou: {data}" / "Começa: {data}" | E25 | estático-i18n |
| Cartão template | texto "Este cartão é um template." | E22 | observado |
| Adesivos | botões com imagens (ex.: taco-celebrate ×4) sobre o cartão | E22 | observado |
| Campos de power-up na frente | pares "Campo: valor" (ex.: horas, estimativas) | E22 | observado |
| Campos personalizados nativos | opção "Mostrar campo na frente do cartão" | E25 | estático-i18n |
| Capa (topo) | imagem acima do título | E04 | observado |
| Capa cheia | imagem de fundo com título sobreposto | E10 | observado |
| Cartão de quadro (link para quadro) | mini-prévia do quadro com colunas | E10 | observado |
| Cartão de separação / link / espelho | tipos de cartão ("Cartão de separação", "Converter em cartão de link", "Cartão de espelhamento") | E25 | estático-i18n |
| Comentários (n), votos (n), seguindo, local, notificações não lidas, origem externa (e-mail, Slack, Teams, Gmail…), IA | badges | E25 | estático-i18n |
| Membros (avatares) na frente | não renderizados nos quadros testados | E03, E10 | desconhecido (podem não existir nos templates, ou ficar ocultos para anônimo) |
| Edição rápida (hover + E) | Abrir cartão, Editar etiquetas, Alterar membros, Alterar capa, Editar datas, Mover, Copiar cartão, Copiar link, Espelho, Arquivar, Ocultar da lista, Converter (separação/link/quadro/comum), Salvar | E12, E25 | estático-i18n |
| Seleção em massa | Shift+clique; clique direito ou "e" abre ações em massa | E12 | observado (texto do diálogo) |

---

## 5. Verso do cartão (modal)

### 5.1 Observado em runtime (anônimo, somente leitura)

| Região | Comportamento | Evidence | Status |
|---|---|---|---|
| Rota | `/c/<shortLink>` abre o quadro por trás com o modal; slug inclui nº do cartão (`/c/rgPKi2O1/145-…`) | E08, E03 | observado |
| Cabeçalho do modal | pílula com a lista atual ("Lista de alterações deste cartão, atualmente em Done" — botão de mover, desabilitado), "Share", "Fechar caixa de diálogo" | E08, E11 | observado |
| Título | textbox desabilitado; ícone de cartão | E11 | observado |
| Selo de template | heading "Este é um template de cartão." | E23 | observado |
| Etiquetas | seção "Etiquetas" com grupo de chips | E08 | observado |
| Data Entrega | "30 de jul. de 2019, 09:00" + status ("Concluído" / "Em Atraso") | E08, E23 | observado |
| Descrição | rich text renderizado (links, mailto, parágrafos); "Mostrar mais" quando longa | E08, E23 | observado |
| Checklist | título clicável, % concluído, barra de progresso, itens com checkbox (desabilitados) | E11 | observado |
| Anexos | seção "Anexos" > "Arquivos": nome, "Adicionado há {data}", marcador "• Capa", link "Abrir anexo" | E08 | observado |
| Visualizador de anexo | lightbox com título, data + tamanho (KB), "Abrir em uma nova guia", "Baixar" (`?dl=1`), anterior/próximo, Fechar | E17 | observado |
| Campos de power-up | seções por campo com valor (botão), "Configure" e iframe do power-up | E23 | observado |
| Barra inferior flutuante | "Power-ups", "Automações", separador, toggle "Comentários e atividade" — todos desabilitados para anônimo; em 390 px vira só ícones | E08, E11, E21 | observado |
| Compartilhar e mais… | "Imprimir…", "Exportar JSON" (`/card/<id>.json`), "Link para este cartão", "Mostrar código QR", "Incorporar este cartão" (embed), "Email deste cartão" (e-mails viram comentários), "Nº do Cartão 145", "Adicionado: {data}" | E17 | observado |
| Navegação entre cartões | ← / → (ou K/J) abre cartão adjacente da lista | E12 | observado (texto do diálogo) |

### 5.2 Ações de edição (não visíveis ao anônimo; mapeadas no bundle de idioma)

| Ação | Detalhes de comportamento (rótulos curtos) | Evidence | Status |
|---|---|---|---|
| "Adicionar ao cartão" | botão-menu principal do verso (novo layout "island") | E25 | estático-i18n |
| Membros | "Atribuir membros", "Entrar no cartão"/"Sair do Cartão"; atalho M; Espaço = atribuir a si | E12, E25 | estático-i18n / observado (atalho) |
| Etiquetas | popover: buscar, criar ("Criar uma nova etiqueta": título + cor), editar, excluir (remove de todos os cartões, sem desfazer), "Remover cor" (etiqueta sem cor só aparece no verso), modo daltônico, sugestões, limite máximo por quadro; 30 cores (10 tons × suave/normal/alto contraste); atalhos L e 1–0 | E12, E25 | estático-i18n |
| Datas | "Datas de início, datas de entrega e lembretes": data de início, entrega, hora, lembrete (nenhum, na hora, 5/10/15 min, 1/2 h, 1/2 dias, 1/2 semanas); recorrência (diária, seg–sex, semanal, mensal por data/dia da semana, personalizada); ao concluir cartão recorrente, prazo avança; sugestão de prazo por linguagem natural; atalho D | E12, E25 | estático-i18n |
| Checklist | criar (atalho "-"), "Copiar Itens de…", "Gerar checklist" (IA); item: atribuir membro, prazo (recurso pago "checklists avançadas"), converter em cartão, excluir; "Ocultar itens marcados"/"Mostrar itens verificados (n)"; excluir checklist é permanente | E12, E25 | estático-i18n |
| Anexo | arquivo, link ("Texto a ser exibido"), anexo do Trello (cartão/quadro), vincular de volta; editar, baixar, comentar, "Criar capa"/"Remover capa", remover (sem desfazer); limite de tamanho; Ctrl+V anexa link | E12, E25 | estático-i18n |
| Capa | cores, fotos do Unsplash (busca + categorias), anexos; tamanho "Título dentro da capa"/"Título na capa"; cor do texto clara/escura; reposicionar (arrastar/setas); "Gerar com IA"; capas podem ser desativadas por quadro | E25 | estático-i18n |
| Campos personalizados | tipos: Caixa de Seleção, Data, Lista Suspensa (opções coloridas, reordenáveis), Número, Texto; renomear, reordenar, excluir (exige digitar o nome), "Mostrar campo na frente do cartão", campos sugeridos | E25 | estático-i18n |
| Local | adicionar/alterar/remover local; "Exibir este cartão em um mapa" | E25 | estático-i18n |
| Mover | quadro (sugeridos), lista, posição; ",", ".", "<", ">" movem para listas adjacentes | E12, E25 | estático-i18n / observado (atalho) |
| Copiar | nome; manter: checklists, etiquetas, membros, anexos, comentários, campos personalizados, adesivos; destino quadro/lista/posição; Ctrl+C/V | E12, E25 | estático-i18n |
| Espelhar | "Cartão de espelhamento" (pago); alternativa gratuita "cartão de vínculo" | E25 | estático-i18n |
| Template | "Criar template"; "Criar cartão com base em template" | E25 | estático-i18n |
| Arquivar / Excluir | arquivar (C); excluir só a partir de arquivados ("Excluir cartão?" remove ações da atividade) | E12, E25 | estático-i18n |
| Seguir / Votar / Adesivos | Seguir (S) → badge "Você está seguindo"; Votar (V, power-up); adesivos | E12, E25 | estático-i18n |
| Horário de foco / Planner | agendar tempo de foco do cartão no calendário pessoal | E25 | estático-i18n |
| Desfazer / Refazer / Repetir | Z, Shift+Z, R | E12 | observado (texto do diálogo) |

### 5.3 Comentários, atividade e editor

| Item | Comportamento | Evidence | Status |
|---|---|---|---|
| Painel "Comentários e atividade" | toggle na barra inferior; desabilitado para anônimo | E08 | observado |
| Composer | "Escrever um comentário..."; Ctrl/Cmd+Enter salva; Esc descarta; "Seu comentário é muito longo" (sugere anexar como texto) | E12, E25 | estático-i18n / observado (atalho) |
| @menção | digitar @ + nome/usuário/iniciais → lista navegável; menções especiais "Todos os membros no cartão" e "Todos os membros no quadro"; notificação "mencionou você no cartão" | E12, E25 | observado (diálogo) / estático-i18n |
| Reações | "Adicionar reação" com emoji, tooltip de quem reagiu, limites por comentário e total | E25 | estático-i18n |
| Editar comentário / Responder | "Editar comentário", "Responder" | E25 | estático-i18n |
| Atividade | "Mostrar Detalhes"/"Ocultar detalhes"; "Carregar Mais Atividades"; vazio: "Sem ações" | E25 | estático-i18n |
| Editor rich text | Markdown por atalhos (* listas, # títulos, --- regra), comando "/" para inserir conteúdo, emoji com ":" ; pacote de mensagens do editor pt_BR carregado | E24, E25 | estático-i18n / observado (chunk carregado) |
| Comandos "/" no composer | separador, link, widget, tempo, voo, notícias (IA) | E25 | estático-i18n |

---

## 6. Atalhos de teclado (diálogo "Atalhos de Teclado", `?overlay=shortcuts`) — E12, observado

Inclui um interruptor "Atalhos habilitados". Descrições abaixo resumidas.

| Tecla | Ação | Tecla | Ação |
|---|---|---|---|
| Shift+clique | selecionar cartões em massa (e / clique direito = ações em massa) | ← ↓/J ↑/K → | navegar entre cartões |
| ← / → (no verso) | abrir cartão anterior/próximo | Ctrl/Cmd+C, X, V | copiar / recortar / colar cartão |
| Ctrl/Cmd+V no quadro | novo cartão com texto/link copiado | Ctrl/Cmd+V no verso | anexar link |
| ] | alternar menu do quadro | B | busca rápida de quadros |
| / | focar busca | C | arquivar cartão |
| D | data de entrega | - | adicionar checklist |
| E | edição rápida | Esc | fechar/cancelar |
| Ctrl/Cmd+Enter | salvar texto | Enter / Shift+Enter | abrir cartão / abrir após criar |
| F | filtro | L | etiquetas; 1–0 aplica cor (verde, amarelo, laranja, vermelho, roxo, azul, azul-celeste, verde-limão, rosa, preto) |
| ; | mostrar/ocultar nomes de etiquetas | M | membros |
| N | inserir novo cartão | \ / Shift+\ | recolher lista / todas |
| , . < > | mover cartão para lista adjacente (fim/topo) | Q | meus cartões |
| S | seguir cartão | Espaço | atribuir a si |
| T | editar título | V | votar (power-up) |
| X | limpar filtros | ? | atalhos |
| @ | autocompletar membros | Z / Shift+Z / R | desfazer / refazer / repetir ação |
| Shift+scroll | rolar quadro na horizontal | | |

---

## 7. Estados vazios, carregamento e erro

| Estado | Representação | Evidence | Status |
|---|---|---|---|
| Carregamento | esqueleto: logo + 3 colunas vazias, depois listas com contador "0" antes dos cartões chegarem | E22, E23 (passo 0) | observado |
| Lista vazia | contador 0, sem texto | E22 | observado |
| Filtro sem resultado | "0 cartão corresponde aos filtros" em cada lista; contador 0 no botão de filtro | E16 | observado |
| Visão sem permissão | "Página não encontrada." + convite a fazer login | E13, E14 | observado |
| Quadro público | "Este quadro público é somente para visualização." | E07 | observado |
| Calendário vazio | "Não há nada agendado" / nenhum cartão com datas | E25 | estático-i18n |
| Atividade vazia | "Sem ações" / "Nenhuma ação nos últimos {n} dias" / "Sem comentários" | E25 | estático-i18n |
| Automação vazia | cada aba (regras, botões de cartão/quadro, agendado, data de entrega) tem estado vazio com 3 exemplos + vídeo | E25 | estático-i18n |
| Cronograma | "(n) Não agendado", "Sem etiquetas", "Sem membros" | E25 | estático-i18n |
| Limites | muitos cartões/listas/etiquetas/checklists → mensagens específicas pedindo arquivar | E25 | estático-i18n |

---

## 8. Responsividade

| Largura | Observação | Evidence | Status |
|---|---|---|---|
| 1280×720 (connect) | cabeçalho completo; listas ~272 px; modal do cartão centralizado (~580 px) com barra flutuante abaixo | E04, E11 | observado |
| 390×844 (launch, pt-BR) | menu do site vira hambúrguer; banner de cookies empurra o quadro; cabeçalho do quadro: nome truncado com reticências, selo Template, ícone de visões, ícone de filtro, "…" (menu); avatares e Visibilidade somem; listas mantêm largura fixa + rolagem horizontal (sem "uma coluna por tela"); modal do cartão quase tela cheia; barra inferior do cartão só com ícones | E21 | observado |
| 390/768 em modo connect | **inválido**: a emulação de viewport via CDP compartilhado só recortou a captura, sem relayout (modal fora da área) | E18, E19, E20 | observado (limitação da ferramenta) |

---

## 9. Estado no cliente e rotas (identificadores)

- localStorage (nomes, valores com hash): `collapsed-lists`, `labelState`, `boardCardFilterSettings-<boardId>-notLoggedIn`, `recentBoardsState-anonymous`, `recentCardsState-anonymous`, `workspaceNavigation-anonymous`, `global-theme`, `lastActivity`, `recentlyUsedFeatures` (E16) — observado.
- Rotas de UI: `/b/<short>`, `/board/<id>[/table|/calendar-view|/dashboard|/timeline|/map]`, `/c/<short>/<idShort>-<slug>`, `?overlay=shortcuts`, `?overlay=member-activity&u=<user>`, `?filter=<kw>`, `/u/<user>/profile`, `/card/<id>.json`, `/1/cards/<id>/attachments/<id>/download/<arquivo>[?dl=1]`, `/templates/<categoria>/<slug>-<short>` (E02–E17) — observado.
- Chunks carregados sob demanda ao abrir cartão: `card-back`, `card-composer`, `filter-popover`, `about-this-board-content`, `atlaskit-editor-messages-pt_BR`, `locale.pt-BR` (E24) — observado (só URLs).

---

## 10. Implicações para o sistema de demandas da Melt (recomendações, não observações)

O que vale replicar (padrões comprovados acima):
- Teclado em primeiro lugar (F, N, E, D, L, M, `\`, Z) e diálogo `?` — custo baixo, ganho alto.
- Overlays endereçáveis por URL (`?overlay=`, `/c/<id>`) e filtro na URL: permite colar link de uma demanda ou de uma visão filtrada no WhatsApp/Slack.
- Limite WIP visível no cabeçalho ("3 / 10") com destaque ao estourar — essencial para capacidade de designers/redatores.
- Semântica de prazo com cores (concluído, em breve, < 24 h, atrasado) e lembretes relativos.
- Cartão-template ("Request card template" no quadro de intake) — na Melt deve virar **formulário nativo de briefing por tipo de demanda**, não texto solto na descrição.
- Estados vazios com exemplo e chamada para ação; esqueleto de carregamento.

Onde dá para ser melhor que Trello/Dmanda:
- Intake de demandas nativo (o template de intake do Trello depende de Google Forms + Zapier + Butler — ver E22/E23).
- Visões Tabela/Calendário/Painel sem paywall, já com filtros por cliente, responsável, tipo de peça e status de aprovação.
- Campos de agência de primeira classe (cliente, canal, formato, rodada de aprovação, SLA) em vez de campos genéricos.
- Mobile de verdade: uma lista por tela com troca por gesto (Trello web mantém rolagem horizontal em 390 px — E21).
- Fluxo de aprovação do cliente (link público só leitura + aprovar/pedir ajuste), aproveitando a ideia do quadro público somente leitura (E07).

---

## 11. Lista de verificação da frente

| Pergunta | Situação |
|---|---|
| Cabeçalho: visões, filtros, membros, menu, visibilidade | respondida (observado) |
| Cabeçalho: automação/Butler, power-ups, compartilhar, estrela | parcial (estático-i18n; não visível anônimo) |
| Conteúdo das visões Tabela/Calendário/Painel/Cronograma/Mapa | não respondida em runtime (exige login/plano); parcial via i18n |
| Listas: contador, recolher, WIP, vazio | respondida (observado) |
| Menu da lista, cor, adicionar cartão/lista | parcial (estático-i18n) |
| Frente do cartão: etiquetas, descrição, anexos, checklist, prazo, capa, template, adesivos, campos de power-up | respondida (observado) |
| Frente: comentários, membros, seguindo, local, início, votos, campos nativos | parcial (estático-i18n) / membros desconhecido |
| Verso: seções de leitura, anexos, compartilhar | respondida (observado) |
| Verso: ações laterais (membros, etiquetas, datas, checklist, anexo, capa, campos, mover, copiar, espelhar, template, arquivar) | parcial (estático-i18n; layout do menu "Adicionar ao cartão" não visto) |
| Atividade/comentários, @menção, editor | parcial (diálogo de atalhos + i18n; painel desabilitado para anônimo) |
| Atalhos de teclado | respondida (observado) |
| Estados vazios | respondida (observado + i18n) |
| Responsividade | respondida para 390 px e 1280 px (launch/connect); tablet em modo launch não testado |

## 12. Desconhecidos (sem resposta)

1. Layout real do menu "Adicionar ao cartão" e da coluna de ações do verso no modo edição (só rótulos via i18n).
2. Aparência do painel "Comentários e atividade" aberto (anônimo não consegue abrir; nenhum comentário observado).
3. Conteúdo/interação das visões Tabela, Calendário, Painel, Cronograma e Mapa (bloqueadas sem login; Painel/Cronograma/Mapa nem foram navegados).
4. Se avatares de membros aparecem na frente do cartão para anônimo (não apareceram nos 6 quadros; causa não determinada).
5. Menu da lista e popover de limite WIP renderizados (só strings; o limite em si foi observado).
6. Comportamento de arrastar e soltar (cartões/listas) — não exercitado (exige edição).
7. Editor rich text em edição (toolbar, comandos "/") — só strings e chunk carregado.
8. Quais itens são pagos vs. gratuitos além de visões, espelhamento, checklists avançadas e exportação (strings de upsell indicam, sem confirmação por plano).
9. Responsividade em 768 px no modo launch e modo escuro (`global-theme` existe; não testado).
10. Badges de campos personalizados nativos (só vistos campos de power-ups de terceiros).
