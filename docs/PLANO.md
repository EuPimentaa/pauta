# Plano de construção paralela

Como vários agentes constroem o MVP (SPEC §4.1 sem importação, com as trocas de `docs/ADAPTACOES.md`) ao mesmo tempo
sem pisar um no outro. O contrato já está pronto e é a referência de todos:

| Contrato | Arquivo |
|---|---|
| Banco (todas as tabelas do MVP) | `server/migracoes/001_base.sql`, seed de configuração `002_config.sql` |
| Verificação do banco | `node server/scripts/verificar-migracoes.ts` (ou `npm run verificar:migracoes --workspace server`) |
| Tipos, DTOs e eventos | `shared/tipos/*.ts` (reexportados por `shared/tipos/index.ts`) |
| Rotas HTTP | `docs/API.md` (109 rotas, cada uma com dono) |
| Pontos de extensão do front | `web/src/extensoes/tipos.ts` |
| Stack, pastas e convenções | `docs/ARQUITETURA.md` |

Sumário: [0 Regras para todos](#0-regras-para-todos) · [1 Onda 1](#1-onda-1-núcleo-servidor--design-system-web) ·
[2 Onda 2](#2-onda-2-núcleo-web) · [3 Onda 3](#3-onda-3-funcionalidades) · [4 Pontos de extensão](#4-pontos-de-extensão-quem-fornece-quem-usa) ·
[5 Integração](#5-integração-e-verificação-final) · [6 Dúvidas em aberto](#6-dúvidas-em-aberto)

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
   `web/src/extensoes/demanda/ciclo-versoes.tsx`, `server/test/ciclo-retorno.test.ts`. O núcleo usa o prefixo `nucleo-`
   nas pastas de extensão.
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

---

## 1. Onda 1: NÚCLEO-SERVIDOR + DESIGN-SYSTEM-WEB

Em paralelo, **na branch principal (`master`) e na mesma árvore**, com pastas disjuntas. Começa já.

### 1.1 NÚCLEO-SERVIDOR (agente 1 · API 7311)

**Possui:** `server/**` (exceto `server/migracoes/001_base.sql` e `002_config.sql`, que são contrato),
`shared/logica/**` (cria), `shared/tipos/**` (guarda; muda só para corrigir o contrato e avisa), `package.json` da
raiz, `Dockerfile`, `.dockerignore`, `.env.example`. Faixa de migração: **003–019**.

**Rotas:** as 47 marcadas "núcleo" em `docs/API.md` (§3 e §4.1–§4.9, menos a trilha de aprovações do cliente).

**Entrega, nesta ordem** (commits pequenos; a ordem destrava a Onda 2 cedo):

1. Base: `src/config.ts` (env: `PORT`, `DATA_DIR`, `APP_URL`, `APP_NOME`, `SEGREDO`, `NODE_ENV`, `ADMIN_EMAIL`,
   `ADMIN_SENHA`), `src/db.ts`, `src/erros.ts`, `src/app.ts` (`criarApp(db)` descobre `src/rotas/*.ts`),
   `src/index.ts` (migra, cria o admin no primeiro boot, sobe HTTP, serve `web/dist` com fallback de SPA e CSP da
   SPEC §7.2 em produção), `GET /api/saude`.
2. Auth e sessão (§4.2 da API), pessoas (§4.3), equipes (§4.4), ausências (§4.5), clientes (§4.6 menos a trilha).
3. Tempo real: tabela `evento` + barramento + `GET /api/eventos`, `/api/sync`, `/api/bootstrap` (§3 da API).
4. Demandas core (§4.8): detalhe, criar, PATCH com If-Match, `mover()`, pegar, arquivar, restaurar, arquivar
   entregues, excluir. Arquivos (§4.9).
5. `shared/logica/` (puro, sem dependências, usado pelo servidor e pelo front): `datas.ts`, `prazo.ts`,
   `transicoes.ts`, `permissoes.ts`, `bola.ts`, `posicao.ts`, `texto.ts`, `senha.ts` (assinaturas em §1.1.2).
6. `server/test/ajuda.ts` (ambiente de teste para todos), testes do núcleo, `scripts/seed-demo.ts` (descobre
   `scripts/demo/*.ts`), `src/tarefas.ts` (jobs diários descobertos em `src/tarefas/*.ts`: backup `VACUUM INTO`,
   poda de `evento` com mais de 7 dias, lixo de arquivos, `ip_hmac` com mais de 12 meses), Dockerfile.

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
export function novoId(): Id;  export function agora(): Instante

// src/erros.ts
export class ErroHttp extends Error { constructor(status: number, codigo: CodigoErro, mensagem: string, detalhes?: Record<string, unknown>) }

// src/auth.ts
export interface Ator { tipo: 'usuario' | 'cliente' | 'sistema'; usuario: Usuario | null; papel: Papel | null;
                        cobrindo: Id[]; traceId: string | null; ip: string }
export type App = Hono<{ Variables: { ator: Ator; db: Db } }>
export const exigirUsuario: MiddlewareHandler                  // 401 sem sessão; põe `ator` no contexto
export function exigirPapel(...papeis: Papel[]): MiddlewareHandler
export function validar<T>(esquema: ZodType<T>, valor: unknown): T   // 400 validacao com detalhes.campos

// src/servicos/eventos.ts  (grava em `evento` na transação; entrega após o commit)
export function emitir(db: Db, ev: { entidade: Entidade; id: string; demandaId?: Id | null; op: 'upsert' | 'delete';
  patch?: object; campos?: string[] | null; publico?: PublicoEvento; usuarioId?: Id; ator: Ator }): number
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
// test/ajuda.ts
export function ambiente(): Promise<{ app: App; db: Db; pessoas: Record<'admin' | 'am' | 'am2' | 'design' | 'design2' |
  'social' | 'web' | 'aprovadorWeb', Usuario>; clientes: Record<'he' | 'icc', Cliente>;
  como(p: Usuario): { get, post, patch, put, del }; /* já com cookie, X-Trace-Id e Origin */ }>
// scripts/demo/*.ts
export function semear(ctx: { db: Db; pessoas; clientes }): void
```

#### 1.1.2 `shared/logica/` (puro; servidor e front usam o mesmo código)

```ts
// datas.ts
hojeSP(agora?: Date): DataLocal; dataLocalDe(i: Instante): DataLocal; ehDiaUtil(d: DataLocal, feriados: ReadonlySet<string>): boolean
somarDiasUteis(d: DataLocal, n: number, feriados): DataLocal; diasUteisEntre(de: DataLocal, ate: DataLocal, feriados): number
segundaDaSemana(d: DataLocal): DataLocal; formatarPrazo(d: DataLocal, h: HoraLocal | null): string  // "qui, 16/10, 18h"
// prazo.ts
prazoCalculado(p: { publicacaoData: DataLocal | null; criadoEm: Instante; tipo: Pick<TipoPeca, 'slaDiasUteis' | 'folgaAprovacaoDias'> }, feriados): DataLocal
prazoCurto(p: { prazo: DataLocal; criadoEm: Instante; slaDiasUteis: number }, feriados): boolean
estadoPrazo(d: Pick<Demanda, 'prazo' | 'prazoHora' | 'status'>, agora: Date): 'atrasada' | 'hoje' | 'em_dia' | 'sem_prazo' | 'concluida'
// transicoes.ts
etapaAplica(e: Etapa, t: TipoPeca | null): boolean
destinoDaDirecao(d: Demanda, direcao: 'proxima' | 'anterior', etapas: Etapa[], tipo: TipoPeca | null): Etapa | 'anterior' | null
avaliarTransicao(p: { demanda: Demanda; para: Etapa | 'anterior'; tipo: TipoPeca | null; transicoes: Transicao[];
  relacao: RelacaoDemanda; corpo?: { motivo?: string; confirmar?: boolean }; atendidos?: RequisitoTransicao[] }):
  | { ok: true; transicao: Transicao }
  | { ok: false; codigo: 'sem_permissao' | 'transicao_invalida'; mensagem: string }
  | { ok: false; codigo: 'requer_dialogo'; dialogo: DialogoTransicao; requer: RequisitoTransicao[]; transicao: Transicao }
// permissoes.ts
relacaoCom(d: Demanda, eu: { id: Id; papel: Papel; cobrindo: Id[] }): RelacaoDemanda
camposEditaveis(r: RelacaoDemanda): 'todos' | readonly (keyof EditarDemandaEntrada)[]
// bola.ts
calcularBola(d: Pick<Demanda, 'bloqueio' | 'responsavelId' | 'aprovadorId' | 'atendimentoId'>, categoria: Categoria): { bola: Bola; comQuemId: Id | null }
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
- login certo/errado; 6ª falha em 15 min → 429; convite usado 2× → 410; redefinição revoga sessões antigas;
  mutação sem `X-Trace-Id` ou com `Origin` errado → 403 csrf; desativar pessoa derruba a sessão e o SSE.
- criar com cliente e tipo → Na fila; sem tipo → Triagem; executor cria → solicitante; prazo calculado pula
  fim de semana e feriado; número sequencial sem repetir sob 20 criações concorrentes (Promise.all).
- PATCH com rev velho → 409 com `atual`; executor responsável muda briefing e não muda título (403
  `campo_nao_permitido`); comentário de outro não muda o rev.
- mover: cada linha da tabela `transicao` tem um teste de permitido e um de negado; `versao_nova`/`envio`/`retorno`
  pela rota → 409 `requer_dialogo`; etapa que não se aplica → 422; Agendar põe o social do cliente; Na fila sem
  responsável notifica o distribuidor (ou o substituto, com `cobrindoId`).
- SSE: evento chega a dois clientes; reconexão com `Last-Event-ID` não perde nem repete; `desde` podado → `resync`;
  notificação só ao destinatário; apontamento só ao dono e admin; bootstrap e sync aplicam o mesmo filtro.
- `verificar-migracoes.ts` verde; `npm run seed:demo` cria um ambiente navegável (todas as etapas com cards).
- Roteiro manual: `curl` em `/api/saude`; login pelo `curl` com cookie; `curl -N /api/eventos` mostra o evento de
  um PATCH feito em outro terminal.

### 1.2 DESIGN-SYSTEM-WEB (agente 2 · API 7312, Vite 5182)

**Possui:** `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/src/estilos/**`,
`web/src/ui/**`, `web/src/casca/**`, `web/src/lib/**`, `web/src/sessao/**`, `web/src/api/cliente.ts`,
`web/src/api/auth.ts`, `web/src/extensoes/registro.ts`, `web/src/telas/auth/**`, `web/src/telas/dev/**`,
`web/public/fonts/**`, as extensões `extensoes/avatar/nucleo-tema.tsx` e `extensoes/avatar/nucleo-sair.tsx`.
`web/src/extensoes/tipos.ts` passa a ser dele (muda só por pedido). Não usa migrações.

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
  Esqueleto, EstadoVazio, SeletorData, SeletorHora, `Markdown` (markdown-it `html:false` + DOMPurify com a
  allowlist da SPEC §7.2, links com `rel="noopener noreferrer nofollow ugc"`), `EditorMarkdown` (TipTap StarterKit
  + Mention; recebe `buscarPessoas`), `TextoPuro`, `CopiarTexto` (para caminhos `M:\`), avisos com `sonner`.
- **Casca** (`casca/`): barra superior `.chrome-dark` (logo, slots de `extensoes/topo`, avatar com `extensoes/avatar`),
  menu lateral recolhível com `[` (grupos de `extensoes/menu`), barra de abas do celular (`extensoes/celular` por
  papel), faixa "Sem conexão · tentando de novo" (estado exposto por um hook que o NÚCLEO-WEB alimenta).
- **Registro** (`extensoes/registro.ts`): um `import.meta.glob(..., { eager: true })` por pasta da tabela de
  `extensoes/tipos.ts`, tipado com `ModulosExtensao`, ordenado por `ordem`, com funções `rotas()`, `menus()`,
  `topo()`, `avatar()`, `abasCelular()`, `secoesDemanda()`, `acoesDemanda()`, `menuDemanda()`, `interceptadores()`,
  `dialogos()`, `comandos()`, `fontesBusca()`, `atalhos()`, `tratadores()`, `layouts()`, `cabecalhoVisao()`,
  `menuColuna()`, `entradaColuna()`, `secoesInicio()`, `secoesConfig()`. Ids repetidos: erro no console em dev.
- **Roteador** (`App.tsx`): rotas de `telas/**/rota.tsx` com `acesso` e `layout`; rotas `sobreposta` renderizam por
  cima da tela anterior (padrão "background location" do react-router); `/` redireciona para `eu.rotaInicial`;
  rota desconhecida → "Página não encontrada"; título da aba "<titulo> · <APP_NOME>".
- **Cliente HTTP** (`api/cliente.ts`): `api<T>(metodo, caminho, { corpo?, ifMatch?, idempotencia?, sinal? })` com
  `credentials: 'same-origin'`, `X-Trace-Id` novo a cada mutação (exporta `ultimosTraces()` para o eco do SSE),
  erro tipado `ErroDaApi { status, codigo, mensagem, detalhes }`, 401 → `/entrar?volta=`.
  `api/auth.ts`: `useEu`, `useEntrar`, `useSair`, convite e redefinição.
- **Telas**: `/entrar`, `/convite/:token`, `/redefinir/:token` (layout vazio), `/dev/ui` (catálogo de todos os
  componentes nos dois temas; só em `import.meta.env.DEV`). Tema salvo em `prefs.tema` (PATCH `/api/auth/eu`) e em
  `localStorage` para pintar antes do login.

**Critérios de aceite:** `npm run build` sem aviso de tamanho acima de 500 kB por chunk; `/dev/ui` no claro e no
escuro passa no contraste AA (conferir com o painel de acessibilidade do navegador) e navega só pelo teclado;
login → cai na rota inicial do papel; convite em janela anônima define a senha e entra; 390 px sem rolagem
horizontal na casca; `[` recolhe o menu; nenhuma cor hex fora de `estilos/`.

---

## 2. Onda 2: NÚCLEO-WEB

Começa quando a Onda 1 estiver na branch principal. Branch principal, árvore própria. **Agente 3 · API 7313, Vite 5183.**

**Possui:** `web/src/api/**` (exceto `cliente.ts` e `auth.ts`), `web/src/tempo-real/**`, `web/src/quadro/**`,
`web/src/demanda/**`, `web/src/visoes/**`, `web/src/paleta/**`, `web/src/dialogos/**`, `web/src/teclado/**`,
`web/src/telas/visao/**`, `web/src/telas/demanda/**`, `shared/logica/filtros.ts`, `shared/logica/sinal.ts` e todos os
arquivos `nucleo-*` em `web/src/extensoes/*/`. Sem migrações.

**Entrega:**
- **Dados** (`api/`): chaves de cache em `api/chaves.ts` (§2.1); `useBootstrap()` e seletores (`useDemandas`,
  `useDemanda(id)`, `useDemandaPorNumero(n)`, `useUsuario`, `useCliente`, `useTipo`, `useEtapas`, `useTransicoes`,
  `useEu`, `useRelacao(demanda)`); `useDetalhe(numero)`; mutações otimistas com reversão e aviso
  (`useMover`, `useEditarDemanda` com If-Match e mescla campo a campo no 409, `usePegar`, `useArquivar`,
  `useRestaurar`, `useCriarDemanda`); utilitários de cache exportados (`aplicarPatchDemanda(qc, id, patch)`,
  `atualizarDetalhe(qc, demandaId, fn)`, `inserirOuAtualizar(lista, item)`).
- **Tempo real** (`tempo-real/`): EventSource em `/api/eventos?desde=<seq do bootstrap>`, reconexão 1 s → 30 s (× 4 com a
  aba oculta), polling em `/api/sync` se o SSE falhar, ignora o próprio eco (`t` ∈ traces recentes), `resync` →
  recarrega o bootstrap, entrega a `tratadores()`. Tratadores do núcleo: demanda e cadastros (cliente, contato,
  link do cliente, usuário, equipe, ausência, tipo, etapa, visão, feriado). Patches recebidos durante um arraste
  esperam o fim do arraste; card que chega de outra pessoa pisca `--accent-soft` por 1,2 s.
- **Quadro** (`quadro/`): dnd-kit; agrupar por etapa, responsável, cliente ou dia; colunas de 296 px com faixa de 3 px
  da cor da etapa, contador, recolher (`\`, Shift+`\`) e pílula de 44 px, estado salvo em `prefs.colunasRecolhidas`;
  menu da coluna (`menuColuna()`), "+ Adicionar"/N (`entradaColuna()`); Entregue só com os últimos 7 dias e "ver no
  Arquivo"; card de 72–88 px com chip do cliente, tipo, número, avatar, prazo com estado, **um** sinal
  (`shared/logica/sinal.ts`: atrasada > parado > rodada extra > briefing incompleto > bloqueio), contadores > 0,
  faixa de prioridade; destinos permitidos calculados no início do arraste com `avaliarTransicao()` (proibidos
  esmaecidos com o motivo no tooltip); transição que pede diálogo → card pendente (opacidade 0,6, borda tracejada) e
  `interceptadores()`; Esc devolve em 200 ms; "Movida para X · Desfazer"; rolagem automática nas bordas; teclado
  (setas/J K, Enter, Esc, `,` `.`, Espaço = Pegar, Q, X).
- **Visão** (`visoes/`, rota `/v/:slug`): cabeçalho com nome, seletor de layout (`layouts()`), Agrupar por, Só as
  minhas (Q), contador, Limpar (X) e o slot `cabecalhoVisao()`; filtros na URL `?f=` (`shared/logica/filtros.ts`:
  `aplicarFiltros`, `codificarFiltros`, `decodificarFiltros`); abaixo de 768 px usa o layout `lista` com
  `celular: true` se existir. Layout `quadro` registrado em `extensoes/layouts/nucleo-quadro.tsx`.
- **Modal** (`demanda/`, rota sobreposta `/d/:numero`): abre do cache; Esc fecha; ←/→ e J/K abrem a vizinha; topo com
  cliente · número · título editável, pílula da etapa (só destinos permitidos; usa os mesmos interceptadores), chip da
  bola "há 3 dias" e "cobrindo Samara", ações (`acoesDemanda()`, um primário laranja) e menu ··· (`menuDemanda()`;
  do núcleo: copiar link, arquivar/restaurar); colunas principal/lateral com `secoesDemanda()`; seção lateral do
  núcleo (`nucleo-campos`): cliente, tipo, responsável, atendimento, prioridade + motivo, prazo interno (calculado ou
  manual), publicação, planejada, bloqueio.
- **Paleta** (`paleta/`): Cmd/Ctrl+K e `/` com `cmdk`; recentes primeiro; seções Ações, Demandas, Clientes, Pessoas,
  Visões a partir de `comandos()` e `fontesBusca()`; fontes locais do núcleo: clientes, pessoas e visões (do cache);
  comandos do núcleo: ir para cada visão, alternar tema.
- **Diálogos** (`dialogos/`): host e `abrirDialogo()` (contrato `AbrirDialogo`); id sem diálogo registrado → aviso
  "Disponível em breve"; diálogos do núcleo `confirmar` e `motivo` + interceptador `nucleo-confirmar` (requisitos
  `confirmacao` e `motivo`).
- **Teclado** (`teclado/`): despachante de `atalhos()` com escopos, acorde G de 1,5 s com o indicador "G…", sem
  atalho de uma letra dentro de campo de texto, desligável por `prefs.atalhos`.
- Menu "Visões" (`extensoes/menu/nucleo-visoes.tsx`) e o botão de busca no topo (`extensoes/topo/nucleo-busca.tsx`).

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
servidor mostra "Sem conexão" e, ao voltar, ressincroniza sem duplicar cards; 409 de rev mescla e avisa; tudo pelo
teclado; 390 px sem rolagem horizontal da página.

---

## 3. Onda 3: funcionalidades

Começa quando a Onda 2 estiver na branch principal. **Cada uma num git worktree e branch próprios**, a partir da
branch principal:

```
git worktree add ../melt-demandas-<nome> -b funcionalidade/<nome> master
cd ../melt-demandas-<nome> && npm ci
```

Regras da onda: dono único dos arquivos listados; usa as APIs internas do servidor (§1.1.1) e do front (§2); fala com
as outras funcionalidades **só** por diálogos (`abrirDialogo`), eventos SSE e cache (chaves da §2.1). Depender de
diálogo de outra funcionalidade é permitido: até o merge dela, o host mostra "Disponível em breve".

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
  `server/scripts/demo/modal.ts`, `web/src/funcionalidades/modal/**`, `web/src/extensoes/*/modal-*.ts(x)`.
- **Endpoints (API §4.10, 19):** comentários (GET, POST, PATCH, DELETE), histórico, checklists (POST, PATCH, DELETE),
  itens (POST, PATCH, DELETE), anexos (POST, PATCH, DELETE), repetir, apontamentos (GET, POST, PATCH, DELETE).
- **Extensões:** `demanda/modal-briefing` (campos do tipo inline com ajuda, "Briefing incompleto: falta Formato",
  Markdown com @, "Texto original (WhatsApp)" recolhido como texto puro), `demanda/modal-checklists` (barra e %,
  selo "Ajustes R2 · prazo sex, 17/10"), `demanda/modal-anexos` (links e anexos de referência; Ctrl+V e arrastar
  arquivo; `M:\` com [Copiar caminho]), `demanda/modal-atividade` (abas Comentários | Histórico; compositor com @,
  Ctrl+Enter, "Visível ao cliente" desligado), `demanda/modal-tempo` (lateral: total, meus, [Lançar tempo]),
  `demanda/modal-cliente` (lateral: links do cliente, pasta de saída com Copiar, Acessos); `demanda-menu/modal-repetir`
  e `modal-mudar-equipe`; `dialogos/modal-repetir`, `modal-lancar-tempo`; `atalhos/modal` (Shift+D);
  `eventos/modal` (comentario, checklist, checklist_item, anexo, apontamento).
- **Testes:** contadores `nCheck*`/`nAnexos` no evento de demanda; executor fora da demanda → 403 em checklist;
  menção notifica o mencionado e não o autor, e editar só notifica a menção nova; editar comentário de outro → 403;
  anexo `http://` → 400; `anexoIds` de outra demanda → 400; repetir copia briefing, campos, links e checklist padrão e
  marca `repetidaDeId`; apontamento: executor não lista os de outro (403), `minutosRegistrados` atualiza e o evento de
  apontamento só chega ao dono e ao admin; histórico paginado em ordem decrescente.
- **Roteiro de navegador:** abrir uma demanda do quadro; preencher os campos até sumir "Briefing incompleto";
  mencionar @Rafa num comentário e ver o sino do Rafa em outra janela; marcar item e ver "3/5" no card; colar um
  print com Ctrl+V; copiar o caminho `M:\`; lançar 30 min; Shift+D cria a repetição com a nova data.

### F2 · Ciclo da peça e página pública (`ciclo`)
- **Possui:** `server/src/rotas/ciclo-*.ts`, `server/src/rotas/publico.ts`, `server/src/servicos/ciclo*.ts`,
  `server/src/servicos/drive.ts`, `server/test/ciclo-*.test.ts`, `server/test/publico-*.test.ts`,
  `server/scripts/demo/ciclo.ts`, `shared/logica/texto-whatsapp.ts`, `web/src/funcionalidades/ciclo/**`,
  `web/src/telas/publico/**` (`/a/:token`), `web/src/extensoes/*/ciclo-*.ts(x)`.
- **Endpoints (API §4.11 e §4.12, 17):** entregar versão, editar versão, testar Drive (versão e avulso), enviar,
  retorno, aprovado pelo WhatsApp, anular, devolver, extra, texto WhatsApp, links da demanda, revogar link, e as 4
  rotas públicas. Serviço central: `registrarRetorno()` usado pelo link e pelo AM; `abrirRodada()`.
- **Extensões:** `demanda/ciclo-versoes` (linha do tempo V1…Vn com itens, prévia estática, iframe só no clique em
  hosts conhecidos, "enviada em… (link | por fora)", decisões, "Rodada 3 · 2 inclusas" + [Marcar como extra]);
  `demanda-acoes/ciclo` (Entregar versão, Enviar ao cliente, Registrar retorno, Aprovado pelo WhatsApp, Devolver para
  ajuste, Concluir sem aprovação, Copiar para WhatsApp; primário conforme a etapa e a relação); `dialogos/ciclo-*`
  (`entregar-versao`, `enviar-ao-cliente` com teste de Drive e "Copiar para WhatsApp" no fim, `registrar-retorno`
  com Ctrl+V do print, `devolver-ajuste`, `anular-aprovacao`); `mover/ciclo` (interceptador dos diálogos
  `entregar_versao`, `enviar_ao_cliente`, `registrar_retorno`, `devolver_ajuste`, `anular_aprovacao`);
  `atalhos/ciclo` (Shift+R); `eventos/ciclo` (versao, rodada, envio, aprovacao, link_publico).
  Tela pública `/a/:token` (layout vazio, celular primeiro, logo do cliente e "por Melt", folha de confirmação ao
  aprovar, "um ajuste por linha", "Você é Fulana?", nome lembrado no aparelho, 409 "Chegou a V3").
- **Testes:** entregar move para Revisão e notifica o aprovador; enviar por link reaproveita o link ativo do contato;
  Drive privado (fetch simulado) → 422 `drive_privado`; `GET /api/publico/a/:token` não muda `acessos`; mesma
  `Idempotency-Key` 2× → uma aprovação; versão antiga → 409 com `versaoAtual`; duas decisões simultâneas → uma 200 e
  uma 409 `ja_decidida`; aprovado com tipo de publicação → Agendar com o social do cliente; ajuste abre a rodada 2
  com checklist e prazo em dias úteis pulando feriado; rodada 3 com 2 inclusas → `sugerirExtra`; anular volta para
  Com o cliente; link expirado/revogado → 410; URL assinada vencida → 403; executor enviando → 403; headers
  `no-store`, `noindex`, `no-referrer` na pública.
- **Roteiro:** entregar V1 (link do Drive) → arrastar Revisão → Com o cliente abre o diálogo (Esc devolve o card) →
  enviar por link → abrir o link no celular (390 px), pedir ajuste com 3 linhas → o card vai para Ajustes com
  "Ajustes R2" → entregar V2 → enviar → aprovar no celular → Agendar com o social; "Aprovado pelo WhatsApp" + Desfazer.

### F3 · Painéis (`paineis`)
- **Possui:** `server/src/rotas/paineis-*.ts`, `server/src/servicos/paineis*.ts`, `server/src/tarefas/paineis-*.ts`
  (prazo e cobertura, 8h), `server/test/paineis-*.test.ts`, `shared/logica/paineis.ts`,
  `web/src/funcionalidades/paineis/**`, `web/src/telas/{inicio,semana,triagem}/**`, `web/src/extensoes/*/paineis-*.ts(x)`.
- **Endpoints (API §4.13, 7):** início, semana, triagem, aceitar, recusar, notificações, marcar lidas.
- **Extensões:** `inicio/paineis-*` (Hoje, Com você agora, Fila da equipe com Pegar, Com o cliente há mais de 2 dias
  úteis com "Copiar lembrete" e "Registrar retorno" via diálogo do ciclo, Atrasadas, Primeiros passos do admin);
  `layouts/paineis-semana` (layout `semana` das visões, mesmo componente da Minha semana); `topo/paineis-sino`
  (sino com contagem, lista, marcar lidas); `avatar/paineis-ausencia` + `dialogos/paineis-ausencia`;
  `menu/paineis` (Início, Minha semana, Triagem (n)); `celular/paineis-*` (Início, Semana, Triagem, Sino);
  `atalhos/paineis` (G I, G S, G T; J/K, Enter e Shift+Backspace no escopo triagem); `eventos/paineis` (notificacao).
- **Testes:** "Com você" inclui a demanda de quem eu cubro hoje com `cobrindoId` e deixa de incluir após o fim da
  ausência; "Hoje" põe horário marcado primeiro; fila sem responsável só das minhas equipes; "com o cliente há mais de
  2 dias úteis" conta feriado; semana marca `prazo` quando não há planejada; semana de outra pessoa por executor →
  403; aceitar por executor que não é aprovador → 403 e pelo aprovador da equipe → ok; recusar sem motivo → 400;
  notificação de ausente vai ao substituto; tarefa de prazo não repete no mesmo dia; marcar lidas só emite ao dono.
- **Roteiro:** executor entra e cai em `/semana`; arrastar card de seg para qua (planejada muda, prazo não, borda
  tracejada some); AM marca ausência com substituto e o substituto vê "cobrindo"; triagem inteira só pelo teclado.

### F4 · Entrada (`entrada`)
- **Possui:** `server/src/rotas/entrada*.ts`, `server/src/rotas/busca.ts`, `server/src/servicos/entrada*.ts`,
  `server/test/entrada-*.test.ts`, `shared/logica/rapida.ts`, `shared/logica/colar-whatsapp.ts`,
  `web/src/funcionalidades/entrada/**`, `web/src/extensoes/*/entrada-*.ts(x)`.
- **Endpoints (API §4.14, 4):** rápida, prévia, analisar (Colar do WhatsApp), busca. A Nova demanda usa
  `POST /api/demandas` (núcleo) e `POST /api/clientes` ("Criar cliente HE" sem sair do fluxo).
- **Extensões:** `dialogos/entrada-nova-demanda` (Colar do WhatsApp no topo; cliente com apelidos; grade de até 12
  tipos + Outro; título; obrigatórios do tipo com ajuda, opcionais recolhidos; publicação → prazo interno calculado
  e editável com aviso "prazo curto"; horário e local nos tipos com horário; padrões de AM e responsável sugerido;
  Criar (Ctrl+Enter), Criar e abrir, Salvar na triagem); `topo/entrada-nova` (o botão laranja);
  `celular/entrada-mais` ("+" com foco no Colar); `coluna-entrada/entrada-rapida` (linha com chips `HE:`/`@rafa`,
  prévia ao vivo, Backspace desfaz o chip, cliente/responsável/tipo herdados da coluna e dos filtros);
  `busca/entrada-demandas` (fonte Demandas via `/api/busca`); `comandos/entrada` (Nova demanda);
  `atalhos/entrada` (Shift+N, N, ?); `dialogos/entrada-atalhos` (lista do `?` gerada de `atalhos()`).
- **Testes:** "HE: Carrossel @rafa" → cliente HE, responsável Rafa, título "Carrossel"; "he outubro" não vira marcador;
  executor sem cliente → Triagem; contexto da coluna aplicado; analisar reconhece "[14/10 15:32] Fulana:" e o cliente
  por apelido sem acento; reconhecido → Na fila; busca "#12" acha pelo número; "he outubro" filtra o cliente; "acao"
  acha "Ação"; arquivadas só com `incluirArquivadas`; resposta da busca em menos de 150 ms com 5 mil demandas.
- **Roteiro:** Shift+N, colar uma conversa do WhatsApp → cria direto em Na fila; sigla nova "XYZ" → "Criar cliente
  XYZ" sem sair do formulário; N numa coluna da visão Criação por responsável → nasce com aquela pessoa; Cmd+K "#12"
  + Enter abre o modal; `?` lista os atalhos de todas as funcionalidades instaladas.

### F5 · Cadastros (`cadastros`)
- **Possui:** `server/src/rotas/cadastros-*.ts`, `server/src/rotas/{mural,arquivo}.ts`, `server/src/servicos/cadastros*.ts`,
  `server/test/cadastros-*.test.ts`, `web/src/funcionalidades/cadastros/**`,
  `web/src/telas/{clientes,config,mural,arquivo}/**`, `web/src/extensoes/*/cadastros-*.ts(x)`.
- **Endpoints (API §4.6 trilha, §4.7 menos visões, §4.15; 14):** tipos de peça (POST, PATCH, PUT campos), feriados
  (GET, POST, DELETE), config da aplicação (GET, PATCH), trilha de aprovações do cliente, mural (GET, POST, PATCH,
  DELETE), arquivo. As telas também usam as rotas do núcleo de pessoas, equipes e clientes.
- **Extensões:** `config/cadastros-*` (Pessoas com convite e "copiar link", redefinição e desativar; Equipes com
  membros, aprovador e distribuidor; Tipos de peça com campos e até 3 obrigatórios; Feriados; Aparência: tema e
  atalhos); `menu/cadastros` (Clientes, Mural, Arquivo, Configurações); `eventos/cadastros` (aviso).
  Telas: `/clientes` (lista com contadores), `/clientes/:sigla` (cabeçalho com contatos, pasta de saída, links; abas
  Demandas — usa o layout registrado com o filtro do cliente —, Aprovações, Configurações: rodadas, apelidos, grupo),
  `/config/*`, `/equipe/:slug/avisos` (mural com fixar e ordenar), `/arquivo` (cliente, mês, tipo, texto; restaurar).
- **Testes:** 4º obrigatório → 400; feriado novo recalcula os prazos automáticos e não os manuais; executor edita o
  mural da própria equipe e não o da agência; detector de senha devolve o aviso; arquivo filtra por mês e cliente;
  trilha inclui anuladas; `demandaNumeroInicial` menor que o maior número → 400.
- **Roteiro:** admin convida uma pessoa e copia o link → janela anônima define a senha e entra; cria cliente com
  contato padrão e apelidos; muda os campos de um tipo e vê o formulário da Nova demanda mudar; restaura do Arquivo.

### F6 · Lista, filtros, visões e celular (`lista`)
- **Possui:** `server/src/rotas/visoes.ts`, `server/test/lista-*.test.ts`, `web/src/funcionalidades/lista/**`,
  `web/src/extensoes/*/lista-*.ts(x)`.
- **Endpoints (API §4.7, 1):** `PATCH /api/visoes/:id`.
- **Extensões:** `layouts/lista-lista` (tabela virtualizada só leitura: #, Cliente, Título, Tipo, Etapa, Com quem,
  Prazo, Publicação, Rodada, Atualizada; ordena pelo cabeçalho; agrupa por etapa, responsável ou cliente; com
  `celular: true` vira lista agrupada com barra de chips das colunas e contagens, toque pula para o grupo);
  `visao-cabecalho/lista-filtros` (chips Cliente, Responsável, Tipo, Prioridade, Prazo, Bola, texto; todos na URL);
  `visao-cabecalho/lista-editar` (admin: editar filtros e colunas recolhidas padrão da visão).
- **Testes:** PATCH de visão por não admin → 403; filtro com categoria inexistente → 400; `aplicarFiltros` coberto
  para cada campo de `FiltrosVisao` (no `shared/logica/filtros.ts` do núcleo-web, via testes deste agente).
- **Roteiro:** em 390 px a visão vira lista com chips e o modal abre em tela cheia; filtros sobrevivem ao recarregar
  e ao compartilhar a URL; ordenar por prazo; admin muda as recolhidas da Geral e outra janela recebe pelo SSE.

---

## 4. Pontos de extensão: quem fornece, quem usa

Contrato em `web/src/extensoes/tipos.ts`. O DESIGN-SYSTEM-WEB escreve os carregadores (`registro.ts`); quem consome
cada registro está na coluna "mecanismo".

| Ponto | Mecanismo (consome) | Contribuem |
|---|---|---|
| `telas/**/rota.tsx` | DS (roteador) | DS (auth, dev), NW (visão, demanda), F2 (pública), F3, F5 |
| `extensoes/menu` | DS (menu lateral) | NW (visões), F3, F5 |
| `extensoes/topo` | DS | NW (busca), F3 (sino), F4 (Nova demanda) |
| `extensoes/avatar` | DS | DS (tema, sair), F3 (ausência) |
| `extensoes/celular` | DS | F3, F4, NW (busca) |
| `extensoes/demanda` (seções) | NW (modal) | NW (campos), F1, F2 |
| `extensoes/demanda-acoes` | NW | F2 (e quem precisar) |
| `extensoes/demanda-menu` | NW | NW (copiar link, arquivar), F1 (repetir, mudar equipe) |
| `extensoes/mover` (interceptadores) | NW (quadro, pílula, teclado) | NW (confirmar, motivo), F2 |
| `extensoes/dialogos` | NW (host + `abrirDialogo`) | NW (confirmar, motivo), F1, F2, F3, F4 |
| `extensoes/comandos` · `extensoes/busca` | NW (paleta) | NW, F4 |
| `extensoes/atalhos` | NW (despachante) | NW, F1, F2, F3, F4 |
| `extensoes/eventos` | NW (cliente SSE) | NW, F1, F2, F3, F5 |
| `extensoes/layouts` · `extensoes/visao-cabecalho` | NW (página da visão) | NW (quadro), F3 (semana), F6 |
| `extensoes/coluna-menu` · `extensoes/coluna-entrada` | NW (quadro) | NW (arquivar entregues), F4 (rápida) |
| `extensoes/inicio` | F3 (tela Início) | F3 |
| `extensoes/config` | F5 (tela Configurações) | F5 |
| `server/src/rotas/*.ts` | NS (`criarApp`) | NS, F1–F6 |
| `server/src/tarefas/*.ts` | NS (`tarefas.ts`) | NS, F3 |
| `server/scripts/demo/*.ts` | NS (`seed-demo.ts`) | NS, F1, F2 |
| `server/migracoes/NNN_*.sql` | NS (`migrar`) | faixas da §3 |

DS = DESIGN-SYSTEM-WEB, NS = NÚCLEO-SERVIDOR, NW = NÚCLEO-WEB.

---

## 5. Integração e verificação final

**Ordem de merge da Onda 3** (qualquer ordem funciona; esta reduz telas "Disponível em breve" nos testes):
F5 → F4 → F1 → F2 → F3 → F6.

Para cada funcionalidade, o integrador:
1. Pede à funcionalidade `git rebase master` e o "pronto" da regra 8 verde na própria worktree.
2. Confere o diff: nenhum arquivo fora do que ela possui (`git diff --name-only master...funcionalidade/<nome>`);
   migrações só na faixa dela; nada em `shared/tipos/*.ts` existentes nem em `web/src/extensoes/tipos.ts`.
3. `git merge --no-ff funcionalidade/<nome>` na branch principal e roda, na raiz: `npm ci`, `npx tsc --noEmit -p server`,
   `npx tsc --noEmit -p web`, `npm test`, `node server/scripts/verificar-migracoes.ts`, `npm run build`.
4. Aplica os pedidos de `docs/pedidos/*.md` aceitos (migração na faixa 090–099 quando for banco), avisa as outras
   funcionalidades para fazer rebase, e remove a worktree (`git worktree remove`).

**Verificação final** (banco novo, `DATA_DIR` limpo, build de produção servido pelo Node na 7300):
1. Primeiro boot com `ADMIN_EMAIL`/`ADMIN_SENHA` cria o admin; o Início do admin mostra os primeiros passos.
2. Admin convida um AM, um designer e um social; cada um define a senha pelo link (janelas separadas).
3. Admin define aprovador e distribuidor da Criação e cadastra o cliente HE com contato padrão e social.
4. AM cola uma conversa do WhatsApp → demanda em Na fila; o distribuidor recebe a notificação.
5. Designer pega pela fila da equipe, move para Em produção, entrega V1 com link do Drive; o AM recebe "voltou".
6. AM envia por link; no celular (390 px) o cliente pede ajuste com 2 linhas; o designer vê "Ajustes R2" com prazo.
7. Designer entrega V2; AM envia; cliente aprova; a demanda vai para Agendar com o social; o social conclui.
8. AM arquiva as entregues; a busca do Arquivo encontra a demanda por "he" + palavra do título; restaurar devolve.
9. Duas janelas abertas o tempo todo: tudo aparece na outra em menos de 1 s; derrubar e subir o servidor ressincroniza.
10. Tema claro e escuro, teclado apenas no quadro e no modal, CSP sem violações no console, `/api/publico/*` com
    `no-store`/`noindex`, backup diário criado em `DATA_DIR/backups`.
11. `docker build` e o container sobem com o volume em `/app/data` e respondem em `/api/saude`.

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
7. **Visível ao cliente** pode ser ligado por qualquer usuário interno (a SPEC não restringe).
8. **Notificação de triagem** vai só ao AM do cliente; sem cliente, só o contador "Triagem (n)" do menu avisa.
9. **Transições acrescentadas** à SPEC §7.1: entregar direto da fila (fila → revisão), devolver à fila
   (produção → fila) e desfazer a aprovação (aprovado/agendar → com o cliente).
10. **Desativar uma pessoa** não reatribui as demandas dela; o AM ou o admin reatribui.
