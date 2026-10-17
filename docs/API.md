# API

Contrato HTTP do servidor para o **modelo de quadros separados por equipe** (`docs/ADAPTACOES.md`, decisões 4 e 5).
Tipos citados (`MoverEntrada`, `Demanda`...) estão em `shared/tipos/` e são a fonte da verdade dos formatos; este
documento diz **quem pode, o que acontece, que erro sai e que evento é emitido**. Banco: `server/migracoes/001_base.sql`.
Plano de construção e donos de cada rota: `docs/PLANO.md`.

Sumário: [1 Convenções](#1-convenções) · [2 Permissões](#2-permissões) · [3 Tempo real](#3-tempo-real) ·
[4 Endpoints](#4-endpoints) · [5 Regras transversais](#5-regras-transversais) · [6 Textos para WhatsApp](#6-textos-para-whatsapp)

---

## 1. Convenções

- **Base:** tudo sob `/api`. JSON em camelCase (o banco é snake_case; o servidor converte).
- **Sessão:** cookie `__Host-sid` em produção (httpOnly, Secure, SameSite=Lax, `Path=/`, sem `Domain`: um subdomínio
  irmão não consegue plantá-lo) e `sid` em desenvolvimento; 30 dias deslizantes. Valor = `randomBytes(32)` em
  base64url; o banco guarda só o sha256. Convite, redefinição e link público usam a mesma entropia e o mesmo hash.
  Junto vai a **dica** `pauta_sessao=1` (não é segredo, sem httpOnly, mesma validade): o login e o convite a põem, o
  logout a tira e o index.html servido pelo Node a acerta com a sessão de verdade; sem ela, o app em produção vai direto
  para /entrar sem pedir o bootstrap (o 401 esperado não suja o console). Integração 3A.
  `exigirUsuario` confere em **toda** requisição: sessão com `revogada_em` nulo e `expira_em > agora`, e `usuario.ativo = 1`.
  Sem sessão válida: `401 nao_autenticado`. Rotas sem sessão: `GET /api/saude`, `POST /api/auth/login`,
  `POST /api/auth/convite/consultar`, `POST /api/auth/convite`, `POST /api/auth/redefinicao/consultar`,
  `POST /api/auth/redefinicao`, `/api/publico/*`.
- **Anti-CSRF:** toda mutação (POST, PATCH, PUT, DELETE), inclusive login e página pública, exige o header
  `X-Trace-Id` (uuid v4 gerado pelo navegador por mutação) e `Origin` igual a `APP_URL`. Falta ou diferença:
  `403 csrf`. O `X-Trace-Id` volta no evento SSE (`t`) para o navegador ignorar o próprio eco e vai para `atividade.trace_id`.
- **IP do cliente** (`Ator.ip`, limites, `ip_hmac`): em produção a Cloudflare fica na frente do Traefik do EasyPanel,
  então `TRUST_PROXY_HOPS=2` (env; 1 só com o Traefik; 0 em desenvolvimento). Com N > 0, o IP é o N-ésimo item **a
  partir do fim** de `X-Forwarded-For` (com 2, o penúltimo: o IP do visitante que a Cloudflare acrescentou; o último é o
  da Cloudflare, que o Traefik acrescentou); nunca o primeiro, que o cliente forja. Sem o header (ou N = 0): o
  endereço do socket.
- **Limite de corpo:** `bodyLimit` (`hono/body-limit`) antes de qualquer parse, recusando pelo `Content-Length` sem
  interpretar o corpo: `POST /api/arquivos` até 10 MiB + 64 KiB (`413 arquivo_grande`); o resto de `/api`, 1 MiB (`413 corpo_grande`).
  No upload recusado, o servidor lê e descarta o corpo (até 64 MB e 30 s, `drenarCorpo`) antes de responder: o
  navegador só lê a resposta depois de mandar tudo e, com a conexão derrubada no meio, via "conexão caiu" em vez do 413.
  O front confere `config.uploadLimiteBytes` antes de enviar (`enviarArquivo`).
- **Cabeçalhos** (produção, no HTML e na API): `Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com;
  frame-src https://drive.google.com https://www.youtube-nocookie.com https://www.figma.com; connect-src 'self';
  font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
  `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer` no HTML de `/a/*`, `/convite` e `/redefinir` e em
  `/api/publico/*`, `same-origin` no resto. (`'unsafe-inline'` só em estilo: o sonner e o TipTap injetam `<style>`;
  scripts continuam só `'self'` e o DOMPurify não deixa passar `style`.)
- **Logs:** caminhos `/a/*`, `/api/publico/*`, `/api/auth/convite*` e `/api/auth/redefinicao*` saem mascarados; corpo de
  rota de auth nunca vai ao log.
- **Concorrência:** `PATCH /api/demandas/:id` exige `If-Match: <rev>`. Diferente do atual: `409 conflito_rev` com
  `detalhes.atual: ConflitoRevDetalhes` (demanda + descrição, para mesclar campo a campo). O `rev` sobe só com os
  campos do PATCH (gatilho `demanda_rev`): arrastar, concluir, membros, etiquetas, comentários e contadores **não**
  geram conflito em quem está editando o título. `POST /mover` aceita `rev` opcional com a mesma regra. Membros e
  etiquetas são conjuntos (adicionar/tirar um por vez), sem perda entre duas pessoas.
- **Idempotência:** `POST /api/publico/a/:token/decisao` exige `Idempotency-Key` (uuid). A chave vale **por link**
  (`aprovacao_idem_uk`) e é procurada antes de qualquer validação: mesma chave e mesmo pedido → `200` com o estado
  atual, sem efeito novo; mesma chave com outro pedido → `422 idempotencia` (§4.17).
- **Transação:** toda mutação roda em `BEGIN IMMEDIATE ... COMMIT`, grava `atividade` e as linhas de `evento` na mesma
  transação; o barramento entrega aos SSE abertos depois do commit. Instantes gravados vêm de `agora()` (`src/db.ts`).
- **Respostas de mutação** trazem o objeto atualizado (o navegador aplica sem esperar o SSE).
- **Datas:** instantes em ISO 8601 UTC (`Instante`); datas e horas locais de São Paulo em `YYYY-MM-DD` e `HH:MM`.
  Prazo sem hora = 18:00 (`prazoHoraPadrao`). A semana começa na segunda.
- **Listas paginadas:** `?cursor=&limite=` (padrão 50, máximo 200) e resposta `Pagina<T>` (`proximo` opaco).
- **Erro:** sempre `ErroApi` = `{ "erro": { "codigo", "mensagem", "detalhes"? } }`. A `mensagem` é em português,
  pronta para o aviso ("Você não tem acesso a esta ação." + o motivo). Erros de gatilho do SQLite viram o código da
  tabela abaixo, nunca 500: `coluna_com_demandas`, `quadro_com_historico`, `cliente_fixo_apos_envio`,
  `anexo_e_evidencia`, `anexo_e_capa` → `409 conflito`; `destino_arquivado`, `concluida_sem_data` → `422 estado_invalido`;
  `arquivo_no_lixo`, `demanda_de_outro_cliente`, `contato_de_outro_cliente`, `capa_nao_e_imagem` → `400 validacao`.

| Status | `codigo` | Quando |
|---|---|---|
| 400 | `validacao` | zod recusou corpo ou consulta; ids de outro quadro; `detalhes.campos: { caminho: mensagem }` |
| 401 | `nao_autenticado`, `credenciais_invalidas` | sem sessão; login errado (sem dizer qual dos dois) |
| 403 | `csrf`, `sem_permissao`, `campo_nao_permitido`, `previa_interna` | ver acima; o papel não permite; campo só do atendimento (`detalhes.campo`); decisão pela página pública com sessão interna no cookie (§4.17) |
| 404 | `nao_encontrado` | não existe ou foi excluída (anonimizada) |
| 409 | `conflito_rev`, `versao_desatualizada`, `ja_decidida`, `conflito` | ver cada rota |
| 410 | `link_inativo`, `token_invalido` | link público expirado/revogado; convite ou redefinição usado/revogado/expirado ou de pessoa inativa |
| 413 / 415 | `arquivo_grande`, `corpo_grande` / `tipo_arquivo` | upload acima de 10 MB, JSON acima de 1 MiB / magic number fora da lista |
| 422 | `estado_invalido`, `senha_fraca`, `drive_privado`, `idempotencia` | a ação não vale no estado atual; senha fraca; Drive privado; chave repetida com outro pedido |
| 429 | `muitas_tentativas` | login e troca de senha (§4.2), página pública (§4.17); `detalhes.tenteEmSegundos` |
| 500 | `interno` | registrado no log com o trace |

Notação usada nas rotas: **SSE** lista os eventos gravados (`entidade` e público: *interno* = todos os usuários
ativos; *gestão* = atendimento e admin; *usuário* = só o dono; *dono+admin*). **Atividade** é o `tipo` gravado em
`atividade`. **Notifica** são as linhas de `notificacao` criadas (§5.9). O **dono** de cada rota (agente do
`docs/PLANO.md`) vem no título da seção: núcleo, modal (F1), ciclo (F2), painéis (F3), entrada (F4), cadastros (F5).

## 2. Permissões

Papéis: `admin`, `atendimento`, `equipe` (`shared/tipos/nucleo.ts`). **Admin pode tudo.** Todo mundo da agência
**vê** todos os quadros, demandas e clientes (transparência); o cliente vê só o que foi enviado pelo link.

| Ação | admin | atendimento | equipe |
|---|---|---|---|
| Pessoas e convites, equipes, feriados, configuração da aplicação | sim | não | não |
| Quadro: criar, copiar, renomear, mudar slug/equipe/fundo, arquivar, restaurar, excluir | sim | não | não |
| Colunas (criar, renomear, cor, papel, pessoa, limite WIP, ordenar, arrastar, arquivar, mover/arquivar todos os cards) | sim | sim | sim |
| Etiquetas do quadro (criar, editar, excluir); modelos de demanda **do quadro** | sim | sim | sim |
| Modelos de demanda **globais**; "Revisei os modelos" | sim | não | não |
| Automações do quadro | sim | sim | não |
| Estrela e Seguir (para si) | sim | sim | sim |
| Demandas: criar, editar, mover (inclusive entre quadros), membros, etiquetas, concluir, copiar, arquivar, restaurar, checklists, anexos, comentários, cronômetro e lançar tempo | sim | sim | sim |
| Campos `atendimentoId` e `rodadasInclusas` (`CAMPOS_SO_ATENDIMENTO`) ao criar, editar e copiar | sim | sim | `403 campo_nao_permitido` |
| Entregar versão | sim | sim | só sendo membro (ou o AM) da demanda |
| Editar versão, acrescentar itens (`versao.editar`) | sim | sim | só o autor da versão |
| Enviar ao cliente, registrar retorno, aprovado pelo WhatsApp, anular aprovação, ajuste interno, marcar extra, links públicos, texto para WhatsApp | sim | sim | não |
| Comentário "Visível ao cliente" | sim | sim | não |
| Editar comentário (`comentario.editar`) / excluir (`comentario.excluir`) | excluir de qualquer um | o próprio | o próprio |
| Excluir anexo (`anexo.excluir`; o de evidência nunca sai) | sim | sim | só quem enviou |
| Apagar checklist de rodada "Ajustes R2" (`checklist_rodada.excluir`) | sim | sim | não |
| Renomear o checklist de rodada e acrescentar, reescrever ou tirar itens dele (`checklist_rodada.editar`; marcar e reordenar são livres) | sim | sim | não |
| Editar e excluir apontamento (`apontamento.editar`) | sim | o próprio | o próprio |
| Clientes: criar | sim | sim | só sigla e nome (`CAMPOS_CLIENTE_EQUIPE`; nasce com a pendência `sem_am`) |
| Clientes: editar (dados, apelidos, responsáveis, contatos, links) | todos | os da carteira (`atendimentoId` = eu) e os sem AM | não |
| Horas de outra pessoa | sim | não (só o total por cliente e mês, §4.20) | não |
| Excluir (anonimizar) demanda | sim | não | não |

Toda regra de papel fica em `server/src/servicos/permissoes.ts` (usa `shared/logica/permissoes.ts`, com a lista
`AcaoPermissao` do `docs/PLANO.md` §1.1.2, que o front usa para esconder o que não pode). Negado: `403 sem_permissao`
com o motivo ("Só o atendimento envia ao cliente."). Nenhuma rota decide papel fora desse módulo.

## 3. Tempo real

### `GET /api/eventos` (SSE) · núcleo
- **Quem:** qualquer usuário com sessão. Headers da resposta: `Content-Type: text/event-stream`, `Cache-Control:
  no-cache`, `X-Accel-Buffering: no`. Começa com `retry: 1000`.
- **Retomada:** `Last-Event-ID` (o navegador manda sozinho) ou `?desde=<seq>` na primeira conexão (o `seq` do bootstrap).
  Com `atual = SELECT seq FROM sqlite_sequence WHERE name = 'evento'` (0 se não houver) e `menor = min(seq)` da tabela:
  - `desde > atual` → `event: resync` (`servidor_reiniciado`: backup restaurado ou banco novo) e segue ao vivo;
  - `desde < atual` e (tabela vazia ou `desde < menor − 1`) → `event: resync` (`historico_podado`) e segue ao vivo;
  - senão reenvia `seq > desde` da tabela, em ordem, e passa ao barramento ao vivo sem buraco.
  A poda diária (7 dias) nunca apaga o último evento.
- **Mensagens:** `id: <seq>` + `event: d` + `data: EventoTempoReal`; `event: ping` a cada 25 s (`EventoPing`), quando o
  servidor revalida a sessão: sessão revogada ou pessoa desativada → fecha; papel mudou → `event: resync`
  (`motivo: 'papel_alterado'`).
- **Filtro de público** (igual em `/api/eventos`, `/api/sync` e `/api/bootstrap`): `interno` → todos; `gestao` →
  atendimento e admin (`link_publico`); `usuario` → só `usuario_id` (`notificacao`, `quadro_usuario`);
  `usuario_admin` → `usuario_id` e admins (`apontamento`); `admin` → admins.
- **Patch:** `p` traz o objeto inteiro quando `c` é nulo e só os campos de `c` numa alteração. `d` = demanda dona.
  O navegador aplica por `e`/`op` no cache do TanStack Query (os tratadores ficam em `web/src/extensoes/eventos`).
  - **Objeto inteiro também quando a demanda entra no conjunto do bootstrap** (criação, restaurar, desmarcar uma
    concluída antiga): as outras janelas não a têm. O tratador ignora patch parcial de id desconhecido.
  - Mudança de descrição sai como patch de `descricaoAtualizadaEm`: o tratador invalida `['demanda', numero]` (o texto
    não viaja no evento).
  - Membros e etiquetas viajam como `membroIds` e `etiquetaIds` da `demanda` (a lista inteira).
  - **Quadro arquivado** (`quadro` com `arquivadoEm` preenchido): o navegador tira do cache as colunas, etiquetas e
    demandas dele. **Quadro restaurado** (`arquivadoEm` volta a nulo): o tratador recarrega o bootstrap.
  - **Configuração** (`config`, id `app`, público `interno`): sempre o objeto inteiro (`ConfigApp`), emitido pelo
    `PATCH /api/config/app` com alguma mudança e pelo "Revisei os modelos"; o tratador troca `['bootstrap'].config`.

### `GET /api/sync?desde=N` · núcleo
Alternativa ao SSE (polling 5 s → 60 s com backoff). Resposta `SyncSaida`: até 500 eventos `seq > N` com o mesmo filtro;
`resync: true` nas mesmas condições da retomada acima.

### `GET /api/bootstrap` · núcleo
- **Quem:** usuário com sessão. **Resposta:** `Bootstrap`.
- `seq` é lido **antes** das consultas (na mesma transação de leitura), então nada se perde entre o bootstrap e o SSE.
- Quadros ativos com as colunas ativas, as etiquetas e as automações; modelos de quadro (com as automações
  sugeridas); modelos de demanda ativos (globais e dos quadros ativos); `eu.favoritos`, `eu.seguindo` e
  `eu.cronometro`. Demandas: `excluido_em IS NULL AND arquivado_em IS NULL AND quadro ativo AND (concluida_em IS NULL
  OR concluida_em > agora − quadroConcluidasDias)`, com `etiquetaIds` = só as linhas de `demanda_etiqueta` do quadro
  atual da demanda (§5.6). Feriados: ano corrente e o próximo.
- Meta: menos de 1 s com 500 demandas em 8 quadros.

## 4. Endpoints

`:id` é sempre o id (uuid ou slug do seed); `:numero` é o número humano da demanda (#123).

### 4.1 Saúde · núcleo

#### `GET /api/saude`
Público. `200 { ok: true, versao }`. Usado pelo health check do EasyPanel.

### 4.2 Autenticação e sessão · núcleo

#### `POST /api/auth/login`
- **Corpo:** `LoginEntrada`. **Resposta:** `200 Eu` + cookie de sessão (§1).
- **Erros:** `401 credenciais_invalidas` (e-mail inexistente, senha errada, pessoa sem senha ou inativa: mesma
  mensagem e mesmo tempo, porque sem usuário o scrypt roda contra um hash fictício), `429 muitas_tentativas`.
- **Limites** (falhas em `login_tentativa` com `tipo='login'`, somados; o primeiro que estourar responde 429 com espera
  progressiva): e-mail+IP 5 em 15 min; e-mail 20 em 1 h; IP 50 em 15 min. A tentativa é **reservada** antes do
  scrypt (conferir o limite e gravar a linha com `ok = 0` na mesma transação; no acerto, `ok = 1`): numa rajada em
  paralelo as tentativas em andamento já contam, e a 6ª do mesmo e-mail+IP leva 429 mesmo com a senha certa.
  Atualiza `usuario.ultimo_acesso_em`.

#### `POST /api/auth/logout`
Revoga a sessão atual e apaga o cookie. `204`.

#### `GET /api/auth/eu`
`200 Eu` ou `401`. Renova a validade da sessão (deslizante).

#### `PATCH /api/auth/eu`
- **Corpo:** `EditarEuEntrada` (nome, apelido, cor, prefs; prefs é mesclado). **Resposta:** `200 Eu`.
- **Erros:** `409 conflito` apelido já usado por pessoa ativa. **SSE:** `usuario` (interno) se nome/apelido/cor mudaram.

#### `POST /api/auth/senha`
- **Corpo:** `TrocarSenhaEntrada`. **Resposta:** `204`. Revoga as outras sessões da pessoa e os links de convite e
  redefinição pendentes.
- **Erros:** `401 credenciais_invalidas` (senha atual), `422 senha_fraca` (menos de 10 caracteres ou na lista de óbvias),
  `429 muitas_tentativas` (5 falhas em 15 min por pessoa; `login_tentativa` com `tipo='senha'`, reservada antes do
  scrypt como no login).

O link de convite e o de redefinição levam o token no **fragmento** (`/convite#<token>`, `/redefinir#<token>`): o
navegador não o envia ao servidor nem ao `Referer`, e ele não cai em log. A tela lê `location.hash`, apaga o fragmento
com `history.replaceState` e manda o token no corpo.

#### `POST /api/auth/convite/consultar` e `POST /api/auth/redefinicao/consultar`
Públicos. **Corpo:** `TokenEntrada`. `200 TokenAcessoInfo` (com a cor da pessoa, para o avatar). Não consomem o
token. `410 token_invalido` se usado, revogado, expirado, de pessoa inativa ou, no convite, de quem já definiu a senha
(`senha_definida_em` preenchido). Limite: o do login por IP.

#### `POST /api/auth/convite` e `POST /api/auth/redefinicao`
- Públicos. **Corpo:** `DefinirSenhaEntrada`. **Resposta:** `200 Eu` + cookie (já entra).
- Consome numa transação: `UPDATE token_acesso SET usado_em = ? WHERE token_hash = ? AND finalidade = ? AND usado_em IS
  NULL AND revogado_em IS NULL AND expira_em > ?`, exigindo `changes = 1` e `usuario.ativo = 1`; grava `senha_hash`
  (scrypt) e `senha_definida_em`; o convite exige ainda `senha_definida_em` nulo. Na mesma transação revoga os outros
  links pendentes da pessoa (as duas finalidades). A redefinição revoga todas as sessões anteriores.
- **Erros:** `410 token_invalido` (inclusive pessoa inativa e convite de quem já tem senha), `422 senha_fraca`.

### 4.3 Pessoas · núcleo (telas em cadastros)

#### `GET /api/pessoas`
Admin. `200 Usuario[]` (com e-mail e convite pendente). Os outros papéis usam `bootstrap.usuarios`.

**Entrar numa equipe** (aqui, no `PATCH` e em `PUT /api/equipes/:id/membros`), na mesma transação:
- a pessoa passa a **seguir os quadros ativos da equipe** (`quadro_usuario.seguindo = 1`);
- ganha a **própria coluna** em cada quadro ativo da equipe com `colunaPorMembro` onde ainda não tem coluna ativa:
  nome = apelido ou primeiro nome, cor = a da pessoa, papel `normal`, `responsavelId` = ela, posição logo depois da
  última coluna com responsável (sem nenhuma, logo depois da coluna de entrada). Sair da equipe ou ser desativada não
  arquiva a coluna (alguém move os cards e arquiva).

#### `POST /api/pessoas`
- **Quem:** admin. **Corpo:** `CriarPessoaEntrada`. **Resposta:** `201 CriarPessoaSaida` (com o link de convite, 7 dias).
- Equipes: "Entrar numa equipe" acima.
- **Erros:** `409 conflito` e-mail ou apelido já usado. **SSE:** `usuario`, `equipe`, `coluna` (as criadas) (interno);
  `quadro_usuario` (usuário).

#### `PATCH /api/pessoas/:id`
- **Quem:** admin. **Corpo:** `EditarPessoaEntrada` (`equipes` substitui as participações; equipe nova = "Entrar numa
  equipe" acima; sair da equipe não deixa de seguir). **Resposta:** `200 Usuario`.
- Mudar `papel` ou `ativo=false` revoga as sessões, fecha o SSE da pessoa e manda `resync` aos SSE dela. Desativar
  ou trocar o `email` também marca `revogado_em` em todos os tokens pendentes, na mesma transação. Desativar para o
  cronômetro dela (gravando os minutos) e não mexe nas demandas: ela continua membro até alguém tirar.
- **Erros:** `409 conflito` (e-mail/apelido repetido, ou desativar/rebaixar o último admin). **SSE:** `usuario`,
  `equipe`, `coluna` (as criadas).

#### `POST /api/pessoas/:id/convite`
- **Quem:** admin. Só para quem ainda não definiu senha e está ativo (`409 conflito` se já tem senha ou está inativo).
  Revoga os links pendentes da pessoa (convite e redefinição) na mesma transação. **Resposta:** `200 LinkAcesso`.

#### `POST /api/pessoas/:id/redefinicao`
- **Quem:** admin. Link de redefinição de 1 h (revoga a redefinição anterior **e o convite pendente**: nunca há dois links
  que trocam a senha da mesma pessoa). Pessoa inativa → `409 conflito`. **Resposta:** `200 LinkAcesso`.

### 4.4 Equipes · núcleo

#### `GET /api/equipes`
Qualquer usuário. `200 Equipe[]` (também vem no bootstrap).

#### `POST /api/equipes` · `PATCH /api/equipes/:id`
- **Quem:** admin. **Corpo:** `CriarEquipeEntrada` / `EditarEquipeEntrada`. **Resposta:** `201`/`200 Equipe`.
- `modeloQuadroId` é só a sugestão dos Primeiros passos. **Erros:** `409 conflito` nome/slug. **SSE:** `equipe`.

#### `PUT /api/equipes/:id/membros`
- **Quem:** admin. **Corpo:** `DefinirMembrosEntrada` (substitui). **Resposta:** `200 Equipe`.
- Quem entra: "Entrar numa equipe" (§4.3: segue os quadros e ganha a coluna). **SSE:** `equipe`, `usuario` de quem
  entrou ou saiu, `coluna` (as criadas) (interno); `quadro_usuario` (usuário).

### 4.5 Quadros · núcleo

#### `GET /api/quadros?arquivados=1`
Qualquer usuário. `200 Quadro[]`: sem o parâmetro, os ativos (que também vêm no bootstrap); com `arquivados=1`, só os
arquivados (Configurações → "Quadros arquivados").

#### `GET /api/quadros/:id`
Qualquer usuário. `200 QuadroCompleto` (inclusive de quadro arquivado; colunas arquivadas com `arquivadaEm`).

#### `POST /api/quadros`
- **Quem:** admin. **Corpo:** `CriarQuadroEntrada`. **Resposta:** `201 QuadroCompleto`.
- Slug: o enviado ou gerado do nome (minúsculo, sem acento, hífens; `-2`, `-3` se repetir). Colunas (§5.10 para as
  posições): `colunas` se vier (a tela manda as das pessoas já expandidas, com `responsavelId`, e a `modeloColunaId`
  de cada coluna que veio do modelo); senão as do `modeloQuadroId`, com a coluna `porMembro` virando uma coluna por
  membro ativo da equipe (principal primeiro, depois por nome; nome = apelido ou primeiro nome, cor = cor da pessoa,
  `responsavelId` = a pessoa); sem modelo nem colunas, o quadro nasce vazio. `responsavelId` repetido ou de pessoa
  inativa → `400 validacao`.
- `colunaPorMembro` (padrão: o modelo tem coluna `porMembro` e `colunas` não veio, ou alguma coluna do corpo tem
  `responsavelId`): quem entrar na equipe depois ganha a própria coluna (§4.3). Equipe ainda sem membros: o quadro
  nasce só com as outras colunas e a flag ligada (a tela "Criar os quadros das equipes" avisa).
- **Automações do modelo** (`ModeloQuadro.automacoes`, ex.: Kanban simples → enviado ao cliente › Com o cliente,
  ajuste › Fazendo): criadas para a coluna de destino que nasceu (pela `modeloColunaId` quando vier `colunas`); se o
  admin desmarcou a coluna, a automação não nasce.
- Com equipe e `membrosDaEquipeSeguem !== false`, os membros ativos da equipe passam a seguir. É assim que os
  **Primeiros passos** criam os quadros das equipes (uma chamada por equipe, com as colunas sugeridas que o admin
  desmarcou ou renomeou).
- **Erros:** `409 conflito` nome de quadro ativo ou slug repetido; `400 validacao` modelo ou equipe inexistentes.
- **SSE:** `quadro`, `coluna` (cada), `automacao` (cada), `quadro_usuario` (usuário, cada seguidor).

#### `POST /api/quadros/:id/copiar`
- **Quem:** admin. **Corpo:** `CopiarQuadroEntrada` (nome, slug, equipe, cor, fundo...). **Resposta:** `201 QuadroCompleto`.
- Copia do quadro de origem (ativo ou arquivado): as colunas ativas na mesma ordem (nome, cor, papel, limite WIP,
  `responsavelId` das pessoas ainda ativas), `colunaPorMembro`, as etiquetas, as automações (as que apontam para uma
  coluna do próprio quadro passam a apontar para a coluna copiada; as que levam a outro quadro continuam iguais) e os
  modelos de demanda ativos do quadro (com itens e etiquetas). Não copia cards, estrelas nem seguidores (os membros
  da equipe do quadro novo passam a seguir, como no `POST`).
- **Erros:** `409 conflito` nome ou slug. **SSE:** os do `POST`, mais `etiqueta` e `modelo_demanda` (cada).

#### `PATCH /api/quadros/:id`
- **Quem:** admin. **Corpo:** `EditarQuadroEntrada` (nome, slug, descrição, cor, fundo, equipe, `colunaPorMembro`,
  posição no menu). **Resposta:** `200 Quadro`. Mudar o slug quebra links antigos (a tela avisa). **Erros:** `409
  conflito`. **SSE:** `quadro`.

#### `POST /api/quadros/:id/arquivar` · `POST /api/quadros/:id/restaurar`
- **Quem:** admin. **Resposta:** `200 Quadro` / `200 QuadroCompleto`.
- Arquivar não mexe nas demandas: elas saem do bootstrap, do Início, da Agenda e da busca padrão junto com o quadro e
  voltam ao restaurar. Arquivar **desliga** (`ativa = 0`) as automações de outros quadros que apontam para ele.
  Cronômetros ligados em demandas dele são parados. Restaurar com nome igual ao de um quadro ativo → `409 conflito`.
- **SSE:** `quadro` (o navegador limpa ou recarrega, §3), `automacao` (as desligadas).

#### `DELETE /api/quadros/:id`
- **Quem:** admin. **Resposta:** `204`. Só se o quadro **nunca teve demanda** (nem arquivada, nem de passagem: gatilho
  `quadro_com_historico` → `409 conflito` "Este quadro já teve demandas. Arquive em vez de excluir."). Leva junto
  colunas, etiquetas, estrelas, automações (as dele e as que apontavam para ele) e modelos do quadro.
- **SSE:** `quadro`, `coluna`, `etiqueta`, `automacao`, `modelo_demanda` (delete, interno).

#### `PUT /api/quadros/:id/favorito` · `PUT /api/quadros/:id/seguir`
- **Quem:** qualquer usuário, para si. **Corpo:** `FavoritoEntrada` (estrela e ordem entre os favoritos; arrastar no
  menu) / `SeguirEntrada`. **Resposta:** `200 QuadroUsuario`. Sem estrela e sem seguir, a linha é apagada.
- **SSE:** `quadro_usuario` (usuário).

### 4.6 Colunas · núcleo

**Cards da coluna** (contador, limite WIP, ordenar, mover todos, arquivar todos e "coluna vazia"): `arquivado_em IS
NULL AND (concluida_em IS NULL OR concluida_em > agora − quadroConcluidasDias)`, o mesmo conjunto que o quadro mostra.
As concluídas antigas já saíram do quadro e estão no Arquivo; nenhuma ação em lote as reabre.

**Coluna de pessoa** (`responsavelId`): só papel `normal`; uma por pessoa ativa entre as colunas ativas do quadro
(índice `coluna_responsavel_uk`; repetida → `409 conflito`); pessoa inativa → `400 validacao`. Soltar card nela
reatribui (§5.1, passo 6).

#### `POST /api/quadros/:id/colunas`
- **Quem:** qualquer usuário. **Corpo:** `CriarColunaEntrada` (padrão: no fim). **Resposta:** `201 Coluna`.
- **Erros:** `422 estado_invalido` quadro arquivado; `responsavelId` acima. **SSE:** `coluna`.

#### `PATCH /api/colunas/:id`
- **Quem:** qualquer usuário. **Corpo:** `EditarColunaEntrada` (nome, cor, papel, pessoa, limite WIP, posição =
  arrastar coluna). **Resposta:** `200 EditarColunaSaida`.
- Virar `concluida` conclui na mesma transação as demandas abertas da coluna, **sem** criar repetições
  (`concluidas` na resposta; atividade `demanda.concluida` com `via: 'papel'`). Deixar de ser `concluida` não
  desmarca ninguém. Papel diferente de `normal` com pessoa → `400 validacao` ("Tire a pessoa da coluna antes").
  Pôr ou trocar a pessoa não mexe nos membros dos cards que já estão nela.
- **SSE:** `coluna`; `demanda` (`concluidaEm`, `concluidaPor`) das concluídas.

#### `POST /api/colunas/:id/arquivar` · `POST /api/colunas/:id/restaurar`
- **Quem:** qualquer usuário. **Resposta:** `200 ArquivarColunaSaida` / `200 Coluna` (restaurada no fim do quadro).
- Arquivar só sem cards da coluna: com card → `409 conflito` "Mova ou arquive os cards antes". Na mesma transação,
  antes de arquivar, arquiva as concluídas antigas que ainda apontam para ela (`concluidasArquivadas`; o gatilho
  `coluna_arquivar_vazia` conta toda demanda não arquivada). Desliga as automações que apontam para ela
  (`automacoesDesligadas`). Restaurar em quadro arquivado → `422`; restaurar coluna de pessoa que já tem outra coluna
  ativa no quadro → restaura sem a pessoa.
- **SSE:** `coluna`, `automacao`, `demanda` (`arquivadoEm`) das concluídas antigas.

#### `POST /api/colunas/:id/mover-cards`
- **Quem:** qualquer usuário. **Corpo:** `MoverCardsEntrada` (destino em qualquer quadro ativo; `etiquetasSemPar` e
  `membros` quando muda de quadro). **Resposta:** `200 MoverCardsSaida`. Cada card da coluna passa por `mover()` (§5.1)
  na ordem atual, para o fim do destino, com `via: 'coluna'`.
- **SSE/Atividade/Notifica:** os de `mover()`, um por demanda.

#### `POST /api/colunas/:id/arquivar-cards`
- **Quem:** qualquer usuário. **Resposta:** `200 ArquivarCardsSaida`. Como `POST /api/demandas/:id/arquivar`, um por
  card da coluna.

#### `POST /api/colunas/:id/ordenar`
- **Quem:** qualquer usuário. **Corpo:** `OrdenarColunaEntrada` (`prazo`: sem prazo por último; `prioridade`: urgente
  primeiro; `criacao`; `titulo`; `cliente`: sigla). Grava as posições dos cards da coluna de uma vez (passo 1024),
  como o "Ordenar por" do Trello. **Resposta:** `200 OrdenarColunaSaida`. **SSE:** `demanda` (`posicao`) de cada card.

### 4.7 Etiquetas · núcleo

#### `POST /api/quadros/:id/etiquetas` · `PATCH /api/etiquetas/:id`
- **Quem:** qualquer usuário. **Corpo:** `CriarEtiquetaEntrada` / `EditarEtiquetaEntrada`. **Resposta:** `201`/`200 Etiqueta`.
- Nome é opcional (etiqueta só de cor). **Erros:** `409 conflito` nome repetido no quadro (sem caixa). **SSE:** `etiqueta`.

#### `DELETE /api/etiquetas/:id`
- **Quem:** qualquer usuário. **Resposta:** `204`. Sai de todas as demandas (cascade), inclusive das que a guardam
  estando em outro quadro (§5.6). Modelos com etiqueta padrão de mesmo nome continuam (recriam a etiqueta na próxima
  aplicação). **SSE:** `etiqueta` (delete); `demanda` (`etiquetaIds`) de cada demanda afetada que está no quadro.

### 4.8 Automações do quadro · ciclo

#### `PUT /api/quadros/:id/automacoes/:gatilho`
- **Quem:** admin, atendimento. `:gatilho` ∈ `GATILHOS_AUTOMACAO`. **Corpo:** `DefinirAutomacaoEntrada` (destino e
  `membros`: `manter` ou `responsavel_destino`). **Resposta:** `200 AutomacaoQuadro`. O destino é uma coluna ativa de
  qualquer quadro ativo (o quadro de destino é o dela); senão `400 validacao`. Execução: §5.5.
- **SSE:** `automacao` (interno).

#### `DELETE /api/quadros/:id/automacoes/:gatilho`
- **Quem:** admin, atendimento. **Resposta:** `204` (também sem automação: idempotente). Quadro arquivado → `422`;
  desconhecido → `404`. **SSE:** `automacao` (delete).

### 4.9 Modelos de demanda · entrada

#### `GET /api/modelos-demanda?inativos=1`
Qualquer usuário. `200 ModeloDemanda[]` (com `inativos=1`, inclusive os desativados, para a tela de modelos). Os
ativos também vêm no bootstrap.

#### `POST /api/modelos-demanda` · `PATCH /api/modelos-demanda/:id`
- **Quem:** global (`quadroId` nulo): admin; de um quadro: qualquer usuário. **Corpo:** `CriarModeloDemandaEntrada` /
  `EditarModeloDemandaEntrada` (`itens` e `etiquetas` substituem as listas). "Excluir" = `ativo: false` (as demandas
  criadas com ele continuam com `modeloId`). **Resposta:** `201`/`200 ModeloDemanda`.
- **Campo só do atendimento:** `rodadasInclusas` (a demanda criada com o modelo herda o valor, e na demanda o campo é de
  `CAMPOS_SO_ATENDIMENTO`): a equipe que manda a chave, com qualquer valor, recebe `403 campo_nao_permitido`
  (`CAMPOS_MODELO_SO_ATENDIMENTO`, `shared/logica/permissoes.ts`; decisão da integração 3A, segurança 3).
- **Erros:** `409 conflito` nome repetido no mesmo escopo; `422 estado_invalido` quadro arquivado. **SSE:** `modelo_demanda`.

#### `POST /api/modelos-demanda/revisados`
- **Quem:** admin ("Revisei os modelos" dos Primeiros passos, na tela de modelos). Sem corpo. Grava
  `configuracao['passos.modelos_revisados_em'] = agora` (de novo, se apertar outra vez). **Resposta:** `200
  ModelosRevisadosSaida`. **SSE:** `config` (objeto inteiro; quem apertou atualiza `['bootstrap'].config` pela
  resposta e invalida `['inicio']`).

### 4.10 Clientes · núcleo (+ trilha em cadastros)

Quem edita: §2. **Pendências** (`ClienteResumo.pendencias`, calculadas na leitura): `sem_am`, `sem_contato_padrao`.
A lista e o cabeçalho do cliente mostram "Completar cadastro"; toda mutação que muda uma delas emite `cliente` com
`pendencias`. **Logo:** só por upload (`logoArquivoId`, jpg/png/webp); no app, `logoUrl` = `/api/arquivos/:id?inline=1`;
na página pública, URL assinada (§4.17).

#### `GET /api/clientes`
Qualquer usuário. `200 ClienteNaLista[]` com contadores (abertas, com o cliente, atrasadas pelo `estadoPrazo`, §5.2;
só demandas de quadros ativos).

#### `GET /api/clientes/:sigla`
Qualquer usuário. `200 Cliente` (contatos, links, apelidos, responsáveis, contadores). `404` se a sigla não existe.

#### `POST /api/clientes`
- **Quem:** qualquer usuário; o papel equipe só manda `CAMPOS_CLIENTE_EQUIPE` (sigla e nome; outro campo → `403
  campo_nao_permitido`). **Corpo:** `CriarClienteEntrada` (sigla em maiúsculas, A–Z e 0–9, até 12). **Resposta:**
  `201 Cliente`. Usado também pelo diálogo `criar-cliente` (F5), aberto pela Nova demanda, pela criação rápida e pelo
  modal ("Criar cliente HE").
- `atendimentoId` padrão = o ator, se o papel dele for atendimento (criado pela equipe: sem AM, pendência `sem_am`,
  "Completar cadastro" para o atendimento). Cria o apelido da sigla (`origem='sigla'`) e os `apelidos` normalizados
  (minúsculo, sem acento).
- **Erros:** `409 conflito` sigla ou apelido de outro cliente (`detalhes.clienteId`). **Atividade:** `cliente.criado`.
  **SSE:** `cliente`.

#### `PATCH /api/clientes/:id`
- **Corpo:** `EditarClienteEntrada`. Mudar a sigla troca também o apelido de origem `sigla`. **Resposta:** `200 Cliente`.
- Mudar o AM **não** muda o AM das demandas existentes. **Atividade:** `cliente.editado`. **SSE:** `cliente`.

#### `PUT /api/clientes/:id/apelidos`
- **Corpo:** `DefinirApelidosEntrada` (substitui; a sigla fica). **Resposta:** `200 Cliente`.
- **Erros:** `409 conflito` apelido de outro cliente. **SSE:** `cliente` (`apelidos`).

#### `PUT /api/clientes/:id/responsaveis`
- **Corpo:** `DefinirResponsaveisEntrada` (uma pessoa ativa por equipe; substitui). **Resposta:** `200 Cliente`.
- A Nova demanda e a criação rápida **sugerem** o responsável da equipe do quadro como membro. O servidor só o põe
  sozinho ao mudar de quadro com `membros: 'responsavel_destino'` (automação configurada assim, ou a escolha no "Mover
  para…"/"Enviar para", §5.1) e na repetição que nasce em outro quadro (§5.3). **SSE:** `cliente` (`responsaveis`).

#### `POST /api/clientes/:id/contatos` · `PATCH /api/clientes/:id/contatos/:contatoId`
- **Corpo:** `CriarContatoEntrada` / `EditarContatoEntrada`. `padrao: true` desmarca o anterior (mesma transação).
  "Excluir" = `ativo: false`. **Resposta:** `201`/`200 ClienteContato`. **SSE:** `cliente_contato`, `cliente` (pendências).
- Desativar revoga, na mesma transação, os links públicos ativos do contato (como `POST /api/links-publicos/:id/revogar`:
  **Atividade** `link.revogado` em cada demanda, **SSE** `link_publico` para a gestão); reativar não os devolve. O link
  de contato inativo vale como inativo (`410`, §4.17). Segurança da leva 2, achado 3.

#### `POST /api/clientes/:id/links` · `PATCH /api/clientes/:id/links/:linkId` · `DELETE /api/clientes/:id/links/:linkId`
- **Corpo:** `CriarLinkClienteEntrada` / `EditarLinkClienteEntrada` (só https). `DELETE` apaga de fato (`204`).
  **SSE:** `cliente_link` (upsert/delete).

#### `GET /api/clientes/:id/aprovacoes` · cadastros
Qualquer usuário. `200 ItemTrilhaCliente[]` (mais novas primeiro), inclusive anuladas. Pelo **id** (a sigla dá `404`);
`quem` = o contato, o nome informado no link ou "registrado por <apelido>".

### 4.11 Configuração · cadastros

#### `GET /api/config/feriados?ano=2027` · `POST /api/config/feriados` · `DELETE /api/config/feriados/:data`
- **Quem:** GET qualquer usuário; POST/DELETE admin. **Corpo:** `CriarFeriadoEntrada`. **Resposta:** `Feriado[]`,
  `201 Feriado`, `204`. Feriado não recalcula prazos já gravados (não há prazo automático depois da criação); vale
  para os próximos cálculos (prazo do modelo, repetição, rodadas, "parado há"). **Erros:** `409 conflito` data
  repetida. **SSE:** `feriado`.
- `GET` sem `ano` devolve o ano corrente de São Paulo; `ano` fora de 2000–2100 → `400`. `POST` sem `tipo` grava o
  padrão do banco (`nacional`).

#### `GET /api/config/app` · `PATCH /api/config/app`
- **Quem:** GET qualquer usuário; PATCH admin. **Resposta:** `200 ConfigAppSaida`.
- **Corpo:** `EditarConfigAppEntrada`: cada número dentro de `FAIXAS_CONFIG` (fora: `400 validacao`).
  `demandaNumeroInicial` só aceita valor maior que o maior número existente. O "Revisei os modelos" é
  `POST /api/modelos-demanda/revisados` (§4.9).
- Grava só o que mudou: mandar o **mesmo** `demandaNumeroInicial` que já está gravado não é mudança (`200`; o formulário
  pode mandar a configuração inteira); diferente do atual, precisa ser maior que o maior número já usado (`400
  validacao` com `detalhes.campos.demandaNumeroInicial`). Campos fora de `EditarConfigAppEntrada` (como
  `modelosRevisadosEm`) são descartados; um campo fora da faixa recusa o corpo inteiro (nada é gravado).
  **SSE:** `config` (objeto inteiro, só quando algo mudou).

### 4.12 Demandas · núcleo

#### `GET /api/demandas/:numero`
- **Quem:** qualquer usuário. **Resposta:** `200 DemandaDetalhe` (uma ida: quadro e coluna, descrição, checklists,
  rodadas, versões com itens, envios, aprovações, anexos, movimentos, tempo; `linksPublicos` só para
  atendimento/admin). Arquivada e de quadro arquivado também abrem (com `quadro` e `coluna` arquivados: o modal abre só
  para leitura). **Erros:** `404` inexistente ou excluída. Meta: menos de 100 ms.

#### `POST /api/demandas`
- **Quem:** qualquer usuário (`CAMPOS_SO_ATENDIMENTO` só atendimento/admin). **Corpo:** `CriarDemandaEntrada`.
  **Resposta:** `201 CriarDemandaSaida`.
- **Lugar:** `quadroId` ativo (`422 estado_invalido`); `colunaId` desse quadro e ativa (`400 validacao`), padrão =
  **coluna de entrada** (a primeira coluna ativa de papel `normal`; sem nenhuma, a primeira ativa; quadro sem colunas →
  `422` "Crie uma coluna antes"); `posicao` padrão = fim da coluna. `numero` = max + 1 (ou `demandaNumeroInicial`).
- **Com modelo** (`modeloId` global ou do mesmo quadro, ativo): o que o corpo não trouxer sai do modelo: `descricaoMd`
  = `briefingMd`; prazo = hoje + `prazoDiasUteis` dias úteis (sem hora); prioridade; estimativa; rodadas inclusas;
  um checklist por nome de `itens`; etiquetas padrão casadas **por nome** com as do quadro (sem caixa e sem acento) e,
  sem par, **criadas** no quadro com a cor do modelo (o admin decidiu o modelo; isto não vale para mover, §5.6).
- **Padrões:** `atendimentoId` = AM do cliente, senão eu se meu papel for atendimento; `rodadasInclusas` = corpo ??
  modelo ?? cliente ?? 2; prioridade `media`. `membroIds` (ativos) e `etiquetaIds` (do quadro) validados (`400`).
- **Também cria:** rodada 1 (`inicial`, prazo = prazo da demanda), anexos dos `links`, menções da descrição (a de
  pessoa inexistente ou desativada vira texto, `@Nome`, como no comentário; vale também no PATCH). Coluna de
  papel `concluida` → nasce concluída. Coluna de pessoa → a pessoa entra como membro.
- **Avisos:** `senha_detectada`, `limite_wip` (não bloqueiam).
- **Atividade:** `demanda.criada`. **SSE:** `demanda` (objeto inteiro), `rodada`, `checklist`, `checklist_item`,
  `anexo`, `etiqueta` (criadas pelo modelo). **Notifica:** `membro` a cada membro; `chegou` pela regra da §5.9;
  `mencao` às menções da descrição.

#### `PATCH /api/demandas/:id`
- **Quem:** qualquer usuário (`CAMPOS_SO_ATENDIMENTO`: §2). Header `If-Match: <rev>` obrigatório (`400 validacao` se faltar).
- **Corpo:** `EditarDemandaEntrada`. **Resposta:** `200 EditarDemandaSaida`.
- **Efeitos:** descrição → menções novas e `descricaoAtualizadaEm` (§3); trocar o cliente troca o AM pelo AM do novo
  cliente quando o AM atual era o do cliente antigo (ou nulo), e as horas passam ao novo cliente (gatilho
  `demanda_cliente_horas`); prazo acompanha a rodada (§5.7); `capaAnexoId` (anexo ativo de imagem desta demanda) limpa
  `capaCor` e vice-versa; `repetir` sem prazo → `400`; `inicio` depois do prazo → `400`.
- **Cliente fixo depois do envio:** com qualquer versão já enviada, trocar ou tirar o cliente → `409 conflito` "Esta
  demanda já foi enviada ao cliente. Para outro cliente, copie a demanda." (gatilho `demanda_cliente_fixo`: o link e a
  trilha são do cliente que recebeu).
- **Erros:** `403 campo_nao_permitido`, `409 conflito_rev` (`detalhes.atual: ConflitoRevDetalhes`), `409 conflito`
  (cliente fixo), `400 validacao`.
- **Atividade:** `demanda.editada` (campos, com `antes`). **SSE:** `demanda` (campos alterados, incluindo `rev`).
  **Notifica:** `mencao` às menções novas da descrição.

#### `POST /api/demandas/:id/mover`
- **Quem:** qualquer usuário. Arrastar no quadro (inclusive na Lista), "Mover para…", "Enviar para <quadro>", teclas
  `,` e `.` (coluna anterior/próxima), "Mover todos os cards".
- **Corpo:** `MoverEntrada`. **Resposta:** `200 MoverSaida`. Regras e efeitos: §5.1 (lugar, posição e membros), §5.3
  (concluir/repetir ao entrar ou sair de coluna `concluida`), §5.6 (etiquetas entre quadros).
- **Erros:** `400 validacao` coluna inexistente, `etiquetaIds` de outro quadro ou `membroIds` com pessoa inativa;
  `422 estado_invalido` coluna ou quadro de destino arquivados, demanda arquivada; `409 conflito_rev` se `rev` veio e
  não bate.
- **Atividade:** `demanda.movida` (`via: 'manual'`, com `etiquetasDeixadas`, `membrosEntraram` e `membrosSairam`; e
  `demanda.concluida`/`demanda.reaberta` quando for o caso). **SSE:** `demanda` (`quadroId`, `colunaId`, `posicao`,
  `statusDesde`, `etiquetaIds`, `membroIds`, `concluidaEm`...; objeto inteiro quando ela entra no conjunto do
  bootstrap), `etiqueta` (criadas). **Notifica:** `membro` a quem entrou pela coluna ou pelo responsável do destino;
  `chegou` pela regra da §5.9.

#### `POST /api/demandas/:id/concluir`
- **Quem:** qualquer usuário. **Corpo:** `ConcluirEntrada`. **Resposta:** `200 ConcluirSaida`. Regras: §5.3.
- **Atividade:** `demanda.concluida` (`via: 'checkbox'`) ou `demanda.reaberta`; `demanda.repetida` nas duas
  demandas; `demanda.movida` (`via: 'automacao'`). **SSE:** `demanda` (as duas, a nova inteira).

#### `POST /api/demandas/:id/membros` · `DELETE /api/demandas/:id/membros/:usuarioId`
- **Quem:** qualquer usuário ("Entrar" = eu mesmo, tecla Espaço). **Corpo:** `AdicionarMembroEntrada`.
  **Resposta:** `200 DemandaSaida`. Idempotentes (já membro / já fora: `200` sem efeito). Pessoa inativa → `400`.
- **Atividade:** `demanda.membro_adicionado` / `demanda.membro_removido`. **SSE:** `demanda` (`membroIds`).
  **Notifica:** `membro` a quem entrou, se não foi ela mesma.

#### `POST /api/demandas/:id/etiquetas` · `DELETE /api/demandas/:id/etiquetas/:etiquetaId`
- **Quem:** qualquer usuário. **Corpo:** `AdicionarEtiquetaEntrada` (etiqueta do quadro da demanda; outra → `400`).
  **Resposta:** `200 DemandaSaida`. Idempotentes. **Atividade:** `demanda.etiqueta_adicionada` / `_removida`.
  **SSE:** `demanda` (`etiquetaIds`).

#### `POST /api/demandas/:id/arquivar` · `POST /api/demandas/:id/restaurar`
- **Quem:** qualquer usuário. **Corpo** do restaurar: `RestaurarEntrada`. **Resposta:** `200 DemandaSaida`.
- Arquivar não muda coluna nem quadro; para os cronômetros ligados nela (gravando os minutos); o link público continua
  ativo, mas a página o ignora enquanto ela estiver arquivada (§4.17).
- Restaurar: quadro arquivado → `422` "Restaure o quadro antes"; coluna = `colunaId` ?? a de antes, se ativa ?? a
  coluna de entrada (trocar de coluna grava `status_desde` como o `mover()`, §5.1 passo 4); se for de papel
  `concluida` e a demanda não estiver concluída, ela é concluída (sem repetição).
- **Erros:** `409 conflito` já arquivada / não arquivada. **Atividade:** `demanda.arquivada` / `demanda.restaurada`.
  **SSE:** arquivar: `demanda` (`arquivadoEm`); restaurar: `demanda` (**objeto inteiro**, §3).

#### `POST /api/demandas/:id/excluir`
- **Quem:** admin. **Corpo:** `ExcluirDemandaEntrada` (o número confere). **Resposta:** `204`.
- **Bloqueado** (`409 conflito`) se houver qualquer versão, envio ou `aprovacao`: a trilha e os itens de versão são
  imutáveis. Nesses casos, arquive.
- Anonimiza numa transação: título "Demanda excluída"; `descricao_md`, `origem_texto` vazios; capa nula; comentários
  com corpo vazio e `excluido_em` (e menções apagadas); textos de checklist e itens = "—"; anexos com `excluido_em`,
  nome "Anexo removido" e url/caminho/arquivo nulos (o arquivo vai para o lixo se ninguém mais usar, §4.14);
  `rodada.motivo_texto` e `apontamento.nota` nulos; `atividade.dados = '{}'` e `antes` nulo;
  `notificacao.resumo = 'Demanda excluída'`; `evento.patch = '{}'` dos eventos guardados da demanda. Revoga os links
  públicos ativos. Arquiva. Depois: detalhe, comentários e histórico → `404`.
- **Atividade:** `demanda.excluida`. **SSE:** `demanda` (delete).

### 4.13 Criação rápida, Colar do WhatsApp e busca · entrada

#### `POST /api/demandas/rapida/previa`
Qualquer usuário. **Corpo:** `CriarRapidaEntrada`. `200 AnaliseRapida`. Sem efeito (a prévia ao vivo pode ser
calculada no front com `shared/logica/rapida.ts`; esta rota confere).

#### `POST /api/demandas/rapida`
- **Quem:** qualquer usuário. **Corpo:** `CriarRapidaEntrada` (uma linha = uma demanda, na coluna onde a pessoa
  digitou; Enter cria e mantém o campo aberto, como no Trello). **Resposta:** `201 CriarRapidaSaida`.
- Marcadores com casamento **exato**: `HE:`, `[HE]`, `HE -` (apelido em `cliente_alias`) = cliente; `@rafa` (apelido
  de usuário ativo; para quem não tem apelido, o primeiro nome, se só uma pessoa ativa o tiver) = membro (vários). O
  que não casar continua no título. Sigla no formato de marcador que não casa
  (1 a 12 de A–Z/0–9) → `siglaNova` (a interface oferece "Criar cliente XYZ" a todos os papéis, pelo diálogo
  `criar-cliente`; o texto continua no título). Na criação rápida, o Enter com `siglaNova` abre o `criar-cliente` e
  cria com o cliente novo; recusado, o Enter seguinte cria sem cliente e o front tira o "XYZ:" do título (integração 3A).
  Coluna de pessoa: a pessoa entra como membro.
- Cliente = marcador ?? `clienteId` do contexto; AM pelo cliente; sem modelo; posição padrão = fim da coluna. Nunca
  `400` por faltar cliente (cliente é opcional). Coluna arquivada → `422`.
- Atividade, SSE e notificações de `POST /api/demandas` (`origem='rapida'`).

#### `POST /api/entrada/analisar` (Colar do WhatsApp)
Qualquer usuário. **Corpo:** `AnalisarTextoEntrada` (até 50.000 caracteres). `200 AnaliseTexto`. Sem efeito.
Reconhece cabeçalhos `[14/10 15:32] Fulana:`; sugere cliente por apelido e modelo por palavras do nome (post,
carrossel, reels, stories, vídeo, site, relatório, anúncio...); sigla desconhecida em maiúsculas vira `siglaNova`.
A Nova demanda preenche e cria por `POST /api/demandas` com `origem: 'whatsapp'` e `origemTexto`. O prazo pedido na
conversa ("até sexta", "para amanhã", "dia 24/10") é lido no front (`prazoDaConversa`, `shared/logica/colar-whatsapp.ts`):
dia da semana e "amanhã" contam do dia da mensagem, prazo que já passou não é sugerido; ele vence o prazo do modelo.

#### `GET /api/busca`
Qualquer usuário. **Consulta:** `BuscaConsulta`. `200 BuscaSaida` (até 20). `#4521`/`4521` → número exato primeiro;
o maior começo do texto (até 4 palavras, com ou sem os dois-pontos da criação rápida: `HE: carrossel`) igual a um
apelido de cliente filtra o cliente; sem cliente no começo, o maior fim (até 4 palavras, sobrando ao menos uma) igual a
um apelido também filtra (`carrossel he`), mas só quando acha alguma demanda (senão a palavra volta a ser termo); o
resto vai ao FTS5 (título e descrição) por prefixo, sem acento. O `trecho` sai de uma janela de 2.000 caracteres da
descrição em volta do termo (a descrição aceita 100 mil). Sempre `excluido_em IS NULL` (a anonimizada nunca aparece, nem
pelo número). Arquivadas e de quadros arquivados só com `incluirArquivadas`. Meta: menos de 150 ms com 5 mil demandas.

### 4.14 Arquivos · núcleo

#### `POST /api/arquivos`
- **Quem:** qualquer usuário. **Corpo:** `multipart/form-data` com o campo `arquivo` (um por chamada).
- `bodyLimit` recusa pelo `Content-Length` antes do parse (§1). Confere tamanho (`uploadLimiteBytes`, no máximo 10 MB)
  e magic number (jpg, png, webp, gif, pdf, zip); grava em `DATA_DIR/uploads/<2>/<id>` e o sha256. **Resposta:** `201 ArquivoInfo`.
- **Em uso** = referenciado por `versao_item.arquivo_id`, `cliente.logo_arquivo_id` ou `anexo.arquivo_id` sem
  `excluido_em` (inclusive o print de evidência e a capa). O gatilho `arquivo_em_uso` impede marcar `excluido_em`
  num arquivo em uso; o job de órfãos (24 h sem uso) e a exclusão de anexo usam a mesma lista. O caminho inverso
  também é fechado: anexo, item de versão e logo não usam arquivo que já está no lixo (gatilhos `*_no_lixo` →
  `400 validacao` "Este arquivo foi removido. Envie de novo.").
- **Erros:** `413 arquivo_grande`, `415 tipo_arquivo`, `400 validacao` (sem campo).

#### `GET /api/arquivos/:id`
- **Quem:** qualquer usuário. `?inline=1` só vale para imagens. Headers: `X-Content-Type-Options: nosniff`,
  `Content-Disposition: attachment; filename*=` (exceto imagem inline), `Cache-Control: private, max-age=3600`.
- **Erros:** `404` inexistente ou excluído.

### 4.15 Modal da demanda · modal

Checklists, anexos e comentários: qualquer usuário interno (o checklist de rodada, "Ajustes R2", é o pedido do
cliente: só atendimento e admin o apagam, renomeiam e acrescentam, reescrevem ou tiram itens; a equipe marca e
reordena). Toda regra de papel aqui passa por `pode()` (§2: `anexo.excluir`, `comentario.editar`,
`comentario.excluir`, `checklist_rodada.excluir`, `checklist_rodada.editar`). Horas (listar, editar, excluir): §4.20.

#### `GET /api/demandas/:id/comentarios`
Qualquer usuário. `200 Comentario[]` em ordem de criação (excluídos chegam com `corpoMd` vazio e `excluidoEm`).
Demanda excluída → `404`.

#### `GET /api/demandas/:id/historico`
Qualquer usuário. **Consulta:** `ListarHistoricoConsulta`. `200 Pagina<Atividade>` (mais novas primeiro). Omite
`tempo.lancado` de outra pessoa (só o próprio ator e o admin veem); "outra pessoa" é a **dona do apontamento**, não
quem agiu (quem arquiva a demanda e para o cronômetro de outra pessoa não vê as horas dela). Demanda excluída → `404`.

#### `POST /api/demandas/:id/comentarios`
- **Corpo:** `CriarComentarioEntrada`. **Resposta:** `201 ComentarioSaida`.
- `visivelCliente: true` só atendimento e admin; os outros → `403 campo_nao_permitido` (`detalhes.campo = 'visivelCliente'`).
- Menções `@[Nome](mencao:<id>)` extraídas e validadas contra usuários ativos (as inválidas viram texto).
  `anexoIds` precisam ser anexos da mesma demanda sem comentário.
- **Atividade:** `comentario.criado`. **SSE:** `comentario`, `demanda` (`nComentarios`). **Notifica:** `mencao` aos
  mencionados; `comentario` aos membros e ao AM que não foram mencionados (nunca ao autor).

#### `PATCH /api/comentarios/:id` · `DELETE /api/comentarios/:id`
- **Quem:** o autor; `DELETE` também admin. **Corpo:** `EditarComentarioEntrada` (`visivelCliente` com a regra do
  POST). Editar só notifica menções novas. `DELETE` marca `excluido_em` e esvazia o corpo (`204`).
- **Atividade:** `comentario.editado` / `comentario.excluido`. **SSE:** `comentario`, `demanda` (`nComentarios`).

#### `POST /api/demandas/:id/checklists`
- **Corpo:** `CriarChecklistEntrada`. **Resposta:** `201 ChecklistComItens`.
- **Atividade:** `checklist.criado`. **SSE:** `checklist`, `checklist_item`, `demanda` (contadores).

#### `PATCH /api/checklists/:id` · `DELETE /api/checklists/:id`
- **Corpo:** `EditarChecklistEntrada`. **Resposta:** `200 ChecklistComItens`. `DELETE` apaga com os itens (`204`).
  **Atividade:** `checklist.editado` (renomear, com `tituloAntes`) / `checklist.removido`. **SSE:** `checklist` (upsert/delete), `checklist_item` (delete de cada item, no
  `DELETE`), `demanda` (contadores).

#### `POST /api/checklists/:id/itens`
- **Corpo:** `CriarItensEntrada` (cada texto vira um item). **Resposta:** `201 ChecklistItem[]`.
  **SSE:** `checklist_item`, `demanda` (contadores).

#### `PATCH /api/checklist-itens/:id` · `DELETE /api/checklist-itens/:id`
- **Corpo:** `EditarItemEntrada` (`feito` grava `feitoEm`/`feitoPor`). **Resposta:** `200 ChecklistItem` / `204`.
- **Atividade:** `checklist.item_feito` / `checklist.item_desfeito` / `checklist.item_editado` (texto, com `textoAntes`) /
  `checklist.item_removido` (`DELETE`). **SSE:** `checklist_item`, `demanda` (contadores).

#### `POST /api/demandas/:id/anexos`
- **Corpo:** `CriarAnexoEntrada` (link https, caminho de rede ou arquivo já enviado). Provedor detectado pelo host.
  Sempre `finalidade: 'referencia'`: a chave `finalidade` é ignorada aqui (o print de evidência nasce só pelas rotas
  do ciclo, ligado à aprovação; o modal decide "Print do retorno" e o Remover por essa ligação). **Resposta:** `201 Anexo`. **Atividade:** `anexo.adicionado`. **SSE:** `anexo`, `demanda` (`nAnexos`).
- Comentário, checklist (e itens) e anexo numa demanda arquivada ou de quadro arquivado → `422 estado_invalido` (o
  modal abre só para leitura). Lançar tempo numa arquivada continua permitido.

#### `PATCH /api/anexos/:id` · `DELETE /api/anexos/:id`
- **Quem:** editar: qualquer usuário; excluir: quem enviou, atendimento, admin. `DELETE` marca `excluido_em` (e o do
  arquivo, se ninguém mais usar); se for a capa, limpa `capaAnexoId` antes, na mesma transação (gatilho
  `anexo_e_capa`) (`204`). Print de evidência de uma decisão (`aprovacao.evidencia_anexo_id`, mesmo anulada) nunca
  sai: `409 conflito` "Este print é a prova de uma aprovação." (gatilho `anexo_evidencia_fixa`).
  **Atividade:** `anexo.removido`. **SSE:** `anexo`, `demanda` (`nAnexos`, capa).

#### `POST /api/demandas/:id/copiar`
- **Quem:** qualquer usuário (`CAMPOS_SO_ATENDIMENTO` vão junto com os valores da original). **Corpo:**
  `CopiarDemandaEntrada`. **Resposta:** `201 CriarDemandaSaida`.
- Copia título (ou o novo), descrição, cliente, AM, prioridade, estimativa, modelo e repetir; com `manter`:
  checklists (itens desmarcados; o de rodada não vai), etiquetas (as atuais, mapeadas por nome no destino, §5.6), membros,
  anexos de referência (link e caminho; arquivo reaproveita o mesmo `arquivo_id`) e datas. Nasce com rodada 1, sem
  versões, comentários nem histórico; `origem='copia'`, `origemDemandaId`. O modelo só vai se valer no quadro de
  destino; `repetir` só vai junto com as datas; com o AM original desativado, a cópia fica com o AM do cliente.
- **Atividade:** `demanda.copiada` nas duas. **SSE/Notifica:** como `POST /api/demandas`.

#### `POST /api/demandas/:id/cronometro` · `POST /api/cronometro/parar`
- **Quem:** qualquer usuário, para si. **Resposta:** `200 CronometroSaida`.
- Iniciar: para o meu cronômetro ligado (se houver, em qualquer demanda) e liga um novo nesta (`origem='cronometro'`,
  `iniciadoEm = agora`, `data` = dia local); demanda arquivada ou de quadro arquivado → `422`. Parar: grava
  `paradoEm` (≥ `iniciadoEm`: com o relógio parado dos testes, pode ser o mesmo instante) e `minutos = max(1,
  arredondado)`; acima de `cronometroLimiteHoras` grava o limite e devolve o aviso `cronometro_longo`. Sem cronômetro
  ligado, parar devolve `ativo: null, parado: null`.
- **Atividade:** `tempo.lancado` (`origem: 'cronometro'`, ao parar). **SSE:** `apontamento` (dono+admin);
  `demanda` (`minutosRegistrados`, interno, com `a` e `t` **nulos**).

#### `POST /api/demandas/:id/apontamentos`
- **Quem:** qualquer usuário (lança para si). **Corpo:** `CriarApontamentoEntrada`. **Resposta:** `201 Apontamento`.
  É o diálogo `lancar-tempo` (F1), aberto também pela tela `/horas` (F3) depois de escolher a demanda.
- `clienteId` copiado da demanda. **Atividade:** `tempo.lancado` (o histórico só a mostra ao ator e ao admin).
  **SSE:** `apontamento` (dono+admin); `demanda` (`minutosRegistrados`, `a` e `t` nulos).

### 4.16 Ciclo da peça · ciclo

Sem etapas fixas: a demanda fica na coluna que a equipe quiser; as **automações do quadro** (§5.5) movem nos 4
gatilhos. "Com quem está a bola" e o "parado há": §5.4.

#### `POST /api/demandas/:id/versoes` (Entregar versão)
- **Quem:** membros da demanda, o AM, atendimento, admin (os outros: `403` "Entre na demanda para entregar").
- **Corpo:** `EntregarVersaoEntrada` (pelo menos 1 item). **Resposta:** `201 EntregarVersaoSaida`.
- Cria Vn na rodada atual, com os itens; **não** muda a coluna. Demanda arquivada ou concluída → `422` ("Reabra a
  demanda"). Sem rodada aberta (a peça já foi aprovada) → `422`: o caminho é anular a aprovação ou pedir ajuste
  interno, que abre a rodada seguinte. Depois do commit, testa em segundo plano os links do Drive e grava `driveStatus` (emite `versao` de novo).
- **Atividade:** `versao.entregue`. **SSE:** `versao` (com itens), `demanda` (`nVersoes`, `versaoAtualId`).
  **Notifica:** `versao_entregue` ao AM da demanda (se não for o ator); sem AM (cliente criado pela equipe, só com
  sigla e nome), a todas as pessoas ativas do atendimento (sem nenhuma, aos admins), com "· sem atendimento" no resumo.

#### `PATCH /api/versoes/:id`
- **Quem:** autor da versão, atendimento, admin. Só enquanto `enviadaClienteEm` for nulo: depois do envio, `409 conflito`
  "Esta versão já foi enviada ao cliente." para todos (o que foi enviado não muda; a nota é recado interno e nunca vai
  à página pública). **Corpo:** `EditarVersaoEntrada`. **Resposta:** `200 VersaoComItens` (a mesma nota: sem efeito).
- **Atividade:** `versao.editada` (`antes.nota` = a nota de antes). **SSE:** `versao`. Segurança da leva 2, achado 1.

#### `POST /api/versoes/:id/itens`
- **Quem:** autor da versão, atendimento, admin. Só enquanto `enviadaClienteEm` for nulo (`409 conflito` depois).
- **Corpo:** `AdicionarItensEntrada`. **Resposta:** `201 VersaoComItens`. Testa o Drive dos itens novos em segundo
  plano. Usada pelo "[Enviar arquivo (até 10 MB)]" do diálogo de envio quando o Drive está privado.
- **Atividade:** `versao.itens_adicionados`. **SSE:** `versao`.

#### `POST /api/versoes/:id/testar-drive`
- **Quem:** qualquer usuário. Para cada link do Drive, busca `https://drive.google.com/thumbnail?id=<id>&sz=w400` sem
  credenciais (timeout 5 s por passo): a miniatura sempre redireciona (302) para `lh3.googleusercontent.com`, então o
  teste segue até 3 redirecionamentos, só para `drive.google.com` e `*.googleusercontent.com`: imagem 200 → `publico`
  (vira `previaUrl`); 401/403 ou redirecionamento para fora (a tela de login) → `privado`; pasta → `pasta` (só aviso);
  404, 5xx ou rede → `erro`, que **não** bloqueia o envio (a tela diz "Não deu para testar"). Grava em `versao_item`.
  **Resposta:** `200 TestarVersaoSaida`. **SSE:** `versao`. O teste que roda depois de entregar ou acrescentar itens sai
  com ator sem trace (o resultado chega também à janela de quem entregou).

#### `POST /api/drive/testar`
Qualquer usuário. **Corpo:** `TestarDriveEntrada`. **Resposta:** `200 TestarDriveSaida`. Não grava nada.

#### `POST /api/demandas/:id/enviar` (Enviar ao cliente)
- **Quem:** atendimento, admin. **Corpo:** `EnviarAoClienteEntrada`. **Resposta:** `200 EnviarAoClienteSaida`.
- Exige cliente (`422` "Escolha o cliente antes de enviar") e versão entregue (`422` "Entregue uma versão antes");
  demanda arquivada → `422`. A versão é a última entregue (pedir outra → `409 versao_desatualizada`); versão que já
  tem decisão válida → `409 ja_decidida` (senão a peça ficaria "com o cliente" sem decisão possível). O contato
  (`contatoId` ou, ausente, o padrão; `contatoId: null` = sem contato, e o link pergunta o nome) precisa ser ativo e
  do cliente (`400 validacao`; o gatilho `envio_contato_do_cliente` também recusa). Prazo de retorno padrão: hoje + `retornoPrazoDiasUteis`, limitado à véspera útil da publicação.
- `via: 'link'`: testa o Drive dos itens; algum `privado` → `422 drive_privado` (`detalhes.itens`), a não ser que a
  versão tenha um arquivo enviado pelo app ("[Enviar arquivo (até 10 MB)]", `POST /api/versoes/:id/itens`): aí o envio
  passa e a página pública deixa de fora o link privado. Caminho de rede nunca vai ao cliente: versão sem nenhum link
  ou arquivo (só caminhos) → `422 estado_invalido` com `detalhes.motivo: 'sem_itens_visiveis'` (o cliente aprovaria
  sem ver; a tela só oferece "Enviei por fora"). Reaproveita o link ativo da demanda para o mesmo contato (e estende a validade dele por mais
  `linkPublicoValidadeDias` a partir deste envio); senão gera token de 32 bytes, grava `token_hash` (sha256) e
  `token_cifrado` (AES-256-GCM com chave derivada de `SEGREDO`), validade `linkPublicoValidadeDias`, e o
  `link_publico_item`. `via: 'fora'`: exige `canal`; sem link.
- Grava `envio` com `quadro_id` = o quadro em que a demanda está **antes** da automação (a decisão do cliente vai rodar
  as automações deste quadro, §5.5), o primeiro envio da versão (`enviadaClienteEm`, `enviadaVia`), `envioPendenteEm =
  agora` (a bola vai ao cliente) e roda a automação `enviado_ao_cliente` do quadro atual (§5.5). Demanda sem AM: quem
  envia passa a ser o AM dela (`demanda.editada` com `atendimentoId`), para receber a decisão e ver a peça parada no
  Início.
- **Atividade:** `versao.enviada` (+ `link.gerado`, + `demanda.movida` com `via: 'automacao'`).
  **SSE:** `envio`, `versao`, `demanda` (interno); `link_publico` (gestão).

#### `POST /api/demandas/:id/retorno` (Registrar retorno, Shift+R)
- **Quem:** atendimento, admin. **Corpo:** `RegistrarRetornoEntrada`. **Resposta:** `200 RegistrarRetornoSaida`.
- Exige envio pendente (`envioPendenteEm`; senão `409 conflito` "Nada aguardando o cliente"). Mesma função do link
  (`registrarRetorno()` em `server/src/servicos/ciclo.ts`), com `via='manual'`. A versão é a última enviada (`409
  versao_desatualizada`); decisão válida na versão → `409 ja_decidida`. Contato ativo do cliente (`400`). A
  `aprovacao` grava `quadroAntesId`/`colunaAntesId` = onde a demanda está agora.
  - **aprovado:** `aprovadaEm`/`aprovadaVersaoId`, fecha a rodada, limpa `envioPendenteEm` e roda a automação
    `aprovado` **do quadro do envio** (`envio.quadro_id` do último envio desta versão; pode levar a outro quadro,
    ex.: Social › Agendar). Levada a um quadro que não é o do envio, o prazo (o da rodada, já cumprido) vira a
    publicação com a hora dela, ou nenhum (com repetição, fica); a rodada guarda o dela (`demanda.editada` com
    `aprovacaoId` e `prazoNovo`; anular, quando a demanda volta, devolve o prazo de antes se ninguém mexeu nele);
  - **ajuste:** `comentario` = linhas, abre a rodada N+1 (§5.7) com checklist "Ajustes R{N+1}", limpa
    `envioPendenteEm` e roda a automação `ajuste_pedido` do quadro do envio (ex.: volta da Atendimento › Com o
    cliente para a Criação › Fila); `sugerirExtra` se N+1 passou das inclusas.
  - Depois da automação, grava `retornoEm = max(agora, statusDesde)`: numa coluna `aguardando_cliente` sem automação
    que tire o card dali, a bola volta para a equipe (§5.4).
  - Print (`evidenciaArquivoId`) vira anexo `evidencia` ligado à aprovação (não sai mais: §4.15).
- **Erros:** acima e `400 validacao` (ajuste sem linhas).
- **Atividade:** `retorno.registrado` (+ `rodada.aberta`, `demanda.movida`). **SSE:** `aprovacao`, `demanda`,
  `rodada`, `checklist`, `checklist_item`, `anexo`. **Notifica:** membros, AM e quem enviou a versão (menos o ator):
  `aprovada` ou `ajuste_pedido`.

#### `POST /api/demandas/:id/aprovado-whatsapp`
- **Quem:** atendimento, admin. Atalho de 1 clique = retorno `aprovado`, `canal='whatsapp'`, contato padrão.
- **Corpo:** `AprovadoWhatsappEntrada`. **Resposta:** `200 RegistrarRetornoSaida`. Erros, atividade, SSE e notificação
  como o retorno. O aviso "Aprovação registrada · Desfazer" chama a anulação.

#### `POST /api/aprovacoes/:id/anular`
- **Quem:** atendimento, admin. Só decisão `aprovado` ainda válida e a mais recente da demanda.
- Marca `anuladaEm`/`anuladaPor`, limpa `aprovadaEm`/`aprovadaVersaoId` e `retornoEm`, reabre a rodada, volta
  `envioPendenteEm` ao instante do envio daquela versão e, **se a demanda não mudou de coluna desde a decisão** (a
  passagem aberta em `demanda_movimento` é a que a decisão abriu, ou anterior a ela), devolve-a para `colunaAntesId`,
  se ativa (`demanda.movida` com `via: 'manual'`; os membros trocados pela automação voltam, pela atividade
  `demanda.movida` da decisão). **Resposta:** `200 AnularAprovacaoSaida` (`voltou`).
- **Erros:** `409 conflito` (ajuste, já anulada, não é a mais recente ou já há uma rodada nova aberta, como depois de
  um ajuste interno). Vale para a aprovação pelo link e pela equipe; o "Desfazer" do aviso só aparece na manual.
  **Atividade:** `aprovacao.anulada`
  (+ `demanda.movida`). **SSE:** `aprovacao`, `demanda`, `rodada`, `notificacao`: as `aprovada` da decisão anulada
  ganham "· anulada por Pri" no resumo (integração 3B; aprovar de novo não deixa duas iguais sem explicação).

#### `POST /api/demandas/:id/ajuste-interno` (Pedir ajuste interno)
- **Quem:** atendimento, admin. Exige versão entregue na rodada atual (`422` "Nada entregue nesta rodada"); sem
  envio pendente (`409`: registre o retorno do cliente). **Corpo:** `AjusteInternoEntrada`.
- Abre a rodada N+1 com `origem='interna'` (§5.7). Não move (não é gatilho de automação). **Resposta:** `200 AjusteInternoSaida`.
- **Atividade:** `rodada.aberta`. **SSE:** `rodada`, `checklist`, `checklist_item`, `demanda`. **Notifica:**
  `ajuste_pedido` aos membros.

#### `POST /api/rodadas/:id/extra`
- **Quem:** atendimento, admin. Só rodada com número > 1. **Corpo:** `MarcarExtraEntrada`. **Resposta:** `200 Rodada`.
- **Atividade:** `rodada.extra_marcada` / `rodada.extra_desmarcada`. **SSE:** `rodada`.

#### `GET /api/demandas/:id/whatsapp?modelo=envio|lembrete|aprovado|ajuste`
- **Quem:** atendimento, admin. **Resposta:** `200 TextoWhatsappSaida` (§6). O lembrete reusa o mesmo link.
- **Erros:** `409 conflito` sem envio (envio/lembrete) ou sem decisão (aprovado/ajuste).

#### `GET /api/demandas/:id/links`
Atendimento, admin. `200 LinkPublicoComUrl[]` (decifra o token para reexibir o link).

#### `POST /api/links-publicos/:id/revogar`
- **Quem:** atendimento, admin. **Resposta:** `200 LinkPublicoResumo`. **Erros:** `409 conflito` já revogado.
- **Atividade:** `link.revogado`. **SSE:** `link_publico` (gestão). Excluir a demanda (§4.12) também revoga.

### 4.17 Página pública · ciclo

Todas: sem sessão; `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store` (também no
HTML de `/a/:token`); `/a/*` e `/api/publico/*` mascarados nos logs. Token: `randomBytes(32)` em base64url (sha256 no banco).

- **Limites** (em memória, janela deslizante; um processo só): 30 por minuto por **IP+token** em
  `/api/publico/a/:token*`; 300 por minuto por IP em `/api/publico/arquivos/*`. Estouro: `429`.
- **Prévia interna** (segurança da leva 2, achado 2): quem tem sessão interna válida no cookie (o atendimento no "Ver
  como o cliente", o link copiado de `GET /api/demandas/:id/links`) vê a página, mas não é o cliente: `/visto` responde
  `204` sem contar e a decisão responde `403 previa_interna` "Você está vendo como o cliente: só ele pode decidir por
  este link." (senão a decisão iria como do cliente, `registrado_por` nulo e nome livre, sem rastro de quem a tomou).
  A página lê a dica `pauta_sessao` (§1) e mostra a faixa "Prévia: os botões não valem para você" com Aprovar e Pedir
  ajuste desligados; o 403 que chegar sem a dica também a liga. Sessão revogada ou vencida não conta como sessão.
- **"Enviada por este link"** = existe `envio` com aquela `versao_id` e `link_id` = o link. Nenhuma rota pública lê
  `demanda.versao_atual_id` (pode ser trabalho interno ainda não enviado).
- **Itens ignorados:** demanda arquivada, excluída (excluir também revoga) ou de outro cliente que não o do link (o
  gatilho `demanda_cliente_fixo` já impede trocar o cliente depois do envio). Sem item que sobre: `410 link_inativo`.

#### `GET /api/publico/a/:token`
- **Sem efeito colateral** (o robô de prévia do WhatsApp abre o link). **Resposta:** `200 PaginaAprovacao`.
- Por item: `versao` = a de maior número enviada por este link; anteriores só as enviadas por este link; comentários
  com `visivel_cliente = 1` e sem `excluido_em` (a menção sai trocada por "@Nome": a página mostra texto puro);
  `proximoPasso` = `null` sem decisão e aguardando, ou "Esta peça não aguarda mais sua decisão." quando a versão do
  link não tem decisão mas a peça não espera mais por ela (outra versão enviada por fora, envio pendente tratado de
  outro jeito), ou "A peça desta versão foi enviada por outro meio." quando a versão não tem nada que o cliente veja
  (só caminho de rede, envio de antes da trava): a página esconde os botões; `modeloNome` = nome do modelo da demanda. Arquivos e o logo do
  cliente por URL assinada (`urlAssinada(id, linkPublicoArquivoMinutos)`).
- **Erros:** `404` token desconhecido; `410 link_inativo` expirado, revogado, de contato desativado ou sem itens (vale
  para `/visto` e para a decisão).

#### `POST /api/publico/a/:token/visto`
Chamado pelo JS da página. Soma `acessos`, grava `ultimoAcessoEm`; `link.visto` no máximo uma vez a cada 6 h. `204`.
Com sessão interna no cookie (prévia interna): `204` sem efeito. **SSE:** `link_publico` (gestão).

#### `POST /api/publico/a/:token/decisao`
- **Header:** `Idempotency-Key` (obrigatório). **Corpo:** `DecisaoPublicaEntrada`. **Resposta:** `200 DecisaoPublicaSaida`.
- **Ordem:**
  1. sem chave → `400 validacao`; link expirado/revogado/de contato desativado → `410 link_inativo`; sessão interna no cookie → `403
     previa_interna` (prévia interna, acima);
  2. `hash` = sha256 de `demandaId|versaoId|decisao|linhas unidas por \n|contatoId|nomeInformado`; busca
     (`link_id`, chave) **antes de qualquer outra validação**: achou com o mesmo `idempotency_hash` → `200` com o estado
     atual do item, sem efeito; achou com outro hash → `422 idempotencia`;
  3. a demanda é item do link, não arquivada, do mesmo cliente do link (`demanda.cliente_id = link_publico.cliente_id`);
     se a versão pedida é a última enviada por este link e já tem decisão válida → `409 ja_decidida` (antes do "não
     aguarda mais": de duas decisões simultâneas, a segunda recebe `ja_decidida`, porque a primeira já limpou o envio
     pendente);
     tem **envio pendente** e `versao_enviada_id` foi enviada por este link; senão `409 conflito` "Esta peça não
     aguarda mais sua decisão" (sem itens nem versão nos detalhes);
  4. `versaoId` = `versao_enviada_id`; senão `409 versao_desatualizada` com `versaoAtual` = a versão de maior número
     enviada por este link (`DetalhesVersaoDesatualizada`: "Chegou a V3");
  5. sem decisão válida na versão (`409 ja_decidida`); a versão tem algum item que o cliente vê (senão `409 conflito`
     "A peça desta versão foi enviada por outro meio. Fale com o seu atendimento.");
  6. identidade: `contatoId` nulo ou igual a `link_publico.contato_id` (senão `400 validacao`; o `registrarRetorno()`
     confere de novo que o contato está ativo e é do cliente, como no manual); sem `contatoId`,
     `nomeInformado` obrigatório (1 a 120 caracteres, texto puro); ajuste com pelo menos 1 linha (`400 validacao`);
  7. grava a `aprovacao` com a chave, o hash, `ip_hmac` (HMAC-SHA256 com `SEGREDO`) e `user_agent`, e roda
     `registrarRetorno()` com `via='link'`, motivo `cliente_mudou` e prazo padrão (hoje + `ajustePrazoDiasUteis`),
     inclusive a automação do quadro do envio (§5.5) e o `retornoEm`.
- **Atividade:** `retorno.registrado` (ator_tipo `cliente`). **SSE/Notifica:** como `POST /retorno`.

#### `GET /api/publico/arquivos/:id?exp=&sig=`
`sig` = HMAC-SHA256(`SEGREDO`, `${id}.${exp}`) em base64url; `exp` em segundos Unix. Inválida ou vencida: `403`.
Mesmos headers de `GET /api/arquivos/:id`; `&inline=1` (só imagem, como na rota interna) serve a prévia da página.

### 4.18 Início, Agenda e notificações · painéis

"Minhas" = sou membro ou o AM (`ehMinha`, `shared/logica/quadro.ts`). Só demandas de quadros ativos e não arquivadas.

#### `GET /api/inicio`
- Qualquer usuário. `200 InicioSaida`: minhas abertas por prazo (`estadoPrazo` §5.2: atrasadas, hoje, esta semana
  de amanhã até domingo (no domingo ela é vazia), com o cliente, depois, sem prazo; as com o cliente (`pausado`) têm o
  grupo `comCliente`, nunca atrasadas, as enviadas há mais tempo primeiro (`envioPendenteEm`, senão `statusDesde`);
  integração 3B); `comClienteParado` para o atendimento e também para o **admin**, só nas demandas em
  que a pessoa é o AM (`atendimentoId` = eu; a equipe nunca recebe o bloco): as com o cliente há mais de
  `clienteParadoDiasUteis` (§5.4), mais antigas primeiro (dias úteis desde o envio, senão desde a entrada na coluna
  `aguardando_cliente`); "Registrar retorno" só aparece com `envioPendenteEm`, senão o bloco mostra "Abrir". Na
  tela, o admin só vê o bloco quando há alguma; o atendimento sempre ("Nenhuma peça parada com o cliente.").
  `mencoes` (últimas 10 `mencao`); `resumo` (`comCliente` = as minhas abertas com a bola com o cliente); `extras`
  (na prática vazio: as minhas abertas de quadros ativos estão todas no bootstrap).
- As listas são as de `shared/logica/paineis.ts` (`minhasPorPrazo`, `comClienteParado`, `resumoInicio`), as mesmas
  que o front calcula do bootstrap (o card entra e sai do Início na hora; `GET /api/inicio` serve as menções). Ordem
  dentro de cada grupo: prazo, hora (sem hora = 18h), prioridade (urgente primeiro) e número; "sem prazo" por
  prioridade e número; "com o cliente" pelo envio.
- `primeirosPassos` só para admin, nulo quando concluído. Na ordem de `PASSOS_INICIAIS`, com o critério de `feito` (e
  o `caminho` de cada item):
  - `convidar_equipe` (`/config/pessoas`): pelo menos 2 usuários ativos. Vem primeiro para o modelo "Por pessoa" já
    nascer com as colunas das pessoas;
  - `criar_quadros` (`/quadros/novo?equipes=1`): pelo menos 1 quadro ativo. A tela "Criar os quadros das equipes"
    mostra uma linha por equipe ativa sem quadro, com o modelo sugerido e as colunas para desmarcar ou renomear (as
    das pessoas já expandidas; equipe sem membros: aviso "Convide a equipe antes: quem entrar depois ganha a própria
    coluna"); cada linha é um `POST /api/quadros`;
  - `cadastrar_clientes` (`/clientes`): pelo menos 1 cliente fora de `ex` com AM (integração 3B: o cliente que a
    equipe cria depois, só com sigla e nome, não reabre o bloco; a pendência `sem_am` fica em Clientes);
  - `revisar_modelos` (`/config/modelos`): `config.modelosRevisadosEm` preenchido (botão "Revisei os modelos",
    `POST /api/modelos-demanda/revisados`).

#### `GET /api/agenda`
- Qualquer usuário. **Consulta:** `AgendaConsulta` (`de`..`ate` inclusive, até 62 dias; senão `400`; `ate` antes de
  `de`, data inválida ou campo fora de `CAMPOS_AGENDA` → `400`). `quadroIds` e `campos` aceitam a chave repetida
  (`quadroIds=a&quadroIds=b`, como o `comConsulta` do front) ou separados por vírgula; `soMinhas` e
  `incluirConcluidas` aceitam `1`/`0`/`true`/`false`; quadro arquivado em `quadroIds` não traz nada. **Resposta:**
  `200 AgendaSaida`: as demandas de todos os quadros ativos (ou `quadroIds`) com a data pedida (`campos`, padrão
  prazo) no intervalo, "Só as minhas" opcional, concluídas incluídas por padrão; feriados do intervalo; `extras` =
  as que não estão no bootstrap (concluídas antigas).
- Arrastar no calendário muda o **prazo** por `PATCH /api/demandas/:id` (com `If-Match`), mantendo a hora
  (`useMudarPrazo` e `CalendarioDemandas` do núcleo-web, os mesmos do Calendário do quadro).

#### `GET /api/notificacoes`
Só as minhas. **Consulta:** `ListarNotificacoesConsulta` (`limite` padrão 30, máximo 100, `400` acima; `antesDe` = id:
as mais antigas que ele). `200 ListarNotificacoesSaida` (`proximo` = o id da última da página quando há mais;
`naoLidas` é sempre o total da pessoa, não o da página).

#### `POST /api/notificacoes/lidas`
- **Corpo:** `MarcarLidasEntrada` (até 500 `ids`). `204`. Marca só as minhas ainda não lidas; ids de outra pessoa são
  ignorados sem erro (não revela o que existe). **SSE:** `notificacao` (usuário; patch `lidaEm`) para cada uma marcada;
  sem nada mudar, nenhum evento.

### 4.19 Arquivo · cadastros

#### `GET /api/arquivo`
Qualquer usuário. **Consulta:** `ListarArquivoConsulta` (cliente, quadro, mês, texto). `200 Pagina<Demanda>`.
- Lista tudo o que **saiu do quadro**: `excluido_em IS NULL AND (arquivado_em IS NOT NULL OR (concluida_em IS NOT
  NULL AND concluida_em <= agora − quadroConcluidasDias))`. A concluída sem arquivar não some: sai do quadro e aparece
  aqui ("Concluída · não arquivada", com [Arquivar]).
- Mês e ordem (mais recentes primeiro) por `coalesce(arquivado_em, concluida_em)`, com os índices
  `demanda_arquivo_ix`/`demanda_arquivo_cli_ix` (a consulta repete o `WHERE` deles).
- Restaurar (só arquivadas) usa `POST /api/demandas/:id/restaurar`; desmarcar uma concluída antiga usa
  `POST /api/demandas/:id/concluir` com `concluida: false` (ela volta ao quadro, objeto inteiro no SSE).
- **Texto (`q`):** `#12` ou `12` acha pelo número; o maior começo do texto que for apelido ou sigla de um cliente filtra
  o cliente ("he outubro", "hospital evangelico carrossel"); o resto procura no título e na descrição pelo FTS5 por
  prefixo, sem acento. O mês é o de São Paulo (23h30 de 30/09 é setembro). Cursor inválido → `400`.

### 4.20 Horas · núcleo

Telas: `/horas` (F3) e a aba Horas de `/clientes/:sigla` (F5), as duas pelo hook `useApontamentos` do núcleo-web.
Lançar e cronômetro ficam no modal (§4.15).

#### `GET /api/apontamentos`
- **Quem:** qualquer usuário. **Consulta:** `ListarApontamentosConsulta` (padrão: a semana atual; até 92 dias, senão
  `400`). **Resposta:** `ListarApontamentosSaida`.
- Equipe: só os próprios. Atendimento: os próprios + `porCliente` (de todas as pessoas, só o total **por cliente e mês
  inteiro**: o período vira os meses que ele toca e `demandaId` não vale para o total; com uma demanda e um dia, o
  total menos os próprios dava as horas de outra pessoa; segurança da leva 2, achado 4). Admin: os do filtro (todos,
  sem `usuarioId`) + `porCliente` + `porPessoa`, com o recorte pedido. `usuarioId` de outra pessoa sem ser admin: `403`.
  Excluídos (`excluido_em`) não entram; cronômetro ligado entra sem minutos (não soma). `extras` = demandas dos itens
  fora do bootstrap.

#### `PATCH /api/apontamentos/:id` · `DELETE /api/apontamentos/:id`
- **Quem:** o dono ou admin (`pode('apontamento.editar')`). **Corpo:** `EditarApontamentoEntrada`. Cronômetro ligado
  não se edita (`409`: pare antes). `DELETE` marca `excluido_em` (`204`). **Resposta:** `200 Apontamento`.
- **SSE:** `apontamento` (dono+admin), `demanda` (`minutosRegistrados`, `a` e `t` nulos).

## 5. Regras transversais

### 5.1 `mover()`: lugar, posição e efeitos (`server/src/servicos/mover.ts`, único caminho de troca de coluna)
1. **Destino:** `colunaId` ativa de quadro ativo; o quadro de destino é o da coluna (`422 estado_invalido` se
   arquivados; o gatilho `demanda_destino_ativo` também recusa). Demanda arquivada não se move (`422`).
2. **Posição** (§5.10): `posicao` relativa dentro da coluna de destino; padrão = fim. "Enviar para <quadro>" manda a
   coluna de entrada do quadro e `depoisDeId: null` (topo).
3. **Mesma coluna:** só reordena (`demanda.movida` não é gravada; só o evento de `posicao`).
4. **Outra coluna:** grava `coluna_id`, `quadro_id`, `status_desde = max(agora, status_desde anterior + 1 ms)` (o
   gatilho `demanda_status_desde` exige que cresça; com o relógio parado dos testes, criar e mover no mesmo instante
   continua valendo), `atualizado_por` = o usuário do ator (**NULL** para cliente pelo link e sistema, nunca o valor
   anterior) e `atualizado_em`; o gatilho fecha a passagem em `demanda_movimento` e abre outra com esse `por`.
5. **Outro quadro:** etiquetas por §5.6. Cliente, AM, número, histórico, comentários e versões vão junto. **Membros:**
   `membroIds` (Desfazer) substitui; senão `membros: 'responsavel_destino'` troca pelo responsável ativo do cliente na
   equipe do quadro de destino (`cliente_responsavel`; sem cliente, sem equipe ou sem responsável, mantém); senão
   (`manter`, padrão) ficam os mesmos.
6. **Coluna de pessoa:** entrar numa coluna com `responsavelId` S põe S como membro (se ativa); se a coluna de origem
   tinha responsável R ≠ S, tira R (arrastar entre pessoas reatribui, como no Trello da Melt). Sair de uma coluna de
   pessoa para uma comum não tira ninguém. Notifica `membro` a S (se não foi S quem moveu).
7. **Papel da coluna:** entrar numa `concluida` conclui (§5.3, com repetição); sair de uma `concluida` para uma
   não-`concluida` reabre. `aguardando_cliente` só muda a bola (§5.4).
8. **Limite WIP:** se os cards da coluna de destino (§4.6) passarem do limite, devolve o aviso `limite_wip` (nunca
   bloqueia).
9. **Rev:** `rev` opcional no corpo; diferente do atual → `409 conflito_rev`. Mover não sobe o rev.
10. **Notificações** (§5.9): `membro` a quem entrou pelos passos 5 e 6; `chegou` pela regra da §5.9. A atividade
    `demanda.movida` guarda `membrosEntraram`/`membrosSairam` (o Desfazer e a anulação usam).

### 5.2 Prazo e estado do prazo
- Dias úteis = seg a sex fora de `feriado`. Prazo sem hora = `prazoHoraPadrao` (18:00). Não há prazo automático depois
  da criação: o modelo sugere `hoje + prazoDiasUteis` na criação e a pessoa muda à vontade.
- **Estado do prazo** (`estadoPrazo(d, coluna, agora)` em `shared/logica/prazo.ts`; vale para o card, o Início, a
  Agenda, os contadores do cliente, o filtro `prazo` e os jobs de prazo): concluída → `concluida`; com o cliente (§5.4) → `pausado`
  (**nunca atrasada**: o card mostra a data sem cor e "com o cliente há N"); sem prazo → `sem_prazo`; senão `prazo` +
  `prazoHora` contra agora → `atrasada`, `hoje` ou `em_dia`.
- Funções puras em `shared/logica/datas.ts` e `prazo.ts` (dias úteis, somar, diferença, próximo prazo da repetição).

### 5.3 Concluir e repetir (`server/src/servicos/concluir.ts`)
- **Marcar** (`POST /concluir` com `true`, checkbox, ou soltar numa coluna `concluida`): `concluida_em = agora`,
  `concluida_por`; para os cronômetros ligados nela. Já concluída: sem efeito.
- **Repetir** (`repetir` ≠ `nenhuma`, ao marcar por qualquer caminho, menos a coluna virar `concluida`): antes,
  `SELECT id, arquivado_em, excluido_em FROM demanda WHERE origem = 'repeticao' AND origem_demanda_id = ?`:
  - não existe → cria **uma** próxima (índice `demanda_repeticao_uk`);
  - existe arquivada (o Desfazer do concluir arquiva, §5.11) e não excluída → restaura na coluna de entrada do quadro
    de nascimento (abaixo), no topo;
  - existe ativa, ou excluída → nada (concluir, reabrir e concluir de novo não duplica nem para a série).
  - **Próxima desfeita** (arquivada pelo Desfazer, com a original aberta; `SQL_PROXIMA_DESFEITA`): não aparece no
    Arquivo e `POST /restaurar` nela dá `409 conflito` ("Ela volta sozinha quando a #N for concluída."); com a
    original concluída de novo, ela volta pelo caminho acima. Integração 3A, revisão funcional 8.
- **Onde nasce:** no **quadro de nascimento** da original (o da primeira passagem em `demanda_movimento`), na coluna
  de entrada dele, no topo, se o quadro estiver ativo; senão no quadro atual. Ex.: o post semanal criado na Criação e
  concluído no Social › Publicado gera o próximo na Criação. `origem='repeticao'`, `criado_por` = quem concluiu (sem
  usuário: cliente pelo link ou sistema, o `criado_por` da original).
- Prazo seguinte: `diaria` = próximo dia útil; `semanal` = +7 dias; `mensal` = mesmo dia do mês seguinte (31 → último
  dia); se cair em dia não útil, o próximo dia útil. Início e publicação andam o mesmo tanto. Vão junto: título,
  descrição, cliente, AM, prioridade, estimativa, modelo, `repetir`, capa de cor e os checklists (itens desmarcados; o
  de rodada não vai). **Membros:** os da original; nascendo em outro quadro que o atual, o responsável do cliente na
  equipe do quadro de nascimento, se houver (como `responsavel_destino`). **Etiquetas:** as da original no quadro de
  nascimento (as atuais, se nascer no quadro atual; as guardadas, §5.6, se nascer em outro). Não vão: anexos,
  comentários, versões, horas.
- **Automação `concluida`** (§5.5): só quando a marcação vem do checkbox/ação (`POST /concluir`), nunca ao soltar numa
  coluna `concluida` (a pessoa já escolheu o lugar).
- **Desmarcar** (`false`): limpa `concluida_em`/`concluida_por`. Se a demanda estiver numa coluna `concluida`, ela
  volta para a coluna em que estava antes de entrar nela (última passagem em `demanda_movimento`), se ativa; senão
  para a coluna de entrada (`demanda.movida` com `via: 'reabrir'`). A repetição já criada fica.

### 5.4 Com quem está a bola e "parado há"
- `comQuemEsta(d, coluna)` (`shared/logica/quadro.ts`): `concluida` se concluída; `cliente` se `envioPendenteEm` não é
  nulo, **ou** se a coluna é `aguardando_cliente` e o cliente ainda não decidiu depois que a demanda entrou nela
  (`retornoEm` nulo ou `statusDesde > retornoEm`); senão `equipe` (os membros). Assim a decisão do cliente devolve a
  bola mesmo quando nenhuma automação tira o card de "Com o cliente": o prazo da rodada nova volta a poder atrasar e
  o card sai do "Com o cliente há mais de 2 dias" do AM.
- **Parado há** = dias úteis desde `statusDesde` (última mudança de coluna ou de quadro). Com a bola na equipe e acima
  de `paradoLimiteDiasUteis`, o card destaca "parado há N dias úteis". Com o cliente, o contador da equipe pausa e o
  card mostra "com o cliente há N" desde `coalesce(envioPendenteEm, statusDesde)`; acima de `clienteParadoDiasUteis`
  entra no Início do AM ("Com o cliente há mais de 2 dias úteis", com "Copiar lembrete" e "Registrar retorno").

### 5.5 Automações do quadro (`server/src/servicos/automacoes.ts`)
- `executarAutomacao(db, demandaId, gatilho, ator, quadroId)` procura `automacao_quadro` do **quadro de referência**
  com o gatilho e `ativa = 1`:
  - `enviado_ao_cliente` e `concluida`: o quadro atual da demanda;
  - `ajuste_pedido` e `aprovado`: o quadro **do envio decidido** (`envio.quadro_id` do último envio da versão), mesmo
    que a demanda esteja em outro quadro esperando o cliente. É o vaivém Criação → Atendimento › Com o cliente →
    Criação › Fila (ajuste) → Social › Fila (aprovado), todo configurado na Criação.
- Destino ativo → `mover()` para o **topo** da coluna de destino (`via: 'automacao'`, o `gatilho` vai na atividade;
  mudar de quadro segue §5.6 com `etiquetasSemPar: 'deixar'` e os membros pelo `membros` da automação, §5.1). Com a
  demanda esperando o cliente em outro quadro (ex.: Atendimento › Com o cliente), as etiquetas **guardadas no quadro
  do envio** também casam por nome com o destino, além das atuais (`etiquetasTambemDe`; as sem par continuam guardadas
  lá, sem aviso): no vaivém, "Alteração" chega ao Social › Fila e "Urgente" fica na Criação.
  Destino arquivado ou a demanda já está lá → nada (sem erro).
- Gatilhos e quem chama: `enviado_ao_cliente` (enviar, F2), `ajuste_pedido` e `aprovado` (retorno pelo link ou
  manual, aprovado pelo WhatsApp, F2), `concluida` (`POST /concluir`, núcleo). Automações não disparam umas às
  outras (mover nunca é gatilho), então não há laço.
- A resposta da rota que disparou traz `automacao: true` e o navegador mostra "Movida para Social › Agendar · Desfazer".

### 5.6 Etiquetas ao mudar de quadro
- `demanda_etiqueta` guarda cada etiqueta com o quadro **dela**. As etiquetas atuais da demanda (`etiquetaIds`) são
  as do quadro em que ela está; as de outros quadros **ficam guardadas** e reaparecem se ela voltar. Nada se perde no
  vaivém Criação → Atendimento → Criação.
- Ao entrar no quadro B, as etiquetas de B passam a ser: as que a demanda já guardava em B, **mais** as atuais do
  quadro de origem que casam **por nome** (sem caixa e sem acento, `normalizarAlias`; etiqueta só de cor casa por cor)
  com uma etiqueta de B.
- As sem par: `etiquetasSemPar: 'deixar'` (padrão; nomes em `etiquetasDeixadas`, aviso "2 etiquetas ficaram no quadro
  Criação") ou `'criar'` (criadas em B com o mesmo nome e cor, `etiquetasCriadas`). O diálogo "Mover para…" mostra
  quais ficam sem par antes de confirmar; automação e "Enviar para" sempre deixam.
- `etiquetaIds` no corpo substitui o conjunto de B (Desfazer: os ids que ela tinha em B, inclusive nenhum).
- Nunca apaga as linhas do quadro de origem. Ordem na transação: trocar `quadro_id`/`coluna_id`, inserir as de B que
  faltam (`INSERT OR IGNORE`). Excluir uma etiqueta tira a linha guardada também (cascade).

### 5.7 Rodadas
- A rodada 1 (`inicial`) nasce com a demanda (`prazo` e `prazo_original` = prazo da demanda).
- **Prazo da rodada:** com `rodadaAtual = 1`, todo PATCH de `prazo`/`prazoHora` atualiza a rodada 1; com
  `rodadaAtual > 1`, atualiza a rodada atual (renegociação). `prazo_original` nunca muda (gatilho `rodada_imutavel`).
- **Abrir a rodada N+1** (retorno de ajuste ou ajuste interno): fecha a atual, cria a nova com `prazo` e
  `prazoOriginal` (padrão: hoje + `ajustePrazoDiasUteis`), `rodadaAtual = N+1`, `demanda.prazo = prazo`, checklist
  "Ajustes R{N+1}" com uma linha por item (linhas vazias e marcadores `-`, `•`, `1.` são limpos). Passou de
  `rodadasInclusas`: a resposta sugere marcar como extra (não marca sozinho).

### 5.8 Texto vindo de fora
- **Markdown** (componente `Markdown` do design system): markdown-it `{html:false}` + DOMPurify com a allowlist
  p, br, strong, em, s, code, pre, blockquote, ul, ol, li, h1–h3, hr, a **mais só** `span[data-mencao]`;
  `ALLOWED_ATTR` = `href`, `data-mencao`; `ALLOW_DATA_ATTR: false`; `ALLOWED_URI_REGEXP = /^(https:|mailto:)/i`; hook
  `afterSanitizeAttributes` põe `rel="noopener noreferrer nofollow ugc"` e `target="_blank"` nos links.
- **Menção** `@[Nome](mencao:<id>)`: uma regra de renderização do markdown-it, **antes** do DOMPurify, troca o link por
  `<span data-mencao="<id>">@Nome</span>` quando `<id>` casa `^[A-Za-z0-9-]{1,64}$` (nome escapado); senão vira texto.
  Nunca afrouxe a regex de URI para aceitar `mencao:`.
- `origemTexto`, texto do cliente, `nomeInformado` e `comentario` da aprovação: só texto puro. Detector de senha
  (`shared/logica/senha.ts`) avisa na descrição e no comentário, sem bloquear.

### 5.9 Notificações
- `notificar()` (`server/src/servicos/notificacoes.ts`) nunca notifica o próprio ator nem repete a mesma pessoa no
  mesmo fato (quem recebe `mencao` não recebe `comentario`; quem recebe `membro` não recebe `chegou`). Cada
  notificação gera `evento` `notificacao` com público `usuario`.
- Tipos (`TIPOS_NOTIFICACAO`): `membro`, `mencao`, `comentario`, `versao_entregue`, `aprovada`, `ajuste_pedido`,
  `prazo`, `atrasada`, `chegou`. Os do ciclo (F2, `servicos/ciclo.ts`): `versao_entregue` ao AM ("Rafa entregou a V2
  de #123 …"; sem AM, ao atendimento ativo ou, sem ele, aos admins); `aprovada`/`ajuste_pedido` aos membros de antes
  da automação, ao AM e a quem enviou a versão ("Fulana aprovou a V2 de #123 …",
  "Fulana pediu 2 ajustes na V1 de #123 …"; pelo link o ator é o cliente e `atorId` vem nulo); o ajuste interno avisa
  os membros. O sino (F3) monta o link `/d/:numero` pelo `demandaId` e mostra o ícone do tipo quando não há ator.
- **`chegou`** (aos seguidores do quadro): só quando uma demanda **entra** no quadro (criada por outra pessoa, ou vinda
  de outro quadro) e, depois de aplicados os membros (§5.1), **nenhum membro é da equipe do quadro** (quadro sem
  equipe: nenhum membro). Nunca por automação numa coluna `aguardando_cliente` (o envio ao cliente não é trabalho
  novo para o quadro). Assim um quadro com coluna por pessoa ou com `responsavel_destino` quase não gera `chegou`.
- **Jobs das 8h de São Paulo** (painéis, `server/src/tarefas/paineis-prazo.ts`; só em dia útil, contando `feriado`),
  sobre demandas abertas de quadros ativos, para os membros **ativos** (sem nenhum ativo, o AM, se ativo),
  **ignorando `estadoPrazo = 'pausado'`** (com o cliente). Como todo job, roda ao subir se perdeu o horário (servidor
  desligado às 8h ou deploy depois das 8h): aí uma demanda que venceu às 18h do mesmo dia útil já sai como `atrasada`.
  - `prazo`: estado `hoje` (vence hoje e a hora ainda não passou; com a hora já passada sai como `atrasada`); sem
    repetir no mesmo dia (`notificacao_prazo_ix`). Resumo: "#123 Carrossel HE vence hoje, 18h" (com a sigla do
    cliente, quando há);
  - `atrasada`: `estadoPrazo = 'atrasada'` e a pessoa ainda não recebeu `atrasada` desta demanda depois do prazo
    atual (`notificacao_atrasada_ix`): uma vez por pessoa, demanda e prazo; prazo novo (rodada, renegociação) pode
    avisar de novo. Resumo: "#123 Carrossel HE está atrasada desde qua, 15/10".

### 5.10 Posição
- Demandas têm `posicao REAL` **por coluna**; colunas e quadros têm `pos REAL` por quadro e no menu; listas curtas por
  pai (checklist, itens, anexos, etiquetas, favoritos) também. O navegador manda `depoisDeId`/`antesDeId` e o servidor
  calcula: entre vizinhos = média; fim = último + 1024; se a folga ficar < 1e-6, renormaliza o escopo (passo 1024) e
  publica os eventos. Cards escondidos por filtro mantêm o lugar.

### 5.11 Desfazer (aviso "Desfazer")
Só para mutações sem efeito externo, sempre como a mutação inversa pela API: mover (volta para a coluna e a posição
de antes; entre quadros, com os `etiquetaIds` e os `membroIds` de antes), concluir (desmarcar; a repetição criada é
arquivada, e concluir de novo a restaura, §5.3), arquivar (restaurar), membro e etiqueta (tirar/pôr), prazo arrastado
na Agenda ou no Calendário (PATCH), aprovação manual (anular). Gerar link e enviar ao cliente não entram.

## 6. Textos para WhatsApp

Tom da marca: direto, sem exclamação, com data no formato "qui, 16/10, 18h". Uma ideia por linha, o link sozinho na
linha dele (o WhatsApp mostra a prévia) e o título em negrito do WhatsApp (`*título*`, sem asteriscos de dentro; o
modelo da demanda não entra: "Segue Post E-mail…" soava errado). `{contato}` = primeiro nome do contato, com o
tratamento quando o nome começa por um ("Seu Joaquim", "Dona Maria"; `primeiroNome`); sem contato: "Olá, tudo bem?"
no envio e no lembrete (pergunta, não exclamação), "Obrigado." sem nome no aprovado e no ajuste. `{v}` = número da
versão. Lembrete sem link (envio por fora sem link ativo do contato) termina sem o endereço; sem prazo, a linha do
prazo some. `↵` = quebra de linha.

| Modelo | Texto |
|---|---|
| envio (link) | Olá, {contato}.↵Segue a V{v} de \*{titulo}\* para aprovação:↵{url}↵↵Retorno até {prazoRetorno}. |
| envio (por fora) | Olá, {contato}.↵Segue a V{v} de \*{titulo}\* para aprovação.↵↵Retorno até {prazoRetorno}. |
| lembrete | Olá, {contato}.↵Passando para lembrar da V{v} de \*{titulo}\*, que aguarda o seu retorno:↵{url} |
| aprovado | Obrigado, {contato}.↵Registramos a aprovação da V{v} de \*{titulo}\*. |
| ajuste | Obrigado, {contato}.↵Recebemos os ajustes da V{v} de \*{titulo}\*.↵A V{v+1} fica pronta até {prazo}. |
