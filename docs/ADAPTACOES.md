# Adaptações da SPEC para a construção

A referência de produto é `docs/pesquisa/SPEC.md` (v0.2). Ela foi escrita antes de três decisões do dono do
produto. **Onde este arquivo e a SPEC divergirem, vale este arquivo.** Onde este arquivo não falar nada, vale a SPEC.

## Decisões do dono (14/10/2026)

1. **Hospedagem:** VPS da agência com EasyPanel (Ubuntu 24.04), domínio `demandas.meltcomunicacao.com.br`.
   Um container Docker, um processo Node. Nada de Supabase, Vercel ou serverless.
2. **Começar do zero:** nada é importado do Trello nesta construção. O importador fica para depois
   (mantenha colunas `origem_trello_id` anuláveis para ele). Só entram seeds de **configuração** (equipes, modelos de
   quadro, feriados nacionais, parâmetros). Nenhum cliente, pessoa ou demanda real é semeado.
3. **Login por e-mail e senha**, com convite do admin. Sem Google.
4. **Nome: Pauta** (`APP_NOME`, padrão `"Pauta"`).
5. **Quadros separados por equipe, como no Trello.** O dono recusou o fluxo único de etapas da SPEC (§2.3, §5.1, §7.1
   transições, Triagem, visões semeadas). Vale a seção "Modelo de quadros" abaixo, que **substitui** essas partes da SPEC.
   Todo o resto da SPEC que não depende do fluxo único continua valendo (cliente, versões, rodadas, aprovação por link,
   registrar retorno, copiar/colar WhatsApp, comentários, checklists, anexos, histórico, busca, atalhos, segurança, SSE).

## Modelo de quadros (substitui o fluxo único da SPEC)

O objetivo é ser **familiar para quem vem do Trello** e **mais bonito e mais completo que o Dmanda**, com os
diferenciais de agência por cima.

**Estrutura**
- **Quadro**: nome, descrição curta, cor/fundo, equipe (opcional), ordem, arquivado. Estrela (favorito) por pessoa.
  Toda a equipe interna vê e edita todos os quadros (transparência). Só admin cria, renomeia, arquiva e exclui quadro.
- **Coluna** (lista): nome, **cor** (paleta da marca, ou sem cor), posição, limite WIP opcional e um **papel** opcional
  que dá significado sem prender o fluxo: `normal` (padrão), `aguardando_cliente` (pausa o "parado há" e põe a bola com
  o cliente) e `concluida` (cards aqui contam como entregues). Qualquer pessoa interna cria, renomeia, colore, reordena e
  arquiva colunas. Recolher coluna é preferência local (localStorage), como no Trello.
- **Etiquetas por quadro** (nome + cor), várias por card, como no Trello/Dmanda.
- **Demanda (card)**: número global fixo (#123), quadro, coluna, posição, título, descrição em Markdown, **cliente**
  (opcional, mas sugerido), **membros/responsáveis** (vários), **atendimento** (AM, opcional), etiquetas,
  **prioridade** (baixa, média, alta, urgente; padrão média), **início**, **prazo** (data e hora opcional),
  **publicação** (opcional), **concluída** (marca com data), **estimativa**, **repetir** (nenhuma, diária, semanal,
  mensal: ao concluir, cria a próxima com o prazo seguinte), capa (cor ou imagem anexada), arquivada.
- **Mover entre quadros**: a demanda é a mesma (mesmo #, histórico, comentários, versões). Diálogo "Mover para…" com
  quadro + coluna + posição, e atalho rápido de "Enviar para <quadro>" no menu do card.
- **Modelos de demanda** (no lugar dos tipos de peça com campos): por quadro ou globais; nome, descrição-modelo em
  Markdown (o briefing com títulos), checklist padrão, etiquetas padrão, prazo padrão em dias úteis. A criação usa um
  modelo opcional.
- **Automações do quadro** (configuração simples, sem construtor de regras): "ao enviar ao cliente, mover para a coluna
  X", "quando o cliente pedir ajuste, mover para Y", "quando o cliente aprovar, mover para Z (pode ser em outro quadro)",
  "ao marcar concluída, mover para W". Cada uma é opcional.

**Ciclo da peça sem etapas fixas** (o que da SPEC §5.2–§5.4 continua, sem depender de etapas):
- Versões V1…Vn (links do Drive testados, caminho `M:\`, arquivos até 10 MB), "Entregar versão" por qualquer membro.
- "Enviar ao cliente" (admin/atendimento): gera link `/a/:token` ou registra "enviei por fora"; dispara a automação.
- Página pública `/a/:token` exatamente como a SPEC §5.4 (sem login, 409 de versão, idempotência, GET sem efeito).
- "Registrar retorno" (Shift+R) e "Aprovado pelo WhatsApp"; cada ajuste abre a rodada N+1 com prazo novo, motivo e o
  checklist "Ajustes R{N+1}"; rodadas inclusas por cliente (padrão 2) e "marcar como extra"; trilha de aprovação;
  Copiar para WhatsApp.
- **Com quem está a bola**: com o cliente quando a demanda está numa coluna `aguardando_cliente` ou tem envio sem
  decisão; senão com os membros. O card mostra "parado há X dias úteis" desde a última mudança de coluna.

**Telas do MVP**
- **Quadro** (`/q/:slug`): colunas coloridas com contador, arrastar cards e colunas, criação rápida no rodapé da coluna
  (Enter cria; `HE:` = cliente pelo apelido/sigla, `@rafa` = membro), filtros (Só as minhas, cliente, membro, etiqueta,
  prazo, prioridade, texto), alternância **Quadro | Lista | Calendário** (arrastar no calendário muda o prazo).
- **Modal da demanda** (`/d/:numero`, por cima da tela atual), com tudo acima + checklists com progresso, comentários
  com @menção, anexos, atividade, **cronômetro** e lançar tempo, mover/copiar/repetir/arquivar.
- **Início** (`/inicio`): minhas demandas por prazo (atrasadas, hoje, esta semana, depois, sem prazo), "com o cliente há
  mais de 2 dias" para o atendimento, menções recentes e os primeiros passos do admin.
- **Agenda** (`/agenda`): calendário de todos os quadros (mês e semana; semana começa na segunda), "Só as minhas".
- **Busca e comandos** (Cmd/Ctrl+K e `/`), **notificações** (sino), **Clientes** (lista + página do cliente com
  demandas e trilha de aprovações), **Arquivo** (busca e restaurar), **Configurações** (pessoas e convites, equipes,
  quadros, modelos, feriados, aparência), **Nova demanda** (Shift+N) com "Colar do WhatsApp" e cliente criado na hora.
- Celular: menu no topo, quadro com rolagem horizontal por coluna (snap), modal em tela cheia.

**Saem do MVP** (por causa do modelo de quadros): Triagem, fluxo/etapas/transições por papel, visões semeadas,
Minha semana como tela separada (a Agenda com "Só as minhas" cobre), mural (vira uma coluna de avisos se a equipe
quiser), ausência com substituto (v1).

**Papéis**: `admin` (tudo, pessoas, quadros), `atendimento` (clientes, enviar ao cliente, registrar retorno, marcar
extra) e `equipe` (todo o resto das demandas). Todo mundo vê tudo; horas individuais de outra pessoa só o admin vê.

**Visual**: colunas com fundo **levemente tingido** na cor escolhida (tom pastel calculado para contraste AA nos dois
temas) + ponto de cor no título, cards brancos/escuros com sombra suave, vidro fosco só na barra superior, menu lateral,
popovers e modal. É a resposta direta ao "muito bonito" do Dmanda, com a marca Melt (laranja só como acento).

## Banco: SQLite (`node:sqlite`) no lugar do Postgres

A SPEC §6.5 desaconselha SQLite por depender de recursos do Postgres. Cada um é resolvido assim, num único processo
com disco persistente:

| Recurso do Postgres na SPEC | Como fazemos |
|---|---|
| schema fechado, `grant` por coluna, RLS | não existe acesso externo ao arquivo do banco; as permissões por papel e por campo ficam numa camada única do servidor (`servicos/permissoes.ts`), coberta por testes |
| `pg_advisory_xact_lock`, ordem de commit | um só escritor: toda mutação roda em `BEGIN IMMEDIATE ... COMMIT` dentro do processo |
| `LISTEN/NOTIFY` e `seq` sem buracos | tabela `evento(seq INTEGER PRIMARY KEY AUTOINCREMENT, ...)` gravada **na mesma transação** da mutação; depois do commit o barramento em memória entrega aos SSE abertos. Reconexão relê `seq > Last-Event-ID` da tabela (retenção de 7 dias) |
| FKs compostas, CHECK | suportados pelo SQLite; `PRAGMA foreign_keys=ON` em toda conexão |
| `unaccent` na busca | FTS5 com `tokenize='unicode61 remove_diacritics 2'`, tabela de conteúdo externo mantida por gatilhos; busca por prefixo |
| `jsonb` | `TEXT` com `CHECK (json_valid(col))`; `json_extract` quando preciso |
| `timestamptz` | `TEXT` ISO 8601 UTC (`strftime('%Y-%m-%dT%H:%M:%fZ','now')`); datas sem hora em `TEXT YYYY-MM-DD` |
| `boolean` | `INTEGER` 0/1 com CHECK |
| funções/gatilhos de regra de negócio (§6.3) | funções TypeScript em `servicos/` (ex.: `mover()`, `registrarRetorno()`); gatilhos SQL só para integridade simples (FTS, `atualizado_em`) |

Backup: `VACUUM INTO` diário em `DATA_DIR/backups` (mantém 14) feito pelo próprio servidor.

## Login e pessoas

- Senha com scrypt (`node:crypto`), mínimo 10 caracteres, checagem contra uma lista curta de senhas óbvias.
- **Primeiro boot:** se não houver nenhum usuário e existirem `ADMIN_EMAIL` e `ADMIN_SENHA`, cria o admin.
- **Convite:** o admin cadastra a pessoa (nome, apelido, e-mail, papel, equipes) e o sistema gera um **link de convite**
  de uso único, válido por 7 dias, que o admin copia e manda (WhatsApp). A pessoa abre, define a senha e entra.
  O token vai no fragmento do link (`/convite#...`), que não chega a logs nem ao `Referer`.
- **Esqueci a senha:** o admin gera um link de redefinição de uso único (1 h). Sem SMTP nesta construção.
- Sessão por cookie (`__Host-sid` em produção, `sid` em desenvolvimento; httpOnly, SameSite=Lax, Secure em produção),
  30 dias deslizantes, hash no banco. Desativar a pessoa ou mudar o papel revoga as sessões e fecha o SSE dela;
  desativar também revoga convites e redefinições pendentes.
- Limite de tentativas (falhas somadas): 5 em 15 min por e-mail+IP, 20 por hora por e-mail, 50 em 15 min por IP →
  espera progressiva. O IP real vem do `X-Forwarded-For` que o Traefik acrescenta (`TRUST_PROXY_HOPS`, `docs/API.md` §1).
- Anti-CSRF: mutações exigem `X-Trace-Id` (a SPEC usa esse header também para o eco do tempo real) e `Origin` igual
  a `APP_URL`.

## Arquivos

- Disco local: `DATA_DIR/uploads/<2 primeiros do id>/<id>` (nunca o nome original no disco).
- Upload multipart pelo Node, até 10 MB, conferindo magic number (jpg, png, webp, gif, pdf, zip).
- Download interno: `GET /api/arquivos/:id` autenticado, `X-Content-Type-Options: nosniff`, `Content-Disposition:
  attachment` exceto imagens.
- Página pública de aprovação: URL assinada com HMAC e validade de 10 min (`/api/publico/arquivos/:id?exp=&sig=`).
- Logo do cliente só por upload (vai à página pública por URL assinada); não há logo por URL externa.
- Exclusão: marca `excluido_em`; o job diário apaga do disco depois de 30 dias.
- O teste de "Drive público" (SPEC §5.3) é feito pelo servidor com `fetch` sem credenciais.

## Tempo real

SSE como na SPEC §7.3 (`GET /api/eventos`, `Last-Event-ID`, ping 25 s, `event: resync`). Não usamos WebSocket.
Como é um processo só, não há dispatcher com `LISTEN`: o barramento é em memória e a fonte de reenvio é a tabela `evento`.

## Começar do zero sem atrito

Como não há importação, o sistema precisa ser fácil de povoar:
- **Primeiros passos do admin** na tela Início enquanto faltar algo: criar os quadros das equipes (um clique cria
  Atendimento, Criação, Social, Web, Tráfego e Produção a partir de **modelos de quadro** com colunas sugeridas, que o
  admin pode desmarcar ou renomear antes), convidar a equipe, cadastrar clientes, revisar os modelos de demanda.
- **Modelos de quadro** no "Novo quadro": Kanban simples (A fazer, Fazendo, Revisão, Com o cliente, Concluído),
  Por pessoa (uma coluna por membro da equipe + Fila), Semana (Seg…Sex + Concluído) e Em branco.
- **Cliente criado na hora:** em Nova demanda e na criação rápida, se a sigla não existir, oferecer "Criar cliente HE"
  (sigla + nome) sem sair do fluxo; completar o cadastro depois.
- Seed de demonstração **só para desenvolvimento e QA** (`npm run seed:demo --workspace server`), nunca em produção.

## Nome e marca

- O nome do produto é configurável (`APP_NOME`, padrão `"Pauta"`). Nunca escreva o nome fixo no código: use a config.
- Logo: PNGs da marca em `web/public/marca/` (`logo_dark.png`, `logo_white.png`, `emark_*.png`, `bar_rainbow.png`),
  com a técnica de máscara CSS da `marca.md` §3.
- Fonte Syne **hospedada no app** (`web/public/fonts/`, licença OFL), pesos 400–700.

## Bibliotecas do front (já instaladas)

dnd-kit (no lugar do Pragmatic DnD citado na SPEC, que é só inferência sobre o Trello), TanStack Query, react-router,
cmdk, date-fns, lucide-react, sonner, TipTap 3 (StarterKit + Mention), markdown-it (`html: false`) + DOMPurify para
renderizar Markdown. O texto de comentários e do briefing é guardado em **Markdown**.

## Escopo desta construção

O MVP da SPEC §4.1, **menos a importação**, com as trocas acima. Fica para depois tudo o que a SPEC marca como v1/v2.
