# Arquitetura

Sistema interno de demandas da Melt Comunicação ("Pauta", nome em `APP_NOME`). Roda numa VPS da agência (Docker),
um processo Node servindo API + SSE + o front compilado. Banco SQLite em arquivo único.

Modelo de trabalho: **quadros separados por equipe, como no Trello** (quadro → colunas coloridas com papel opcional →
cards), com o ciclo da peça (versões, envio ao cliente, aprovação por link, rodadas) e 4 automações simples por
quadro por cima. Não há fluxo único de etapas, triagem nem visões semeadas (`docs/ADAPTACOES.md`, decisões 4 e 5).

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
| Arrastar | `@dnd-kit/core` + `@dnd-kit/sortable` (cards, colunas, favoritos do menu, dias do calendário) |
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
  src/servicos/*.ts       regras de negócio reutilizáveis (mover, concluir, automacoes, demandas, horas, eventos,
                          atividade, notificacoes, permissoes, posicao, mapear, ...)
  src/rotas/*.ts          cada arquivo exporta `export function registrar(app: App): void` (descoberto automaticamente)
  migracoes/NNN_nome.sql  aplicadas em ordem numérica, cada uma numa transação, registradas em `_migracoes`
  scripts/                verificar-migracoes.ts, seed-demo.ts (+ demo/*.ts, só desenvolvimento)
  test/*.test.ts          test/ajuda.ts monta o ambiente (app + :memory: + pessoas, quadros, clientes, criarDemanda com
                          `ate` por SQL, relogio); cada funcionalidade pode ter test/<prefixo>-ajuda.ts
shared/
  tipos/<area>.ts         tipos de domínio, DTOs da API e eventos de tempo real (um arquivo por área; index.ts reexporta)
  tipos/ext/<func>.ts     tipos acrescentados por uma funcionalidade (importados direto)
  logica/*.ts             funções puras usadas pelo servidor e pelo front (dias úteis, prazo e repetição, com quem
                          está a bola, etiquetas entre quadros, permissões, filtros, criação rápida...)
web/src/
  main.tsx, App.tsx       providers + roteador (rotas de telas/**/rota.tsx) + componentes de extensoes/global
  api/cliente.ts          fetch com credenciais, erro tipado, X-Trace-Id, If-Match
  api/<area>.ts           hooks TanStack Query (chaves em api/chaves.ts)
  tempo-real/             cliente SSE (EventSource) com reconexão e aplicação de eventos no cache
  ui/                     design system (Botao, Campo, Modal, Popover, Menu, Avatar, ChipEtiqueta, SeletorCor,
                          GradeCalendario, Tooltip, Markdown, ...)
  casca/                  barra superior, menu lateral (com a seção Quadros e os favoritos), abas do celular
  estilos/tokens.css      tokens claro/escuro (marca Melt; tinta das colunas por cor; fundos de quadro; vidro)
  quadro/ demanda/ paleta/ dialogos/ teclado/ calendario/   núcleo do front (página do quadro, card, modal, Cmd+K,
                          diálogos, atalhos, CalendarioDemandas da Agenda e do Calendário do quadro)
  funcionalidades/<nome>/ código de cada funcionalidade da Onda 3
  telas/<area>/rota.tsx   cada tela exporta `rota: ExtensaoRota` (metadados + `carregar` lazy; descoberta via import.meta.glob)
  extensoes/              tipos.ts (contrato), registro-rotas.ts (só telas; o App.tsx importa), registro.ts (o resto;
                          a casca autenticada importa com import()) e uma pasta por ponto de extensão (global/ incluso)
docs/pedidos/<agente>.md  pedidos de mudança de contrato durante as ondas
```

## Pontos de extensão (para trabalho em paralelo sem conflito)

Ninguém edita um arquivo central para "registrar" algo. Cada área cria arquivos novos que são descobertos.
Nome do arquivo com o prefixo da funcionalidade (`ciclo.ts` ou `ciclo-envio.ts`; dono pelo glob `<f>{,-*}.{ts,tsx}`);
o núcleo usa `nucleo`.

- **Rotas da API**: `server/src/rotas/*.ts` exportando `registrar(app)`.
- **Jobs diários**: `server/src/tarefas/*.ts` exportando `tarefa: { nome, horario, executar(db) }`.
- **Dados de exemplo**: `server/scripts/demo/*.ts` exportando `semear(ctx)`.
- **Migrações**: `server/migracoes/NNN_*.sql` com faixa de números reservada por área (`docs/PLANO.md` §3):
  001–002 contrato, 003–019 núcleo, 020–079 funcionalidades (10 por funcionalidade), 090–099 integração.
  Migração de funcionalidade só acrescenta (tabela, coluna anulável, índice).
- **Front**: 23 pontos + telas, com contrato em `web/src/extensoes/tipos.ts` e carregadores em
  `web/src/extensoes/registro-rotas.ts` (telas) e `web/src/extensoes/registro.ts` (o resto, fora da página pública;
  seções do modal, diálogos, layouts, Início, Configurações e globais entram por `carregar`, com `React.lazy`; funções
  fora do render recebem `qc` e `acoes`) (todas as pastas aceitam `.ts` e `.tsx`): telas (`telas/**/rota.tsx` → `rota: {
  caminho, carregar, acesso, layout }`, com `React.lazy`), componentes globais (`extensoes/global`: SSE, host de
  diálogos, paleta, teclado), menu lateral (fora a seção Quadros, que é da casca), barra superior, menu do avatar, abas
  do celular, cabeçalho e menu ··· do quadro, layouts do quadro (Quadro | Lista | Calendário), menu e criação rápida
  da coluna, selos do card, interceptadores ao soltar card (coluna com papel ou automação), seções/ações/menu ··· do
  modal (o menu também é o de contexto do card), diálogos globais (`abrirDialogo(id, params, { ancora })`, modal ou
  popover), comandos e fontes de busca da paleta, atalhos, tratadores de eventos, seções do Início e de
  Configurações. A API interna do núcleo-web (hooks, `CardDemanda` e utilitários de cache) está no `docs/PLANO.md` §2.2.
- **Tipos compartilhados**: `shared/tipos/<area>.ts`; `shared/tipos/index.ts` só reexporta. Tipos novos de uma
  funcionalidade vão em `shared/tipos/ext/<funcionalidade>.ts`. Dentro de `shared/**`, imports só por caminho relativo
  com `.ts` (o servidor não tem o alias `@shared`, que é só do web).

## Convenções do servidor

- Toda rota sob `/api`. JSON em `camelCase`; tabelas e colunas em `snake_case`. Ids: texto (`crypto.randomUUID()`).
- Erro: `{ erro: { codigo: string, mensagem: string } }` com status HTTP adequado. Validação com zod → 400.
- Mutação = transação (`BEGIN IMMEDIATE`) + atividade + linha em `evento`; o barramento entrega depois do commit.
- Datas: ISO 8601 UTC em texto. Prazos "só dia" guardados como `YYYY-MM-DD` em coluna própria. Todo instante gravado
  pelo app vem de `agora()` (`src/db.ts`), inclusive `criado_em`/`atualizado_em`, para os testes fixarem o relógio
  (`relogio()` do `test/ajuda.ts`); os `DEFAULT now` do SQLite são só rede de segurança.
- Ordenação: demandas têm `posicao REAL` **por coluna** (o navegador manda `depoisDeId`/`antesDeId` e o servidor
  calcula; os cards escondidos por filtro mantêm o lugar); colunas por quadro, quadros no menu e listas curtas por pai
  (checklist, itens, anexos, etiquetas, favoritos) têm `pos REAL`. Inserir entre vizinhos = média; fim = último + 1024;
  se a folga ficar < 1e-6, renormalizar o escopo inteiro (passo 1024) e publicar os eventos.
- Banco: tabelas `STRICT`; booleanos 0/1; JSON em TEXT com `json_valid`; FKs compostas garantem que a coluna de uma
  demanda é do quadro dela, que cada etiqueta guardada é do quadro dela (as de outros quadros ficam guardadas e voltam
  com a demanda) e que evidência, rodada, comentário e link de uma decisão ou envio são da mesma demanda; gatilhos só
  de integridade (imutabilidade das trilhas, contadores `n_*`, histórico de movimentação entre colunas e quadros, `rev`,
  `atualizado_em`, FTS, identidade na trilha, cliente fixo depois do envio, horas seguem o cliente, evidência e arquivo
  em uso não saem, arquivo no lixo não volta, coluna `concluida` exige concluída, destino arquivado, capa só de
  imagem). Toda UPDATE em `demanda` grava `atualizado_por` (NULL para cliente e sistema) e `atualizado_em`; mudar de
  coluna grava `status_desde` maior que o anterior (max(agora, anterior + 1 ms)). Regra de negócio fica em `src/servicos/`
  (`mover()` é o único caminho de troca de coluna ou de quadro; `concluir()` cuida da repetição;
  `executarAutomacao()` dos 4 gatilhos, com o quadro do envio para ajuste e aprovação). `verificar-migracoes.ts`
  confere que as listas fechadas de `shared/tipos` são as mesmas dos CHECK do banco.
- Concorrência: `PATCH /api/demandas/:id` exige `If-Match: <rev>`; decisão pública exige `Idempotency-Key` (por link).
- Exclusão: arquivar (`arquivado_em`) por padrão (demanda, coluna vazia, quadro); demanda: anonimizar só por admin e
  só sem versão, envio ou aprovação; quadro: excluir só se nunca teve demanda.
- Segurança (detalhes em `docs/API.md` §1): cookie `__Host-sid` em produção (`sid` em dev), httpOnly, SameSite=Lax,
  Secure; tokens de 32 bytes guardados como sha256; mutações exigem `X-Trace-Id` e Origin igual a `APP_URL`
  (anti-CSRF); IP real pelo `X-Forwarded-For` com `TRUST_PROXY_HOPS`; limites de login por e-mail+IP, e-mail e IP;
  `bodyLimit` antes do parse (10 MiB no upload, 1 MiB no resto); CSP fixa (API §1); uploads com magic number, servidos
  com `X-Content-Type-Options: nosniff` e `Content-Disposition: attachment` exceto imagens.

## Convenções do front

- Tudo em português do Brasil, tom direto e simpático, sem jargão.
- Atualização otimista nas mutações frequentes (mover card, marcar checklist, renomear); reverter em erro com toast.
- Acessibilidade: foco visível, navegação por teclado no quadro e no modal, contraste AA nos dois temas.
- Mobile: menu no topo, quadro com rolagem horizontal por coluna (snap) e barra de chips das colunas, modal em tela
  cheia, popovers viram folhas.
- Visual (ADAPTACOES): colunas com fundo levemente tingido na cor escolhida + ponto no título, cards claros/escuros com
  sombra suave, vidro fosco só na barra superior, no menu lateral, nos popovers e no modal; laranja só como acento (um
  primário por tela). Recolher coluna, a visão escolhida por quadro e os quadros recentes ficam no `localStorage`.

## Portas

| | dev principal | agente paralelo N |
|---|---|---|
| API + SSE | 7300 | 7310 + N |
| Vite | 5173 | 5180 + N |

`DATA_DIR` (padrão `./data`) guarda `demandas.db` e `uploads/`; cada agente usa `./data/agente-N`.
Números dos agentes: 1 núcleo-servidor, 2 design-system-web, 3 núcleo-web, 4–9 funcionalidades F1–F6 (modal, ciclo,
painéis, entrada, cadastros, lista; `docs/PLANO.md` §3).
Em desenvolvimento, `APP_URL` é a origem do Vite (o anti-CSRF compara o `Origin`).

## Deploy (EasyPanel)

VPS da agência com EasyPanel (Ubuntu 24.04), domínio `demandas.meltcomunicacao.com.br`.

- Serviço do tipo **App**, origem Git, build pelo `Dockerfile` da raiz (multi-stage: compila `web/dist`, imagem final
  `node:24-slim` só com dependências de produção do servidor).
- **Mount** (volume) em `/app/data` → `DATA_DIR=/app/data` (banco + anexos). Sem o volume, os dados somem a cada deploy.
- Porta do container: `7300`. A Cloudflare (proxy laranja) fica na frente e o EasyPanel (Traefik) termina o HTTPS na
  VPS; o SSE sai com `Cache-Control: no-cache` e `X-Accel-Buffering: no`, sem compressão, e o ping de 25 s mantém a
  conexão abaixo do corte de 100 s da Cloudflare. Configuração da Cloudflare: `README.md`.
- Variáveis: `APP_NOME`, `SEGREDO` (32+ bytes, assina links), `NODE_ENV=production`, `DATA_DIR=/app/data`, `APP_URL=https://demandas.meltcomunicacao.com.br`,
  `TRUST_PROXY_HOPS=2` (Cloudflare + Traefik; seria 1 só com o Traefik),
  `ADMIN_EMAIL` e `ADMIN_SENHA` (só no primeiro boot, para criar o admin; depois remova).
- Health check: `GET /api/saude`.
- Backup: `VACUUM INTO` diário dentro de `/app/data/backups` (mantém 14), feito pelo próprio servidor.
