# Pedidos do F9 (agenda externa)

Pedidos a outros donos (FASE2-PLANO §0, regra 1), esclarecimentos de contrato que o F9 precisou decidir e avisos ao
integrador. Nada aqui bloqueia o merge: cada item tem um contorno local já no código do F9. (O FASE2-PLANO §0 fala em
`docs/pedidos/f9-agenda.md`; este arquivo segue o nome pedido pelo orquestrador, `fase2-agenda.md`.)

## Pedidos

| # | Para | Pedido | Contorno no F9 | Prioridade |
|---|---|---|---|---|
| 1 | Integrador (`web/scripts/contraste.ts`, `pares()`; §0 regra 9) | Pares novos da agenda externa, para os dois temas. **Texto (4,5:1):** `--label-<c>-ink` sobre `--surface-sunken` (título e hora do evento "livre"/"talvez", que não tem fundo próprio, numa célula de fim de semana ou de fora do mês, que são misturas de `--surface-sunken` com `--surface`; `--surface-sunken` é o pior caso). **Não textuais (3:1):** `--label-<c>-ink` sobre `--surface-sunken` (contorno do evento na célula de fim de semana); `--border-control` sobre `--surface-sunken` (contorno da linha "3 eventos" no fim de semana); `--border-control` sobre `--bg` (contorno tracejado do chip desligado no filtro de calendários, na barra da Agenda). Os outros pares que o F9 usa já estão em `pares()`: `--label-<c>-ink` sobre `--label-<c>-bg` (evento, "Hoje na agenda", chip ligado) e sobre `--surface` (evento leve), `--text-2` sobre `--surface` e `--surface-sunken`. | Só tokens que já existem; `npm run contraste` verde (276 pares) e a auditoria de navegador sem nenhum problema em `/agenda` (mês e semana), `/inicio` e `/config/agendas-externas`, nos dois temas, a 1440 e 390 px. | média |
| 2 | Integrador (README, seção "Fase 2") | Levar `docs/fase2/operacao-agenda.md` ao README (FASE2-PLANO §2, linha "Operação"). | — | média |
| 3 | Integrador (`server/test/integracao-fase2.test.ts`, §6 passo 3) | A ferramenta `agenda` do MCP com o provedor real: `server/src/provedores/agenda.ts` exporta `provedor: ProvedorAgendaMcp<Db>` (subtipo de `ProvedorMcp<Db>`, `tipo: 'agenda'`). Para ter dados sem rede: `gravarCorpoAgenda(db, id, readFileSync('server/test/fixtures/agenda/google-2026.ics'))` (`servicos/agenda-busca.ts`) depois de `criarAgenda`, ou o `scripts/demo/agenda.ts` no seed de demonstração. Período acima de 62 dias lança o `ErroHttp` 400 da rota; erro inesperado sai mascarado. | Testado pelo F9 (`agenda-rotas.test.ts`, "provedor do MCP"). | média |
| 4 | Dono do núcleo (`server/src/tarefas.ts`, toque exclusivo do F9 nesta fase) — aviso | `executarTarefa` grava `String(e.message)` em `tarefa_execucao.detalhe` e imprime o erro inteiro (`console.error('tarefa … falhou:', e)`). A tarefa `agenda-busca` nunca deixa a exceção original subir (cada agenda num try/catch; no fim, se alguma falhou, lança um erro com a mensagem já passada por `descreverErro`), então nada vaza dela. Sugestão para depois da fase: `mascararSegredos` no `detalhe` e `descreverErro` no log, como rede de segurança para todas as tarefas. Não foi feito porque o teste `nucleo-boot` confere o `detalhe` exato e o toque do F9 em `tarefas.ts` é só o `aCadaMin`. | A tarefa do F9 mascara antes de lançar (teste "segredo nunca escapa"). | baixa |

## Esclarecimentos de contrato (para a API.md §F.9 e §F.11)

- **`404` e parentes:** além do `404`, `401`, `403` e `410` também viram `endereco_invalido` (o Google responde `404` ao
  endereço redefinido; os outros três são a mesma situação para quem cola: "cole o endereço novo"). Redirecionamento
  (`redirect: 'error'`) e qualquer outro status que não seja `200` viram `fora_do_ar`.
- **Hash sem DTSTAMP:** o atalho "corpo igual → só `buscada_em`" vale quando a última leitura boa (`ok_em`) é do mesmo
  dia em São Paulo e a agenda está sem erro. Num dia novo o mesmo corpo é lido de novo, porque a janela de −30/+180
  dias anda um dia (as ocorrências só são regravadas se mudaram). Corpo igual depois de um erro limpa o erro e publica.
- **Conteúdo mudou mas as ocorrências da janela não:** grava `hash_conteudo`, `ok_em` e `contagens` e publica o
  `agenda_externa`, sem regravar `agenda_ocorrencia` e sem mudar `ocorrencias_em` (o front não relê os períodos).
- **`buscada_em`** = o instante em que a tentativa começou (gravado no fim dela). A tarefa busca as ativas com
  `buscada_em <= agora − 15 min` (ou nulo), a mais atrasada primeiro.
- **Erro inesperado na busca** (a busca lança, a leitura quebra, o banco falha): a agenda fica com `fora_do_ar` (busca)
  ou `nao_e_ical` (leitura), as ocorrências anteriores ficam, e a falha sobe já mascarada (`FalhaBuscaAgenda`): o
  `.catch(registrarFalhaMascarada('agenda busca'))` da rota a registra; a tarefa junta as falhas e termina com "1 de 2
  agendas falharam: …" em `tarefa_execucao.detalhe` (mascarado).
- **Tetos:** passar de 20.000 ocorrências na janela é o erro `teto_ocorrencias` (mantém as anteriores); passar de
  1.000 numa série corta a série e conta 1 em `contagens.avisos` (pesquisa-ical D14: "não passa do teto; aviso se
  cortar"). A contagem por série inclui 2 dias de folga antes da janela (a margem da expansão).
- **`PATCH` com `url`:** além de zerar `hash_conteudo`, zera `erro` (o erro era do endereço antigo). As ocorrências
  da última busca boa ficam até a busca nova terminar (o caso comum é o Google ter redefinido o endereço da mesma agenda).
  `ativa: true` numa pausada também busca de novo.
- **`POST …/atualizar`:** o `202` traz a agenda como estava (a busca roda depois). Busca já em andamento da mesma agenda
  não começa outra (a resposta é a mesma). O fim chega pelo SSE quando algo muda; quando nada muda (o mesmo feed), a
  tela de Configurações relê a lista a cada 2 s até a `buscadaEm` mudar (no máximo 75 s).
- **`GET …/eventos`:** `agendas` são sempre todas as ativas (mesmo com `agendaIds`, para a cor e o filtro);
  `agendaIds` desconhecido ou de agenda pausada não traz nada; até 50 ids.
- **Chave da ocorrência (`agenda_ocorrencia.chave`):** evento avulso = o `UID`; ocorrência de série (ou de evento com
  exceção ou RDATE) = `UID|<início original em UTC ISO>` (dia inteiro: `UID|AAAA-MM-DD`); `UID` com mais de 300
  caracteres vira `h:<sha256>`; VEVENT sem `UID` = `sem-uid:<posição>`.
- **Fuso:** a conversão pelo `Intl` guarda o desvio de cada bloco de 6 h quando ele não muda ali dentro (com 15 h de
  folga); perto de uma mudança de horário usa o algoritmo de 2 candidatos inteiro. Mesmos resultados, ~10× mais rápido
  (300 mil ocorrências em 1,9 s; 20 mil em ~0,13 s).
- **Mês na Agenda:** os externos do dia viram uma linha só depois dos prazos, fora do limite do "+N": com um evento, o
  próprio evento; com dois ou mais, "N eventos" (abre a lista do dia num popover; folha no celular). Na semana e no
  celular, os de dia inteiro (e os dias do meio de um evento de vários dias) no topo e o resto pelo horário, com as
  demandas sem hora no fim; sem externos, o dia fica exatamente como antes (o Calendário do quadro não passa `externos`).
- **`GradeCalendario`:** prop nova `rodapeDoDia?(dia, foco)`: uma linha no fim da célula, fora do limite do "+N"
  (só props novas, como permite o FASE2-PLANO §2).
- **Diálogo `agenda-evento`:** `MapaDialogos['agenda-evento'] = { evento: EventoAgendaExterna; agenda: { nome; cor } }`
  e o resultado `{ fechado: true }`, pelo `declare module` em `web/src/extensoes/dialogos/agenda-evento.tsx`.
- **localStorage do filtro:** `pauta:agenda-externa-desligadas` (lista de ids escondidos), a mesma na Agenda e no Início.
