# Integração da Onda 3 · leva 1 (F5, F4, F1)

Feita sobre `2628f9f` (Ondas 1 e 2 na `master`), na ordem do PLANO §5: **F5 → F4 → F1**. As três branches partiam de
`2628f9f` (sem rebase), as worktrees estavam limpas e o `git diff --name-only master...funcionalidade/<f>` de cada uma
só tinha arquivos do dono (glob `extensoes/*/<f>{,-*}`, `shared/logica/<f>-*.ts` e o `docs/pedidos/<f>.md`): nada em
`shared/tipos/*.ts`, em `web/src/extensoes/tipos.ts` nem em migrações. Commits da integração: lista no fim.

Ambiente: API 7329 + Vite 5199 (`DATA_DIR=./data/integrador-3a`, `seed:demo` com o `modal.ts` do F1), build de produção
servido pelo Node na 7330 (`NODE_ENV=production`, CSP real, banco novo em `./data/integrador-3a-prod`), Chrome headless
próprio por CDP com uma janela (contexto isolado) por pessoa. Credenciais em `.env.integrador-3a` e
`.env.integrador-3a-prod` (não versionados).

## Merges

| Funcionalidade | Merge | Arquivos | Conflitos | Regra 8 logo depois do merge |
|---|---|---|---|---|
| F5 cadastros (8 commits) | `e999e0a` | 55 | nenhum | tsc ok; 264/264; 420 checagens; build sem aviso; contraste 0; auditoria com 14 páginas numa lista só: 0 problemas |
| F4 entrada (14 commits) | `358e6bb` | 45 | nenhum | tsc ok; 310/310; 420; build ok; contraste 0; auditoria `/q/criacao,/d/12,/config/modelos,/clientes/XYZ`: 0 |
| F1 modal (12 commits) | `31cf35e` | 82 | nenhum | tsc ok; 347/347; 420; build ok; contraste 0; auditoria `/q/criacao,/d/24,/d/31,/d/21,/d/26` (arquivada) `,/q/social`: 0 |

Os arquivos das três eram disjuntos, então não houve conflito textual. Os pontos de contato entre elas foram
conferidos no navegador depois de cada merge: o diálogo `criar-cliente` (F5) aberto pela criação rápida e pela Nova
demanda (F4) e pelo cliente do painel lateral (F1) devolve o cliente e a demanda nasce com ele; nenhum atalho repetido
no mesmo escopo (F4: Shift+N, `?`; F1: M, L, D, T, Shift+M); a lista do `?` mostra os atalhos das três; o menu ··· do
quadro sai na ordem da §4 (seguir, copiar link, etiquetas, modelos, editar, copiar, arquivar); `/dev/extensoes` sem
erro de id repetido no console.

`npm ci`: a primeira execução falhou no meio (EPERM) porque Vites antigos de outros agentes, rodando da raiz (5182 e
5192) e das worktrees (5184, 5187, 5188), seguravam os módulos nativos (`lightningcss`, `rolldown`, `oxide`); parar
esses processos não foi permitido nesta sessão. Os três módulos presos foram movidos para fora do `node_modules` e o
`npm ci` passou (o `package-lock.json` não mudou em nenhuma das branches). Os Vites de 5182 e 5192 ficaram sem os
arquivos que carregavam; não servem mais para nada.

## Pedidos (`docs/pedidos/*.md`)

### F5 (`cadastros.md`)

| # | Pedido | O que foi feito | Commit |
|---|---|---|---|
| 1 | F3: não repetir os Primeiros passos | Aceito. PLANO §3 (F3) e §4 (tabela de pontos e ordem do Início: `cadastros-primeiros-passos` 50) dizem que os Primeiros passos vieram com o F5 e o Início do F3 só hospeda `secoesInicio()`. A ordem de Configurações ganhou `cadastros-parametros` 550. | `1a51396` |
| 2 | NÚCLEO-WEB: Copiar quadro sem modelos e sem o seguir | Aceito. `useCopiarQuadro` recarrega o bootstrap depois de pôr o quadro, as colunas, as etiquetas e as automações; o contorno do F5 (`depoisDeCopiar`) saiu. Conferido: "Criação 2" com as 5 colunas (as das pessoas com `responsavelId`), "Urgente" e a equipe seguindo o quadro novo. | `9f6bc4a` |
| 3 | Contrato: entidade `config` no tempo real | Aceito. `MapaEntidades.config: ConfigApp` + `ENTIDADES` (sem migração: `evento.entidade` não tem CHECK). O `PATCH /api/config/app` emite o objeto inteiro (público `interno`) só quando algo muda, e o "Revisei os modelos" do F4 também. Tratador do núcleo troca `['bootstrap'].config`; o do F5, `['config','app']`. Testes novos no servidor e no tratador. Conferido com duas janelas de admin: "Revisados em sex, 16/10." aparece na outra sem recarregar. API §3, §4.9 e §4.11. | `2a6a5d5`, `9e1a6fd` |
| 4 | DS: aviso de acesso de rota só de admin solto por cima | Aceito. Em rota `sobreposta`, o `Tela` desenha o aviso num `Modal` com Fechar (volta para a tela de baixo). Conferido como designer em `/quadros/novo`. | `7cf9caf` |
| 5 | NÚCLEO-WEB: fechar o SSE no `pagehide` e reabrir no `pageshow` persistido | Aceito. `conexao.ts` fecha o fluxo e os relógios no `pagehide` e reabre do último seq no `pageshow` com `persisted`; teste novo. A auditoria com as 14 páginas que o F5 precisou rodar em três grupos passou numa lista só (64 capturas, 0 problemas). | `01264c4` |
| 6 | DS: Chrome da auditoria sem cache de voltar/avançar | **Recusado**: o pedido 5 resolveu a causa (a lista longa passou com o cache ligado), e manter o cache ligado na auditoria testa o comportamento real. | — |
| — | Esclarecimentos de contrato | Registrados na API (§4.10 trilha pelo id, §4.11 feriado sem ano/tipo e PATCH que só grava o que mudou, §4.19 texto do Arquivo). | `2a6a5d5` |

### F4 (`entrada.md`)

| # | Pedido | O que foi feito | Commit |
|---|---|---|---|
| 1 | DS: texto de ajuda do editor por cima do valor trocado de fora | Aceito. `EditorInterno` lê o vazio com `useEditorState` (a cada transação, inclusive o `setContent` sem update); a Nova demanda deixou de remontar o editor (o `key` do contorno saiu). Conferido: trocar Post → Carrossel → Sem modelo → Reels mostra o briefing sem o texto de ajuda e volta o texto de ajuda no vazio; depois de digitar, trocar o modelo não pisa no texto. | `68d2938` |
| 2 | NÚCLEO-WEB: texto da busca vazia da §4.1 | Aceito. A paleta diz `Nada encontrado para "termo". Tente a sigla do cliente ou o número.`; saiu a linha de contorno da fonte Demandas. | `c4cffde` |
| 3 | NÚCLEO-SERVIDOR: teste intermitente da URL assinada | Aceito. O teste troca o último caractere por outro diferente dele (era a falha "actual: true" da INTEGRACAO-2). | `486b97b` |

### F1 (`modal.md`)

| # | Pedido | O que foi feito | Commit |
|---|---|---|---|
| 1 | DS: popover e menu atrás do modal | Aceito, de um jeito mais geral que a regra sugerida: `--z-popover` = `--z-modal` = 70, e dentro do `#pauta-camadas` a ordem de abertura decide (vale também para modal aberto de dentro de popover e para popover sobre popover). Saiu o contorno do `cronometro.css`. Conferido: ··· do modal, seletor de cliente, Datas e o SeletorData dentro dele, tudo por cima. | `be5367d` |
| 2 | DS: Checkbox sem texto não marca no clique do centro | Aceito: `.ui-check-caixa svg { pointer-events: none }`; saiu o contorno dos itens do checklist (o de `.mdl-escolha` ficou, é outro elemento). Conferido: `elementFromPoint` no centro é o `input` e o clique marca. | `be5367d` |
| 3 | NÚCLEO-WEB: Esc no título fecha o modal | Aceito: o título em edição é uma camada (`useCamada`); Esc cancela e devolve o foco ao título, Enter salva e devolve o foco. | `3c01b8e` |
| 4 | NÚCLEO-WEB: topo do modal com o lugar antigo depois de mover | Aceito: o contexto usa o quadro e a coluna do bootstrap; os do detalhe só para a demanda fora dele e só se forem o lugar dela. O contorno do F1 (buscar o detalhe de novo) ficou: não atrapalha e mantém o detalhe atual. | `3c01b8e` |
| — | Respostas que a API não definia | Registradas na API §4.15 (PATCH de checklist devolve `ChecklistComItens`, DELETE emite o delete dos itens, 422 em arquivada, histórico pela dona do apontamento, regras da cópia). | `d8d7fba` |

Também registrados na API os desvios do F4 (`@` pelo primeiro nome único, apelido de até 4 palavras na busca, prazo
da conversa no front): `2df3260`. Nenhum pedido pediu banco: **nenhuma migração 090–099**.

## Achados da integração

| # | Achado | O que foi feito | Commit |
|---|---|---|---|
| 1 | F4: "até sexta" de uma conversa de 14/10 colada no dia 16 virava 23/10 (o dia da semana contava de hoje) | `prazoDaConversa` conta dia da semana, "hoje" e "amanhã" do dia da mensagem; prazo que já passou não é sugerido. 3 casos novos no teste. | `ac13423` |
| 2 | F1: ao parar o cronômetro o painel mostrava "Total 6 min · meu 3 min" com 3 gravados | O evento da demanda (`minutosRegistrados` absoluto, sem trace, não é eco) chegava antes da resposta e `somarMeus` somava em cima. A soma parte do retrato de antes da chamada e fica com o maior valor (parar, ligar outro e lançar tempo). Conferido em produção: 3 ciclos T/T, painel 4, 5 e 6 min = banco. | `7af4124` |
| 3 | F1: prévia da etiqueta nova achatada (14 px) no formulário | `.mdl-formulario > .mdl-etiqueta-barra { flex: none }`. | `8a0830b` |

## Verificação final (PLANO §5, o que depende só de F5, F4, F1 e do núcleo)

Build de produção servido pelo Node (7330), banco novo, CSP real, janelas separadas para admin, AM (Pri), designers
(Bia, Léo, Duda) e social (Caio), mais uma segunda janela de admin (escuro) e uma de celular (390 px, escuro). Tempos
medidos com a outra janela consultando a cada 50 ms depois da ação.

| Passo | Resultado |
|---|---|
| 1 | Primeiro boot criou o admin; backup do dia em `DATA_DIR/backups`. `/inicio` é "Página não encontrada" (o Início é do F3): os 4 primeiros passos foram conferidos com uma cópia do banco nesse instante pela rota de DEV `/dev/cadastros-inicio`: convidar, criar quadros, cadastrar clientes, revisar modelos, nessa ordem, "0 de 4 feitos". |
| 2 | Convites de Pri (atendimento), Bia e Léo (Criação) e Caio (Social) pelo diálogo (link + mensagem para o WhatsApp); cada um abriu o link numa janela limpa, a URL ficou `/convite` sem o token, definiu a senha e entrou em `/inicio`. |
| 3 | "Criar os quadros das equipes" criou os 6 (Criação e Social por pessoa; os Kanban com 2 automações sugeridas). O passo pedia renomear "Revisão" para "Pronto" na Criação, mas o modelo "Por pessoa" não tem Revisão: acrescentei "Revisão" e renomeei para "Pronto" antes de criar. Os 6 apareceram no menu da Bia; cada pessoa já seguia o quadro da equipe. Duda, convidada depois, ganhou a coluna dela na Criação na janela da Bia na hora (antes de "Pronto"). HE com contato padrão, AM Pri e responsáveis Bia (Criação) e Caio (Social): "Cadastro completo". "Revisei os modelos" (e a outra janela de admin viu). Com a cópia do banco desse instante, `/dev/cadastros-inicio` não mostra mais o bloco. |
| 4 | Automações: F2 (não integrado). |
| 5 | Pri colou a conversa (evento de colar com texto) na Nova demanda: HE, Carrossel sugerido, briefing do modelo, Bia sugerida ("responsável do HE na Criação"), prazo qua, 21/10 ("até quarta" de uma sexta). Nasceu na Fila; apareceu na janela da Bia em 15 ms; Bia recebeu `membro`; Léo e Duda (seguidores) não receberam `chegou`. "HE: Ideia de post @bia" + Enter criou outra com HE e Bia. Léo criou "XYZ: Banner" com "Criar cliente XYZ" (nasceu com XYZ e Léo, coluna dele) e Pri viu "Completar cadastro (1)". |
| 6 | Bia arrastou para a coluna dela; Léo arrastou da coluna da Bia para a dele: o avatar trocou para LM na janela da Bia em 9 ms. T ligou o cronômetro (topo "0:00 · #1"), 3 itens marcados viraram "3/5" na outra janela; T parou e gravou o tempo. Entregar V1: F2. |
| 9 | Agenda, Lista, Calendário e `/horas`: F3 e F6. O tempo do cronômetro aparece no painel do modal e na estimativa ("6 min lançados · 5%"). |
| 10 | Arquivar (pelo menu do card; a Criação "por pessoa" não tem coluna de concluídas), busca "he ideia" no Arquivo achou a #2, Restaurar devolveu o card à janela da Bia (1 ms depois da resposta). Uma concluída com `concluida_em` recuado 9 dias por SQL aparece como "Concluída em 07/10/2026 · não arquivada" com [Arquivar] e [Devolver ao quadro]. "Copiar quadro" da Criação criou "Criação 2" sem cards, com as colunas, "Urgente" e a equipe seguindo; apareceu no menu da Bia. |
| 11 | Tudo o que foi feito acima apareceu na outra janela em até 125 ms (os 6 quadros criados de uma vez; o resto abaixo de 20 ms), contados de quando a ação terminou na primeira. Servidor derrubado: faixa "Sem conexão"; servidor de volta: a faixa sai e o card movido em seguida chega à outra janela. |
| 12 | Claro e escuro (Modelos no escuro, celular no escuro: quadro, Nova demanda pelo "+", modal, cliente e Arquivo, sem rolagem lateral a 390 px). Atalhos de uma letra não fazem nada fora do quadro e do modal (N, Q, J em `/clientes`). Console sem erro nem violação de CSP em todas as janelas. Convite sem token depois de aberto; backup diário presente. `/api/publico/*` e `/a/*`: F2. |
| 13 | Docker: fora desta leva. |

Roteiros das seções no mesmo banco de produção:
- **F5**: convite com link e senha, Criar os quadros das equipes, coluna da pessoa nova na outra janela, Copiar quadro,
  designer criando XYZ e o atendimento vendo "Completar cadastro", cliente completo com contato e responsáveis, cor
  (verde, 3 ms) e papel ("Aguardando o cliente") da coluna mudando na outra janela, restaurar do Arquivo.
- **F4**: Shift+N + colar a conversa, sigla nova "XYZ" criada sem sair do campo (designer), três Enter seguidos criando
  três demandas na ordem (no banco de demonstração), Ctrl+K "#12" + Enter abrindo o modal, `?` com os atalhos.
- **F1**: descrição com @Bia (Bia recebeu `mencao`), "3/5" no card, print colado (evento de colar com imagem) e
  "Tornar capa" (a outra janela mostrou a imagem em 3 ms), Espaço e M mudando membros, D mudando o prazo para ontem
  ("Atrasada há 1 dia" na outra janela), T ligando e parando, Shift+M "Mover para…" ao Social avisando que "Urgente" fica
  na Criação e passando para Caio (Caio recebeu `membro`; a outra janela tirou o card), voltar para a Criação trouxe
  "Urgente" de volta, "Copiar…" para "Pronto" (checklist desmarcado), arquivada abrindo só para leitura.

Capturas: `scratchpad/integ3a/prod/` (01–71), auditorias em `scratchpad/integ3a/aud-*`.

## Estado final (regra 8, na raiz, `master` em `2df3260` + este registro)

- `npx tsc --noEmit -p server` e `-p web`: sem erros.
- `npm test`: 347 de 347 (eram 242: F5 +22, F4 +43, F1 +37, integração +3).
- `node server/scripts/verificar-migracoes.ts`: 420 checagens, 0 falhas.
- `npm run build`: ok, sem aviso de chunk.
- `npm run contraste --workspace web`: 276 pares, 0 abaixo do mínimo.
- Auditoria de navegador com login, depois de cada merge (F5: 14 páginas; F4: 4; F1: 6) e a final na `master` com as
  telas das três numa lista só (`/q/criacao,/d/24,/d/31,/d/26,/q/social,/config/modelos,/clientes,/clientes/CLA,/arquivo,`
  `/quadros/novo,/config/pessoas,/config/quadros,/config/parametros,/dev/cadastros-inicio`; claro e escuro, 1440 e 390):
  0 problemas.
- `npm test` mais duas vezes seguidas na `master` final: 347/347 (nenhuma falha intermitente nesta sessão).

## Pendente

- **Worktrees não removidas.** `../melt-demandas-cadastros`, `-entrada` e `-modal` estão limpas e as branches ficam,
  mas os Vites dos agentes do F5 (5188), F4 (5187) e F1 (5184) ainda rodam de dentro delas e seguram arquivos (no
  Windows a remoção falharia no meio). Parar esses processos não foi permitido nesta sessão. Depois de pará-los:
  `git worktree remove ../melt-demandas-cadastros`, `git worktree remove ../melt-demandas-entrada`,
  `git worktree remove ../melt-demandas-modal` (o que se perde são só arquivos ignorados: `.env.<f>`, `data/agente-N`,
  `node_modules`, `web/dist`).

## Avisos para a leva 2 (F2, F3, F6)

- **Rebase** em `master`. Nada mudou em `shared/tipos/*.ts` além da entidade `config` (acréscimo) e nada em
  `extensoes/tipos.ts`.
- **F3:** os Primeiros passos já existem (`inicio/cadastros-primeiros-passos`, ordem 50, critérios pelo bootstrap): o
  Início só hospeda `secoesInicio()` e não repete o bloco. Ao entrar o Início, apagar a rota de DEV
  `web/src/telas/quadros/dev/` (`/dev/cadastros-inicio`), que o F5 deixou só para testar. Hoje, sem o F3, `/inicio`
  (a rota inicial) é "Página não encontrada".
- **Camadas:** popover e modal estão na mesma camada (70); quem abriu depois fica por cima. Não crie z-index próprio
  para "subir" um popover.
- **Tempo real:** a entidade `config` existe (objeto inteiro). E o achado 2 vale para todos: campo que o servidor manda
  absoluto num evento sem trace (como `minutosRegistrados`) não pode ser somado em cima do cache na resposta; parta do
  valor de antes da chamada.
- **Editor:** trocar o `valor` do `EditorMarkdown` por fora já atualiza o vazio; não precisa remontar com `key`.
- **Paleta:** a busca vazia é do núcleo; fonte de busca não devolve linha de "nada encontrado".
- **Diálogos que já existem:** `criar-cliente` e `copiar-quadro` (F5); `nova-demanda` e `atalhos` (F4); `mover-demanda`,
  `copiar-demanda`, `membros`, `etiquetas`, `datas`, `capa` e `lancar-tempo` (F1). Configurações › Quadros (F5) tem o
  botão [Automações], que abre `automacoes-quadro` (F2) e hoje mostra "Disponível em breve".
- **Atalhos ocupados:** Shift+N e `?` (global, F4); M, L, D, T e Shift+M (card e modal, F1).
- **F6:** continua valendo o pedido 3 do NÚCLEO-WEB (apagar os layouts de exemplo `lista` e `calendario`).
- Colunas fora da tela usam `content-visibility`: em teste de navegador, conte `article[data-demanda-id]` em vez de ler
  `innerText` de coluna que não está visível.

## Commits

`e999e0a` merge F5 · `9f6bc4a` copiar quadro recarrega o bootstrap · `2a6a5d5` entidade config e esclarecimentos do F5
· `7cf9caf` aviso de acesso em modal · `01264c4` SSE e o cache de voltar/avançar · `1a51396` PLANO (Primeiros passos)
· `358e6bb` merge F4 · `9e1a6fd` Revisei os modelos emite config · `486b97b` teste da URL assinada · `68d2938` vazio do
editor · `c4cffde` busca vazia da paleta · `ac13423` prazo da conversa · `31cf35e` merge F1 · `be5367d` camadas e
Checkbox · `3c01b8e` título e topo do modal · `7af4124` cronômetro sem contar em dobro · `8a0830b` prévia da etiqueta
· `d8d7fba` e `2df3260` decisões do F1 e do F4 na API.
