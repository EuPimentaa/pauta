# Integração da Onda 3 · leva 2 (F2, F3, F6)

Feita sobre `0401e53` (Ondas 1 e 2 e a leva 1 na `master`), na ordem do PLANO §5: **F2 → F3 → F6**. As três branches
partiam de `0401e53` (a `master` não andou durante a leva, sem rebase), as worktrees estavam limpas e o
`git diff --name-only master...funcionalidade/<f>` de cada uma só tinha arquivos do dono, mais duas remoções que a
integração anterior pediu: o F3 apagou a rota de DEV `web/src/telas/quadros/dev/` (do F5; INTEGRACAO-3A, avisos) e o F6
apagou os layouts de exemplo `nucleo-exemplo-lista` e `nucleo-exemplo-calendario` (pedido 3 do NÚCLEO-WEB). Nada em
`shared/tipos/*.ts`, em `web/src/extensoes/tipos.ts` nem em migrações. Observação de nome: a rota do F3 é
`server/src/rotas/paineis.ts` (sem o hífen do glob `paineis-*.ts`); tem o prefixo da funcionalidade e não conflita com
ninguém, então ficou.

Ambiente: API 7333 + Vite 5203 (`DATA_DIR=./data/integrador-leva2`, `seed:demo`) para desenvolvimento e auditoria;
build de produção servido pelo Node na **7300** (`NODE_ENV=production`, CSP real, banco que começou vazio em
`./data/integrador-leva2-prod`) para a verificação final; Chrome headless da 9222 com um contexto isolado por janela
(uma por pessoa, mais o cliente no celular). Credenciais geradas em `.env.integrador-leva2` e
`.env.integrador-leva2-prod` (não versionados).

## Merges

| Funcionalidade | Merge | Arquivos | Conflitos | Regra 8 logo depois do merge |
|---|---|---|---|---|
| F2 ciclo (9 commits) | `c423fc8` | 63 | nenhum | tsc ok; 409/409; 420 checagens; build sem aviso; `/a/:token` 142,5 kB gzip sem o `registro`; contraste 0; auditoria `/q/criacao,/d/21,/d/24,/q/atendimento,/a/<token>`: 0; `/dev/extensoes` sem erro |
| F3 painéis (16 commits) | `91fb6d3` | 53 | nenhum | tsc ok; 452/452; 420; build ok; 143,1 kB; contraste 0; auditoria como admin (`/inicio,/agenda,/horas,/agenda?minhas=1,/q/criacao,/d/21`) e como atendimento (`/inicio,/agenda,/horas,/agenda?minhas=1`): 0; `/dev/extensoes` sem erro |
| F6 lista (6 commits) | `c589040` | 25 | nenhum | tsc ok; 496/496; 420; build ok; 143,0 kB; contraste 0; auditoria (abaixo, depois dos pedidos) |

Os arquivos das três eram disjuntos. Os pontos de contato entre elas foram conferidos no navegador depois de cada merge:
o [Configurar automações] de Configurações › Quadros (F5) e o "Automações" do menu ··· do quadro abrem o diálogo do F2;
o menu ··· do quadro sai na ordem da §4 (Seguir, Copiar link, Etiquetas, Automações, Modelos, Editar, Copiar,
Arquivar); no Início do atendimento (F3), "Copiar lembrete" abre `copiar-whatsapp` no modelo Lembrete e "Registrar
retorno" abre o diálogo do F2 com a demanda (deixaram de ser "Disponível em breve"); o sino (F3) desenha as
notificações do ciclo (F2: `versao_entregue`, `ajuste_pedido`, `aprovada`, com o ícone do tipo quando o ator é o
cliente pelo link); arrastar no Calendário do quadro (F6) muda o prazo e a Agenda (F3) de outra janela concorda em
7 ms depois da resposta do servidor (54 ms do soltar). Nenhum atalho repetido no mesmo escopo: F2 Shift+R e Shift+E
(card e modal), F3 G I, G A, G H (global) e Shift+←, Shift+→, Shift+T (agenda), F6 F (quadro), ao lado dos da leva 1.
As `ordem` de selos, ações, menu, celular, topo, Início e paleta batem com a §4 (a paleta do F2 e do F3 entrou na tabela).

`npm ci`: a primeira execução falhou no meio (EPERM em `lightningcss`) porque um Vite de outra sessão, rodando da raiz na
5195 (sem API por trás), segura os módulos nativos; não é desta sessão e não o parei. Os três módulos presos
(`lightningcss-win32-x64-msvc`, `@rolldown/binding-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`) foram movidos
para `scratchpad/presos-3b` e o `npm ci` passou; antes de cada `npm ci` seguinte parei os meus servidores (o Vite da
5203 também segura esses módulos). O `package-lock.json` não mudou em nenhuma das branches. Os Vites das worktrees
(5185 do ciclo e 5189 da lista) foram parados no começo; as APIs delas e os servidores do F3 já estavam parados.

## Pedidos (`docs/pedidos/*.md`)

### F2 (`ciclo.md`)

| # | Pedido | O que foi feito | Commit |
|---|---|---|---|
| 1 | NÚCLEO-SERVIDOR (produto): no ajuste e no aprovado com a demanda esperando em outro quadro, mapear também as etiquetas guardadas no quadro do envio | **Aceito** (a verificação final do PLANO §5, passo 8, exige "as etiquetas de mesmo nome" no Social). `mover()` ganhou `etiquetasTambemDe` (acréscimo à API interna, PLANO §1.1.1): mudando de quadro, as etiquetas guardadas nesse quadro também casam por nome com o destino, sem aviso das sem par (continuam guardadas lá). `executarAutomacao` passa o quadro do envio quando a demanda está em outro quadro. O teste do vaivém agora espera "Alteração" no Social e "Urgente" guardada na Criação (falhava antes). API §5.5 | `f533af9`, `67a9dbd` |
| 2 | NÚCLEO-SERVIDOR: `entregarPorSql` sem a miniatura do Drive | **Aceito.** A fixture grava `previa_url` do link `/file/d/<id>/` e a paridade deixou de ignorar a coluna | `f5ac8eb` |
| — | Esclarecimentos de contrato (10) | Registrados na API: §4.8 (DELETE idempotente, 422/404), §4.16 (entregar depois da aprovação → 422; enviar versão decidida → 409 `ja_decidida`; `contatoId: null`; link reaproveitado estende a validade; Drive privado com arquivo enviado pelo app; teste do Drive com redirecionamentos e `erro` que não bloqueia; anular com rodada nova → 409), §4.17 (`ja_decidida` antes de "não aguarda mais"; `proximoPasso`; menção trocada por "@Nome"; `&inline=1`), §6 (textos sem contato, lembrete sem link, modelo que não se repete no título) | `67a9dbd` |

Os avisos do F2 (Início com `copiar-whatsapp`/`registrar-retorno` fora do modal, [Automações] do F5, peso da página
pública, atalhos) foram conferidos acima e na verificação final.

### F3 (`paineis.md`)

| # | Pedido | O que foi feito | Commit |
|---|---|---|---|
| 1 | F2: notificações `versao_entregue`, `aprovada`, `ajuste_pedido` | **Já atendido pelo F2** (servicos/ciclo.ts, por `notificar()`, nunca o ator). Conferido em produção: a Pri recebe "Bia entregou a V1 de #1…", a Bia recebe "Marina Souza pediu 2 ajustes na V1…" e "Marina Souza aprovou a V2…". Os tipos do ciclo e os destinatários estão na API §5.9. O ajuste interno avisa só os membros, como a API §4.16 sempre disse (quem pede é o atendimento) | `6b9724f` |
| 2 | Integrador: o admin também recebe "com o cliente há mais de N dias úteis" nas demandas em que é o AM | **Aceito** (o admin pode tudo o que o atendimento pode, API §2). API §4.18 e PLANO §3 | `6b9724f`, `13544a3` |
| 3a | NÚCLEO-WEB: texto de vazio do `CalendarioDemandas` no celular | **Aceito**: prop `vazio?: string \| null`; a Agenda passa `null` (desenha o aviso dela) e saiu o CSS que escondia a linha do núcleo | `0b69e2f` |
| 3b | NÚCLEO-WEB: foco itinerante na grade do calendário (124 paradas do Tab no mês de todos os quadros) | **Aceito**, na `GradeCalendario` (DS), que serve a Agenda e o Calendário do quadro: só os itens do dia em foco entram no Tab; as setas andam de dia em dia; clicar num dia ou num item dele faz dele o dia em foco. Agenda do admin a 1440 px: **125 → 51 paradas** (o resto é casca, cabeçalho e legenda). Espaço, → e Espaço continuam arrastando pelo teclado (conferido: o prazo mudou) | `9d888dc` |
| 3c | NÚCLEO-WEB: no celular, rolar até hoje na lista do mês | **Recusado**: o contorno do F3 (a Agenda abre em semana no celular, e o modo fica lembrado) resolve sem rolagem automática, que brigaria com a barra presa e com quem rolou de propósito | — |
| 4 | NÚCLEO-WEB: `useApontamentos` com `enabled` | **Aceito**: `useApontamentos(c, { enabled })`; as Horas da equipe não buscam os totais do mês | `0b69e2f` |
| 5 | F5: apagar `web/src/telas/quadros/dev/` | Feito pelo próprio F3 a pedido da 3A; aceito no merge | `91fb6d3` |
| — | Esclarecimentos (§4.18 e §5.9) | Registrados na API: ordem das listas, "esta semana" de amanhã até domingo, `comCliente`, `extras`, consultas da Agenda (chave repetida ou vírgula, 1/0/true/false, 400), paginação do sino (`limite` 30/100, `antesDe`, `proximo`, `naoLidas`), marcar lidas (500 ids, de outra pessoa ignorados, sem evento quando nada muda), avisos das 8h (membros ativos, senão o AM ativo; `prazo` só com a hora por vir; roda ao subir se perdeu o horário) | `6b9724f` |

### F6 (`lista.md`)

| # | Pedido | O que foi feito | Commit |
|---|---|---|---|
| 1 | NÚCLEO-WEB: seletor de visão só com ícones no celular | **Aceito**: `Abas.soIcones` (DS; o rótulo fica como nome acessível e dica); no celular o seletor vai para a linha do total e o "Só as minhas" perde o ícone para caber. A 390 px, sem filtros, o cabeçalho caiu de **3 linhas para 2** mais a faixa de colunas (título e Filtros; total, Só as minhas, visões e ···): o primeiro card da Criação de demonstração subiu de y≈282 para y≈244 a 390 × 844 | `6d60846` |
| 2 | NÚCLEO-WEB: seletor de visão logo depois do nome | **Aceito** (era também o achado visual 16 da INTEGRACAO-2) | `6d60846` |
| 3 | Contrato: lugar `abaixo` em `ExtensaoCabecalhoQuadro` para os chips | **Aceito** (acréscimo em `extensoes/tipos.ts`): uma linha inteira sob o cabeçalho, que some sem conteúdo; o F6 passou os chips para `quadro-cabecalho/lista-filtros-chips` (lado `abaixo`, ordem 100). No celular a linha dos chips vem antes da do total. A 1440 px sem filtros tudo cabe numa linha; com texto e Limpar o grupo da direita ainda desce para a segunda linha (faltam ~40 px; com o menu recolhido cabe), como já descia antes | `6d60846` |
| 4 | NÚCLEO-WEB: `semPrazo` também na lista do celular | **Recusado**: o contorno do F6 ("Sem prazo (N)" recolhível com `CardDemanda`, que abre e leva às Datas) é melhor no celular do que chips, e na lista não há arrastar; mover para o núcleo duplicaria | — |
| 5 | NÚCLEO-WEB: card sob o mouse na API do teclado | **Aceito**: `definirCardSobMouse`/`sairDoCard` exportados por `teclado/index.ts`; a Lista importa de lá | `0f733c8` |
| 6 | NÚCLEO-WEB: exportar `MenuDoCard` | **Aceito**: `quadro/index.ts`; a Lista importa de lá. PLANO §2.2 | `0f733c8` |
| 7 | NÚCLEO-WEB: `tabIndex` opcional no `CardDemanda` | **Recusado** por ora: só faria sentido com foco itinerante na lista do celular, onde o Tab é raro (sem teclado físico) e a auditoria passa; fica para quando houver uso real | — |
| — | Decisões do F6 (busca pelo começo das palavras, também no quadro do núcleo; `?ordem=` e `?agrupar=`; agrupar por membro repete a demanda; soltar só agrupada por coluna; coluna do agrupamento some) | Registradas no PLANO §3 (F6) | `13544a3` |

Nenhum pedido pediu banco: **nenhuma migração 090–099**.

## Achados da integração

| # | Achado | O que foi feito | Commit |
|---|---|---|---|
| 1 | "Copiar lembrete" do Início abria o diálogo com o foco na aba **Envio**, embora a escolhida fosse Lembrete: o foco inicial e a armadilha do Tab contavam os botões com `tabindex="-1"` (abas inativas, itens de foco itinerante). A armadilha também podia deixar o Tab escapar quando o último "focável" era um desses | `focaveis()` (`lib/foco.ts`, DS) ignora `tabindex="-1"`. Conferido: o foco cai na aba Lembrete | `6c0b781` |
| 2 | Na verificação em produção, com o servidor derrubado ~10 s, a faixa "Sem conexão" saía pela resposta do `/api/sync`, mas o SSE seguia esperando a espera crescente: um card movido logo depois chegava à outra janela **7,2 s** depois (na consulta seguinte) | A resposta do sync reabre o SSE na hora (`tempo-real/conexao.ts`). Teste novo (falhava). De novo em produção: o card movido 10 ms depois da volta chega junto com a saída da faixa (3,3 s: o tempo até a próxima tentativa do cliente) e, com o fluxo de volta, os eventos seguintes em milissegundos | `43258b4` |
| 3 | Passo 11 ("tudo aparece na outra janela em menos de 1 s"): a lista de Pessoas do admin levava **1,66 s** para tirar o "Convite pendente" (o tratador do F5 esperava 1,5 s também para pessoas, equipes e clientes, não só para as demandas) | Pessoas, equipes e clientes juntam só uma rajada de 150 ms; as demandas (Arquivo e contadores) seguem com 1,5 s. Em produção: convite aceito → lista do admin em **327 ms**; cliente criado pelo Léo → lista de Clientes da Pri em **236 ms** | `7989d67` |

## Verificação final (PLANO §5, os 13 passos)

Build de produção servido pelo Node na 7300, banco novo, CSP real, janelas isoladas para o admin, Pri (atendimento),
Bia, Léo e Duda (Criação), Caio (Social), uma segunda janela da Bia (escuro) e o cliente no celular (390 px). Tempos
contados de quando a ação terminou na primeira janela (clique, Enter ou o soltar), com a outra consultando a cada 50–100 ms.

| Passo | Resultado |
|---|---|
| 1 | Primeiro boot criou o admin; `/` deslogado vai a `/entrar` sem erro no console. O Início do admin mostra os 4 Primeiros passos na ordem: convidar, criar quadros, cadastrar clientes, revisar modelos ("0 de 4 feitos"). |
| 2 | Convites de Pri (atendimento), Bia e Léo (Criação) e Caio (Social); cada um definiu a senha numa janela limpa, a URL ficou `/convite` sem o token e a pessoa entrou em `/inicio`; a lista do admin tirou o "Convite pendente" sem recarregar, em ~1,66 s nesta rodada e em **327 ms** depois do achado 3 (conferido com um quinto convite). |
| 3 | "Criar os quadros das equipes" criou os 6 (Atendimento, Web, Tráfego e Produção em Kanban com 2 automações sugeridas; Criação e Social por pessoa). O modelo "Por pessoa" não tem Revisão: acrescentei "Revisão" e renomeei para "Pronto" antes de criar (Fila, Bia, Léo, Pronto). Cada pessoa já seguia o quadro da equipe (Pri › Atendimento, Bia e Léo › Criação, Caio › Social). Duda, convidada depois, ganhou a coluna na janela da Bia **219 ms** depois do Enter da senha. HE pela tela (sigla e nome) e o resto pela API (AM Pri, contato padrão Marina, responsáveis Bia na Criação e Caio no Social): "Cadastro completo". "Revisei os modelos": os Primeiros passos somem. |
| 4 | Automações da Criação pelo menu ··· do quadro (diálogo do F2): enviado → Atendimento › Com o cliente; ajuste → Criação › Fila; aprovado → Social › Fila com "Responsável do cliente no destino". |
| 5 | Pri colou a conversa na Nova demanda (Shift+N): HE por "Hospital Esperança", Carrossel sugerido, briefing do modelo, Bia sugerida (responsável do HE na Criação), Criação › Fila, prazo qua, 21/10 ("até quarta"). Ctrl+Enter: a #1 apareceu na janela da Bia em **219 ms** (com o POST); a Bia recebeu `membro`; Léo e Duda (seguidores) não receberam nada. No rodapé da Fila, "HE: Ideia de post @bia" + Enter criou a #2 (HE, Bia). Léo, na coluna dele, "XYZ: Banner" + Enter → "Criar cliente XYZ" → #3 com XYZ e Léo; a Pri vê a pendência do XYZ (`sem_am`, `sem_contato_padrao`). |
| 6 | Bia levou a #2 para a coluna dela; Léo a arrastou da coluna da Bia para a dele: membros Léo, e o avatar trocou na janela da Bia ao fim do arraste. Bia levou a #1 para a coluna dela, T ligou o cronômetro (topo "0:00 · #1"), marcou 2 itens (a janela do Léo mostrou "2/5"), Shift+E entregou a V1 com link do Drive ("Não deu para testar", que não bloqueia): o sino da Pri ganhou o número em **215 ms** (`versao_entregue`). T parou: 1 min em sex, 16/10. |
| 7 | Pri: "Enviar ao cliente" › Gerar link (Marina): "Movida para Atendimento › Com o cliente"; o card saiu da Criação da Bia em **449 ms** (com o POST); no Atendimento ele não tem etiquetas (Urgente e Alteração ficaram guardadas na Criação). Celular (390 px): "Pedir ajuste", 2 linhas, "Sim, sou Marina Souza", "Enviar 2 ajustes": a #1 voltou à Fila da Criação na janela da Bia em **265 ms**, rodada 2, prazo seg, 19/10, checklist "Ajustes R2" com as 2 linhas, Urgente e Alteração de volta; a Bia recebeu `ajuste_pedido`. |
| 8 | Bia entregou a V2; Pri enviou (o mesmo link, reaproveitado); o cliente aprovou no celular (folha "Aprovar a V2?" › "Sim, sou Marina" › "Confirmar aprovação"): a #1 apareceu no Social › Fila do Caio em **283 ms** e saiu do Atendimento da Pri em 284 ms, com **Alteração** (a de mesmo nome; Urgente ficou guardada na Criação: pedido 1 do F2) e o **Caio como único membro** (recebeu `membro`); a Bia recebeu `aprovada` e a #1 saiu do Início dela (entrou no do Caio). Uma semanal criada na Criação e levada ao Social: o Caio marcou "Concluída" ("A próxima fica para sex, 23/10 · Desfazer") e a próxima (#5) apareceu na Fila da Criação da Bia em **267 ms**, com a Bia (responsável do HE na Criação). |
| 9 | A Agenda da Pri mostra as demandas dos 3 quadros (Atendimento 2, Criação 1, Social 2, com a cor de cada um). Arrastar a #5 de 23/10 para 22/10: prazo 22/10 18h ("Prazo: qui, 22/10, 18h · Desfazer") e o card mudou na Criação da Bia em até **402 ms** do soltar. Lista da Criação com `?v=lista&agrupar=membro&ordem=prazo&f=<HE>`: chip "Cliente: HE", grupos Bia e Léo ("1 de 2"); igual depois de recarregar e na janela da Bia com a mesma URL. Calendário com o mesmo filtro: só as do HE. `/horas` da Bia: 1 min na sex, 16/10 (o cronômetro do passo 6). |
| 10 | A Pri arquivou os cards da coluna Concluído do Atendimento (menu da coluna › "Arquivar todos os cards" › confirmar): o card saiu da janela do admin na hora. No Arquivo, "he relatório" achou a #7; Restaurar a devolveu e ela reapareceu na janela do admin na hora. A semanal concluída com `concluida_em` recuado 9 dias por SQL (como na 3A) aparece como "Concluída em 07/10/2026 · não arquivada" com [Arquivar] e [Devolver ao quadro]. "Copiar quadro" da Criação criou "Criação 2" com Fila, Bia, Léo, Duda e Pronto, Urgente e Alteração, as 3 automações e nenhum card. |
| 11 | Duas janelas o tempo todo. Menção do Léo num comentário: o sino da Bia subiu em **205–219 ms** nas duas janelas dela (e "Menções recentes" no Início em 207 ms); a aba Sino do celular, em **107 ms**. Estrela no Social numa janela da Bia: Favoritos no menu da outra em **264 ms**. Tudo o mais dos passos 3 a 10 chegou à outra janela em menos de 0,5 s; a lista de Pessoas, depois do achado 3, em 327 ms. Servidor derrubado: faixa "Sem conexão" em 1,1–1,4 s; de volta: a faixa sai e o card movido logo depois chega (achado 2). |
| 12 | Claro e escuro a 1440 e 390 px (quadro, modal, Início, Agenda, Lista, Social e a página pública): sem rolagem lateral, nenhum erro nem violação de CSP no console de nenhuma janela em todo o roteiro. Letras soltas (n, q, j, f, m, d, t, Shift+E, Shift+R) não fazem nada em `/clientes`, `/agenda`, `/horas`, `/inicio` e `/arquivo`; no quadro, J foca um card e F abre os Filtros. `/api/publico/a/<token>`, `/a/<token>`, `/api/publico/arquivos/*` e `/a/<token inexistente>` saem com `no-store`, `noindex` e `no-referrer`. `/a/:token` baixou 25 arquivos do build + o HTML = **143,7 kB gzip** e não o `registro` (contando como o F2: JS, CSS e HTML; as fontes woff2, 55,8 kB, e o logo PNG da Melt, 49 kB, ficam de fora). Convite sem token na URL depois de aberto (passo 2). Backup do dia em `DATA_DIR/backups/demandas-2026-10-16.db`. |
| 13 | **Sem Docker nesta máquina** (nem WSL). Simulei a imagem: a pasta montada como o Dockerfile monta (só `shared`, `server/src`, `server/migracoes`, `web/dist` e os package.json), `npm ci --omit=dev --workspace server` (4 pacotes), `NODE_ENV=production` com `DATA_DIR` num "volume": `/api/saude` 200, o comando do HEALTHCHECK sai com 0, CSP no HTML, banco e `backups` no volume. Com `TRUST_PROXY_HOPS=2`, 7 logins errados do mesmo IP real (o penúltimo do `X-Forwarded-For`, como a Cloudflare + Traefik deixam) com o primeiro item forjado a cada vez: 401 ×5 e 429 ×2; outro IP real com outro e-mail: 401. O `docker build` de verdade e o container no EasyPanel ficam para o deploy. |

Roteiros das seções (no mesmo banco de produção, além do que a tabela já cobre):
- **F2**: "Aprovado pelo WhatsApp" numa peça enviada por fora levou o card ao Social › Fila do Caio em 268 ms
  ("Aprovação registrada · Movida para Social › Fila. · Desfazer"); o Desfazer o tirou de lá em 275 ms, de volta ao
  Atendimento › Com o cliente com a Bia, sem aprovação e com o envio pendente. No Atendimento, arrastar de Revisão para
  Com o cliente uma peça com a V1 não enviada abriu "Enviar ao cliente agora?" [Cancelar | Só mover | Enviar];
  Cancelar a deixou em Revisão (servidor e tela).
- **F3**: "Só as minhas" na Agenda (`?minhas=1`, com a faixa Sem prazo); uma demanda entrou no Início da Bia em 26 ms
  (a Pri a pôs como membro) e saiu em 13 ms (tirou); folha do sino no celular; Horas: editar (diálogo "Editar tempo"; o
  total foi a 15 min), o atendimento vê "Por cliente no mês: HE 15 min" sem as pessoas e o admin vê também "Por pessoa".
- **F6**: na Lista agrupada por coluna, arrastar a #2 para o grupo Duda a moveu (membros Duda, "Movida para Duda ·
  Desfazer") e o quadro da Bia mudou em até 401 ms do soltar; no celular, tocar no último chip da faixa leva à coluna
  Pronto (chip ativo acompanha) sem rolagem lateral, e o modal abre em tela cheia (390 × 844).

Capturas em `scratchpad/leva2/prod/fotos/final/`: `{claro,escuro}-{1440,390}-{quadro,modal,inicio,agenda,lista,social,publico}.png`
e as do roteiro (`p01`…`p12`). Auditorias em `scratchpad/leva2/aud-*`.

## Estado final (regra 8, na raiz, `master`)

- `npx tsc --noEmit -p server` e `-p web`: sem erros.
- `npm test`: **497 de 497** (eram 360: F2 +49, F3 +43, F6 +44, integração +1), quatro vezes sem falha.
- `node server/scripts/verificar-migracoes.ts`: 420 checagens, 0 falhas.
- `npm run build`: sem aviso de chunk; `/a/:token` 143,1 kB gzip pelo grafo do build (143,7 kB medidos na rede) e sem o `registro`.
- `npm run contraste --workspace web`: 276 pares, 0 abaixo do mínimo.
- Auditoria de navegador com login, depois dos pedidos do F6 e de novo no fim: `/inicio, /agenda, /horas, /q/criacao,
  /q/criacao?v=lista, ?v=calendario, ?f=<filtros>, ?v=lista&agrupar=membro&ordem=prazo, /d/21, /d/24, /d/31,
  /q/atendimento, /a/<token>, /config/quadros, /config/modelos, /clientes, /clientes/CHZ, /arquivo, /quadros/novo`
  (claro e escuro, 1440 e 390; 88 passagens na rodada final, mais o `/dev/ui`, a casca e o menu do avatar): **nenhum
  problema**. Agenda do admin a 1440 px: 51 paradas no Tab (eram 125).
- `/dev/extensoes`: sem erro no console depois de cada merge.

## Pendente e avisos

- **Docker**: o `docker build` e o container com o volume ficam para o EasyPanel (passo 13 simulado acima).
- Worktrees de F2, F3 e F6 removidas (`git worktree remove`; os servidores delas parados antes); as branches
  `funcionalidade/ciclo`, `paineis` e `lista` continuam (já mescladas). Sobraram, da leva 1, as pastas vazias
  `../melt-demandas-{cadastros,entrada,modal}` (só as junções de `node_modules/@melt-demandas`, sem arquivos).
- O Vite da 5195 (outra sessão, na raiz) segura `node_modules`; os módulos nativos que ele carrega estão em
  `scratchpad/presos-3b`. Quem precisar de `npm ci` na raiz: pare esse processo antes.
- A `master` tem agora o sino e a lista de notificações (o "adiado para o F3" da 3A): pelo critério da 3A, ela pode ir
  à agência depois do deploy (e do passo 13 de verdade).
- **Para quem mexer depois**: `focaveis()` ignora `tabindex="-1"`; a `GradeCalendario` tem uma parada só (itens do dia
  em foco); o cabeçalho do quadro tem o lado `abaixo`; `Abas.soIcones`; `useApontamentos(c, { enabled })`;
  `CalendarioDemandas.vazio`; `mover({ etiquetasTambemDe })`; `MenuDoCard` e o card sob o mouse pelos índices.

## Commits

`c423fc8` merge F2 · `f533af9` etiquetas do quadro do envio no aprovado · `f5ac8eb` miniatura na fixture · `67a9dbd`
esclarecimentos do F2 na API · `91fb6d3` merge F3 · `6c0b781` foco ignora tabindex=-1 · `0b69e2f` vazio do calendário e
`enabled` · `9d888dc` grade do calendário com uma parada · `6b9724f` esclarecimentos do F3 na API · `c589040` merge F6
· `6d60846` cabeçalho do quadro (visões e chips) · `0f733c8` `MenuDoCard` e card sob o mouse · `43258b4` SSE reaberto
pelo sync · `13544a3` PLANO · `7989d67` listas de cadastros em ~0,3 s · este registro.

---

# Integração 3B, segunda parte: as revisões da leva 2 e as correções

Três revisões adversariais rodaram sobre `3467300` (funcional ponta a ponta em produção, segurança e visual/UX). Esta
parte corrige o que elas acharam, direto na `master` (`3304ddd`..`5085874` mais este registro, sem push), em commits
pequenos. Quando fazia sentido, o teste novo falhou antes da correção (conferido tirando a correção e rodando de novo:
cliente sem AM, prazo da peça aprovada, link só com caminho de rede).

Ambiente: API 7341 + Vite 5211 (`DATA_DIR=./data/integrador-3b2`, `seed:demo` e dados de ciclo criados pela API) para
desenvolvimento e auditoria; build de produção servido pelo Node na **7300** (`NODE_ENV=production`, CSP real, banco
que começou vazio em `./data/integrador-3b2-prod`) para a verificação final; Chrome headless próprio na 9411 (perfil
próprio, um contexto isolado por janela). Credenciais geradas em `.env.integrador-3b2` e `.env.integrador-3b2-prod` (não
versionados). Os servidores da revisão de segurança (7324 e 7326, de outra sessão) seguiram no ar e não foram tocados.

## Segurança

A revisão não achou nenhuma vulnerabilidade nova reproduzível; o único achado alto da leva (a nota interna da versão na
página pública) já estava fechado em `3467300`. Nada a corrigir. As mudanças desta parte que tocam a página pública
mantêm as regras: os campos novos do contrato (`mime`, `bytes`, `anteriores[].linhas`) são do que o próprio cliente
recebeu ou escreveu, o texto continua puro e o PDF continua servido como anexo (ver recusas).

## Funcional

| # | Grav. | Achado | O que foi feito | Commit |
|---|---|---|---|---|
| 1 | média | Cliente sem AM (o que a equipe cria): ninguém recebia `versao_entregue`; a decisão ia só aos membros; a peça nunca entrava em "Com o cliente há mais de 2 dias úteis" | Sem AM, a entrega avisa todo o atendimento ativo (sem ninguém, os admins) com "· sem atendimento"; quem envia ao cliente vira o AM da demanda (`demanda.editada` com `atendimentoId`); a decisão avisa também quem enviou a versão. Três testes novos (falhavam). API §4.16 e §5.9 | `3304ddd` |
| 2 | média | Link de aprovação de versão só com caminho de rede: o cliente aprovava sem ver nada | Servidor: envio por link sem nenhum link ou arquivo → `422 estado_invalido` (`detalhes.motivo: 'sem_itens_visiveis'`). Página: versão sem nada visível (envios de antes da trava) mostra "A peça desta versão foi enviada por outro meio." sem os botões, e a decisão dá `409`. Diálogo: "Gerar link" desabilitado com o motivo, "Enviei por fora" escolhido e [Enviar arquivo (até 10 MB)] para acrescentar a peça. Testes novos (falhavam). API §4.16 e §4.17 | `0ffcbf3`, `e11b876` |
| 3 | média | Nova demanda fora de um quadro caía no Atendimento (o primeiro do menu) para quem não tem favorito | `quadroInicial`: depois do pedido, do aberto, do último usado e dos favoritos, o quadro da equipe da pessoa (o que ela segue primeiro), depois um que ela segue, e só então o primeiro do menu. Em produção, o Shift+N do Caio no Início abre em Social › Fila | `50a3734` |
| 4 | média | Peça aprovada levada ao Social mantinha o prazo da rodada de ajuste da Criação (atrasaria lá e dispararia o aviso das 8h) | Aprovação que leva a peça a um quadro que não é o do envio: o prazo vira a publicação (com a hora dela) ou nenhum; com repetição fica; a rodada guarda o dela. Anular, quando a demanda volta, devolve o prazo de antes se ninguém mexeu. Atividade "Automação tirou o prazo, cumprido na aprovação (era seg, 19/10)". Testes novos (falhavam). API §4.16 | `1eb3d0c` |
| 5 | baixa | Primeiros passos voltavam quando um designer criava cliente sem AM | Critério: 1 cliente fora de `ex` **com** AM (front e servidor); a pendência fica em Clientes. API §4.18 | `65e3106` |
| 6 | baixa | "Obrigado, Seu." | `primeiroNome` mantém o tratamento ("Seu Joaquim", "Dona Maria", "Dr. Paulo"); vale também na saudação do WhatsApp e no "Você é…?" | `eeb0088`, `2045b57` |
| 7 | baixa | Título do Colar do WhatsApp vinha da apresentação ("Aqui é da Clínica…") | Prefere a primeira linha que pede ("precisamos", "gostaria", "pode fazer"…) e pula "aqui é…", "sou a…"; teste novo | `eb01615` |
| 8 | baixa | Registrar retorno parecia já ter "Aprovado" escolhido | Primário "Registrar retorno" até escolher; o erro aparece junto das opções (`aria-describedby`); foco das opções em contorno tracejado por fora, que não se confunde com a escolhida (anel cheio por dentro) | `e11b876` |
| 9 | baixa | Anular e aprovar de novo deixava duas notificações "aprovou" iguais | As `aprovada` da decisão anulada ganham "· anulada por Pri" e saem de novo pelo SSE (o sino troca a linha); teste novo | `d3a64c3` |
| 10 | baixa | Rascunho da Nova demanda guardava a conversa com senha no localStorage | Com senha no texto (o aviso do formulário ou o detector sobre a conversa, o título e a descrição), o rascunho não é gravado e o antigo sai; o aviso diz isso | `fb3916b` |
| 11 | baixa | O `[` não aparecia na lista do `?` | A lista inclui `ATALHOS_CASCA` (já existia para isso) | `3b17406` |
| 12 | baixa | Aba Demandas do cliente: "3 abertas" e um grupo com 4 cards | Grupos só com as abertas; as concluídas que ainda estão nos quadros num grupo próprio no fim | `f9d2a72` |
| 13 | baixa | "Olá, tudo bem." e link colado no prazo | Junto com o visual 6 (textos em linhas) | `eeb0088` |
| 14 | baixa | PDF do briefing abria uma aba que só baixava | É decisão de segurança (attachment + nosniff, ver recusas): o nome e o menu dizem "Baixar" e baixam sem abrir aba; o detalhe diz "PDF · 12 KB" | `8920f61` |
| 15 | baixa | Prévia da rápida "ICC · Caio · Caio" | O nome da coluna não se repete quando já está como membro | `c1b5791`, `45de5e1` |

## Visual e UX

| # | Grav. | Achado | O que foi feito | Commit |
|---|---|---|---|---|
| 1 | alta | Depois de decidir, a confirmação ficava fora da tela e o foco ia para o body | O selo da decisão vem logo abaixo do título e do resumo (quem volta ao link vê primeiro); ao decidir, a tela volta ao item e o foco vai para o selo (`tabIndex=-1`, `role=status`). Produção, 390 px: `scrollY` 0, selo em y=167 com o foco | `2045b57` |
| 2 | média | No desktop os botões ficavam duas telas abaixo | A barra fica presa no rodapé também no desktop, dentro da coluna, com "V1 · 3 itens · retorno até ter, 20/10" à esquerda | `2045b57` |
| 3 | média | Zoom cortava a peça | `max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px)`: 4:5 a 1440×900 abre com 701×876 | `2045b57` |
| 4 | média | Prévia que não carrega (Drive que deixou de ser público) | `onError`: na página, cartão "Prévia indisponível · Abrir em drive.google.com" (ou "Ver a peça aqui" no embutível); no modal, o ícone do provedor | `2045b57`, `e11b876` |
| 5 | média | "Aprovado V2 por…", folha com o título solto, "Peça · V1" | "V2 aprovada por Carla Menezes em 17/10 às 00:17." (servidor e página); folha "Aprovar a V1 de “Título”?" com "A agência segue com esta versão como está."; sem modelo, "Versão 1" | `eeb0088`, `2045b57` |
| 6 | média | WhatsApp numa linha só, modelo grudado no título | Uma ideia por linha, o link sozinho na linha dele, o título em negrito do WhatsApp (`*título*`), "Segue a V1 de *E-mail marketing vacinação* para aprovação:", sem o modelo; testes e API §6 atualizados; a caixa do texto cresce com ele | `eeb0088` |
| 7 | média | Nada dizia quantas peças a versão tem | Resumo sob o título ("2 imagens e 1 link"), cada prévia numerada ("1 de 3 · PNG · 41 KB") e a folha de aprovação com as miniaturas ("Você vai aprovar os 3 itens desta versão.") | `2045b57` |
| 8 | média | Estado do ciclo abaixo da dobra do modal | Seção nova `topo` (contrato: `ExtensaoSecaoDemanda.coluna`) logo abaixo de "na coluna … do quadro …"; o F2 põe `ciclo-estado` ("V2 enviada por link a Carla Menezes · retorno até ter, 20/10", "V2 aprovada por Marina Souza · sáb, 17/10", "Ajuste pedido na V1 · R2 até seg, 19/10"), na cor do estado, que leva a "Versões e aprovação" | `66a4599`, `94554e3` |
| 9 | média | Ações espremiam o título; tamanhos diferentes; X sozinho no celular | Desktop: título em largura total, ··· e fechar no canto, barra própria abaixo do título com Concluída, o primário e até 2 secundárias, todos com 32 px e 13 px (Concluída com o raio das ações). Celular: uma linha presa [X] [Concluída] … [primário] [···], e as secundárias vão para o ···; a 360 px o primário perde o ícone e cabe inteiro | `66a4599`, `8bb18c4` |
| 10 | média | Prévia grande empurrava Para quem e o prazo para baixo | Versão em lista compacta (miniatura de 44 px, nome, detalhe e ações; `ItemVersao compacto`): a 1440×900 o rótulo do prazo fica em y=561 e a 390×844 em y=501 | `e11b876` |
| 11 | média | Motivo presumido como fato; ator repetido; diálogos com motivo marcado; um ícone só | Trilha: "**Rodada 2** aberta com o pedido de Carla Menezes · prazo seg, 19/10" (sem motivo; `rodada.aberta.pedidoPor`); Versões: "ajuste pedido pelo link" sem o motivo; diálogos com "Escolha o motivo" obrigatório; ícone por fato (Upload entregou, Send enviou, Eye abriu o link, CheckCircle2 aprovou, Wrench ajuste) | `0224a16`, `e11b876` |
| 12 | média | Início punha prazos vencidos no topo de "Depois" | Grupo "Com o cliente" em Minhas (`MinhasPorPrazo.comCliente`, as enviadas há mais tempo primeiro); "6 com o cliente" no resumo virou âncora para ele. API §4.18 | `b3328c1` |
| 13 | média | Agenda e Calendário sem atraso e sem sigla | Chip com `data-atrasada` (texto em `--danger-ink` e o triângulo), a sigla antes do título e o título inteiro no `title` | `db4e1db` |
| 14 | média | Designer fora da demanda via uma instrução sem saída | "Nenhuma versão entregue. Entre na demanda para entregar a versão." com [Entrar e entregar] (entra e abre o diálogo; com versões, o botão vai no cabeçalho da seção). PLANO §4.1 | `94554e3` |
| 15 | baixa | Registrar retorno sem escolha | Ver funcional 8 | `e11b876` |
| 16 | baixa | Cronômetro ligado fora dos totais | O tempo que já correu entra no total do dia e da semana | `6550e6b` |
| 17 | baixa | Dicas de teclado no toque; aba do sino cortada | `.ui-kbd` some com `(hover: none) and (pointer: coarse)` (menos na lista do `?`); "Escolha a imagem do print" e "Ligue o cronômetro num card" no toque; anexos sem Ctrl+V no toque; aba "Avisos" | `6550e6b`, `e11b876`, `8920f61` |
| 18 | baixa | Sinais com caixa misturada e datas em cinco formatos | Sinais com maiúscula ("Com o cliente há…", "Parado há…"); card, Lista e Aprovações do cliente nos dois formatos ("seg, 19/10, 18h" e "sáb, 17/10 às 00:17"; de outro ano, com o ano) | `28e91b0` |
| 19 | baixa | Lista com "Média" em toda linha e colunas vazias | A média não aparece (como no card); Início e Concluída só quando alguma linha tem o dado | `01e01da` |
| 20 | baixa | "Todas têm prazo." com filtro | `CalendarioDemandas.semPrazoVazio`: com filtro, "Nenhuma sem prazo com estes filtros." | `db4e1db` |
| 21 | baixa | "Ver 104 demandas" pequeno; faixas cortadas sem sinal | Botão primário em largura total no rodapé da folha; as faixas da Agenda esmaecem na borda (`mask-image`) | `6550e6b`, `745d889` |
| 22 | baixa | PDF só com Baixar e sem tipo; bloco vazio enorme; `<details>` nativo sem o ajuste pedido | "PDF · 12 KB" sob o nome (contrato: `ItemVersaoPublico.mime`/`bytes`); bloco sem miniatura compacto (120–200 px); "Versões anteriores" com chevron, cada versão num cartão (V1, data, decisão) e as linhas do ajuste que o cliente pediu (contrato: `anteriores[].linhas`). Abrir o PDF inline: recusado (abaixo) | `2045b57` |

## Recusas e adiamentos

- **PDF inline (funcional 14, visual 22):** o servidor entrega todo arquivo que não é imagem com `Content-Disposition:
  attachment` e `nosniff`, de propósito (a revisão de segurança listou isso como defesa: PDF pode trazer script, e o
  visualizador do navegador abriria na origem do app). A tela passou a dizer "Baixar" e a mostrar o tipo e o tamanho;
  abrir no navegador fica para quando houver um visualizador isolado.
- **Títulos cortados no mês do calendário (visual 13, parte):** a célula do mês comporta uma linha por item; quebrar em
  duas empurra os itens para "+N outros". O título inteiro está no `title` e no nome acessível, e a semana mostra mais.
- **"Qui, 15/10" nas Horas (visual 18, parte):** é o título do dia, como "Hoje" e "Ontem" ao lado; o formato é o mesmo
  ("qui, 15/10"), só a inicial maiúscula de título.
- **"Chegou" repetido no Social depois de anular e aprovar de novo (funcional 9, parte):** a demanda de fato saiu e
  entrou duas vezes; marcar a "chegou" anterior pediria ligar o movimento à decisão. A "aprovada", que é o fato
  desfeito, ficou marcada.
- **`docker build` de verdade:** não há Docker nem WSL nesta máquina (como na primeira parte); simulado abaixo.

## Contrato e pontos de extensão (acréscimos)

`ItemVersaoPublico.mime`/`bytes` e `ItemAprovacaoPublico.anteriores[].linhas` (`shared/tipos/publico.ts`);
`MinhasPorPrazo.comCliente` (`shared/tipos/paineis.ts`); `MapaDadosAtividade['demanda.editada'].aprovacaoId`/`prazoNovo`
e `['rodada.aberta'].pedidoPor` (`shared/tipos/demandas.ts`); `ExtensaoSecaoDemanda.coluna: 'topo'`
(`web/src/extensoes/tipos.ts`; PLANO §4: `ciclo-estado` 100). Servidor: `atendimentoSemAm`, `visivelAoCliente`,
`marcarNotificacoesDoFato`, `abrirRodada({ pedidoPor })`; `422 estado_invalido` com `motivo: 'sem_itens_visiveis'` no
envio por link; `409` na decisão de versão sem nada visível. Front: `primeiroNome` com o tratamento
(`shared/logica/texto-whatsapp.ts`, que perdeu o `nomeDaPeca` e o `modeloNome`), `separarAcoes(…, maxSecundarias)`,
`CalendarioDemandas.semPrazoVazio`, `ItemVersao compacto`, `formatarDiaBarraMes`, grupos de ícone da atividade
(`entrega`, `envio`, `visto`, `aprovacao`, `ajuste`). Docs: API §4.16, §4.17, §4.18, §5.9 e §6; PLANO §4 e §4.1.
Nenhuma migração nova.

## Verificação

- **Regra 8, na raiz, `master` em `33edd0c`:** `npx tsc --noEmit -p server` e `-p web` sem erros; `npm test`
  **504/504** oito vezes seguidas (eram 497; os testes novos ficaram nos arquivos que já cobriam o assunto);
  `node server/scripts/verificar-migracoes.ts` 420 checagens, 0 falhas; `npm run build` sem aviso de chunk;
  `npm run contraste --workspace web` 276 pares, 0 abaixo (menor 4,61:1 claro e 4,60:1 escuro); auditoria de navegador
  com login (`/inicio, /agenda, /horas, /q/criacao, /q/criacao?v=lista, ?v=calendario, /q/atendimento, /d/75` (com o
  cliente), `/d/51` (aprovada), `/d/66` (não enviada), `/d/48` (equipe fora), `/clientes/IVI` e duas páginas `/a/`
  (aguardando com anteriores; Drive quebrado e Figma), claro e escuro, 1440 e 390: 68 passagens com o `/dev/ui`, a casca
  e o menu do avatar; repetida no fim, mais `/d/75, /d/66, /inicio` a 360 px depois do último ajuste): **nenhum problema**;
  `/dev/extensoes` sem erro no console.
- **Dockerfile:** o fecho das importações do servidor (todos os `.ts` de `server/src` e o que eles importam) tem 117
  arquivos, todos em `shared/`, `server/src/` e `server/migracoes/`, e só os pacotes `hono`, `@hono/node-server` e
  `zod` (as dependências de produção do servidor); o resto que ele lê é `server/migracoes` e `web/dist`, os dois
  copiados. Simulação da imagem (a pasta montada como o Dockerfile monta, `npm ci --omit=dev --workspace server`: 4
  pacotes, `NODE_ENV=production` com o banco num "volume"): `/api/saude` 200, o comando do HEALTHCHECK sai com 0, CSP e
  `noindex`/`no-referrer` em `/a/…`, banco no volume.

### Verificação final em produção (PLANO §5, banco vazio)

Build de produção pelo Node na 7300, janelas isoladas para o admin, Pri (atendimento), Bia, Léo e Duda (Criação), Caio
(Social), uma segunda janela da Bia (escuro) e o cliente no celular (390 px); tempos de quando a ação terminou na
primeira janela.

| Passo | Resultado |
|---|---|
| 1 | Deslogado, `/` vai a `/entrar` sem erro no console; o Início do admin mostra os 4 Primeiros passos na ordem. |
| 2 | Convites de Pri, Bia, Léo e Caio, cada um definindo a senha numa janela limpa (URL `/convite` sem o token, entra em `/inicio`); a lista de Pessoas do admin tira o "Convite pendente" em **327 ms** (medido com um quinto convite). |
| 3 | "Criar os quadros das equipes" cria os 6 ("Revisão" acrescentada e renomeada para "Pronto" na Criação); cada pessoa segue o quadro da equipe; a Duda, convidada depois, ganha a coluna na janela da Bia em **218 ms**; HE completo pela tela e pela API; "Revisei os modelos": os Primeiros passos somem (e não voltam com o cliente sem AM do passo de baixo). |
| 4 | Automações da Criação pelo diálogo do F2: enviado → Atendimento › Com o cliente; ajuste → Criação › Fila; aprovado → Social › Fila com "Responsável do cliente no destino". |
| 5 | Conversa colada na Nova demanda: HE, Carrossel, briefing, Bia sugerida, Criação › Fila, prazo qua, 21/10; a #1 aparece na janela da Bia em **222 ms**; a Bia recebe `membro`, Léo e Duda nada; "HE: Ideia de post @bia" cria a #2; o Léo cria "XYZ: Banner" com "Criar cliente XYZ" e a Pri vê a pendência. |
| 6 | Léo arrasta a #2 da coluna da Bia para a dele (o avatar troca na janela da Bia); T liga o cronômetro, 2 itens marcados, V1 com link do Drive: o sino da Pri ganha o número em **218 ms**; T para: 1 min. |
| 7 | Envio por link: a #1 vai para Atendimento › Com o cliente e sai da Criação da Bia em **438 ms**, sem etiquetas (guardadas na Criação); no celular, 2 ajustes: volta à Criação › Fila em **277 ms**, rodada 2, prazo seg, 19/10, "Ajustes R2", etiquetas de volta; a Bia recebe `ajuste_pedido`. |
| 8 | V2 enviada pelo mesmo link e aprovada no celular (folha "Aprovar a V2 de “…”?"): Social › Fila do Caio em **269 ms** (saiu do Atendimento em 270 ms), com Alteração e o Caio como membro (`membro`); a Bia recebe `aprovada` e a #1 sai do Início dela. O prazo da #1 no Social ficou **sem prazo** (as rodadas guardam 21/10 e 19/10; atividade "Automação tirou o prazo"). A semanal concluída pelo Caio: a próxima (#5) na Fila da Criação em **265 ms**. |
| 9 | A Agenda da Pri mostra os 3 quadros; arrastar a #5 de dia muda o prazo e o card da Criação na janela da Bia em ~0,4 s do soltar (duas vezes); Lista e Calendário com o filtro na URL (iguais depois de recarregar e na janela da Bia); `/horas` com o minuto do cronômetro. |
| 10 | Arquivar os cards de Concluído some na janela do admin na hora; "he relatório" acha a #7 no Arquivo e Restaurar a devolve; a concluída há 9 dias (recuada por SQL) aparece "não arquivada"; "Copiar quadro" cria "Criação 2" com colunas, etiquetas e automações, sem cards. |
| 11 | Menção: sino da Bia em **219 ms** (e Menções recentes); estrela: Favoritos na outra janela em **266 ms**; aba "Avisos" do celular em **123 ms**; Pessoas em 327 ms e Clientes em **235 ms**; servidor derrubado: faixa "Sem conexão" em 1,4 s; o card movido 11 ms depois da volta chega com a saída da faixa (3,7 s: a próxima tentativa do cliente). |
| 12 | Claro e escuro a 1440 e 390 (quadro, modal, Início, Agenda, Lista, Calendário, Social e a página pública): sem rolagem lateral e nenhum erro nem violação de CSP no console; letras soltas não fazem nada fora do quadro e do modal; J e F no quadro; `/api/publico/*`, `/a/*` e o 404 com `no-store`, `noindex` e `no-referrer`; `/a/:token` baixou 26 arquivos do build + o HTML = **146,1 kB gzip**, sem o `registro`. Backup do dia: o servidor ficou no ar até depois das 3h e gravou `DATA_DIR/backups/demandas-2026-10-17.db` (`integrity_check` ok, com as 14 demandas e as 7 pessoas do roteiro). |
| 13 | Sem Docker: simulação acima. |

Roteiros das seções no mesmo banco: Aprovado pelo WhatsApp leva ao Social do Caio em 266 ms e o Desfazer tira em 259 ms;
soltar em Com o cliente com versão não enviada oferece [Cancelar | Só mover | Enviar] e Cancelar deixa em Revisão; "Só
as minhas" na Agenda; demanda entra e sai do Início da Bia em 127 ms e 21 ms; editar horas (15 min); na Lista agrupada
por coluna, arrastar a #2 para o grupo Duda move no quadro da Bia em ~0,4 s; faixa de colunas e modal em tela cheia a
390 px.

**As correções desta parte, em produção** (mesmo banco):
- o Léo cria a #11 para o ACM (cliente que ele mesmo criou, sem AM) e entrega: a Pri recebe "Léo entregou a V1 de #11
  Banner da fachada · sem atendimento"; ela envia por link sem contato e vira o AM; o texto sai "Olá, tudo bem?↵Segue a
  V1 de *Banner da fachada* para aprovação:↵<link>↵↵Retorno até ter, 20/10, 18h."; o cliente aprova como "Seu Joaquim":
  "Aprovação registrada. Obrigado, Seu Joaquim." e a Pri recebe a aprovação; o Início do admin continua sem os
  Primeiros passos;
- versão só com caminho de rede: o envio por link dá `422 sem_itens_visiveis` e o diálogo abre com "Gerar link"
  desabilitado e "Enviei por fora" escolhido;
- carrossel com 2 imagens e Figma: "2 imagens e 1 link", "1 de 3 · PNG · 41 KB"…, barra presa no desktop com "V1 · 3
  itens · retorno até ter, 20/10"; folha "Aprovar a V1 de “Carrossel Novembro Azul”?" com as miniaturas; depois de
  aprovar, `scrollY` 0, o selo em y=167 com o foco;
- Shift+N do Caio no Início abre em Social › Fila; Registrar retorno sem escolha diz "Registrar retorno" e o erro
  aparece junto das opções; o motivo abre em "Escolha o motivo";
- conversa com "a senha é…": título "3 stories para o feriado de Finados", o aviso diz que o rascunho não fica e o
  localStorage fica sem rascunho depois do Esc;
- Início da Pri: "2 com o cliente" (âncora) e o grupo "Com o cliente".

**Capturas finais** em `scratchpad/integ3b2/prod/fotos/final/`: `{claro,escuro}-{1440,390}-{quadro,modal,modal-topo,
modal-versoes,inicio,agenda,lista,calendario,social,publico,publico-pendente}.png` e as do roteiro (`p01`…`p13`; as das
correções são `p13-*`). Auditoria em `scratchpad/integ3b2/aud/` e `aud.txt`; capturas de desenvolvimento em
`scratchpad/integ3b2/fotos/`.

## Avisos para quem mexer depois

- A seção `topo` do modal é uma linha só (sem cabeçalho); o fallback do Suspense dela é vazio.
- Envio por link precisa de pelo menos um item que o cliente vê (`visivelAoCliente`): a tela já não oferece o link nesse
  caso; quem chamar a API direto recebe `422`.
- A aprovação que leva a peça a outro quadro mexe no prazo da demanda (não no da rodada); quem ler o histórico encontra
  `demanda.editada` com `aprovacaoId`.
- `MinhasPorPrazo` tem o grupo `comCliente`: quem conta "as minhas" (o número do menu usa só `atrasadas`) deve somar
  os seis grupos.
- No toque, `.ui-kbd` some; dica de atalho dentro de frase escreve a alternativa de toque (`usePonteiroGrosso`).
- O servidor de produção guarda o `index.html` em memória ao subir: `npm run build` com ele no ar quebra a página até
  reiniciar (aconteceu nesta verificação, as capturas foram refeitas depois de reiniciar). No EasyPanel cada deploy sobe
  um container novo, então não afeta a produção.
- O `.env.integrador-3b2-prod` guarda as senhas de teste das pessoas do roteiro; nada disso vai para docs ou commits.

## Commits

`3304ddd` cliente sem AM · `1eb3d0c` prazo da peça aprovada · `0ffcbf3` link só com algo visível · `eeb0088` textos para
o cliente · `2045b57` página pública · `e11b876` diálogos do ciclo · `0224a16` trilha sem motivo presumido e ícones ·
`66a4599` cabeçalho do modal e seção topo · `94554e3` estado do ciclo no topo e Entrar e entregar · `8920f61` anexos
"Baixar" · `50a3734` quadro da Nova demanda · `fb3916b` rascunho sem senha · `eb01615` título do Colar · `65e3106`
Primeiros passos · `b3328c1` Início "Com o cliente" · `db4e1db` Agenda e Calendário · `6550e6b` Horas, toque e filtros ·
`745d889` faixas da Agenda · `28e91b0` sinais e datas · `01e01da` Lista · `3b17406` `[` na lista · `c1b5791` e `45de5e1`
prévia da rápida · `f9d2a72` aba Demandas do cliente · `d3a64c3` notificações anuladas · `8bb18c4` linha do modal a 360 px · `33edd0c` exportação da página pública · `5085874` PLANO
· este registro.

## Adendo: segurança da leva 2 (corrigida depois)

A seção "Segurança" acima ficou desatualizada: os 3 médios e 4 baixos da revisão de segurança não tinham sido
corrigidos nesta integração. Foram fechados numa rodada própria (`3467300`, `17bc612`..`efac828`) e verificados
adversarialmente; as pendências da verificação foram fechadas em `8e84353`..`926c060` (migração
`090_aprovacao_rede_interna.sql`). Limite aceito: quem copia o link e decide de outra rede não é detectável; sobram o
registro `link.exibido` e o aparelho na trilha do admin. Total de horas da demanda visível a todos: decisão na API §2.
