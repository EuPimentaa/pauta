# Pedidos do F3 (painéis)

Pedidos a outros donos (PLANO §0, regra 1), esclarecimentos de contrato que o F3 precisou decidir e avisos. Nada aqui
bloqueia o merge: cada item tem um contorno local já no código do F3.

## Pedidos

| # | Para | Pedido | Contorno no F3 | Prioridade |
|---|---|---|---|---|
| 1 | F2 (ciclo) | As notificações do ciclo são do F2 (API §4.16 e §5.9): `versao_entregue` ao AM ao entregar; `aprovada` aos membros e ao AM na decisão aprovada (link, retorno manual, "Aprovado pelo WhatsApp"); `ajuste_pedido` aos membros e ao AM no ajuste do cliente e no ajuste interno. Sempre por `notificar()` do núcleo (nunca o próprio ator; `exceto` para não repetir a pessoa no mesmo fato), com `demandaId` (o sino monta o link `/d/:numero`). O sino já mostra os três tipos (ícone e rótulo "Versão entregue", "Aprovada", "Ajuste pedido"). Sugestão de resumo, no tom dos do núcleo e dos avisos de prazo: `Rafa entregou a V2 de #123 Carrossel HE`, `Fulana aprovou #123 Carrossel HE (V2)`, `Fulana pediu ajuste em #123 Carrossel HE: R2 até qua, 21/10`. Quando o ator é o cliente pelo link, `atorId` vem nulo e o sino desenha o ícone do tipo no lugar do avatar. | Testado com `notificar()` direto (`paineis-notificacoes.test.ts`, "tipos do ciclo…"). | **alta** (a `master` não vai à agência sem as notificações; o lado do F3 está pronto) |
| 2 | Integrador (API §4.18) | Registrar: "com o cliente há mais de N dias úteis" (`comClienteParado`) vale para o **atendimento e também para o admin** nas demandas em que ele é o AM (`atendimentoId` = eu). O texto atual diz "só para quem tem papel atendimento"; o admin pode tudo o que o atendimento pode (API §2) e, na Melt, o dono também atende clientes. A equipe nunca recebe o bloco. Na tela, o admin só vê o bloco quando há alguma; o atendimento sempre (com "Nenhuma peça parada com o cliente."). | Implementado assim (teste "só do meu atendimento; a equipe não recebe o bloco; o admin vê as que são dele como AM"). | média |
| 3 | NÚCLEO-WEB (`calendario/CalendarioDemandas.tsx`) | No celular a lista por dia diz "Nada neste período." e a Agenda precisa do texto da §4.1 ("Nenhuma demanda com prazo neste período."). Sugestão: prop `vazio?: string` (ou `null` para o host desenhar o próprio). Também no celular: com o mês inteiro, hoje pode ficar longe do topo; uma prop para rolar até hoje ajudaria. E na grade do desktop cada chip é uma parada do Tab (124 no mês de todos os quadros a 1440 px na auditoria): foco itinerante dentro da grade (setas entre os chips do dia) deixaria o Tab mais curto. | A Agenda mostra o próprio aviso acima do calendário e esconde o da lista com `.pnl-agenda .cal-lista-vazia { display: none }`; no celular abre em **semana** (o modo escolhido fica lembrado). | baixa |
| 4 | NÚCLEO-WEB (`api/horas.ts`) | `useApontamentos(c)` não aceita opções do TanStack (`enabled`). A tela `/horas` só precisa dos totais do mês para atendimento e admin. | Para a equipe, a consulta do mês repete a da semana (mesma chave, nenhum pedido a mais). | baixa |
| 5 | F5 (`web/src/telas/quadros/dev/`) | **Feito pelo F3 a pedido da INTEGRACAO-3A** ("ao entrar o Início, apagar a rota de DEV `/dev/cadastros-inicio`"): a pasta saiu neste branch (commit próprio, `0e310b2`). É o único arquivo fora do que o F3 possui no `git diff`. | — | — |

## Esclarecimentos de contrato (para a API.md)

- **§4.18 `GET /api/inicio`**: as listas são as de `shared/logica/paineis.ts` (`minhasPorPrazo`, `comClienteParado`,
  `resumoInicio`), as mesmas que o front calcula do bootstrap. Ordem dentro de cada grupo: prazo, hora (sem hora =
  18h), prioridade (urgente primeiro) e número; "sem prazo" por prioridade e número. "Esta semana" = de amanhã até o
  domingo desta semana (no domingo ela é vazia). A com o cliente sem prazo vai para "sem prazo". `resumo.comCliente` =
  as minhas abertas com a bola com o cliente. `extras` sai sempre vazio na prática (as minhas abertas de quadros ativos
  estão todas no bootstrap). `comClienteParado`: mais antigas primeiro (dias úteis desde o envio, senão desde a entrada
  na coluna `aguardando_cliente`).
- **§4.18 `GET /api/agenda`**: `quadroIds` e `campos` aceitam a chave repetida (`quadroIds=a&quadroIds=b`, como o
  `comConsulta` do front) ou separados por vírgula; `soMinhas` e `incluirConcluidas` aceitam `1`/`0`/`true`/`false`;
  `ate` antes de `de`, data inválida ou campo fora de `CAMPOS_AGENDA` → `400`. Quadro arquivado nos `quadroIds` não
  traz nada (só quadros ativos). `feriados` = os do intervalo.
- **§4.18 `GET /api/notificacoes`**: `limite` padrão 30, máximo 100 (`400` acima); `antesDe` = id (as mais antigas que
  ele); `proximo` = o id da última da página quando há mais. `naoLidas` é sempre o total da pessoa (não da página).
- **§4.18 `POST /api/notificacoes/lidas`**: marca só as minhas ainda não lidas; ids de outra pessoa são ignorados sem
  erro (`204`, não revela o que existe); até 500 `ids` por chamada; sem nada mudar, nenhum evento. Um evento
  `notificacao` (patch `lidaEm`, público `usuario`) por notificação marcada.
- **§5.9 avisos das 8h** (`server/src/tarefas/paineis-prazo.ts`): destinatários = membros **ativos**; sem nenhum ativo,
  o AM (se ativo). `prazo` sai para estado `hoje` (vence hoje e a hora ainda não passou); prazo de hoje com a hora já
  passada às 8h sai como `atrasada`. Resumos: `#123 Carrossel HE vence hoje, 18h` e
  `#123 Carrossel HE está atrasada desde qua, 15/10` (com a sigla do cliente, quando há). Como todo job, roda ao subir
  se perdeu o horário (servidor desligado às 8h ou deploy depois das 8h): nesse caso uma demanda que venceu às 18h do
  mesmo dia útil já sai como `atrasada`.

## Avisos para quem vem depois

- **Início:** as listas saem do bootstrap (o card entra e sai na hora, aqui e em outra janela) e `GET /api/inicio` só
  traz as menções (`['inicio']`). Seções novas entram por `extensoes/inicio` como sempre; as de id `paineis-cliente-parado`
  e `paineis-mencoes` vão para a coluna da direita no desktop largo, as outras (inclusive os Primeiros passos do F5) à
  esquerda, na ordem.
- **Sino:** `['notificacoes']` guarda `ListarNotificacoesSaida` com a primeira página e as mais antigas que a pessoa
  pediu (uma lista só). Quem criar notificação não precisa fazer nada no front: o tratador do F3 põe no sino e, se for
  `mencao`, nas menções do Início. `funcionalidades/paineis/cache.ts` (tratador) e `logica.ts` são testáveis no Node
  (imports relativos).
- **Diálogo `notificacoes`:** sem âncora abre como modal (paleta); com âncora, popover no desktop e folha no celular.
- **Agenda:** estado na URL (`?modo=semana&data=AAAA-MM-DD&minhas=1&quadros=<id>,<id>&campos=prazo,inicio`); o modo e o
  "Só as minhas" ficam lembrados no navegador. Com "Só as minhas", a faixa "Sem prazo" deixa arrastar as minhas sem
  prazo para um dia. Atalhos do escopo `agenda`: Shift+←/→ e Shift+T.
- **Horas:** `?semana=AAAA-MM-DD&pessoa=<id>&mes=AAAA-MM` (pessoa só para o admin). O cronômetro ligado ou parado nesta
  janela relê a lista (o eco não chega pelo tempo real).
- **Atalhos ocupados pelo F3:** G I, G A, G H (global); Shift+←, Shift+→, Shift+T (agenda).
- **Comandos da paleta:** Ir para a Agenda (20), Ir para as Horas (30); Ver notificações (100) e Marcar as notificações
  como lidas (110, só com não lidas).
