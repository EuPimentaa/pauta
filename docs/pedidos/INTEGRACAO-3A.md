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

- ~~Worktrees não removidas.~~ Na segunda parte (abaixo), `git worktree list` já mostrava só a `master`: as worktrees
  de F5, F4 e F1 foram removidas; as branches `funcionalidade/cadastros`, `entrada` e `modal` continuam (já mescladas).

## Avisos para a leva 2 (F2, F3, F6)

- **Rebase** em `master`. Nada mudou em `shared/tipos/*.ts` além da entidade `config` (acréscimo) e nada em
  `extensoes/tipos.ts`.
- **F3:** os Primeiros passos já existem (`inicio/cadastros-primeiros-passos`, ordem 50, critérios pelo bootstrap): o
  Início só hospeda `secoesInicio()` e não repete o bloco. Ao entrar o Início, apagar a rota de DEV
  `web/src/telas/quadros/dev/` (`/dev/cadastros-inicio`), que o F5 deixou só para testar. Sem o F3, `/inicio` era
  "Página não encontrada"; na segunda parte (abaixo) ganhou um Início provisório que o F3 substitui.
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

---

# Integração 3A, segunda parte: as revisões da leva 1 e as correções

Três revisões adversariais rodaram sobre `0f6c1d5` (funcional ponta a ponta em produção, segurança e visual/UX). Esta
parte corrige o que elas acharam, direto na `master` (27 commits, `9c6885d`..`7664f9b`, sem push). Quando fazia sentido,
o teste novo falhou antes da correção (conferido tirando a correção e rodando de novo).

Ambiente: API 7331 + Vite 5201 (`DATA_DIR=./data/integrador-3b`, `seed:demo`) para desenvolvimento e auditoria; build
de produção servido pelo Node na 7332 (`NODE_ENV=production`, CSP real, banco que começou vazio em
`./data/integrador-3b-prod`); Chrome headless na 9222, uma janela isolada por pessoa. Credenciais geradas em
`.env.integrador-3b` e `.env.integrador-3b-prod` (não versionados).

## Segurança

| # | Grav. | Achado | O que foi feito | Commit |
|---|---|---|---|---|
| 1 | alta | `markdownParaTexto` quadrática numa descrição de 100 mil `[` parava o processo ~12 s a cada busca | O trecho sai de uma janela de 2.000 caracteres em volta do termo (busca sem acento no texto original) e as regexes têm quantificadores limitados. Teste: 100 mil `[` em < 50 ms e três plantadas não travam a busca de outra pessoa (falhava com 3,5 s e 10,7 s) | `9c6885d` |
| 2 | média | `tituloDaConversa` quadrática em 50 mil espaços (~2,2 s por chamada de `/api/entrada/analisar`) | O título vai com espaços simples e no máximo 200 caracteres para as regexes do fim (3 ms). Teste: espaços, vírgulas e hífens em < 50 ms | `5519496` |
| 3 | média | A equipe punha `rodadasInclusas` no modelo do quadro e a demanda herdava | `CAMPOS_MODELO_SO_ATENDIMENTO` (`shared/logica/permissoes.ts`): POST e PATCH de modelo pela equipe com a chave → `403 campo_nao_permitido`. API §4.9 | `dc58c55` |
| 4 | média | A equipe renomeava, reescrevia e esvaziava o "Ajustes R2" sem rastro | `pode('checklist_rodada.editar')` (nova ação) em renomear, acrescentar, reescrever e tirar item de checklist com `rodadaId`; marcar e reordenar livres. Atividades novas `checklist.editado`, `checklist.item_editado`, `checklist.item_removido` (com o texto de antes; frases no histórico). O modal trava os controles para a equipe e diz por quê | `cb53d9f` |
| 5 | média | Qualquer pessoa criava "Print do retorno" falso que ninguém removia | O zod de `POST /anexos` descarta `finalidade` e o serviço grava `referencia`; o modal marca e trava o Remover pela ligação com uma aprovação (`aprovacoes[].evidenciaAnexoId`) | `80c81be` |
| 6 | média | Rascunho de comentário sobrevivia ao Sair e aparecia para a próxima pessoa | Chave `rascunho-comentario:<eu>:<demanda>`; o Sair apaga `pauta:rascunho-*` e o bootstrap também quando entra outra pessoa no navegador (`marcarPessoaLocal`) | `e7e4ffb` |
| 7 | baixa | Rótulo da menção forjável (`@Diretoria Financeira` notificando a Bia) | `<Markdown nomeDaPessoa>`: no modal o chip mostra o nome atual da pessoa do id; id de ninguém vira texto. Conferido: o comentário com o rótulo trocado aparece como "@Pri" | `4117547` |
| 8 | baixa | Menção a inativo/inexistente ficava na descrição e notificava depois da reativação | Criar e editar passam a descrição por `limparMencoes` (como o comentário) | `bc3543d` |
| 9 | baixa | `GET /api/arquivo?q=%00x` → 500 | `termosFts` só manda pedaços de letras e números ao FTS ("pós-venda" vira "pós" e "venda") | `16112e2` |

## Funcional

| # | Grav. | Achado | O que foi feito | Commit |
|---|---|---|---|---|
| 1 | alta | `/inicio` era 404 para todo mundo; `/d/N` direto desenhava sobre o 404 e voltava para ele (também visual 3) | **Início provisório** em `web/src/telas/inicio/` (o F3 substitui a pasta): hospeda `secoesInicio()` (Primeiros passos) e a lista dos quadros; quem não tem seção vai direto ao quadro dele (favorito, da equipe, que segue). **Contrato:** `ExtensaoRota.fundo` (só sobrepostas): `/d/:numero` usa o quadro da demanda; `/quadros/novo`, `/config/quadros`; calculado uma vez por entrada do histórico (arquivar a demanda aberta ainda fecha no quadro dela) | `d2c912e` |
| 2 | alta | Menções e notificações gravadas sem nenhuma superfície | **Adiado para o F3** (motivo abaixo) | — |
| 3 | média | "15h30" digitado + Pronto deixava o prazo sem hora | `Combobox.aoSairComTexto` (Tab, clique fora e blur oferecem o texto digitado) e o `SeletorHora` aplica `lerHora`; hora ilegível fica no campo, marcada, e segura o Pronto com "Use 18h, 18h30 ou 9:15" | `dd7027b` |
| 4 | média | O admin não via o convidado entrar; "Link de convite" dava 409 sem atualizar | `definirSenha` emite `usuario` (o tratador do F5 invalida a lista; ~1,6 s em produção) e o 409 atualiza a lista e oferece "Gerar link de nova senha". Teste: evento `usuario` sem e-mail no convite | `9f9150d` |
| 5 | média | Nova demanda fechava com Esc ou clique fora e perdia tudo (também visual 1, alta) | Rascunho (`entrada/rascunho.ts`): fechar sem criar guarda o formulário (localStorage com o id de quem escreve, 3 dias; o Sair apaga) e a próxima abertura devolve, com "Rascunho de há 3 min · Descartar"; com o formulário mexido, o clique fora não fecha (`MolduraDialogo.fecharAoClicarFora`). O Novo quadro mexido pergunta "Descartar este quadro?" | `a991014` |
| 6 | média | Anexo de 11 MB aparecia como "Sem conexão" | O servidor respondia 413 sem ler e o `@hono/node-server` derrubava a conexão em 500 ms (RST: o navegador nunca via o 413). `drenarCorpo` lê e descarta o corpo recusado (até 64 MB e 30 s) e o front confere `uploadLimiteBytes` antes de enviar. Teste com servidor de verdade e upload lento (falhava com `ECONNRESET`). Em produção: "grande.pdf: passa de 10 MB" | `e7e4ffb` |
| 7 | média | "XYZ: Banner" + Enter criava sem cliente e com "XYZ:" no título | O Enter abre o `criar-cliente` e cria com o cliente novo; recusado, o Enter seguinte cria sem cliente e tira o "XYZ:" (`tirarMarcador`) | `4489574` |
| 8 | baixa | O Desfazer de conclusão com repetição deixava a próxima no Arquivo com [Restaurar] | `SQL_PROXIMA_DESFEITA`: com a original aberta, a próxima arquivada não aparece no Arquivo e `POST /restaurar` dá 409 "Ela volta sozinha quando a #N for concluída" (concluir de novo restaura a mesma, sem gastar número). API §5.3 | `f7fcf70` |
| 9 | baixa | "Convidar outra pessoa" deixava o foco no Cancelar | O formulário monta de novo e o foco entra no Nome | `9f9150d` |
| 10 | baixa | "Criado: 1 colunas" | Plural condicional (coluna, automação) | `a8592a7` |
| 11 | baixa | 401 do bootstrap no console deslogado; aviso de preload de fonte | Dica de sessão `pauta_sessao=1` (não é segredo): o login e o convite a põem, o logout a tira e o index.html servido pelo Node a acerta; em produção, sem a dica, o app vai a `/entrar` sem pedir o bootstrap. Os preloads das fontes saem. API §1 | `7664f9b` |
| 12 | baixa | Com "Só as minhas", a coluna dizia "1" sem card | `Contador.visiveis`: com filtro, "1 de 2" (e "com o filtro" no leitor de tela) | `7e64586` |
| 13 | baixa | Placeholders com cliente real | "Ex.: Clínica Exemplo"; o apelido sugere o do próprio cliente | `a8592a7` |
| 14 | baixa | Nome do admin do primeiro boot vindo do e-mail, sem lugar óbvio para trocar | Seção **Sua conta** (todos os papéis, ordem 50) e o item "Sua conta" no menu do avatar; o primeiro boot grava "Admin Revfun" em vez de "admin.revfun" (`nomeDoEmail`) e os Primeiros passos pedem para conferir enquanto o nome for esse e não houver apelido | `d32afc6` |

## Visual e UX

| # | Grav. | Achado | O que foi feito | Commit |
|---|---|---|---|---|
| 1 | alta | Nova demanda e Novo quadro fechando sem guardar | Ver funcional 5 | `a991014` |
| 2 | alta | Mudanças não salvas sumiam em Prazos e limites, Quadros e Aparência | `cadastros/pendentes.tsx`: o formulário fica em memória por chave (trocar de seção ou de quadro e voltar não perde), o rodapé gruda na tela com "1 mudança não salva · Descartar · Salvar" e fechar a aba pergunta (o `BrowserRouter` não tem `useBlocker`) | `d32afc6` |
| 3 | média | Link direto com fundo errado | Ver funcional 1 | `d2c912e` |
| 4 | média | 11 descrições de modelo cortadas, grade pesada | Descrição em até 2 linhas; com um modelo escolhido, a grade recolhe em "Carrossel · Trocar" (as setas andam sem recolher) | `75d081b` |
| 5 | média | Etiquetas não marcadas pareciam aplicadas | Não marcada: contorno na cor, texto neutro e +; marcada: como no card, com ✓; o chip não muda de largura | `75d081b` |
| 6 | média | Gatilho de data com outra altura e borda | `SeletorData` com a moldura do Campo (`tamanho` m = 40 px, p = 32 px); painel da Nova demanda e diálogo Datas todos em 32 px | `75d081b` |
| 7 | média | Ação principal de cada seção num lugar e com dois laranjas | A ação da seção fica no cabeçalho, secundária e com ícone (Pessoas, Equipes, Clientes, Modelos, Feriados) | `9002031` |
| 8 | média | Laranja demais nas seleções | Cartão escolhido com contorno escuro e o ponto do rádio laranja; listas de incluir com `Checkbox tom="neutro"`; modelo escolhido sem fundo laranja | `9002031`, `75d081b` |
| 9 | média | Paleta começava por Convidar pessoa; comandos sem sentido | `Comando.ordem` (contrato, acréscimo; PLANO §4): Nova demanda 10, Colar 20…; as demandas abertas no modal entram nos Recentes; "Criar os quadros das equipes" só com equipe sem quadro; tema só o oposto; "Sua conta" em Ir para | `5fdc0d9` |
| 10 | média | Sigla no fim da busca ignorada | "carrossel cla" e "CLA: carrossel" filtram o cliente (o fim só filtra se achar alguma coisa). API §4.13 | `9c6885d` |
| 11 | baixa | Setas do atalho parecendo traços; linhas repetidas no ? | O `Kbd` desenha as setas com ícones; a mesma tecla em dois lugares vira uma linha | `b651977` |
| 12 | baixa | X nativo azul na busca; vazios diferentes | X nativo escondido e "Limpar busca" no sufixo; "Nada encontrado para …" + [Limpar busca] nas três listas | `8a0b75c` |
| 13 | baixa | Sigla com largura variável e repetida | 52 px fixos; embaixo do nome, a situação | `8a0b75c` |
| 14 | baixa | Linhas cortadas a 390 px | Status desce para a linha de baixo; busca de Clientes na largura toda | `8a0b75c` |
| 15 | baixa | "Sua conta" dentro de Aparência | Ver funcional 14 | `d32afc6` |
| 16 | baixa | Detalhes do modal | Anexos em duas colunas iguais; caminho com peso 400 e 12 px; nome do cliente no title; o "0/3" não se repete ao lado da barra; respiro da menção 3 px | `183cbce`, `4117547` |
| 17 | baixa | "Pediu ajuste em a V2" | "Pediu ajuste na V2" | `a8592a7` |
| 18 | baixa | Exemplos que parecem valor | "Ex.:" em todos; identificador da Nova equipe vazio até o nome | `a8592a7` |
| 19 | baixa | 9 paradas de Tab na barra do editor | Padrão ARIA de toolbar (uma parada; setas, Home e End) | `5b864ff` |
| 20 | baixa | Miniaturas de fundo iguais no escuro | Metade clara e metade escura (`color-scheme` por metade) | `79c45cd` |
| 21 | baixa | Colunas sem cabeçalho e salvando sem aviso | Cabeçalho Cor · Nome · Limite WIP, "Papel: Normal", "Sem pessoa na coluna" e a nota de que salvam na hora | `79c45cd` |
| 22 | baixa | Estrela "principal" sem sentido | Texto "principal" só para quem está em mais de uma equipe, com o porquê no title | `8a0b75c` |
| 23 | baixa | Dois h1 em Configurações; títulos do Markdown no nível do título | Título de seção é h2 (h1 "Configurações", oculto no celular); `<Markdown nivelBase>`: no modal, "## Objetivo" vira h4 com o mesmo tamanho | `d32afc6`, `4117547` |

## Recusas e adiamentos

- **Funcional 2 (notificações sem superfície): adiado para o F3.** O sino, a lista de notificações, `GET
  /api/notificacoes` e "marcar lidas" são do F3 (PLANO §3, rotas §4.18), que entra na leva 2 a partir desta `master`; a
  verificação final do PLANO §5 (passo 11) exige o sino antes de ir ao ar. Uma superfície provisória duplicaria o F3 e
  mudaria o contrato dele. **A `master` não vai para a Melt antes do F3.**
- **Visual 10, chip "CLA ×" no campo da paleta:** opcional; pediria o cliente entendido em `BuscaSaida` (contrato). A
  busca passou a entender a sigla no fim e com dois-pontos, que era o problema.
- **Visual 2, "Trocar a senha" guardado em memória:** senha digitada não fica guardada de propósito; sair da seção
  limpa os campos de senha.
- **Visual 9, "Recentes" com 5 demandas:** ficou com até 8 itens (as demandas abertas no modal e os comandos usados),
  que é o que a paleta já guardava.

## Contrato e pontos de extensão (acréscimos)

`ExtensaoRota.fundo` e `Comando.ordem` (`web/src/extensoes/tipos.ts`); `TIPOS_ATIVIDADE` + `checklist.editado`,
`checklist.item_editado`, `checklist.item_removido` (`shared/tipos/demandas.ts`; o CHECK do banco é por GLOB, sem
migração); ação `checklist_rodada.editar` e `CAMPOS_MODELO_SO_ATENDIMENTO` (`shared/logica/permissoes.ts`); cookie
`pauta_sessao` (API §1); `drenarCorpo` no upload recusado (API §1); próxima desfeita (API §5.3); `rodadasInclusas` no
modelo (API §4.9); regras do checklist de rodada (API §2 e §4.15); anexo pelo modal sempre de referência (API §4.15);
busca com sigla no fim e trecho em janela (API §4.13). Design system: `MolduraDialogo.fecharAoClicarFora`,
`Combobox.aoSairComTexto`, `SeletorData.tamanho`, `Checkbox tom="neutro"`, `Contador.visiveis`,
`Markdown.nomeDaPessoa` e `Markdown.nivelBase`. F5: seção `cadastros-conta` (ordem 50) e avatar `cadastros-conta` (100),
no PLANO §4. Nenhuma migração nova.

## Verificação

- Regra 8 na `master` em `7664f9b`: `npx tsc --noEmit -p server` e `-p web` sem erros; `npm test` **360/360** (eram
  347); `node server/scripts/verificar-migracoes.ts` 420 checagens, 0 falhas; `npm run build` sem aviso de chunk;
  `npm run contraste --workspace web` 276 pares, 0 abaixo; auditoria de navegador com login nas páginas `/inicio,
  /q/criacao, /d/25, /config/conta, /config/pessoas, /config/equipes, /config/quadros, /config/modelos,
  /config/feriados, /config/parametros, /config/aparencia, /clientes, /clientes/CHZ, /arquivo, /quadros/novo` (claro e
  escuro, 1440 e 390): **nenhum problema**.
- **Roteiro de banco vazio em produção** (7332, `NODE_ENV=production`, CSP real), janelas isoladas para admin, Pri
  (atendimento), Bia, Léo e Duda (designers):
  - deslogado, `/` vai a `/entrar` sem nenhum erro no console (nem 401 nem aviso de fonte);
  - o admin entra no Início provisório com os Primeiros passos e o aviso "Você aparece para a equipe como Admin
    Integ3b"; pelo menu do avatar, Sua conta mostra "2 mudanças não salvas" e salva (o aviso some);
  - convites de Pri, Bia e Léo com o foco no Nome; cada um define a senha numa janela limpa (URL sem token) e a lista do
    admin tira o "Convite pendente" em ~1,6 s; "Convidar outra pessoa" volta o foco ao Nome;
  - "Criar os quadros das equipes": "Criado: 5 colunas e 2 automações", "Criado: 1 coluna"…; a Bia em `/` vai para
    `/q/criacao`; a Duda, convidada depois, ganha a coluna na janela da Bia ao vivo;
  - HE pela tela (Nome com "Ex.: Clínica Exemplo"; apelido com "Ex.: hospital esperanca") e o resto pela API (AM,
    contato, responsável); "Revisei os modelos"; os Primeiros passos somem;
  - Pri cola a conversa na Nova demanda (título e cliente lidos), o clique fora não fecha, o Esc fecha e o Shift+N
    devolve o rascunho; Ctrl+Enter cria a #1 (HE, Bia, prazo de "até quarta") e o rascunho sai;
  - Bia: "XYZ: Banner da feira" + Enter abre "Criar cliente XYZ" e nasce a #2 com XYZ e o título sem "XYZ:";
  - modal: "15h30" + Pronto + Salvar grava `prazoHora` 15:30 (e repetir semanal); PDF de 11 MB + PNG: "1 arquivo anexado;
    1 não. grande.pdf: passa de 10 MB"; o comentário com `@[Diretoria Financeira](mencao:<Pri>)` aparece "@Pri";
  - concluir: "A próxima fica para qua, 28/10 · Desfazer"; o Desfazer reabre e o Arquivo fica vazio;
  - Ctrl+K vazio: Recentes (#1), depois Ações com "Nova demanda neste quadro" e "Colar do WhatsApp" primeiro;
  - Q ("Só as minhas"): "Fila 1 de 2";
  - Léo abre `/d/1` direto: por baixo, o quadro Criação; o Esc leva a `/q/criacao`;
  - Prazos e limites: mudar, ir a Pessoas e voltar mantém o 4 com "1 mudança não salva · Descartar · Salvar";
  - nenhum erro nem violação de CSP no console das cinco janelas; sem rolagem lateral a 390 px.
- **Capturas finais** em `scratchpad/integ3b/fotos/final/`: `{claro,escuro}-{1440,390}-{1-quadro,2-modal,3-nova-demanda,
  4-configuracoes,5-clientes}.png` (20) e as do roteiro (`p-entrar`, `p01-inicio-admin`, `p02-pessoas`,
  `p03-quadros-equipes`, `p04-nova-rascunho`, `p05-modal-bia`). Auditoria em `scratchpad/integ3b/aud-dev/`.

## Avisos para a leva 2 (F2, F3, F6), além dos de cima

- **F3:** `web/src/telas/inicio/` é provisório: substitua a pasta inteira (o Início de verdade continua hospedando
  `secoesInicio()`) e apague `web/src/telas/quadros/dev/` (`/dev/cadastros-inicio`). As notificações já são gravadas
  (menção, membro, chegou): o sino e a lista são o que falta para a `master` ir ao ar. Os comandos novos do F3 na paleta
  levam `ordem` (Ir para: Início 10 já existe no núcleo).
- **F2:** o anexo de evidência nasce só pelas rotas do ciclo (`inserirAnexo` com `finalidade: 'evidencia'` ligado à
  aprovação); `POST /api/demandas/:id/anexos` ignora `finalidade`. O checklist de rodada (aberto por `abrirRodada`) só
  muda de conteúdo por atendimento e admin (`checklist_rodada.editar`).
- **Todos:** formulário longo dentro de diálogo usa `fecharAoClicarFora={!sujo}`; rascunho no localStorage leva o
  prefixo `rascunho-` e o id de quem escreve (o Sair apaga); Markdown de texto de usuário no modal usa `nomeDaPessoa` e
  `nivelBase`; data ao lado de campos usa `SeletorData tamanho`; lista de "incluir" usa `Checkbox tom="neutro"`.
- **F6:** o cabeçalho da coluna já mostra "1 de 2" com filtro (`Contador.visiveis`); a Lista e o Calendário seguem o
  mesmo texto.
