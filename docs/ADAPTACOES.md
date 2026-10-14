# Adaptações da SPEC para a construção

A referência de produto é `docs/pesquisa/SPEC.md` (v0.2). Ela foi escrita antes de três decisões do dono do
produto. **Onde este arquivo e a SPEC divergirem, vale este arquivo.** Onde este arquivo não falar nada, vale a SPEC.

## Decisões do dono (14/10/2026)

1. **Hospedagem:** VPS da agência com EasyPanel (Ubuntu 24.04), domínio `demandas.meltcomunicacao.com.br`.
   Um container Docker, um processo Node. Nada de Supabase, Vercel ou serverless.
2. **Começar do zero:** nada é importado do Trello nesta construção. O importador fica para depois
   (mantenha colunas `origem_trello_id` anuláveis para ele). Só entram seeds de **configuração** (equipes, etapas,
   transições, tipos de peça, feriados nacionais, visões). Nenhum cliente, pessoa ou demanda real é semeado.
3. **Login por e-mail e senha**, com convite do admin. Sem Google.

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
- **Primeiros passos do admin** na tela Início enquanto faltar algo: convidar a equipe, cadastrar clientes,
  revisar os tipos de peça, definir aprovador e distribuidor de cada equipe.
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
