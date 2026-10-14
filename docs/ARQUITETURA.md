# Arquitetura

Sistema interno de demandas da Melt Comunicação. Roda numa VPS da agência (Docker), um processo Node
servindo API + SSE + o front compilado. Banco SQLite em arquivo único.

Produto: `docs/pesquisa/SPEC.md`. Ajustes que valem sobre a SPEC: `docs/ADAPTACOES.md`. Contrato: `docs/API.md`
(rotas), `shared/tipos/` (formatos), `server/migracoes/001_base.sql` (banco), `web/src/extensoes/tipos.ts` (pontos de
extensão). Plano de construção paralela, donos de arquivos e faixas de migração: `docs/PLANO.md`.

## Stack (não troque sem motivo forte)

| Camada | Escolha |
|---|---|
| Runtime | Node 24 rodando TypeScript direto (só sintaxe apagável: sem `enum`, `namespace`, parameter properties; imports com `.ts`) |
| HTTP | Hono 4 + `@hono/node-server` |
| Tempo real | SSE em `GET /api/eventos` (ver `docs/ADAPTACOES.md`) |
| Banco | `node:sqlite` (`DatabaseSync`), WAL, `foreign_keys=ON`, `busy_timeout=5000` |
| Validação | zod 4 (servidor) |
| Senhas | `node:crypto` scrypt (N=2^15, r=8, p=1, sal 16 B), comparação com `timingSafeEqual` |
| Front | React 19 + Vite 8 + TypeScript + Tailwind 4 (`@tailwindcss/vite`) |
| Rotas web | react-router 8 |
| Dados web | TanStack Query 5 (cache é a fonte da verdade; eventos do SSE atualizam o cache) |
| Arrastar | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Texto rico | Markdown. Edição com TipTap 3 (StarterKit + Mention) ou textarea com @; exibição com markdown-it (`html:false`) + DOMPurify |
| Paleta Cmd+K | `cmdk` |
| Datas | `date-fns` 4 com locale `ptBR`; fuso de exibição `America/Sao_Paulo` |
| Ícones / toasts | `lucide-react` / `sonner` |
| Testes | `node:test` no servidor (`app.request()` + banco `:memory:`) |

Não adicione dependências sem necessidade. Se precisar, justifique no commit.

## Pastas

```
server/
  src/index.ts            boot: abre banco, roda migrações, cria o admin no 1º boot, sobe HTTP + SSE, serve web/dist
  src/app.ts              criarApp(db) -> Hono (usado pelo index e pelos testes); descobre src/rotas/*.ts
  src/config.ts           variáveis de ambiente
  src/db.ts               abrir(), migrar(), tx/um/todos/rodar, novoId(), agora()
  src/erros.ts            ErroHttp + tratador que devolve ErroApi
  src/auth.ts             scrypt, sessões, Ator, middlewares exigirUsuario / exigirPapel, validar (zod)
  src/tempo-real.ts       barramento em memória + SSE; eventos gravados na tabela `evento` (seq) na mesma transação
  src/tarefas.ts          jobs diários (backup, poda, lixo); descobre src/tarefas/*.ts
  src/servicos/*.ts       regras de negócio reutilizáveis (mover, eventos, atividade, notificacoes, mapear, ...)
  src/rotas/*.ts          cada arquivo exporta `export function registrar(app: App): void` (descoberto automaticamente)
  migracoes/NNN_nome.sql  aplicadas em ordem numérica, cada uma numa transação, registradas em `_migracoes`
  scripts/                verificar-migracoes.ts, seed-demo.ts (+ demo/*.ts, só desenvolvimento)
  test/*.test.ts          test/ajuda.ts monta o ambiente (app + :memory: + pessoas e clientes de teste)
shared/
  tipos/<area>.ts         tipos de domínio, DTOs da API e eventos de tempo real (um arquivo por área; index.ts reexporta)
  tipos/ext/<func>.ts     tipos acrescentados por uma funcionalidade (importados direto)
  logica/*.ts             funções puras usadas pelo servidor e pelo front (dias úteis, prazo, transições, bola,
                          permissões, filtros, criação rápida...)
web/src/
  main.tsx, App.tsx       providers + roteador (rotas de telas/**/rota.tsx)
  api/cliente.ts          fetch com credenciais, erro tipado, X-Trace-Id, If-Match
  api/<area>.ts           hooks TanStack Query (chaves em api/chaves.ts)
  tempo-real/             cliente SSE (EventSource) com reconexão e aplicação de eventos no cache
  ui/                     design system (Botao, Campo, Modal, Popover, Menu, Avatar, Etiqueta, Tooltip, Markdown, ...)
  casca/                  barra superior, menu lateral, abas do celular
  estilos/tokens.css      tokens claro/escuro (marca Melt)
  quadro/ demanda/ visoes/ paleta/ dialogos/ teclado/   núcleo do front (quadro, modal, visão, Cmd+K, diálogos, atalhos)
  funcionalidades/<nome>/ código de cada funcionalidade da Onda 3
  telas/<area>/rota.tsx   cada tela exporta `rota: ExtensaoRota` (descoberta via import.meta.glob)
  extensoes/              tipos.ts (contrato), registro.ts (carregadores) e uma pasta por ponto de extensão
docs/pedidos/<agente>.md  pedidos de mudança de contrato durante as ondas
```

## Pontos de extensão (para trabalho em paralelo sem conflito)

Ninguém edita um arquivo central para "registrar" algo. Cada área cria arquivos novos que são descobertos.
Nome do arquivo com o prefixo da funcionalidade (`ciclo-envio.ts`); o núcleo usa `nucleo-`.

- **Rotas da API**: `server/src/rotas/*.ts` exportando `registrar(app)`.
- **Jobs diários**: `server/src/tarefas/*.ts` exportando `tarefa: { nome, horario, executar(db) }`.
- **Dados de exemplo**: `server/scripts/demo/*.ts` exportando `semear(ctx)`.
- **Migrações**: `server/migracoes/NNN_*.sql` com faixa de números reservada por área (`docs/PLANO.md` §3):
  001–002 contrato, 003–019 núcleo, 020–079 funcionalidades (10 por funcionalidade), 090–099 integração.
  Migração de funcionalidade só acrescenta (tabela, coluna anulável, índice).
- **Front**: 20 pontos com contrato em `web/src/extensoes/tipos.ts` e carregadores em `web/src/extensoes/registro.ts`:
  telas (`telas/**/rota.tsx` → `rota: { caminho, Componente, acesso, layout }`), menu lateral, barra superior, menu
  do avatar, abas do celular, seções/ações/menu ··· do modal, interceptadores de mover (arrastar que abre diálogo),
  diálogos globais (`abrirDialogo(id, params)`), comandos e fontes de busca da paleta, atalhos, tratadores de eventos,
  layouts e cabeçalho da visão, menu e criação rápida da coluna, seções do Início e de Configurações.
- **Tipos compartilhados**: `shared/tipos/<area>.ts`; `shared/tipos/index.ts` só reexporta. Tipos novos de uma
  funcionalidade vão em `shared/tipos/ext/<funcionalidade>.ts`.

## Convenções do servidor

- Toda rota sob `/api`. JSON em `camelCase`; tabelas e colunas em `snake_case`. Ids: texto (`crypto.randomUUID()`).
- Erro: `{ erro: { codigo: string, mensagem: string } }` com status HTTP adequado. Validação com zod → 400.
- Mutação = transação (`BEGIN IMMEDIATE`) + atividade + linha em `evento`; o barramento entrega depois do commit.
- Datas: ISO 8601 UTC em texto. Prazos "só dia" guardados como `YYYY-MM-DD` em coluna própria.
- Ordenação: demandas têm `posicao REAL` **global** (o navegador manda `depoisDeId`/`antesDeId` e o servidor calcula;
  assim os cards escondidos por filtro mantêm o lugar); listas curtas por pai (checklist, itens, anexos, campos,
  avisos, etapas) têm `pos REAL`. Inserir entre vizinhos = média; fim = último + 1024; se a folga ficar < 1e-6,
  renormalizar o escopo inteiro (passo 1024) e publicar os eventos.
- Banco: tabelas `STRICT`; booleanos 0/1; JSON em TEXT com `json_valid`; gatilhos só de integridade (imutabilidade
  das trilhas, contadores `n_*`, histórico de etapa, `rev`, `atualizado_em`, FTS). Toda UPDATE em `demanda` grava
  `atualizado_por`. Regra de negócio fica em `src/servicos/` (ex.: `mover()` é o único caminho de troca de etapa).
- Concorrência: `PATCH /api/demandas/:id` exige `If-Match: <rev>`; decisão pública exige `Idempotency-Key`.
- Exclusão: arquivar (`arquivado_em`) por padrão; exclusão definitiva só por admin.
- Segurança: cookie de sessão `sid` httpOnly, SameSite=Lax, `Secure` quando `NODE_ENV=production`; mutações exigem o header `X-Trace-Id` e Origin igual a `APP_URL` (anti-CSRF); limite de tentativas de login por IP+e-mail; uploads com limite de tamanho, nome sanitizado, servidos com `X-Content-Type-Options: nosniff` e `Content-Disposition: attachment` exceto imagens.

## Convenções do front

- Tudo em português do Brasil, tom direto e simpático, sem jargão.
- Atualização otimista nas mutações frequentes (mover card, marcar checklist, renomear); reverter em erro com toast.
- Acessibilidade: foco visível, navegação por teclado no quadro e no modal, contraste AA nos dois temas.
- Mobile: menu no topo, quadro com rolagem horizontal por coluna (snap), modal em tela cheia.

## Portas

| | dev principal | agente paralelo N |
|---|---|---|
| API + SSE | 7300 | 7310 + N |
| Vite | 5173 | 5180 + N |

`DATA_DIR` (padrão `./data`) guarda `demandas.db` e `uploads/`; cada agente usa `./data/agente-N`.
Números dos agentes: 1 núcleo-servidor, 2 design-system-web, 3 núcleo-web, 4–9 funcionalidades F1–F6 (`docs/PLANO.md`).
Em desenvolvimento, `APP_URL` é a origem do Vite (o anti-CSRF compara o `Origin`).

## Deploy (EasyPanel)

VPS da agência com EasyPanel (Ubuntu 24.04), domínio `demandas.meltcomunicacao.com.br`.

- Serviço do tipo **App**, origem Git, build pelo `Dockerfile` da raiz (multi-stage: compila `web/dist`, imagem final
  `node:24-slim` só com dependências de produção do servidor).
- **Mount** (volume) em `/app/data` → `DATA_DIR=/app/data` (banco + anexos). Sem o volume, os dados somem a cada deploy.
- Porta do container: `7300`. O EasyPanel (Traefik) termina o HTTPS; o SSE precisa de `Cache-Control: no-cache` e `X-Accel-Buffering: no`.
- Variáveis: `APP_NOME`, `SEGREDO` (32+ bytes, assina links), `NODE_ENV=production`, `DATA_DIR=/app/data`, `APP_URL=https://demandas.meltcomunicacao.com.br`,
  `ADMIN_EMAIL` e `ADMIN_SENHA` (só no primeiro boot, para criar o admin; depois remova).
- Health check: `GET /api/saude`.
- Backup: `VACUUM INTO` diário dentro de `/app/data/backups` (mantém 14), feito pelo próprio servidor.
