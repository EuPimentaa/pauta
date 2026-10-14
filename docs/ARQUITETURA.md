# Arquitetura

Sistema interno de demandas da Melt Comunicação. Roda numa VPS da agência (Docker), um processo Node
servindo API + SSE + o front compilado. Banco SQLite em arquivo único.

Produto: `docs/pesquisa/SPEC.md`. Ajustes que valem sobre a SPEC: `docs/ADAPTACOES.md`. Contrato: `docs/API.md`.

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
| Dados web | TanStack Query 5 (cache é a fonte da verdade; eventos do WebSocket atualizam o cache) |
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
  src/index.ts            boot: abre banco, roda migrações, monta app, sobe HTTP + WS, serve web/dist em produção
  src/app.ts              criarApp(db) -> Hono (usado pelo index e pelos testes)
  src/db.ts               abrir(), migrar(), helpers tx/one/all/run
  src/auth.ts             hash/verify, sessões, middleware exigirUsuario / exigirPapel
  src/tempo-real.ts       barramento em memória + SSE; eventos gravados na tabela `evento` (seq) na mesma transação
  src/servicos/*.ts       regras de negócio reutilizáveis (posicao, atividade, notificacoes, ...)
  src/rotas/*.ts          cada arquivo exporta `export function registrar(app: App): void` — descoberto automaticamente
  migracoes/NNN_nome.sql  aplicadas em ordem numérica, cada uma numa transação, registradas em `_migracoes`
  test/*.test.ts
shared/
  tipos/<area>.ts         tipos de domínio, DTOs da API e eventos de tempo real (um arquivo por área)
web/src/
  main.tsx, App.tsx       providers + roteador
  api/cliente.ts          fetch com credenciais, erro tipado, header anti-CSRF
  api/<area>.ts           hooks TanStack Query da área
  tempo-real/             cliente SSE (EventSource) com reconexão e aplicação de eventos no cache
  ui/                     design system (Botao, Campo, Modal, Popover, Menu, Avatar, Etiqueta, Tooltip, ...)
  estilos/tokens.css      tokens claro/escuro (marca Melt)
  telas/<area>/rota.tsx   cada tela exporta `rota` (objeto de rota) — descoberta via import.meta.glob
  extensoes/              registros descobertos via import.meta.glob (ver abaixo)
```

## Pontos de extensão (para trabalho em paralelo sem conflito)

Ninguém edita um arquivo central para "registrar" algo. Cada área cria arquivos novos que são descobertos:

- **Rotas da API**: `server/src/rotas/*.ts` exportando `registrar(app)`.
- **Migrações**: `server/migracoes/NNN_*.sql` com faixa de números reservada por área.
- **Telas**: `web/src/telas/**/rota.tsx` exportando `rota: { caminho, elemento, protegida?, ordem? }`.
- **Itens do menu lateral**: `web/src/extensoes/menu/*.tsx` exportando `item: { id, rotulo, icone, caminho, ordem }`.
- **Seções do modal da demanda**: `web/src/extensoes/demanda/*.tsx` exportando `secao: { id, ordem, coluna: 'principal' | 'lateral', Componente }`.
- **Comandos da paleta Cmd+K**: `web/src/extensoes/comandos/*.ts` exportando `comandos: Comando[]`.
- **Tratadores de eventos de tempo real**: `web/src/extensoes/eventos/*.ts` exportando `tratar(evento, queryClient)`.
- **Tipos compartilhados**: `shared/tipos/<area>.ts`; `shared/tipos/index.ts` só reexporta e é gerado pelo dono do núcleo.

## Convenções do servidor

- Toda rota sob `/api`. JSON em `camelCase`; tabelas e colunas em `snake_case`. Ids: texto (`crypto.randomUUID()`).
- Erro: `{ erro: { codigo: string, mensagem: string } }` com status HTTP adequado. Validação com zod → 400.
- Mutação = transação (`BEGIN IMMEDIATE`) + atividade + linha em `evento`; o barramento entrega depois do commit.
- Datas: ISO 8601 UTC em texto. Prazos "só dia" guardados como `YYYY-MM-DD` em coluna própria.
- Ordenação: coluna `posicao REAL`; inserir entre vizinhos = média; se a folga ficar < 1e-6, renormalizar a lista inteira (passo 1024) e publicar o evento de reordenação.
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

`DATA_DIR` (padrão `./data`) guarda `demandas.db` e `uploads/`.

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
