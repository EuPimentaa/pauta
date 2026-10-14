# Plano de construção paralela

Como vários agentes constroem o MVP (SPEC §4.1 sem importação, com as trocas de `docs/ADAPTACOES.md`) ao mesmo tempo
sem pisar um no outro. O contrato já está pronto e é a referência de todos:

| Contrato | Arquivo |
|---|---|
| Banco (todas as tabelas do MVP) | `server/migracoes/001_base.sql`, seed de configuração `002_config.sql` |
| Verificação do banco | `node server/scripts/verificar-migracoes.ts` (ou `npm run verificar:migracoes --workspace server`) |
| Tipos, DTOs e eventos | `shared/tipos/*.ts` (reexportados por `shared/tipos/index.ts`) |
| Rotas HTTP | `docs/API.md` (111 rotas, cada uma com dono) |
| Pontos de extensão do front | `web/src/extensoes/tipos.ts` (21 pontos) e a API interna do núcleo-web (§2.2) |
| Stack, pastas e convenções | `docs/ARQUITETURA.md` |

Sumário: [0 Regras para todos](#0-regras-para-todos) · [1 Onda 1](#1-onda-1-núcleo-servidor--design-system-web) ·
[2 Onda 2](#2-onda-2-núcleo-web) · [3 Onda 3](#3-onda-3-funcionalidades) · [4 Pontos de extensão](#4-pontos-de-extensão-quem-fornece-quem-usa) ·
[5 Integração](#5-integração-e-verificação-final) · [6 Dúvidas em aberto](#6-dúvidas-em-aberto) ·
[7 Críticas descartadas](#7-críticas-descartadas)

---

## 0. Regras para todos

1. **Dono único de arquivo.** Cada agente só cria e edita os arquivos e pastas listados como seus. Precisa mudar algo
   de outro dono? Não edite: escreva o pedido em `docs/pedidos/<seu-nome>.md` (arquivo seu) e siga com um contorno
   local. O integrador aplica os pedidos na branch principal entre as ondas.
2. **O contrato não muda por conta própria.** `shared/tipos/*.ts` existentes, `001`/`002`, `docs/API.md` e
   `web/src/extensoes/tipos.ts` só mudam por pedido. Acréscimos sem conflito são livres:
   - tipos novos em `shared/tipos/ext/<funcionalidade>.ts` (importados direto do arquivo, não pelo `index.ts`);
   - lógica pura nova em `shared/logica/<funcionalidade>-*.ts`;
   - migração nova **na sua faixa de números** (só acrescenta: tabela, coluna anulável, índice; nunca altera ou apaga).
3. **Nomes com prefixo da funcionalidade** em tudo que vai para pasta compartilhada: `server/src/rotas/ciclo-envio.ts`,
   `web/src/extensoes/demanda/ciclo-versoes.tsx`, `server/test/ciclo-retorno.test.ts`. O núcleo usa `nucleo`. Nas
   pastas de extensão, o dono de cada arquivo é o glob `web/src/extensoes/*/<f>{,-*}.{ts,tsx}`: valem `mover/ciclo.ts`
   e `mover/ciclo-dialogos.ts`; a conferência do `git diff --name-only` (§5) usa esse glob. Todas as pastas aceitam
   `.ts` e `.tsx`.
4. **Português do Brasil** em código de domínio, mensagens, commits e textos de tela. Tom: direto, sem exclamação, com
   números ("3 demandas atrasadas"). Nome do produto sempre de `APP_NOME` (padrão "Pauta"), nunca fixo.
5. **Sem dependências novas.** As do `package.json` bastam (ARQUITETURA). Se for inevitável, peça (regra 1).
6. **Commits pequenos**, mensagem em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   Sempre `git add <seus caminhos>`; nunca `git add -A` ou `git add .` (na Onda 1 dois agentes dividem a mesma árvore).
7. **Ambiente isolado por agente** (número N na tabela de cada onda): API em `7310+N`, Vite em `5180+N`,
   `DATA_DIR=./data/agente-N`. Exemplo para N=5:
   ```
   PORT=7315 DATA_DIR=./data/agente-5 APP_URL=http://localhost:5185 SEGREDO=<32+ bytes> \
   ADMIN_EMAIL=<seu> ADMIN_SENHA=<sua> npm run dev:server
   API_URL=http://127.0.0.1:7315 npm run dev --workspace web -- --port 5185 --strictPort
   ```
   Em desenvolvimento `APP_URL` é a origem do Vite (o anti-CSRF compara o `Origin`). Credenciais só no `.env` local
   (não versionado); nunca em docs ou commits. Dados de exemplo: `npm run seed:demo --workspace server`.
8. **Pronto = verde em tudo**, na raiz: `npx tsc --noEmit -p server`, `npx tsc --noEmit -p web`, `npm test`,
   `node server/scripts/verificar-migracoes.ts`, `npm run build`, e o roteiro de navegador da sua funcionalidade
   executado (claro e escuro, 1440 px e 390 px).
9. **Segurança não é opcional:** nada de `dangerouslySetInnerHTML`; Markdown só pelo componente seguro do design system;
   texto de fora (WhatsApp, cliente) só como texto puro; URL só `https:`; caminho `M:\` nunca vira `href`.
10. **`shared/**` só importa por caminho relativo com `.ts`** (`../tipos/index.ts`), nunca `@shared`: o alias existe só
    no web (vite e `tsconfig paths`); o servidor roda `shared/` no Node e no `tsc -p server`.
11. **Datas pelo relógio do app:** serviços gravam todo instante com `agora()` (nunca o `DEFAULT now` do SQLite) e
    calculam "hoje" com `hojeSP(agora())`, para os testes fixarem o tempo com `relogio()` (§1.1.1).

---

## 1. Onda 1: NÚCLEO-SERVIDOR + DESIGN-SYSTEM-WEB

Em paralelo, **na branch principal (`master`) e na mesma árvore**, com pastas disjuntas. Começa já.

### 1.1 NÚCLEO-SERVIDOR (agente 1 · API 7311)

**Possui:** `server/**` (exceto `server/migracoes/001_base.sql` e `002_config.sql`, que são contrato),
`shared/logica/**` (cria; menos `filtros.ts` e `sinal.ts`, do NÚCLEO-WEB), `shared/tipos/**` (guarda; muda só para
corrigir o contrato e avisa), `package.json` da raiz, `package-lock.json`, `Dockerfile`, `.dockerignore`,
`.env.example`. Faixa de migração: **003–019**.

**Rotas:** as 47 marcadas "núcleo" em `docs/API.md` (§3 e §4.1–§4.9, menos a trilha de aprovações do cliente).

**Entrega, nesta ordem** (commits pequenos; a ordem destrava a Onda 2 cedo):

1. Base: `src/config.ts` (env: `PORT`, `DATA_DIR`, `APP_URL`, `APP_NOME`, `SEGREDO`, `NODE_ENV`, `TRUST_PROXY_HOPS`,
   `ADMIN_EMAIL`, `ADMIN_SENHA`), `src/db.ts`, `src/erros.ts`, `src/app.ts` (`criarApp(db)` descobre `src/rotas/*.ts`;
   `bodyLimit` de `hono/body-limit` antes de tudo; IP real; máscara de log; cabeçalhos da API §1), `src/index.ts`
   (migra, cria o admin no primeiro boot, sobe HTTP, serve `web/dist` com fallback de SPA, a CSP **exata** da API §1 em
   produção e `Referrer-Policy: no-referrer` no HTML de `/a/*`, `/convite` e `/redefinir`), `GET /api/saude`.
2. Auth e sessão (§4.2 da API), pessoas (§4.3), equipes (§4.4), ausências (§4.5), clientes (§4.6 menos a trilha).
3. Tempo real: tabela `evento` + barramento + `GET /api/eventos`, `/api/sync`, `/api/bootstrap` (§3 da API).
4. Demandas core (§4.8): detalhe, criar, PATCH com If-Match, `mover()`, pegar, arquivar, restaurar, arquivar
   entregues, excluir. Arquivos (§4.9).
5. `shared/logica/` (puro, sem dependências, usado pelo servidor e pelo front): `datas.ts`, `prazo.ts`,
   `transicoes.ts`, `permissoes.ts`, `bola.ts`, `posicao.ts`, `texto.ts`, `senha.ts` (assinaturas em §1.1.2).
6. `server/test/ajuda.ts` (ambiente de teste para todos, fixture abaixo), testes do núcleo, `scripts/seed-demo.ts`
   (descobre `scripts/demo/*.ts`), `src/tarefas.ts` (jobs diários descobertos em `src/tarefas/*.ts`: backup
   `VACUUM INTO`, poda de `evento` com mais de 7 dias que nunca apaga o último, lixo de arquivos sem uso pela lista da
   API §4.9, `ip_hmac` com mais de 12 meses), Dockerfile.

#### 1.1.1 API interna do servidor (o que as funcionalidades chamam)

As funcionalidades da Onda 3 importam estes módulos e **não** reescrevem as regras. Assinaturas fixas:

```ts
// src/db.ts
export type Db = DatabaseSync
export function abrir(caminho: string): Db                    // WAL, foreign_keys=ON, busy_timeout=5000
export function migrar(db: Db, pasta?: string): string[]       // como scripts/verificar-migracoes.ts: 1 transação por arquivo, _migracoes
export function tx<T>(db: Db, fn: () => T): T                  // BEGIN IMMEDIATE ... COMMIT; entrega os eventos depois do commit
export function um<T>(db: Db, sql: string, ...p: unknown[]): T | undefined
export function todos<T>(db: Db, sql: string, ...p: unknown[]): T[]
export function rodar(db: Db, sql: string, ...p: unknown[]): { changes: number; lastInsertRowid: number | bigint }
export function novoId(): Id
export function agora(): Instante                              // relógio do app (os testes fixam com relogio())

// src/erros.ts
export class ErroHttp extends Error { constructor(status: number, codigo: CodigoErro, mensagem: string, detalhes?: Record<string, unknown>) }

// src/auth.ts
export interface Ator { tipo: 'usuario' | 'cliente' | 'sistema'; usuario: Usuario | null; papel: Papel | null;
                        cobrindo: Id[]; traceId: string | null;
                        ip: string }   // N-ésimo item a partir do FIM do X-Forwarded-For (N = TRUST_PROXY_HOPS); sem header, o socket
export type App = Hono<{ Variables: { ator: Ator; db: Db } }>
export const exigirUsuario: MiddlewareHandler                  // 401 sem sessão; em TODA requisição confere sessão não revogada,
                                                               // não expirada e usuario.ativo = 1; põe `ator` no contexto
export function exigirPapel(...papeis: Papel[]): MiddlewareHandler
export function validar<T>(esquema: ZodType<T>, valor: unknown): T   // 400 validacao com detalhes.campos
export function limite(chave: string, max: number, janelaSeg: number): MiddlewareHandler   // 429 em memória (página pública)

// src/servicos/eventos.ts  (grava em `evento` na transação; entrega após o commit)
// publico: 'gestao' para link_publico; `anonimo: true` grava a = null e t = null (minutosRegistrados, API §4.10)
export function emitir(db: Db, ev: { entidade: Entidade; id: string; demandaId?: Id | null; op: 'upsert' | 'delete';
  patch?: object; campos?: string[] | null; publico?: PublicoEvento; usuarioId?: Id; ator: Ator; anonimo?: boolean }): number
export function emitirDemandaInteira(db: Db, demandaId: Id, ator: Ator): number   // c = null: restaurar, reabrir (API §3)
// src/servicos/atividade.ts
export function registrarAtividade<T extends TipoAtividade>(db: Db, a: { tipo: T; ator: Ator; demandaId?: Id;
  clienteId?: Id; dados: MapaDadosAtividade[T]; antes?: Record<string, unknown> }): number
// src/servicos/notificacoes.ts  (resolve ausência → substituto com cobrindoId; ignora o próprio ator; emite o evento)
export function notificar(db: Db, n: { para: Id; tipo: TipoNotificacao; demandaId?: Id; atividadeId?: number;
  ator: Ator; resumo: string }): void
// src/servicos/mover.ts  (único caminho de troca de etapa; API.md §5.1)
export function mover(db: Db, p: { demandaId: Id; ator: Ator;
  para?: { etapaId: Id } | { categoria: Categoria | 'anterior' } | { direcao: 'proxima' | 'anterior' };
  atendidos?: RequisitoTransicao[]; motivo?: string; confirmar?: boolean; responsavelId?: Id | null;
  planejadaPara?: DataLocal | null; posicao?: PosicaoRelativa; rev?: number }): Demanda
// src/servicos/demandas.ts
export function carregarDemanda(db: Db, id: Id): Demanda                       // 404 se não existe
export function carregarDetalhe(db: Db, numero: number, ator: Ator): DemandaDetalhe
export function criarDemanda(db: Db, e: CriarDemandaEntrada & { origem?: OrigemDemanda; repetidaDeId?: Id },
  ator: Ator): CriarDemandaSaida
export function atualizarDemanda(db: Db, id: Id, mudancas: EditarDemandaEntrada & Record<string, unknown>,
  ator: Ator, opcoes?: { rev?: number; semPermissao?: boolean }): Demanda      // recalcula bola/prazo/briefing, grava
                                                                               // atualizado_por, emite o patch
export function emitirContadores(db: Db, demandaId: Id, ator: Ator): void     // re-lê n_* e minutos; emite patch
// src/servicos/mapear.ts  (linha do banco → DTO de shared/tipos; um por entidade)
export const mapear: { demanda(l): Demanda; checklist(l): Checklist; checklistItem(l): ChecklistItem; comentario(l, ...): Comentario;
  anexo(l, arquivo?): Anexo; rodada(l, inclusas: number): Rodada; versao(l, itens): VersaoComItens; versaoItem(l, arquivo?): VersaoItem;
  envio(l): Envio; aprovacao(l): Aprovacao; linkPublico(l, demandaIds): LinkPublicoResumo; usuario(l): Usuario;
  usuarioResumo(l): UsuarioResumo; cliente(l, apelidos): ClienteResumo; /* ... e o resto das entidades de MapaEntidades */ }
// src/servicos/posicao.ts  (média dos vizinhos; renormaliza o escopo com passo 1024 quando a folga < 1e-6)
export function posicaoEntre(db: Db, alvo: { tabela: string; coluna: 'posicao' | 'pos'; escopo?: { coluna: string; valor: unknown } },
  rel: PosicaoRelativa | undefined): number
// src/servicos/arquivos.ts
export function lerArquivo(db: Db, id: Id): { info: ArquivoInfo; caminho: string }
export function urlAssinada(id: Id, minutos: number): string
export function assinaturaValida(id: Id, exp: number, sig: string): boolean
// src/servicos/permissoes.ts  (usa shared/logica/permissoes.ts)
export function relacao(db: Db, d: Demanda, ator: Ator): RelacaoDemanda
// src/tarefas.ts  (jobs diários; funcionalidades criam src/tarefas/<prefixo>-*.ts exportando `tarefa`)
export interface Tarefa { nome: string; horario: HoraLocal; executar(db: Db): void | Promise<void> }
// test/ajuda.ts  (as funcionalidades podem criar test/<prefixo>-ajuda.ts com o que for só delas)
export function ambiente(): Promise<{ app: App; db: Db; pessoas: Record<'admin' | 'am' | 'am2' | 'design' | 'design2' |
  'social' | 'web' | 'aprovadorWeb', Usuario>; clientes: Record<'he' | 'icc', Cliente>;
  como(p: Usuario): { get, post, patch, put, del };            // já com cookie, X-Trace-Id e Origin
  criarDemanda(p?: Partial<CriarDemandaEntrada> & { status?: Categoria; como?: Usuario }): Promise<Demanda>;
       // padrão: HE, Post, como am; `status` leva até a etapa pelos serviços (versão, liberar, envio, retorno), sem rotas
  relogio(instante: Instante | null): void }>                  // fixa agora() (e o "hoje" de SP); null volta ao real
// scripts/demo/*.ts
export function semear(ctx: { db: Db; pessoas; clientes }): void
```

**Fixture do `ambiente()`** (todos os testes contam com ela; nada além disso é garantido):
- pessoas: `admin` (admin); `am`, `am2` (atendimento, equipe Atendimento); `design`, `design2` (executor, Criação);
  `social` (executor, Social); `web`, `aprovadorWeb` (executor, Web).
- equipes: Criação com `aprovadorPadraoId = design2` e `distribuidorId = design2`; Social com `distribuidorId = social`
  e sem aprovador; Web com `aprovadorPadraoId = distribuidorId = aprovadorWeb`; Tráfego sem ninguém.
- clientes: `he` = { sigla HE, apelidos `hospital evangelico`, `atendimentoId: am`, `criativoId: design`,
  `socialId: social`, contato padrão "Fulana" (aprova) }; `icc` = { sigla ICC, `atendimentoId: am2`, sem social e sem
  criativo, contato padrão "Beltrana" }.
- relógio: começa em `2026-10-14T13:00:00.000Z` (quarta, 10h em São Paulo) para os testes de prazo e feriado.

#### 1.1.2 `shared/logica/` (puro; servidor e front usam o mesmo código)

```ts
// datas.ts
hojeSP(agora?: Date): DataLocal; dataLocalDe(i: Instante): DataLocal; ehDiaUtil(d: DataLocal, feriados: ReadonlySet<string>): boolean
somarDiasUteis(d: DataLocal, n: number, feriados): DataLocal; diasUteisEntre(de: DataLocal, ate: DataLocal, feriados): number
segundaDaSemana(d: DataLocal): DataLocal; formatarPrazo(d: DataLocal, h: HoraLocal | null): string  // "qui, 16/10, 18h"
// prazo.ts
prazoCalculado(p: { publicacaoData: DataLocal | null; criadoEm: Instante; tipo: Pick<TipoPeca, 'slaDiasUteis' | 'folgaAprovacaoDias'> }, feriados): DataLocal
prazoCurto(p: { prazo: DataLocal; criadoEm: Instante; slaDiasUteis: number }, feriados): boolean
estadoPrazo(d: Pick<Demanda, 'prazo' | 'prazoHora' | 'status' | 'publicacaoData' | 'publicacaoHora'>, agora: Date): EstadoPrazo
  // API §5.2: triagem/fila/producao/ajuste pelo prazo; publicacao pela data de publicação; revisao/cliente/aprovado
  // = 'pausado' (nunca atrasada); concluido/cancelado = 'concluida'
// transicoes.ts
etapaAplica(e: Etapa, t: TipoPeca | null): boolean
destinoDaDirecao(d: Demanda, direcao: 'proxima' | 'anterior', etapas: Etapa[], tipo: TipoPeca | null): Etapa | 'anterior' | null
avaliarTransicao(p: { demanda: Demanda; para: Etapa | 'anterior'; tipo: TipoPeca | null; transicoes: Transicao[];
  relacao: RelacaoDemanda; corpo?: { motivo?: string; confirmar?: boolean }; atendidos?: RequisitoTransicao[] }):
  | { ok: true; transicao: Transicao }
  | { ok: false; codigo: 'sem_permissao' | 'transicao_invalida'; mensagem: string }
  | { ok: false; codigo: 'requer_dialogo'; dialogo: DialogoTransicao; requer: RequisitoTransicao[]; transicao: Transicao }
// permissoes.ts  (na Triagem, aprovador = aprovadorPadraoId da equipe de tipo.equipeId ?? d.equipeId; API §2)
relacaoCom(d: Demanda, eu: { id: Id; papel: Papel; cobrindo: Id[] }, dic: { equipes: Equipe[]; tipos: TipoPeca[] }): RelacaoDemanda
camposEditaveis(r: RelacaoDemanda): 'todos' | readonly (keyof EditarDemandaEntrada)[]
camposCriacaoProibidos(e: CriarDemandaEntrada, eu: { id: Id; papel: Papel }): (keyof CriarDemandaEntrada)[]  // executor (API §2)
// bola.ts  (API §5.1.1)
calcularBola(d: Pick<Demanda, 'bloqueio' | 'responsavelId' | 'aprovadorId' | 'atendimentoId' | 'revisaoOkEm'>,
  categoria: Categoria, tipo: Pick<TipoPeca, 'aprovacaoCliente'> | null): { bola: Bola; comQuemId: Id | null }
prontaParaEnviar(d: Demanda, tipo: TipoPeca | null): boolean  // revisão + aprovação do cliente + bola com o AM
// posicao.ts
entre(antes: number | null, depois: number | null): number; precisaRenormalizar(a: number, b: number): boolean
// texto.ts
normalizarAlias(s: string): string                    // minúsculo, sem acento, espaços simples
extrairMencoes(md: string): Id[]                      // @[Nome](mencao:<id>)
linhasParaItens(texto: string): string[]              // tira vazias e marcadores "-", "•", "1."
// senha.ts
detectarSenha(texto: string): boolean
```

**Critérios de aceite (testes `node:test` com `app.request()` e banco `:memory:`):**
- login certo/errado; 6ª falha em 15 min no mesmo e-mail+IP → 429; 21ª falha no mesmo e-mail em 1 h vinda de IPs
  diferentes → 429; e-mail inexistente leva o mesmo tempo (scrypt fictício); `X-Forwarded-For: 1.1.1.1, 2.2.2.2` com
  `TRUST_PROXY_HOPS=1` → IP 2.2.2.2; `/auth/senha` errada 6× → 429; convite usado 2× → 410; convite de pessoa
  desativada (consultar e definir) → 410; desativar revoga os tokens pendentes; gerar convite para inativa → 409;
  redefinição revoga sessões antigas; sessão de pessoa desativada → 401 na próxima requisição; mutação sem
  `X-Trace-Id` ou com `Origin` errado → 403 csrf; desativar pessoa derruba a sessão e o SSE; corpo JSON de 2 MiB →
  413 `corpo_grande` sem ler o corpo; cookie `__Host-sid` com `NODE_ENV=production`.
- criar com cliente e tipo → Na fila; sem tipo → Triagem; executor cria → solicitante; executor cria Relatório com
  `aprovadorId` = ele → 403 `campo_nao_permitido`, com `responsavelId` de outra pessoa → 403, com prioridade 1 → 403;
  triagem sem AM notifica todos os atendimentos; prazo calculado pula fim de semana e feriado; número sequencial sem
  repetir sob 20 criações concorrentes (Promise.all); `briefingCampos` com url `javascript:` → 400, chave desconhecida → 400.
- PATCH com rev velho → 409 com `atual.briefingMd`; executor responsável muda briefing e não muda título (403
  `campo_nao_permitido`); comentário de outro não muda o rev; mudar `responsavelSugeridoId` ou `prazoManual` sobe o
  rev; PATCH de prazo com `rodadaAtual = 1` muda a rodada 1 e não muda `prazo_original`.
- mover: cada linha da tabela `transicao` tem um teste de permitido e um de negado; `versao_nova`/`envio`/`retorno`
  pela rota → 409 `requer_dialogo`; Post em Com o cliente → Aprovado → 409 `requer_dialogo` `registrar_retorno` (não
  422); triagem → cancelado pelo aprovador da equipe → ok (a linha exata vence a `*`); etapa que não se aplica → 422;
  Agendar põe o social do cliente e, sem social, deixa sem responsável e notifica o distribuidor do Social; Na fila sem
  responsável notifica o distribuidor (ou o substituto, com `cobrindoId`); cancelar revoga o link público; reabrir
  volta para `etapaAnteriorId` e emite o objeto inteiro; bola em Revisão com aprovador = aprovador, e em Aprovado = AM.
- arquivar/restaurar: restaurar emite `demanda` com `c` nulo; excluir com versão → 409; excluir sem versão limpa
  atividade, notificação, checklist e anexos, e histórico/comentários → 404.
- SSE: evento chega a dois clientes; reconexão com `Last-Event-ID` não perde nem repete; `desde` podado → `resync`
  `historico_podado`; tabela vazia com `desde` antigo → `resync`; `desde` maior que o seq atual → `resync`
  `servidor_reiniciado`; notificação só ao destinatário; apontamento só ao dono e admin; `link_publico` não chega ao
  executor; bootstrap e sync aplicam o mesmo filtro.
- `verificar-migracoes.ts` verde; `npm run seed:demo` cria um ambiente navegável (todas as etapas com cards).
- Roteiro manual: `curl` em `/api/saude`; login pelo `curl` com cookie; `curl -N /api/eventos` mostra o evento de
  um PATCH feito em outro terminal.

### 1.2 DESIGN-SYSTEM-WEB (agente 2 · API 7312, Vite 5182)

**Possui:** `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/package.json`, `web/src/main.tsx`,
`web/src/App.tsx`, `web/src/index.css`, `web/src/estilos/**`, `web/src/ui/**`, `web/src/casca/**`, `web/src/lib/**`,
`web/src/sessao/**`, `web/src/api/cliente.ts`, `web/src/api/auth.ts`, `web/src/extensoes/registro.ts`,
`web/src/telas/auth/**`, `web/src/telas/dev/**`, `web/public/fonts/**`, as extensões `extensoes/avatar/nucleo-tema.tsx`
e `extensoes/avatar/nucleo-sair.tsx`. `web/src/extensoes/tipos.ts` passa a ser dele (muda só por pedido). Não usa migrações.

**Entrega:**
- **Tokens** (`estilos/tokens.css`): exatamente `docs/pesquisa/marca.md` §7 com `light-dark()`, `data-theme`,
  `.chrome-dark`, reduced-motion e o vidro da §8 (cai para sólido com `prefers-reduced-transparency` e `prefers-contrast`).
  Tailwind 4 com `@theme` apontando para os tokens (nada de cor solta nas telas).
- **Fonte Syne** 400–700 em `web/public/fonts/` com o `OFL.txt` (copie os `.woff2` do pacote `@fontsource/syne` via
  `npm pack`, sem adicionar dependência), `font-display: swap`, `tabular-nums` nos contadores.
- **Logo** por máscara CSS sobre `web/public/marca/logo_dark.png` (marca §3), "e" mark no menu recolhido e no
  favicon, barra arco-íris só no login.
- **Componentes `ui/`** (acessíveis, foco visível com `--focus-ring`, nos dois temas): Botao (primário laranja, um
  por tela; secundário; ghost; perigo), BotaoIcone, Campo, AreaTexto, Selecao, Combobox (autocompletar), Checkbox,
  Interruptor, Rotulo, Modal (tela cheia abaixo de 768 px), Folha, Popover, Menu, Tooltip (mostra a tecla), Kbd,
  Avatar (cor por hash do id, nunca laranja), Etiqueta/ChipCliente (`--label-*-bg/-ink`), Contador, Abas,
  Esqueleto, EstadoVazio, SeletorData, SeletorHora, `Markdown` (exatamente a API §5.5: markdown-it `html:false`, regra
  que troca `mencao:<id>` por `<span data-mencao>` antes do DOMPurify, allowlist da SPEC §7.2 + `span[data-mencao]`,
  `ALLOWED_URI_REGEXP = /^(https:|mailto:)/i`, hook `afterSanitizeAttributes` com o `rel`), `EditorMarkdown` (TipTap
  StarterKit + Mention com `injectCSS: false` e o CSS nos estilos; carregado com `lazy()` para não pesar a página
  pública; recebe `buscarPessoas`), `TextoPuro`, `CopiarTexto` (para caminhos `M:\`), avisos com `sonner`.
- **Casca** (`casca/`): barra superior `.chrome-dark` (logo, slots de `extensoes/topo`, avatar com `extensoes/avatar`),
  menu lateral recolhível com `[` (grupos de `extensoes/menu`), barra de abas do celular (`extensoes/celular` por
  papel), faixa "Sem conexão · tentando de novo" (estado exposto por um hook que o NÚCLEO-WEB alimenta).
- **Registro** (`extensoes/registro.ts`): um `import.meta.glob('./<pasta>/*.{ts,tsx}', { eager: true })` por pasta da
  tabela de `extensoes/tipos.ts` (o glob `eager` carrega só metadados: as telas vêm por `carregar`), tipado com
  `ModulosExtensao`, ordenado por `ordem`, com funções `rotas()`, `globais()`, `menus()`, `topo()`, `avatar()`,
  `abasCelular()`, `secoesDemanda()`, `acoesDemanda()`, `menuDemanda()`, `interceptadores()`, `dialogos()`,
  `comandos()`, `fontesBusca()`, `atalhos()`, `tratadores()` (vários por entidade, em ordem de id), `layouts()`,
  `cabecalhoVisao()`, `menuColuna()`, `entradaColuna()`, `secoesInicio()`, `secoesConfig()`. Ids repetidos: erro no
  console em dev.
- **Roteador** (`App.tsx`): rotas de `telas/**/rota.tsx` com `acesso` e `layout`, cada tela por `React.lazy(carregar)`
  com `Suspense` (esqueleto); rotas `sobreposta` renderizam por cima da tela anterior (padrão "background location"
  do react-router); `/` redireciona para `eu.rotaInicial`; rota desconhecida → "Página não encontrada"; título da aba
  "<titulo> · <APP_NOME>". Monta os `globais()` dentro do `QueryClientProvider` e do Router: os de escopo
  `autenticada` só nas rotas com `acesso !== 'publica'`, os de `raiz` em todas. Rota pública nunca chama
  `/api/bootstrap` nem redireciona para `/entrar`.
- **Cliente HTTP** (`api/cliente.ts`): `api<T>(metodo, caminho, { corpo?, ifMatch?, idempotencia?, sinal? })` com
  `credentials: 'same-origin'`, `X-Trace-Id` novo a cada mutação (exporta `ultimosTraces()` para o eco do SSE),
  erro tipado `ErroDaApi { status, codigo, mensagem, detalhes }`, 401 → `/entrar?volta=` (exceto em rota pública).
  `api/auth.ts`: `useEu` (o único; lê `['bootstrap'].eu` quando houver, senão `GET /api/auth/eu`), `useEntrar`,
  `useSair`, convite e redefinição.
- **Telas**: `/entrar`, `/convite`, `/redefinir` (layout vazio, `acesso: 'publica'`; leem o token de `location.hash`,
  apagam o fragmento com `history.replaceState` e chamam `.../consultar` e depois `POST /api/auth/convite` ou
  `/redefinicao` com o token no corpo), `/dev/ui` (catálogo de todos os componentes nos dois temas; só em
  `import.meta.env.DEV`). Tema salvo em `prefs.tema` (PATCH `/api/auth/eu`) e em `localStorage` para pintar antes do login.

**Critérios de aceite:** `npm run build` sem aviso de tamanho acima de 500 kB por chunk (telas em chunks próprios;
TipTap e cmdk fora do chunk inicial); `/dev/ui` no claro e no escuro passa no contraste AA (conferir com o painel de
acessibilidade do navegador) e navega só pelo teclado; login → cai na rota inicial do papel; convite em janela anônima
define a senha e entra (e a URL fica sem o `#token`); 390 px sem rolagem horizontal na casca; `[` recolhe o menu;
nenhuma cor hex fora de `estilos/`; `Markdown` com `[x](javascript:alert(1))` não gera link e com
`@[Rafa](mencao:u1)` gera o `span`; build servido com a CSP da API §1 sem violações no console.

---

## 2. Onda 2: NÚCLEO-WEB

Começa quando a Onda 1 estiver na branch principal. Branch principal, árvore própria. **Agente 3 · API 7313, Vite 5183.**

**Possui:** `web/src/api/**` (exceto `cliente.ts` e `auth.ts`), `web/src/tempo-real/**`, `web/src/quadro/**`,
`web/src/demanda/**`, `web/src/visoes/**`, `web/src/paleta/**`, `web/src/dialogos/**`, `web/src/teclado/**`,
`web/src/telas/visao/**`, `web/src/telas/demanda/**`, `shared/logica/filtros.ts` (só na Onda 2: na Onda 3 passa ao
F6), `shared/logica/sinal.ts` e todos os arquivos `nucleo{,-*}` em `web/src/extensoes/*/`. Sem migrações.

**Entrega:**
- **Componentes globais** (`extensoes/global/`, escopo `autenticada`): `nucleo-tempo-real.tsx` (cliente SSE),
  `nucleo-dialogos.tsx` (host de diálogos), `nucleo-paleta.tsx` (Cmd+K), `nucleo-teclado.tsx` (despachante). Nada é
  montado editando o `App.tsx` do DS.
- **Dados** (`api/`): chaves de cache em `api/chaves.ts` (§2.1); `useBootstrap()` e seletores; `useDetalhe(numero)`;
  mutações otimistas com reversão e aviso; utilitários de cache. Assinaturas fixas na §2.2 (as funcionalidades
  dependem delas). `useEu` não é daqui: é do `api/auth.ts` (DS).
- **Tempo real** (`tempo-real/`): EventSource em `/api/eventos?desde=<seq do bootstrap>`, reconexão 1 s → 30 s (× 4 com a
  aba oculta), polling em `/api/sync` se o SSE falhar, ignora o próprio eco (`t` ∈ traces recentes), `resync` →
  recarrega o bootstrap, entrega a `tratadores()` (vários por entidade, todos, em ordem de id). Tratadores do núcleo:
  demanda e cadastros (cliente, contato, link do cliente, usuário, equipe, ausência, tipo, etapa, visão, feriado).
  Demanda: `c` nulo insere o objeto inteiro (criação, restaurar, reabrir); patch parcial de id desconhecido é
  ignorado; patch com `briefingAtualizadoEm` invalida `['demanda', numero]`. Patches recebidos durante um arraste
  esperam o fim do arraste; card que chega de outra pessoa pisca `--accent-soft` por 1,2 s.
- **Quadro** (`quadro/`): dnd-kit; agrupar por etapa, responsável, cliente ou dia; colunas de 296 px com faixa de 3 px
  da cor da etapa, contador, recolher (`\`, Shift+`\`) e pílula de 44 px, estado salvo em `prefs.colunasRecolhidas`;
  menu da coluna (`menuColuna()`), "+ Adicionar" e a tecla **N** (a tecla é do NW: abre o `entradaColuna()` da coluna
  em foco, se `visivel`); Entregue só com os últimos 7 dias e "ver no Arquivo"; card de 72–88 px com chip do
  cliente, tipo, número, avatar, prazo com estado (`estadoPrazo`, API §5.2) ou **horário marcado** ("19/10, 10h · ICC"
  no lugar do prazo quando houver `agendadaInicio`), **um** sinal (`shared/logica/sinal.ts`: atrasada > pronta para
  enviar > parado > rodada extra > briefing incompleto > bloqueio), contadores > 0, faixa de prioridade; destinos
  permitidos calculados no início do arraste com `avaliarTransicao()` (proibidos esmaecidos com o motivo no tooltip;
  Entregue/Cancelada → `etapaAnteriorId` é a linha `anterior`); transição que pede diálogo → card pendente (opacidade
  0,6, borda tracejada) e `interceptadores()`; Esc devolve em 200 ms; "Movida para X · Desfazer"; rolagem automática
  nas bordas; teclado (setas/J K, Enter, Esc, `,` `.`, Espaço = Pegar, N, Q, X).
- **Visão** (`visoes/`, rota `/v/:slug`): cabeçalho com nome, seletor de layout (`layouts()`), Agrupar por, Só as
  minhas (Q), contador, Limpar (X) e o slot `cabecalhoVisao()`; filtros na URL `?f=` (`shared/logica/filtros.ts`:
  `aplicarFiltros`, `codificarFiltros`, `decodificarFiltros`; escopo da visão com `ou` E chips da URL; exclui sempre
  a Triagem; testes mínimos de cada campo); abaixo de 768 px usa o layout `lista` com `celular: true` se existir.
  Layout `quadro` registrado em `extensoes/layouts/nucleo-quadro.tsx`. Visão sem nenhuma demanda: "Nenhuma demanda
  ainda. Crie a primeira com Shift+N." (§4.1).
- **Modal** (`demanda/`, rota sobreposta `/d/:numero`): abre do cache; Esc fecha; ←/→ e J/K abrem a vizinha; topo com
  cliente · número · título editável, pílula da etapa (só destinos permitidos; usa os mesmos interceptadores), chip da
  bola "há 3 dias" e "cobrindo Samara", ações (`acoesDemanda()`, um primário laranja) e menu ··· (`menuDemanda()`;
  do núcleo: copiar link, arquivar/restaurar); colunas principal/lateral com `secoesDemanda()`; seção lateral do
  núcleo (`nucleo-campos`): cliente, tipo, responsável, atendimento, prioridade + motivo, prazo interno (calculado ou
  manual), publicação, planejada, **horário e local** (`agendadaInicio`/`agendadaFim`/`local`, só quando
  `tipo.comHorario`), **estimativa** (`estimativaMin`), **rodadas inclusas** (atendimento e admin), bloqueio. No 409 de
  rev, mescla campo a campo com `ConflitoRevDetalhes` (inclusive o briefing) e avisa.
- **Paleta** (`paleta/`): Cmd/Ctrl+K e `/` com `cmdk`; recentes primeiro; seções Ações, Demandas, Clientes, Pessoas,
  Visões a partir de `comandos()` e `fontesBusca()`; fontes locais do núcleo: clientes, pessoas e visões (do cache);
  comandos do núcleo: ir para cada visão, alternar tema.
- **Diálogos** (`dialogos/`): host e `abrirDialogo()` (contrato `AbrirDialogo`); id sem diálogo registrado → aviso
  "Disponível em breve"; diálogos do núcleo `confirmar` e `motivo` + interceptador `nucleo-confirmar` (requisitos
  `confirmacao` e `motivo`).
- **Teclado** (`teclado/`): despachante de `atalhos()` com escopos (ativados por `useEscopoAtalho`), acorde G de 1,5 s
  com o indicador "G…", sem atalho de uma letra dentro de campo de texto, desligável por `prefs.atalhos`; foco de
  card por `useFocoDemanda` (§2.2).
- Menu "Visões" (`extensoes/menu/nucleo-visoes.tsx`), o botão de busca no topo (`extensoes/topo/nucleo-busca.tsx`) e a
  aba Busca do celular (`extensoes/celular/nucleo-busca.tsx`, abre a paleta).
- Textos de estado do núcleo (§4.1): coluna vazia, filtro sem resultado, visão vazia, carregamento, sem conexão (o
  estado que alimenta a faixa do DS), erro ao salvar, 409, sem permissão, "Arquivada · Desfazer".

### 2.1 Chaves de cache (TanStack Query) que as funcionalidades usam

| Chave | Dado | Dono da consulta |
|---|---|---|
| `['bootstrap']` | `Bootstrap` (as demandas do quadro vivem aqui) | núcleo-web |
| `['demanda', numero]` | `DemandaDetalhe` | núcleo-web |
| `['demanda', id, 'comentarios']` · `['demanda', id, 'historico']` | `Comentario[]` · `Pagina<Atividade>` (infinita) | modal |
| `['demanda', id, 'links']` | `LinkPublicoComUrl[]` | ciclo |
| `['clientes']` · `['cliente', sigla]` · `['cliente', id, 'aprovacoes']` | listas e detalhe | cadastros |
| `['pessoas']` · `['config', 'app']` · `['feriados', ano]` · `['mural', slug]` · `['arquivo', consulta]` | cadastros | cadastros |
| `['inicio']` · `['semana', usuarioId, inicio]` · `['triagem']` · `['notificacoes']` | painéis | painéis |
| `['apontamentos', consulta]` | horas | modal |
| `['busca', q]` | `BuscaSaida` | entrada |

Toda mutação de uma funcionalidade atualiza o cache pelo retorno da API **e** pelo tratador SSE (idempotente).

**Critérios de aceite:** com `seed:demo`, `/v/geral` com 500 demandas abre em menos de 1 s (medir no Performance);
arrastar entre etapas e pessoas reflete em outra janela em menos de 1 s; arrastar para Com o cliente sem o ciclo
instalado devolve o card com aviso; Esc durante o arraste devolve; recolher coluna persiste após recarregar;
`/d/12` por cima de `/v/criacao` e Esc volta à visão sem recarregar; `?f=` sobrevive ao recarregar; derrubar o
servidor mostra "Sem conexão" e, ao voltar, ressincroniza sem duplicar cards; 409 de rev mescla (inclusive o briefing)
e avisa; restaurar ou reabrir numa janela faz o card aparecer na outra em menos de 1 s; um Post em Agendar aparece
na visão Social; nenhuma visão mostra a Triagem; `/a/qualquer` não chama `/api/bootstrap` nem abre SSE; tudo pelo
teclado; 390 px sem rolagem horizontal da página.

### 2.2 API interna do núcleo-web (o que as funcionalidades importam)

Como a §1.1.1 para o servidor: caminhos e assinaturas fixos. Componentes de extensão não recebem utilitários por
props; usam estes hooks. Mudar uma assinatura é pedido (regra 0.1).

```ts
// web/src/api/chaves.ts  (as chaves da §2.1, tipadas)
export const chaves: {
  bootstrap: readonly ['bootstrap']; detalhe(numero: number): readonly ['demanda', number]
  comentarios(id: Id): readonly ['demanda', Id, 'comentarios']; historico(id: Id): readonly ['demanda', Id, 'historico']
  links(id: Id): readonly ['demanda', Id, 'links']; clientes: readonly ['clientes']; cliente(sigla: string): readonly ['cliente', string]
  aprovacoesCliente(id: Id): readonly ['cliente', Id, 'aprovacoes']; pessoas: readonly ['pessoas']
  configApp: readonly ['config', 'app']; feriados(ano: number): readonly ['feriados', number]
  mural(slug: string): readonly ['mural', string]; arquivo(c: ListarArquivoConsulta): readonly ['arquivo', ListarArquivoConsulta]
  inicio: readonly ['inicio']; semana(usuarioId: Id, inicio: DataLocal): readonly ['semana', Id, DataLocal]
  triagem: readonly ['triagem']; notificacoes: readonly ['notificacoes']
  apontamentos(c: ListarApontamentosConsulta): readonly ['apontamentos', ListarApontamentosConsulta]; busca(q: string): readonly ['busca', string]
}
// web/src/api/cache.ts
export function aplicarPatchDemanda(qc: QueryClient, id: Id, patch: Partial<Demanda>): boolean  // false = id desconhecido (ignorado)
export function inserirDemanda(qc: QueryClient, d: Demanda): void       // objeto inteiro (criação, restaurar, reabrir)
export function removerDemanda(qc: QueryClient, id: Id): void
export function atualizarDetalhe(qc: QueryClient, demandaId: Id, fn: (d: DemandaDetalhe) => DemandaDetalhe): void
export function inserirOuAtualizar<T extends { id: unknown }>(lista: readonly T[], item: T): T[]
// web/src/api/bootstrap.ts  (seletores; todos leem ['bootstrap'])
export function useBootstrap(): UseQueryResult<Bootstrap, ErroDaApi>
export function useDemandas(): Demanda[]
export function useDemanda(id: Id | null): Demanda | undefined
export function useDemandaPorNumero(numero: number): Demanda | undefined
export function useUsuario(id: Id | null): UsuarioResumo | undefined
export function useCliente(id: Id | null): ClienteResumo | undefined
export function useTipo(id: Id | null): TipoPeca | undefined
export function useEtapas(): Etapa[]
export function useTransicoes(): Transicao[]
export function useRelacao(d: Demanda): RelacaoDemanda                   // relacaoCom com Eu, equipes e tipos do cache
// web/src/api/demandas.ts  (otimistas: aplicam na hora, revertem com aviso no erro; null = cancelado pelo usuário)
export function useDetalhe(numero: number): UseQueryResult<DemandaDetalhe, ErroDaApi>
export function useMover(): (d: Demanda, entrada: MoverEntrada, origem: PedidoMover['origem']) => Promise<Demanda | null>
  // calcula a transição (avaliarTransicao), chama o interceptador quando precisa de diálogo, mostra "Movida para X · Desfazer"
export function usePegar(): (d: Demanda) => Promise<Demanda | null>
export function useEditarDemanda(): (d: Demanda, mudancas: EditarDemandaEntrada) => Promise<EditarDemandaSaida | null>
export function useArquivar(): (d: Demanda) => Promise<Demanda | null>  // "Arquivada · Desfazer"
export function useRestaurar(): (d: Demanda) => Promise<Demanda | null>
export function useCriarDemanda(): (e: CriarDemandaEntrada) => Promise<CriarDemandaSaida | null>
// web/src/dialogos/index.ts
export function useAbrirDialogo(): AbrirDialogo                          // id sem diálogo registrado → "Disponível em breve"
export function useContextoAcao(): ContextoAcao                          // eu, navegar, abrirDialogo, demandaEmFoco
// web/src/teclado/index.ts
export function useEscopoAtalho(escopo: EscopoAtalho, ativo?: boolean): void   // ativa enquanto montado (e ativo ≠ false)
export function useFocoDemanda(): [Demanda | null, (d: Demanda | null) => void] // quem desenha cards marca o foco
// web/src/api/auth.ts (DS): useEu(): Eu | undefined — o único useEu do app
```

---

## 3. Onda 3: funcionalidades

Começa quando a Onda 2 estiver na branch principal. **Cada uma num git worktree e branch próprios**, a partir da
branch principal:

```
git worktree add ../melt-demandas-<nome> -b funcionalidade/<nome> master
cd ../melt-demandas-<nome> && npm ci
```

Regras da onda: dono único dos arquivos listados (extensões pelo glob `extensoes/*/<f>{,-*}.{ts,tsx}`); usa as APIs
internas do servidor (§1.1.1) e do front (§2.2); fala com as outras funcionalidades **só** por diálogos
(`abrirDialogo`), eventos SSE e cache (chaves da §2.1), nunca por rota HTTP de outra funcionalidade. Depender de
diálogo de outra funcionalidade é permitido: até o merge dela, o host mostra "Disponível em breve". A `ordem` de cada
contribuição está na §4; os textos de estado vazio e de erro, na §4.1.

| # | Funcionalidade | Branch | Agente N | API / Vite | Migrações |
|---|---|---|---|---|---|
| F1 | Modal completo | `funcionalidade/modal` | 4 | 7314 / 5184 | 020–029 |
| F2 | Ciclo da peça + página pública | `funcionalidade/ciclo` | 5 | 7315 / 5185 | 030–039 |
| F3 | Painéis: Início, Semana, Triagem, sino, ausência | `funcionalidade/paineis` | 6 | 7316 / 5186 | 040–049 |
| F4 | Entrada: Nova demanda, rápida, Colar do WhatsApp, busca, atalhos | `funcionalidade/entrada` | 7 | 7317 / 5187 | 050–059 |
| F5 | Cadastros, Configurações, Mural, Arquivo | `funcionalidade/cadastros` | 8 | 7318 / 5188 | 060–069 |
| F6 | Lista, filtros, visões e celular | `funcionalidade/lista` | 9 | 7319 / 5189 | 070–079 |

Integração e correções pós-merge: faixa **090–099**.

### F1 · Modal completo (`modal`)
- **Possui:** `server/src/rotas/modal-*.ts`, `server/src/servicos/modal-*.ts`, `server/test/modal-*.test.ts`,
  `server/test/modal-ajuda.ts`, `server/scripts/demo/modal.ts`, `web/src/funcionalidades/modal/**`,
  `web/src/extensoes/*/modal{,-*}.{ts,tsx}`.
- **Endpoints (API §4.10, 19):** comentários (GET, POST, PATCH, DELETE), histórico, checklists (POST, PATCH, DELETE),
  itens (POST, PATCH, DELETE), anexos (POST, PATCH, DELETE), repetir, apontamentos (GET, POST, PATCH, DELETE).
- **Extensões:** `demanda/modal-briefing` (campos do tipo inline com ajuda, "Briefing incompleto: falta Formato",
  Markdown com @, "Texto original (WhatsApp)" recolhido como texto puro), `demanda/modal-checklists` (barra e %,
  selo "Ajustes R2 · prazo sex, 17/10"), `demanda/modal-anexos` (links e anexos de referência; Ctrl+V e arrastar
  arquivo; `M:\` com [Copiar caminho]), `demanda/modal-atividade` (abas Comentários | Histórico; compositor com @,
  Ctrl+Enter, "Visível ao cliente" desligado e só para atendimento/admin/quem cobre o AM), `demanda/modal-tempo`
  (lateral: total, meus, [Lançar tempo]), `demanda/modal-cliente` (lateral: links do cliente, pasta de saída com
  Copiar, Acessos); `demanda-menu/modal-repetir` e `modal-mudar-equipe`; `dialogos/modal-repetir`,
  `modal-lancar-tempo`; `atalhos/modal.ts` (Shift+D); `eventos/modal.ts` (comentario, checklist, checklist_item,
  anexo, apontamento).
- **Testes:** contadores `nCheck*`/`nAnexos` no evento de demanda; executor fora da demanda → 403 em checklist;
  menção notifica o mencionado e não o autor, e editar só notifica a menção nova; editar comentário de outro → 403;
  executor com `visivelCliente: true` (POST e PATCH) → 403 `campo_nao_permitido`; anexo `http://` → 400; `anexoIds` de
  outra demanda → 400; repetir copia briefing, campos, links e checklist padrão e marca `repetidaDeId`; repetir por
  executor não copia responsável de outra pessoa; apontamento: executor não lista os de outro (403),
  `minutosRegistrados` atualiza num evento com `a`/`t` nulos e o evento de apontamento só chega ao dono e ao admin;
  histórico paginado em ordem decrescente, sem o `tempo.lancado` de outra pessoa; histórico de demanda excluída → 404.
- **Roteiro de navegador** (só superfícies do F1 e do núcleo): abrir uma demanda do quadro; preencher os campos até
  sumir "Briefing incompleto"; mencionar @Rafa num comentário e conferir, como Rafa, que `GET /api/notificacoes` traz a
  menção e `bootstrap.naoLidas` subiu; marcar item e ver "3/5" no card; colar um print com Ctrl+V; copiar o caminho
  `M:\`; lançar 30 min; Shift+D cria a repetição com a nova data. (O sino do Rafa em outra janela fica para a §5.)

### F2 · Ciclo da peça e página pública (`ciclo`)
- **Possui:** `server/src/rotas/ciclo-*.ts`, `server/src/rotas/publico.ts`, `server/src/servicos/ciclo*.ts`,
  `server/src/servicos/drive.ts`, `server/test/ciclo-*.test.ts`, `server/test/publico-*.test.ts`,
  `server/test/ciclo-ajuda.ts`, `server/scripts/demo/ciclo.ts`, `shared/logica/texto-whatsapp.ts`,
  `web/src/funcionalidades/ciclo/**`, `web/src/telas/publico/**` (`/a/:token`), `web/src/extensoes/*/ciclo{,-*}.{ts,tsx}`.
- **Endpoints (API §4.11 e §4.12, 19):** entregar versão, liberar para envio, editar versão, acrescentar itens à
  versão, testar Drive (versão e avulso), enviar, retorno, aprovado pelo WhatsApp, anular, devolver, extra, texto
  WhatsApp, links da demanda, revogar link, e as 4 rotas públicas. Serviço central: `registrarRetorno()` usado pelo
  link e pelo AM; `abrirRodada()`.
- **Extensões:** `demanda/ciclo-versoes` (linha do tempo V1…Vn com itens, prévia estática, iframe só no clique em
  hosts conhecidos, "enviada em… (link | por fora)", decisões, "Rodada 3 · 2 inclusas" + [Marcar como extra];
  sem versão: texto da §4.1); `demanda-acoes/ciclo.tsx` (Entregar versão, **Liberar para envio** (aprovador, em Revisão,
  tipo com aprovação do cliente), Enviar ao cliente, Registrar retorno, Aprovado pelo WhatsApp, Devolver para ajuste,
  Concluir sem aprovação, Copiar para WhatsApp; primário conforme a etapa e a relação); `dialogos/ciclo-*`
  (`entregar-versao`, `enviar-ao-cliente` com teste de Drive, "[Enviar arquivo (até 10 MB)]" via
  `POST /api/versoes/:id/itens`, aviso "Sem o ok de <aprovador>" e "Copiar para WhatsApp" no fim, `registrar-retorno`
  com Ctrl+V do print e decisão inicial pelo destino do arraste, `devolver-ajuste`, `anular-aprovacao`,
  `copiar-whatsapp`); `mover/ciclo.ts` (interceptador dos diálogos `entregar_versao`, `enviar_ao_cliente`,
  `registrar_retorno`, `devolver_ajuste`, `anular_aprovacao`); `atalhos/ciclo.ts` (Shift+R); `eventos/ciclo.ts`
  (versao, rodada, envio, aprovacao, link_publico).
  Tela pública `/a/:token` (`acesso: 'publica'`, layout vazio, celular primeiro, logo do cliente por URL assinada e
  "por Melt", folha de confirmação ao aprovar, "um ajuste por linha", "Você é Fulana?" (ou o nome, obrigatório),
  nome lembrado no aparelho, 409 "Chegou a V3", 409 "Esta peça não aguarda mais sua decisão", link inativo).
- **Testes:** entregar move para Revisão e notifica o aprovador da equipe; liberar passa a bola ao AM, marca "pronta
  para enviar" e notifica o AM; nova entrega limpa o ok; liberar fora de Revisão → 422; enviar por link reaproveita o
  link ativo do contato; enviar/retorno com contato de outro cliente → 400; Drive privado (fetch simulado) → 422
  `drive_privado`; acrescentar item a versão enviada → 409; `GET /api/publico/a/:token` não muda `acessos` e traz o
  logo assinado; mesma `Idempotency-Key` 2× com o mesmo corpo → uma aprovação e duas 200; mesma chave com outra decisão
  → 422 `idempotencia`; a mesma chave em outro link é outra decisão; decisão com `contatoId` diferente do link → 400;
  sem contato e sem nome → 400; versão antiga → 409 com `versaoAtual` (a última enviada **por este link**); última
  versão enviada por fora → 409 `conflito` sem versão; duas decisões simultâneas → uma 200 e uma 409 `ja_decidida`;
  aprovado com tipo de publicação → Agendar com o social do cliente; anular restaura o responsável anterior; ajuste
  abre a rodada 2 com checklist e prazo em dias úteis pulando feriado; rodada 3 com 2 inclusas → `sugerirExtra`;
  link expirado/revogado ou demanda cancelada → 410; URL assinada vencida → 403; 31ª requisição no minuto no mesmo
  IP+token → 429 e outro token no mesmo IP passa; executor enviando → 403; evento `link_publico` não chega ao
  executor; headers `no-store`, `noindex`, `no-referrer` na API e no HTML de `/a/:token`.
- **Roteiro:** entregar V1 (link do Drive) → como aprovador, "Liberar para envio" → arrastar Revisão → Com o cliente
  abre o diálogo (Esc devolve o card) → enviar por link → abrir o link no celular (390 px), pedir ajuste com 3 linhas
  → o card vai para Ajustes → entregar V2 → enviar → aprovar no celular → Agendar com o social; "Aprovado pelo
  WhatsApp" + Desfazer devolve o responsável.

### F3 · Painéis (`paineis`)
- **Possui:** `server/src/rotas/paineis-*.ts`, `server/src/servicos/paineis*.ts`, `server/src/tarefas/paineis-*.ts`
  (prazo e cobertura, 8h), `server/test/paineis-*.test.ts`, `server/test/paineis-ajuda.ts`, `shared/logica/paineis.ts`,
  `web/src/funcionalidades/paineis/**`, `web/src/telas/{inicio,semana,triagem}/**`,
  `web/src/extensoes/*/paineis{,-*}.{ts,tsx}`.
- **Endpoints (API §4.13, 7):** início, semana, triagem, aceitar, recusar, notificações, marcar lidas.
- **Extensões:** `inicio/paineis-*` (Primeiros passos do admin com os critérios da API §4.13; cada item leva ao
  `caminho` da tela que resolve, ex.: `/config/tipos`, onde fica o botão "Revisei os tipos" do F5; Hoje, Com você agora, Fila da equipe com Pegar, Com o cliente há mais de 2 dias úteis com "Copiar lembrete"
  (diálogo `copiar-whatsapp` do F2) e "Registrar retorno" (diálogo `registrar-retorno` do F2), Atrasadas pelo
  `estadoPrazo`); `layouts/paineis-semana` (layout `semana` das visões, mesmo componente da Minha semana);
  `topo/paineis-sino` (sino com contagem, lista, marcar lidas); `avatar/paineis-ausencia` + `dialogos/paineis-ausencia`;
  `menu/paineis.tsx` (Início, Minha semana, Triagem (n)); `celular/paineis-*` (Início, Semana, Triagem, Sino);
  `atalhos/paineis.ts` (G I, G S, G T; J/K, Enter e Shift+Backspace no escopo `triagem`, ativado com
  `useEscopoAtalho('triagem')`); `eventos/paineis-*.ts` (notificacao; e demanda e ausencia, invalidando `['inicio']`,
  `['semana', …]` e `['triagem']` com debounce de 1 s). Textos de Início vazio, Triagem em dia, Semana livre e sino vazio (§4.1).
- **Testes:** "Com você" inclui a demanda de quem eu cubro hoje com `cobrindoId` e deixa de incluir após o fim da
  ausência (com `relogio()`); "Hoje" põe horário marcado primeiro; fila sem responsável só das minhas equipes; "com o
  cliente há mais de 2 dias úteis" conta feriado; peça com o cliente depois do prazo não entra em Atrasadas; semana
  marca `prazo` quando não há planejada; semana de outra pessoa por executor → 403; aceitar por executor que não é
  aprovador → 403, pelo aprovador da equipe do tipo → ok, e com `equipeId` de outra equipe no corpo → 403; recusar sem
  motivo → 400; notificação de ausente vai ao substituto; tarefa de prazo não repete no mesmo dia (com `relogio()`);
  marcar lidas só emite ao dono; primeiros passos: cada passo vira `feito` pelo critério e o bloco some (nulo) no fim.
- **Roteiro:** executor entra e cai em `/semana`; arrastar card de seg para qua (planejada muda, prazo não, borda
  tracejada some); AM marca ausência com substituto e o substituto vê "cobrindo"; triagem inteira só pelo teclado;
  demanda movida em outra janela aparece/sai do Início em menos de 1 s.

### F4 · Entrada (`entrada`)
- **Possui:** `server/src/rotas/entrada*.ts`, `server/src/rotas/busca.ts`, `server/src/servicos/entrada*.ts`,
  `server/test/entrada-*.test.ts`, `server/test/entrada-ajuda.ts`, `shared/logica/rapida.ts`,
  `shared/logica/colar-whatsapp.ts`, `web/src/funcionalidades/entrada/**`, `web/src/extensoes/*/entrada{,-*}.{ts,tsx}`.
- **Endpoints (API §4.14, 4):** rápida, prévia, analisar (Colar do WhatsApp), busca. A Nova demanda usa
  `POST /api/demandas` (núcleo) e `POST /api/clientes` ("Criar cliente HE" sem sair do fluxo).
- **Extensões:** `dialogos/entrada-nova-demanda` (Colar do WhatsApp no topo; cliente com apelidos e "Criar cliente
  XYZ" quando vier `siglaNova`; grade de até 12 tipos + Outro; título; obrigatórios do tipo com ajuda, opcionais
  recolhidos; publicação → prazo interno calculado e editável com aviso "prazo curto"; horário e local nos tipos com
  horário; padrões de AM e responsável sugerido; executor não vê AM, aprovador nem prioridade; Criar (Ctrl+Enter),
  Criar e abrir, Salvar na triagem); `topo/entrada-nova` (o botão laranja); `celular/entrada-mais` ("+" com foco no
  Colar); `coluna-entrada/entrada-rapida` (linha com chips `HE:`/`@rafa`, prévia ao vivo, Backspace desfaz o chip,
  "Criar cliente XYZ" para `siglaNova`, cliente/responsável/tipo herdados da coluna e dos filtros ativos
  (`ContextoColuna.filtros`); `visivel`: agrupado por etapa só em Na fila; executor só na própria coluna e em "Sem
  responsável"); `busca/entrada-demandas` (fonte Demandas via `/api/busca`; busca vazia com o texto da §4.1);
  `comandos/entrada.ts` (Nova demanda); `atalhos/entrada.ts` (Shift+N e `?`; **N é do NW**); `dialogos/entrada-atalhos`
  (lista do `?` gerada de `atalhos()`).
- **Testes:** "HE: Carrossel @rafa" → cliente HE, responsável Rafa, título "Carrossel"; "he outubro" não vira marcador;
  "XYZ: Banner" com XYZ desconhecida → `siglaNova = 'XYZ'`; executor sem cliente → Triagem; executor com `@outra
  pessoa` → 403; contexto da coluna em casos fechados: coluna responsável = Rafa → `responsavelId` = Rafa; coluna
  cliente = HE → `clienteId` = HE; filtro `tipos` com um só tipo → `tipoPecaId`; coluna dia → `planejadaPara`; na visão
  Meus clientes (sem equipe) e sem `#tipo`, "HE: Ideia" vai para a Triagem com `falta: ['tipo']` e nunca 400; analisar
  reconhece "[14/10 15:32] Fulana:" e o cliente por apelido sem acento; reconhecido → Na fila; busca "#12" acha pelo
  número; "he outubro" filtra o cliente; "acao" acha "Ação"; arquivadas só com `incluirArquivadas`; resposta da busca
  em menos de 150 ms com 5 mil demandas.
- **Roteiro:** Shift+N, colar uma conversa do WhatsApp → cria direto em Na fila; sigla nova "XYZ" → "Criar cliente
  XYZ" sem sair do formulário; N numa coluna da visão Criação por responsável → nasce com aquela pessoa; Cmd+K "#12"
  + Enter abre o modal; `?` lista os atalhos de todas as funcionalidades instaladas.

### F5 · Cadastros (`cadastros`)
- **Possui:** `server/src/rotas/cadastros-*.ts`, `server/src/rotas/{mural,arquivo}.ts`, `server/src/servicos/cadastros*.ts`,
  `server/test/cadastros-*.test.ts`, `server/test/cadastros-ajuda.ts`, `web/src/funcionalidades/cadastros/**`,
  `web/src/telas/{clientes,config,mural,arquivo}/**`, `web/src/extensoes/*/cadastros{,-*}.{ts,tsx}`.
- **Endpoints (API §4.6 trilha, §4.7 menos visões, §4.15; 14):** tipos de peça (POST, PATCH, PUT campos), feriados
  (GET, POST, DELETE), config da aplicação (GET, PATCH com `FAIXAS_CONFIG` e `tiposRevisados`), trilha de aprovações do
  cliente, mural (GET, POST, PATCH, DELETE), arquivo. As telas também usam as rotas do núcleo de pessoas, equipes e clientes.
- **Extensões:** `config/cadastros-*` (Pessoas com convite e "copiar link", redefinição e desativar; Equipes com
  membros, distribuidor e aprovador (opcional); Tipos de peça com campos, até 3 obrigatórios e o botão "Revisei os
  tipos" (`PATCH /api/config/app` com `tiposRevisados: true`); Feriados; Aparência: tema e atalhos);
  `menu/cadastros.tsx` (Clientes, Mural, Arquivo, Configurações); `eventos/cadastros.ts` (aviso).
  Telas: `/clientes` (lista com contadores e "Completar cadastro" pelas `pendencias`), `/clientes/:sigla` (cabeçalho
  com logo enviado, contatos, pasta de saída, links e as pendências; abas Demandas — usa o layout registrado com o
  filtro do cliente —, Aprovações, Configurações: rodadas, apelidos, grupo), `/config/*`, `/equipe/:slug/avisos`
  (mural com fixar e ordenar), `/arquivo` (cliente, mês, tipo, texto; arquivadas e entregues que saíram do quadro;
  restaurar só as arquivadas). Estados vazios de Clientes (com [Cadastrar cliente]), Mural e Arquivo (§4.1).
- **Testes:** 4º obrigatório → 400; feriado novo recalcula os prazos automáticos (e a rodada 1) e não os manuais;
  executor edita o mural da própria equipe e não o da agência; detector de senha devolve o aviso; arquivo filtra por
  mês e cliente e lista a entregue há 8 dias sem arquivar; trilha inclui anuladas; `demandaNumeroInicial` menor que o
  maior número → 400; `conviteValidadeDias: 365` → 400; `uploadLimiteBytes` acima de 10 MB → 400; `tiposRevisados`
  grava o instante.
- **Roteiro** (só superfícies do F5 e do núcleo): admin convida uma pessoa e copia o link → janela anônima define a
  senha e entra; cria cliente com contato padrão e apelidos e vê sumir "Completar cadastro"; muda os campos de um tipo
  e confere que outra janela recebe `tipo_peca` pelo SSE e `['bootstrap'].tipos` mostra o campo novo; restaura do
  Arquivo. (O formulário da Nova demanda mudando fica para a §5.)

### F6 · Lista, filtros, visões e celular (`lista`)
- **Possui:** `server/src/rotas/visoes.ts`, `server/test/lista-*.test.ts`, `web/src/funcionalidades/lista/**`,
  `web/src/extensoes/*/lista{,-*}.{ts,tsx}` e, **na Onda 3**, `shared/logica/filtros.ts` (recebe do NÚCLEO-WEB com
  testes mínimos; corrige o que os testes acharem).
- **Endpoints (API §4.7, 1):** `PATCH /api/visoes/:id`.
- **Extensões:** `layouts/lista-lista` (tabela virtualizada só leitura: #, Cliente, Título, Tipo, Etapa, Com quem,
  Prazo, Publicação, Rodada, Atualizada; ordena pelo cabeçalho; agrupa por etapa, responsável ou cliente; com
  `celular: true` vira lista agrupada com barra de chips das colunas e contagens, toque pula para o grupo);
  `visao-cabecalho/lista-filtros` (chips Cliente, Responsável, Tipo, Prioridade, Prazo, Bola, texto; todos na URL);
  `visao-cabecalho/lista-editar` (admin: editar filtros e colunas recolhidas padrão da visão).
- **Testes:** PATCH de visão por não admin → 403; filtro com categoria inexistente → 400; `aplicarFiltros` coberto
  para cada campo de `FiltrosVisao`, para `ou` (Post da Criação em Agendar entra na visão Social; chip de cliente da
  URL vale também para o `ou`) e para a Triagem sempre fora; `prazo: 'atrasado'` não pega peça com o cliente.
  Estado "filtro sem resultado" na lista (§4.1).
- **Roteiro:** em 390 px a visão vira lista com chips e o modal abre em tela cheia; filtros sobrevivem ao recarregar
  e ao compartilhar a URL; ordenar por prazo; admin muda as recolhidas da Geral e outra janela recebe pelo SSE.

---

## 4. Pontos de extensão: quem fornece, quem usa

Contrato em `web/src/extensoes/tipos.ts`. O DESIGN-SYSTEM-WEB escreve os carregadores (`registro.ts`); quem consome
cada registro está na coluna "mecanismo".

| Ponto | Mecanismo (consome) | Contribuem |
|---|---|---|
| `telas/**/rota.tsx` | DS (roteador, lazy) | DS (auth, dev), NW (visão, demanda), F2 (pública), F3, F5 |
| `extensoes/global` | DS (App.tsx) | NW (tempo real, diálogos, paleta, teclado) |
| `extensoes/menu` | DS (menu lateral) | NW (visões), F3, F5 |
| `extensoes/topo` | DS | NW (busca), F3 (sino), F4 (Nova demanda) |
| `extensoes/avatar` | DS | DS (tema, sair), F3 (ausência) |
| `extensoes/celular` | DS | F3, F4, NW (`nucleo-busca`) |
| `extensoes/demanda` (seções) | NW (modal) | NW (campos), F1, F2 |
| `extensoes/demanda-acoes` | NW | F2 (e quem precisar) |
| `extensoes/demanda-menu` | NW | NW (copiar link, arquivar), F1 (repetir, mudar equipe) |
| `extensoes/mover` (interceptadores) | NW (quadro, pílula, teclado) | NW (confirmar, motivo), F2 |
| `extensoes/dialogos` | NW (host + `abrirDialogo`) | NW (confirmar, motivo), F1, F2 (inclusive `copiar-whatsapp`), F3, F4 |
| `extensoes/comandos` · `extensoes/busca` | NW (paleta) | NW, F4 |
| `extensoes/atalhos` | NW (despachante) | NW (inclusive N), F1, F2, F3, F4 (Shift+N, `?`) |
| `extensoes/eventos` | NW (cliente SSE; vários por entidade) | NW, F1, F2, F3 (notificacao, demanda, ausencia), F5 |
| `extensoes/layouts` · `extensoes/visao-cabecalho` | NW (página da visão) | NW (quadro), F3 (semana), F6 |
| `extensoes/coluna-menu` · `extensoes/coluna-entrada` | NW (quadro) | NW (arquivar entregues), F4 (rápida) |
| `extensoes/inicio` | F3 (tela Início) | F3 |
| `extensoes/config` | F5 (tela Configurações) | F5 |
| `server/src/rotas/*.ts` | NS (`criarApp`) | NS, F1–F6 |
| `server/src/tarefas/*.ts` | NS (`tarefas.ts`) | NS, F3 |
| `server/scripts/demo/*.ts` | NS (`seed-demo.ts`) | NS, F1, F2 |
| `server/migracoes/NNN_*.sql` | NS (`migrar`) | faixas da §3 |

DS = DESIGN-SYSTEM-WEB, NS = NÚCLEO-SERVIDOR, NW = NÚCLEO-WEB.

**`ordem` combinada** (quem não está aqui usa 100, 200… dentro do próprio arquivo; números novos entre os existentes):

| Ponto | Ordem |
|---|---|
| modal, coluna principal (SPEC §5.2) | `modal-briefing` 100 · `modal-checklists` 200 · `ciclo-versoes` 300 · `modal-anexos` 400 · `modal-atividade` 500 |
| modal, coluna lateral | `nucleo-campos` 100 · `modal-tempo` 200 · `modal-cliente` 300 |
| celular (SPEC §5.15) | `paineis-inicio` 100 · `paineis-triagem` (AM) / `paineis-semana` (executor) 200 · `entrada-mais` 300 · `nucleo-busca` 400 · `paineis-sino` 500 |
| menu lateral | grupo `trabalho`: `paineis` (Início 100, Minha semana 200, Triagem 300); grupo `visoes`: `nucleo-visoes` (pela `visao.pos`); grupo `agencia`: `cadastros` (Clientes 100, Mural 200, Arquivo 300, Configurações 400) |
| barra superior | esquerda: `nucleo-busca` 100; direita: `entrada-nova` 100, `paineis-sino` 200 |
| avatar | `paineis-ausencia` 100 · `nucleo-tema` 200 · `nucleo-sair` 900 |
| ações do modal | `ciclo` 100–199 (o primário sai daqui) · outras 200+ |
| menu ··· do modal | `nucleo-copiar-link` 100 · `modal-repetir` 200 · `modal-mudar-equipe` 300 · `nucleo-arquivar` 900 |
| Início | `paineis-primeiros-passos` 50 · `paineis-hoje` 100 · `paineis-com-voce` 200 · `paineis-fila` 300 · `paineis-cliente-parado` 400 · `paineis-atrasadas` 500 |
| layouts | `nucleo-quadro` 100 · `lista-lista` 200 · `paineis-semana` 300 |
| cabeçalho da visão | esquerda: `lista-filtros` 100; direita: `lista-editar` 900 |
| globais | `nucleo-tempo-real` 100 · `nucleo-dialogos` 200 · `nucleo-teclado` 300 · `nucleo-paleta` 400 |

### 4.1 Estados vazios, carregamento e erro (SPEC §5.16): texto e dono

| Estado | Texto ou comportamento | Dono |
|---|---|---|
| Carregamento do quadro e das telas | esqueleto com as colunas, depois os cards; nada de spinner na tela toda | NW (telas do DS: DS) |
| Coluna vazia | "Nenhuma demanda aqui." | NW |
| Filtro sem resultado | "Nenhuma demanda com estes filtros." [Limpar filtros] | NW (quadro), F6 (lista) |
| Visão sem nenhuma demanda (começo do zero) | "Nenhuma demanda ainda. Crie a primeira com Shift+N." | NW |
| Sem conexão | faixa discreta "Sem conexão · tentando de novo"; ao voltar, ressincroniza | NW (estado) + DS (faixa) |
| Erro ao salvar | o card volta: "Não foi possível salvar." [Tentar de novo] | NW |
| Sem permissão | "Você não tem acesso a esta ação." + o motivo (`mensagem` do erro) | NW |
| 409 de rev | "Alguém mudou esta demanda ao mesmo tempo. Juntamos as mudanças." | NW |
| Arquivar | "Arquivada · Desfazer" | NW |
| Início vazio | "Nada com você agora. Veja a fila da equipe ou a sua semana." | F3 |
| Triagem vazia | "Triagem em dia." | F3 |
| Minha semana vazia | "Semana livre. Pegue uma demanda na fila da equipe." | F3 |
| Sino vazio | "Nenhuma notificação." | F3 |
| Busca vazia | "Nada encontrado para "termo". Tente a sigla do cliente ou o número." | F4 |
| Demanda sem versão | "Nenhuma versão entregue. Cole o link do Drive ou o caminho da pasta de saída." | F2 |
| Drive privado | "O cliente verá uma tela de login." [Abrir compartilhamento] [Testar de novo] [Enviar arquivo (até 10 MB)] | F2 |
| Link expirado ou revogado | "Este link de aprovação não está mais ativo. Peça um novo ao seu atendimento." | F2 |
| Versão substituída (409) | "Chegou a V3. Veja a versão nova antes de decidir." | F2 |
| Peça que não aguarda decisão (409) | "Esta peça não aguarda mais sua decisão." | F2 |
| Clientes vazio | "Nenhum cliente cadastrado." [Cadastrar cliente] | F5 |
| Mural vazio | "Nenhum aviso neste mural." [Novo aviso] (para quem pode editar) | F5 |
| Arquivo vazio | "Nada no Arquivo ainda. As entregues saem do quadro depois de {quadroEntregueDias} dias." | F5 |

---

## 5. Integração e verificação final

**Ordem de merge da Onda 3:** F4 → F5 → F3 → F1 → F2 → F6. Os roteiros de cada funcionalidade só usam superfícies
próprias e do núcleo (as checagens cruzadas ficam na verificação final abaixo), mas a ordem ainda importa para o
rebase: F5 entra depois da Nova demanda (F4); F1 depois do sino (F3); F2 depois do selo "Ajustes R2" (F1) e já com o
Início do F3 usando os diálogos do ciclo; F6 por último porque recebe `shared/logica/filtros.ts`.

Para cada funcionalidade, o integrador:
1. Pede à funcionalidade `git rebase master` e o "pronto" da regra 8 verde na própria worktree.
2. Confere o diff: nenhum arquivo fora do que ela possui (`git diff --name-only master...funcionalidade/<nome>`,
   extensões pelo glob `web/src/extensoes/*/<f>{,-*}.{ts,tsx}`); migrações só na faixa dela; nada em
   `shared/tipos/*.ts` existentes nem em `web/src/extensoes/tipos.ts`.
3. `git merge --no-ff funcionalidade/<nome>` na branch principal e roda, na raiz: `npm ci`, `npx tsc --noEmit -p server`,
   `npx tsc --noEmit -p web`, `npm test`, `node server/scripts/verificar-migracoes.ts`, `npm run build`.
4. Aplica os pedidos de `docs/pedidos/*.md` aceitos (migração na faixa 090–099 quando for banco), avisa as outras
   funcionalidades para fazer rebase, e remove a worktree (`git worktree remove`).

**Verificação final** (banco novo, `DATA_DIR` limpo, build de produção servido pelo Node na 7300):
1. Primeiro boot com `ADMIN_EMAIL`/`ADMIN_SENHA` cria o admin; o Início do admin mostra os primeiros passos.
2. Admin convida um AM, um designer e um social; cada um define a senha pelo link (janelas separadas).
3. Admin define o aprovador e o distribuidor da Criação (os primeiros passos vão sumindo), confere os tipos e aperta
   "Revisei os tipos", e cadastra o cliente HE com contato padrão, AM e social.
4. AM cola uma conversa do WhatsApp → demanda em Na fila; o distribuidor recebe a notificação. Na visão Meus
   clientes, N + "HE: Ideia de post" cria na Triagem sem erro.
5. Designer pega pela fila da equipe, move para Em produção, entrega V1 com link do Drive; o **aprovador da Criação**
   recebe "voltou", confere e clica "Liberar para envio"; o AM recebe "voltou" e o card mostra "pronta para enviar"
   (sem aprovador na equipe, o AM recebe direto na entrega).
6. AM envia por link; no celular (390 px) o cliente pede ajuste com 2 linhas; o designer vê "Ajustes R2" com prazo.
7. Designer entrega V2; o aprovador libera; AM envia; cliente aprova; a demanda sai da visão Criação e aparece em
   Agendar na visão Social, com o social; o social conclui.
8. AM arquiva as entregues; a busca do Arquivo encontra a demanda por "he" + palavra do título; restaurar devolve e
   o card reaparece na outra janela. Uma entregue há mais de 7 dias sem arquivar também está no Arquivo.
9. Duas janelas abertas o tempo todo: tudo aparece na outra em menos de 1 s (inclusive o sino do Rafa depois de uma
   menção, e o formulário da Nova demanda depois de mudar os campos de um tipo); derrubar e subir o servidor
   ressincroniza.
10. Tema claro e escuro, teclado apenas no quadro e no modal, CSP da API §1 sem violações no console, `/api/publico/*`
    e `/a/*` com `no-store`/`noindex`/`no-referrer`, convite sem token na URL depois de aberto, backup diário criado
    em `DATA_DIR/backups`.
11. `docker build` e o container sobem com o volume em `/app/data` e respondem em `/api/saude`; atrás do Traefik, o
    limite de login conta o IP real (`TRUST_PROXY_HOPS=1`).

---

## 6. Dúvidas em aberto

Decisões tomadas no contrato que o dono do produto deve confirmar (nenhuma bloqueia o início):

1. **Branch principal:** o repositório usa `master`; o pedido falava em `main`. O plano usa `master`.
2. **SLAs e campos dos tipos** são estimativas: o card "S L A" da Criação é imagem e precisa da transcrição humana
   (SPEC §4.6). Ajuste por Configurações ou por migração da faixa 090–099 antes do dia 1.
3. **Sem aprovação do cliente** no seed: Gravação, Relatório, Ajuste de site, Auditoria e OP de tráfego. Relatório e
   Ajuste de site podem precisar passar pelo cliente.
4. **Feriados:** Carnaval e Corpus Christi entram como facultativos e contam como dia não útil; os municipais da
   sede não foram semeados (falta a cidade).
5. **Prazo de retorno do cliente** padrão = hoje + 2 dias úteis (a SPEC não define).
6. **Anúncio Meta** é da Criação (a peça); o Tráfego executa a campanha por OP.
7. **Visível ao cliente** só pode ser ligado por atendimento, admin ou quem cobre o AM (o executor não fala com o
   cliente, SPEC §7.1). Se a agência quiser que o designer escreva direto ao cliente, abre-se para o responsável.
8. **Notificação de triagem** vai ao AM do cliente; sem AM (sem cliente ou cliente sem AM), a todos os atendimentos
   ativos. Com 7 AMs, isso pode virar ruído; a alternativa é um "plantão da triagem" configurável (v1).
9. **Transições acrescentadas** à SPEC §7.1: entregar direto da fila (fila → revisão), devolver à fila
   (produção → fila) e desfazer a aprovação (aprovado/agendar → com o cliente).
10. **Desativar uma pessoa** não reatribui as demandas dela; o AM ou o admin reatribui.
11. **"Liberar para envio" não é obrigatório:** o AM pode enviar sem o ok do aprovador (o diálogo avisa). Se a agência
    quiser travar, basta acrescentar o requisito à linha revisao → cliente (migração 090–099).
12. **Bola em Aprovado fica com o AM** (só ele move dali), e não com o aprovador como diz o texto da SPEC §2.3 (o
    diagrama da SPEC já punha o AM).
13. **Peça com o cliente, em Revisão ou Aprovado nunca é "atrasada"** (estado `pausado`); o atraso do cliente aparece
    como "parado há" e na lista "Com o cliente há mais de 2 dias úteis".
14. **Logo do cliente só por upload** (a CSP não aceita imagem de host qualquer). Logo por URL externa fica de fora.
15. **Excluir (anonimizar) fica bloqueado com qualquer versão**, não só com aprovação: a versão e seus itens são
    imutáveis. Para essas, cancelar ou arquivar.
16. **Proxy:** `TRUST_PROXY_HOPS=1` supõe o Traefik do EasyPanel como único proxy. Se houver Cloudflare (ou outro CDN)
    na frente do domínio, o valor é 2. Confirmar com quem administra o DNS.
17. **`style-src 'unsafe-inline'`** na CSP: o sonner e o TipTap injetam `<style>` em tempo de execução. Scripts
    continuam só `'self'`. Trocar o sonner por avisos próprios permitiria tirar o `'unsafe-inline'`.

---

## 7. Críticas descartadas

Revisão do contrato pelos críticos de fidelidade, integridade e paralelismo (14/10/2026). As 45 críticas foram
incorporadas (schema, seeds, tipos, API.md, este plano); estas partes foram recusadas:

1. **Integridade 7 (parte), `422 validacao` para chave repetida com outro corpo:** virou `422 idempotencia`, porque no contrato inteiro `validacao` é o 400 do zod.
2. **Integridade 10 (parte), `style-src 'self'` puro:** o sonner e o TipTap injetam `<style>` em tempo de execução; a CSP acusaria violação, então o estilo aceita `'unsafe-inline'` e o script continua só `'self'`.
3. **Integridade 10 (parte), baixar o `logo_url` externo para `arquivo` no cadastro:** seria o servidor buscando URL de usuário (risco de SSRF) por pouco ganho; o logo passou a ser só por upload.
4. **Integridade 12 (parte), liberar url/caminho no gatilho de `versao_item` na exclusão:** abriria brecha na trilha imutável; adotamos a outra opção, bloquear o excluir com qualquer versão.
