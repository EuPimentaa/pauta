# Plano de construção paralela

Como vários agentes constroem o MVP no **modelo de quadros separados por equipe** (`docs/ADAPTACOES.md`, decisões 4 e 5,
seção "Modelo de quadros"; o resto da SPEC §4.1 sem importação) ao mesmo tempo sem pisar um no outro. O contrato já
está pronto e é a referência de todos:

| Contrato | Arquivo |
|---|---|
| Banco (todas as tabelas do MVP) | `server/migracoes/001_base.sql`, seed de configuração `002_config.sql` |
| Verificação do banco | `node server/scripts/verificar-migracoes.ts` (listas de `shared/tipos` = CHECK do banco, seeds, gatilhos) |
| Tipos, DTOs e eventos | `shared/tipos/*.ts` (reexportados por `shared/tipos/index.ts`) |
| Rotas HTTP | `docs/API.md` (125 rotas, cada uma com dono) |
| Pontos de extensão do front | `web/src/extensoes/tipos.ts` (23 pontos + telas) e a API interna do núcleo-web (§2.2) |
| Stack, pastas e convenções | `docs/ARQUITETURA.md` |

Sumário: [0 Regras](#0-regras-para-todos) · [1 Onda 1](#1-onda-1-núcleo-servidor--design-system-web) ·
[2 Onda 2](#2-onda-2-núcleo-web) · [3 Onda 3](#3-onda-3-funcionalidades) · [4 Pontos de extensão](#4-pontos-de-extensão-quem-fornece-quem-usa) ·
[5 Integração](#5-integração-e-verificação-final) · [6 Dúvidas](#6-dúvidas-em-aberto) · [7 Críticas descartadas](#7-críticas-descartadas)

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
   pastas de extensão, o dono de cada arquivo é o glob `web/src/extensoes/*/<f>{,-*}.{ts,tsx}` (vale `soltar/ciclo.ts`
   e `card/ciclo-rodada.tsx`); a conferência do `git diff --name-only` (§5) usa esse glob.
4. **Português do Brasil** em código de domínio, mensagens, commits e textos de tela. Tom: direto, sem exclamação, com
   números ("3 atrasadas"). Nome do produto sempre de `APP_NOME` (padrão "Pauta"), nunca fixo.
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
   (não versionado); nunca em docs ou commits. Dados de exemplo: `npm run seed:demo --workspace server` (quadros das
   6 equipes, pessoas, clientes e demandas em todas as colunas; só desenvolvimento).
8. **Pronto = verde em tudo**, na raiz: `npx tsc --noEmit -p server`, `npx tsc --noEmit -p web`, `npm test`,
   `node server/scripts/verificar-migracoes.ts`, `npm run build`, e o roteiro de navegador da sua funcionalidade
   executado (claro e escuro, 1440 px e 390 px).
9. **Segurança não é opcional:** nada de `dangerouslySetInnerHTML`; Markdown só pelo componente seguro do design system;
   texto de fora (WhatsApp, cliente) só como texto puro; URL só `https:`; caminho `M:\` nunca vira `href`.
10. **`shared/**` só importa por caminho relativo com `.ts`** (`../tipos/index.ts`), nunca `@shared`: o alias existe só
    no web; o servidor roda `shared/` no Node e no `tsc -p server`.
11. **Datas pelo relógio do app:** serviços gravam todo instante com `agora()` (nunca o `DEFAULT now` do SQLite) e
    calculam "hoje" com `hojeSP(agora())`, para os testes fixarem o tempo com `relogio()` (§1.1.1).
12. **Erro de gatilho vira código da API** (`API.md` §1): `coluna_com_demandas`/`quadro_com_historico` → `409 conflito`,
    `destino_arquivado` → `422 estado_invalido`; o tradutor fica em `server/src/erros.ts` (núcleo).

---

## 1. Onda 1: NÚCLEO-SERVIDOR + DESIGN-SYSTEM-WEB

Em paralelo, **na branch principal (`master`) e na mesma árvore**, com pastas disjuntas. Começa já.

### 1.1 NÚCLEO-SERVIDOR (agente 1 · API 7311)

**Possui:** `server/**` (exceto `server/migracoes/001_base.sql` e `002_config.sql`, que são contrato, e os arquivos das
funcionalidades), `shared/logica/**` (cria; menos `filtros.ts` e `sinal.ts`, do NÚCLEO-WEB, e os `<f>-*` e
`rapida.ts`/`colar-whatsapp.ts`/`texto-whatsapp.ts`/`paineis.ts` das funcionalidades), `shared/tipos/**` (guarda; muda
só para corrigir o contrato e avisa), `package.json` da raiz, `package-lock.json`, `Dockerfile`, `.dockerignore`,
`.env.example`. Faixa de migração: **003–019**.

**Rotas (66):** as marcadas "núcleo" em `docs/API.md`: tempo real (§3: eventos, sync, bootstrap), saúde, auth (9),
pessoas (5), equipes (4), quadros (9), colunas (7), etiquetas (3), clientes (11, menos a trilha), demandas (12:
detalhe, criar, PATCH, mover, concluir, membros ×2, etiquetas ×2, arquivar, restaurar, excluir) e arquivos (2).

**Entrega, nesta ordem** (commits pequenos; a ordem destrava a Onda 2 cedo):

1. Base: `src/config.ts` (env: `PORT`, `DATA_DIR`, `APP_URL`, `APP_NOME`, `SEGREDO`, `NODE_ENV`, `TRUST_PROXY_HOPS`,
   `ADMIN_EMAIL`, `ADMIN_SENHA`), `src/db.ts`, `src/erros.ts` (com o tradutor de gatilhos, regra 12), `src/app.ts`
   (`criarApp(db)` descobre `src/rotas/*.ts`; `bodyLimit` antes de tudo; IP real; máscara de log; cabeçalhos da API
   §1), `src/index.ts` (migra, cria o admin no primeiro boot, sobe HTTP, serve `web/dist` com fallback de SPA, a CSP
   **exata** da API §1 em produção e `Referrer-Policy: no-referrer` no HTML de `/a/*`, `/convite` e `/redefinir`),
   `GET /api/saude`.
2. Auth e sessão (§4.2), pessoas (§4.3, com "entrar na equipe = seguir os quadros dela"), equipes (§4.4), clientes
   (§4.10 menos a trilha, com responsáveis por equipe).
3. Quadros (§4.5: criar com modelo e coluna `porMembro` expandida, arquivar, restaurar, excluir vazio, estrela,
   seguir), colunas (§4.6) e etiquetas (§4.7).
4. Tempo real: tabela `evento` + barramento + `GET /api/eventos`, `/api/sync`, `/api/bootstrap` (§3).
5. Demandas (§4.12): detalhe, criar (com modelo: descrição, checklist, etiquetas por nome, prazo em dias úteis),
   PATCH com If-Match, `mover()` (§5.1, etiquetas entre quadros §5.6), `concluir()` com repetição (§5.3),
   `executarAutomacao()` (§5.5; o F2 chama nos gatilhos do ciclo), membros, etiquetas, arquivar, restaurar, excluir.
   Arquivos (§4.14).
6. `shared/logica/` (puro, sem dependências, usado pelo servidor e pelo front; assinaturas em §1.1.2).
7. `server/test/ajuda.ts` (ambiente de teste para todos, fixture abaixo), testes do núcleo, `scripts/seed-demo.ts`
   (descobre `scripts/demo/*.ts`), `src/tarefas.ts` (jobs diários descobertos em `src/tarefas/*.ts`: backup
   `VACUUM INTO`, poda de `evento` com mais de 7 dias que nunca apaga o último, lixo de arquivos sem uso pela lista da
   API §4.14, `ip_hmac` com mais de 12 meses), Dockerfile.

#### 1.1.1 API interna do servidor (o que as funcionalidades chamam)

As funcionalidades da Onda 3 importam estes módulos e **não** reescrevem as regras. Assinaturas fixas:

```ts
// src/db.ts
export type Db = DatabaseSync
export function abrir(caminho: string): Db                    // WAL, foreign_keys=ON, busy_timeout=5000
export function migrar(db: Db, pasta?: string): string[]       // como scripts/verificar-migracoes.ts: 1 transação por arquivo
export function tx<T>(db: Db, fn: () => T): T                  // BEGIN IMMEDIATE ... COMMIT; entrega os eventos depois do commit
export function um<T>(db: Db, sql: string, ...p: unknown[]): T | undefined
export function todos<T>(db: Db, sql: string, ...p: unknown[]): T[]
export function rodar(db: Db, sql: string, ...p: unknown[]): { changes: number; lastInsertRowid: number | bigint }
export function novoId(): Id
export function agora(): Instante                              // relógio do app (os testes fixam com relogio())

// src/erros.ts
export class ErroHttp extends Error { constructor(status: number, codigo: CodigoErro, mensagem: string, detalhes?: Record<string, unknown>) }
export function traduzirErroBanco(e: unknown): ErroHttp | null  // gatilhos e UNIQUE → 409/422 (regra 12)

// src/auth.ts
export interface Ator { tipo: 'usuario' | 'cliente' | 'sistema'; usuario: Usuario | null; papel: Papel | null;
                        traceId: string | null; ip: string }   // ip: N-ésimo do FIM do X-Forwarded-For (TRUST_PROXY_HOPS)
export type App = Hono<{ Variables: { ator: Ator; db: Db } }>
export const exigirUsuario: MiddlewareHandler                  // 401 sem sessão; em TODA requisição confere sessão e ativo
export function exigirPapel(...papeis: Papel[]): MiddlewareHandler
export function validar<T>(esquema: ZodType<T>, valor: unknown): T   // 400 validacao com detalhes.campos
export function limite(chave: string, max: number, janelaSeg: number): MiddlewareHandler   // 429 em memória (página pública)

// src/servicos/permissoes.ts  (usa shared/logica/permissoes.ts; 403 sem_permissao com o motivo)
export function exigir(ator: Ator, acao: AcaoPermissao, d?: Demanda): void
export function exigirCamposPermitidos(ator: Ator, entrada: object): void      // CAMPOS_SO_ATENDIMENTO → 403 campo_nao_permitido

// src/servicos/eventos.ts  (grava em `evento` na transação; entrega após o commit)
// publico: 'gestao' p/ link_publico, 'usuario' p/ notificacao e quadro_usuario; `anonimo: true` grava a = t = null
export function emitir(db: Db, ev: { entidade: Entidade; id: string; demandaId?: Id | null; op: 'upsert' | 'delete';
  patch?: object; campos?: string[] | null; publico?: PublicoEvento; usuarioId?: Id; ator: Ator; anonimo?: boolean }): number
export function emitirDemandaInteira(db: Db, demandaId: Id, ator: Ator): number   // c = null: criar, restaurar (API §3)
// src/servicos/atividade.ts
export function registrarAtividade<T extends TipoAtividade>(db: Db, a: { tipo: T; ator: Ator; demandaId?: Id;
  clienteId?: Id; dados: MapaDadosAtividade[T]; antes?: Record<string, unknown> }): number
// src/servicos/notificacoes.ts  (nunca o próprio ator; sem repetir a pessoa no mesmo fato; emite o evento; API §5.9)
export function notificar(db: Db, n: { para: Id | Id[]; tipo: TipoNotificacao; demandaId?: Id; atividadeId?: number;
  ator: Ator; resumo: string; exceto?: Id[] }): Id[]                          // devolve quem recebeu
export function seguidoresDoQuadro(db: Db, quadroId: Id): Id[]
// src/servicos/mover.ts  (único caminho de troca de coluna/quadro; API §5.1 e §5.6)
export function mover(db: Db, p: { demandaId: Id; ator: Ator; colunaId: Id; posicao?: PosicaoRelativa;
  via?: ViaMovimento; gatilho?: GatilhoAutomacao; etiquetasSemPar?: 'remover' | 'criar'; etiquetaIds?: Id[];
  rev?: number }): MoverSaida
// src/servicos/concluir.ts  (API §5.3; `automacao: false` quando quem chama é a coluna concluida)
export function concluir(db: Db, p: { demandaId: Id; ator: Ator; concluida: boolean; via: 'checkbox' | 'coluna' | 'papel';
  repetir?: boolean; automacao?: boolean }): ConcluirSaida
// src/servicos/automacoes.ts  (API §5.5: o F2 chama em enviar e no retorno)
export function executarAutomacao(db: Db, demandaId: Id, gatilho: GatilhoAutomacao, ator: Ator): boolean   // true = moveu
// src/servicos/demandas.ts
export function carregarDemanda(db: Db, id: Id): Demanda                       // 404 se não existe
export function carregarDetalhe(db: Db, numero: number, ator: Ator): DemandaDetalhe
export function criarDemanda(db: Db, e: CriarDemandaEntrada & { origem?: OrigemDemanda; origemDemandaId?: Id },
  ator: Ator): CriarDemandaSaida                                               // o F1 (copiar) e o F4 (rápida) chamam
export function atualizarDemanda(db: Db, id: Id, mudancas: EditarDemandaEntrada & Record<string, unknown>,
  ator: Ator, opcoes?: { rev?: number; semPermissao?: boolean }): EditarDemandaSaida   // grava atualizado_por, emite o patch
export function emitirContadores(db: Db, demandaId: Id, ator: Ator): void     // re-lê n_* e minutos; emite patch
export function colunaDeEntrada(db: Db, quadroId: Id): Coluna                  // 422 sem colunas
export function abrirRodada(db: Db, p: { demandaId: Id; origem: 'cliente' | 'interna'; linhas: string[];
  motivo: MotivoRodada; motivoTexto?: string | null; prazo?: DataLocal; prazoHora?: HoraLocal | null; ator: Ator }):
  { rodada: Rodada; checklist: ChecklistComItens; sugerirExtra: boolean }     // API §5.7 (o F2 chama)
// src/servicos/horas.ts  (arquivar demanda/quadro e desativar pessoa param cronômetros; o F1 usa nas rotas)
export function pararCronometros(db: Db, filtro: { usuarioId?: Id; demandaId?: Id; quadroId?: Id }, ator: Ator): Apontamento[]
// src/servicos/mapear.ts  (linha do banco → DTO de shared/tipos; um por entidade de MapaEntidades)
export const mapear: { demanda(l, membroIds: Id[], etiquetaIds: Id[]): Demanda; quadro(l): Quadro; coluna(l): Coluna;
  etiqueta(l): Etiqueta; automacao(l): AutomacaoQuadro; modeloDemanda(l, itens, etiquetas): ModeloDemanda;
  checklist(l): Checklist; checklistItem(l): ChecklistItem; comentario(l, ...): Comentario; anexo(l, arquivo?): Anexo;
  rodada(l, inclusas: number): Rodada; versao(l, itens): VersaoComItens; envio(l): Envio; aprovacao(l): Aprovacao;
  linkPublico(l, demandaIds): LinkPublicoResumo; usuario(l): Usuario; usuarioResumo(l): UsuarioResumo;
  cliente(l, apelidos, responsaveis): ClienteResumo; apontamento(l): Apontamento /* ... e o resto */ }
// src/servicos/posicao.ts  (média dos vizinhos; renormaliza o escopo com passo 1024 quando a folga < 1e-6)
export function posicaoEntre(db: Db, alvo: { tabela: string; coluna: 'posicao' | 'pos'; escopo?: { coluna: string; valor: unknown } },
  rel: PosicaoRelativa | undefined): number
// src/servicos/arquivos.ts
export function lerArquivo(db: Db, id: Id): { info: ArquivoInfo; caminho: string }
export function urlAssinada(id: Id, minutos: number): string
export function assinaturaValida(id: Id, exp: number, sig: string): boolean
// src/tarefas.ts  (jobs diários; funcionalidades criam src/tarefas/<prefixo>-*.ts exportando `tarefa`)
export interface Tarefa { nome: string; horario: HoraLocal; executar(db: Db): void | Promise<void> }
// test/ajuda.ts  (as funcionalidades podem criar test/<prefixo>-ajuda.ts com o que for só delas)
export function ambiente(): Promise<{ app: App; db: Db;
  pessoas: Record<'admin' | 'am' | 'am2' | 'design' | 'design2' | 'social' | 'web', Usuario>;
  clientes: Record<'he' | 'icc', Cliente>; quadros: Record<'atendimento' | 'criacao' | 'social', QuadroCompleto>;
  como(p: Usuario): { get, post, patch, put, del };            // já com cookie, X-Trace-Id e Origin
  criarDemanda(p?: Partial<CriarDemandaEntrada> & { como?: Usuario; ate?: 'entregue' | 'enviada' | 'aprovada' }): Promise<Demanda>;
       // padrão: quadro criacao, coluna Fila, cliente HE, como am; `ate` usa os serviços (versão, envio, retorno), sem rotas
  coluna(quadro: 'atendimento' | 'criacao' | 'social', nome: string): Coluna;
  relogio(instante: Instante | null): void }>                  // fixa agora() (e o "hoje" de SP); null volta ao real
// scripts/demo/*.ts
export function semear(ctx: { db: Db; pessoas; clientes; quadros }): void
```

**Fixture do `ambiente()`** (todos os testes contam com ela; nada além disso é garantido):
- pessoas: `admin` (admin); `am`, `am2` (atendimento, equipe Atendimento); `design`, `design2` (equipe, Criação);
  `social` (equipe, Social); `web` (equipe, Web).
- quadros: `atendimento` (Kanban simples: A fazer, Fazendo, Revisão, Com o cliente [`aguardando_cliente`], Concluído
  [`concluida`]); `criacao` (Por pessoa: Fila, Design, Design2; mais a coluna Pronto e a Concluído [`concluida`];
  etiquetas "Urgente" rosa e "Alteração" âmbar; automação `aprovado` → `social` › Agendar); `social` (Fila, Agendar,
  Publicado [`concluida`]; etiqueta "Alteração" âmbar). Membros das equipes seguem os quadros das equipes.
- clientes: `he` = { sigla HE, apelidos `hospital evangelico`, `atendimentoId: am`, responsável Criação = `design`,
  Social = `social`, contato padrão "Fulana" (aprova) }; `icc` = { sigla ICC, `atendimentoId: am2`, contato padrão "Beltrana" }.
- relógio: começa em `2026-10-14T13:00:00.000Z` (quarta, 10h em São Paulo) para os testes de prazo e feriado.

#### 1.1.2 `shared/logica/` (puro; servidor e front usam o mesmo código)

```ts
// datas.ts
hojeSP(agora?: Date): DataLocal; dataLocalDe(i: Instante): DataLocal; ehDiaUtil(d: DataLocal, feriados: ReadonlySet<string>): boolean
somarDiasUteis(d: DataLocal, n: number, feriados): DataLocal; diasUteisEntre(de: DataLocal, ate: DataLocal, feriados): number
proximoDiaUtil(d: DataLocal, feriados): DataLocal; segundaDaSemana(d: DataLocal): DataLocal
formatarPrazo(d: DataLocal, h: HoraLocal | null): string        // "qui, 16/10, 18h"
// prazo.ts  (API §5.2 e §5.3)
estadoPrazo(d: Pick<Demanda, 'prazo' | 'prazoHora' | 'concluidaEm' | 'envioPendenteEm'>, coluna: Pick<Coluna, 'papel'>, agora: Date): EstadoPrazo
proximoPrazo(prazo: DataLocal, repetir: Exclude<Repeticao, 'nenhuma'>, feriados): DataLocal
prazoDoModelo(hoje: DataLocal, diasUteis: number | null, feriados): DataLocal | null
// quadro.ts  (API §5.4 e §5.6)
comQuemEsta(d: Pick<Demanda, 'concluidaEm' | 'envioPendenteEm'>, coluna: Pick<Coluna, 'papel'>): ComQuem
paradoHa(d: Demanda, coluna: Coluna, agora: Date, feriados): { comQuem: ComQuem; dias: number }
ehMinha(d: Pick<Demanda, 'membroIds' | 'atendimentoId'>, euId: Id): boolean
colunaDeEntrada(colunas: Coluna[], quadroId: Id): Coluna | null
mapearEtiquetas(daDemanda: Etiqueta[], doDestino: Etiqueta[]): { mapa: Record<Id, Id>; semPar: Etiqueta[] }
passouWip(coluna: Coluna, quantidade: number): boolean
slugDe(nome: string): string
// permissoes.ts  (API §2; o front usa para esconder o que não pode)
type AcaoPermissao = 'quadro.administrar' | 'automacao.editar' | 'modelo.global' | 'cliente.criar' | 'cliente.editar'
  | 'pessoas' | 'config' | 'versao.entregar' | 'ciclo.cliente' | 'comentario.visivel_cliente' | 'demanda.excluir' | 'horas.outros'
pode(acao: AcaoPermissao, eu: { id: Id; papel: Papel }, alvo?: { demanda?: Demanda; cliente?: ClienteResumo }): boolean
motivoNegado(acao: AcaoPermissao): string                         // "Só o atendimento envia ao cliente."
camposProibidos(entrada: object, papel: Papel): string[]          // CAMPOS_SO_ATENDIMENTO
// posicao.ts
entre(antes: number | null, depois: number | null): number; precisaRenormalizar(a: number, b: number): boolean
// texto.ts
normalizarAlias(s: string): string                    // minúsculo, sem acento, espaços simples (apelidos e etiquetas)
extrairMencoes(md: string): Id[]                      // @[Nome](mencao:<id>)
linhasParaItens(texto: string): string[]              // tira vazias e marcadores "-", "•", "1."
// senha.ts
detectarSenha(texto: string): boolean
```

**Critérios de aceite (testes `node:test` com `app.request()` e banco `:memory:`):**
- login certo/errado; 6ª falha em 15 min no mesmo e-mail+IP → 429; 21ª falha no mesmo e-mail em 1 h vinda de IPs
  diferentes → 429; e-mail inexistente leva o mesmo tempo; `X-Forwarded-For: 1.1.1.1, 2.2.2.2` com
  `TRUST_PROXY_HOPS=1` → IP 2.2.2.2; `/auth/senha` errada 6× → 429; convite usado 2× → 410; convite de pessoa
  desativada → 410; desativar revoga os tokens pendentes e para o cronômetro; redefinição revoga sessões antigas;
  sessão de pessoa desativada → 401; mutação sem `X-Trace-Id` ou com `Origin` errado → 403 csrf; corpo JSON de 2 MiB →
  413 `corpo_grande` sem ler o corpo; cookie `__Host-sid` com `NODE_ENV=production`.
- quadros: equipe com modelo Por pessoa e 3 membros → colunas Fila + 3 (nome = apelido, cor da pessoa); colunas do
  corpo vencem o modelo; membros da equipe passam a seguir; não admin criando → 403; nome ativo repetido → 409;
  excluir com demanda (mesmo arquivada, mesmo só de passagem) → 409 e vazio → 204 levando colunas, etiquetas e
  automações que apontavam para ele; arquivar quadro tira as demandas do bootstrap e desliga automações de outros
  quadros que apontavam para ele; restaurar → evento `quadro` com `arquivadoEm` nulo.
- colunas: arquivar com card ativo → 409; mudar o papel para `concluida` conclui as abertas sem repetição; ordenar por
  prazo deixa sem prazo por último; mover todos os cards entre quadros passa por `mover()` (etiquetas §5.6).
- demandas: criar com o modelo Post → descrição, checklist de 4 itens, prazo = hoje + 2 dias úteis pulando fim de
  semana e feriado; etiqueta padrão sem par é criada no quadro; número sequencial sem repetir sob 20 criações
  concorrentes (Promise.all); equipe mandando `atendimentoId` → 403 `campo_nao_permitido`; coluna de outro quadro → 400;
  quadro sem colunas → 422; criar notifica `membro` e `chegou` sem repetir a pessoa.
- PATCH com rev velho → 409 com `atual.descricaoMd`; comentário, arrastar, membro e etiqueta não mudam o rev; trocar
  o cliente troca o AM só quando o AM era o do cliente antigo; `capaAnexoId` de PDF → 400; `repetir` sem prazo → 400.
- mover: mesma coluna só reordena; outro quadro mapeia "Alteração" por nome e remove "Urgente" (`etiquetasRemovidas`),
  com `etiquetasSemPar: 'criar'` cria; `etiquetaIds` do quadro errado → 400; destino arquivado → 422; entrar em coluna
  `concluida` conclui e cria a repetição uma só vez (concluir, reabrir, concluir); sair dela reabre; passar do WIP →
  aviso `limite_wip`; mudar de quadro notifica `chegou` aos seguidores do destino; histórico em `demanda_movimento`.
- concluir: checkbox roda a automação `concluida` e soltar na coluna não roda; desmarcar numa coluna `concluida` volta
  para a coluna anterior; repetição semanal/mensal/diária com feriado e 31 → último dia; executarAutomacao com destino
  arquivado não move e não falha.
- arquivar/restaurar: restaurar emite `demanda` com `c` nulo e escolhe outra coluna se a de antes foi arquivada;
  restaurar em quadro arquivado → 422; excluir com versão → 409; excluir sem versão limpa atividade, notificação,
  checklist e anexos, e histórico/comentários → 404.
- SSE: evento chega a dois clientes; reconexão com `Last-Event-ID` não perde nem repete; `desde` podado → `resync`;
  tabela vazia com `desde` antigo → `resync`; `desde` maior que o seq atual → `resync` `servidor_reiniciado`;
  notificação e `quadro_usuario` só ao dono; apontamento só ao dono e admin; `link_publico` não chega à equipe;
  bootstrap e sync aplicam o mesmo filtro; bootstrap com 500 demandas em menos de 1 s.
- `verificar-migracoes.ts` verde; `npm run seed:demo` cria um ambiente navegável (6 quadros, todas as colunas com cards).
- Roteiro manual: `curl` em `/api/saude`; login pelo `curl` com cookie; `curl -N /api/eventos` mostra o evento de um
  `POST /mover` feito em outro terminal.

### 1.2 DESIGN-SYSTEM-WEB (agente 2 · API 7312, Vite 5182)

**Possui:** `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/package.json`, `web/src/main.tsx`,
`web/src/App.tsx`, `web/src/index.css`, `web/src/estilos/**`, `web/src/ui/**`, `web/src/casca/**`, `web/src/lib/**`,
`web/src/sessao/**`, `web/src/api/cliente.ts`, `web/src/api/auth.ts`, `web/src/api/bootstrap.ts`,
`web/src/api/menu.ts`, `web/src/extensoes/registro.ts`, `web/src/telas/auth/**`, `web/src/telas/dev/**`,
`web/public/fonts/**`, as extensões `extensoes/avatar/nucleo-tema.tsx` e `extensoes/avatar/nucleo-sair.tsx`.
`web/src/extensoes/tipos.ts` passa a ser dele (muda só por pedido). Não usa migrações.

**Entrega:**
- **Tokens** (`estilos/tokens.css`): exatamente `docs/pesquisa/marca.md` §7 com `light-dark()`, `data-theme`,
  `.chrome-dark`, reduced-motion e o vidro da §8 **só** na barra superior, no menu lateral, nos popovers e no modal
  (cai para sólido com `prefers-reduced-transparency` e `prefers-contrast`). Para cada cor de `CORES`: `--label-<cor>-bg`
  e `-ink` (etiquetas, avatares), `--coluna-<cor>-bg` (fundo da coluna **levemente tingido**, tom pastel calculado
  por mistura OKLab com `--surface-sunken`, contraste AA do texto e do card nos dois temas) e `--coluna-<cor>-ponto`
  (ponto no título). `--fundo-<fundo>` para `FUNDOS_QUADRO` (gradientes da marca; `liso` = `--bg`). Tailwind 4 com
  `@theme` apontando para os tokens (nada de cor solta nas telas).
- **Fonte Syne** 400–700 em `web/public/fonts/` com o `OFL.txt` (copie os `.woff2` do pacote `@fontsource/syne` via
  `npm pack`, sem adicionar dependência), `font-display: swap`, `tabular-nums` nos contadores.
- **Logo** por máscara CSS sobre `web/public/marca/logo_dark.png` (marca §3), "e" mark no menu recolhido e no
  favicon, barra arco-íris só no login.
- **Componentes `ui/`** (acessíveis, foco visível com `--focus-ring`, nos dois temas): Botao (primário laranja, um
  por tela; secundário; ghost; perigo), BotaoIcone, Campo, AreaTexto, Selecao, Combobox (autocompletar), Checkbox,
  Interruptor, Rotulo, Modal (tela cheia abaixo de 768 px), Folha, Popover (ancorado; vira folha no celular), Menu
  (com submenu), Tooltip (mostra a tecla), Kbd, Avatar e PilhaAvatares (cor da pessoa, nunca laranja), ChipEtiqueta
  (com e sem nome, recolhível como no Trello), ChipCliente, SeletorCor (paleta `CORES` + "sem cor"), Contador,
  BarraProgresso, Abas, Esqueleto, EstadoVazio, SeletorData (com hora opcional), SeletorHora, **GradeCalendario**
  (mês e semana, semana começando na segunda, feriados marcados, células como alvo de soltar com dnd-kit, itens
  desenhados por quem usa; usado pela Agenda do F3 e pelo Calendário do F6), `Markdown` (exatamente a API §5.8),
  `EditorMarkdown` (TipTap StarterKit + Mention com `injectCSS: false` e o CSS nos estilos; carregado com `lazy()`;
  recebe `buscarPessoas`), `TextoPuro`, `CopiarTexto` (para caminhos `M:\`), avisos com `sonner` (com "Desfazer").
- **Casca** (`casca/`): barra superior `.chrome-dark` com vidro (logo, slots de `extensoes/topo`, avatar com
  `extensoes/avatar`); **menu lateral** recolhível com `[`: grupo `trabalho` (de `extensoes/menu`), **seção Quadros**
  da própria casca (Favoritos com estrela e arrastar para ordenar; Recentes do `localStorage`; os outros por equipe, na
  ordem `pos`; ponto na cor do quadro; estrela ao passar o mouse; "+ Novo quadro" para admin → `/quadros/novo`),
  grupo `agencia` (de `extensoes/menu`); no celular, menu no topo (folha) e a barra de abas de `extensoes/celular`;
  faixa "Sem conexão · tentando de novo" (estado exposto por um hook que o NÚCLEO-WEB alimenta).
- **Dados da casca:** `api/bootstrap.ts` com `useBootstrap()` (GET `/api/bootstrap`, `staleTime: Infinity`, chave
  `['bootstrap']`; o NÚCLEO-WEB mantém o cache pelo SSE) e `api/menu.ts` com `useFavoritar()` e `useSeguir()`
  (`PUT /api/quadros/:id/favorito|seguir`, otimistas sobre `['bootstrap'].eu`).
- **Registro** (`extensoes/registro.ts`): um `import.meta.glob('./<pasta>/*.{ts,tsx}', { eager: true })` por pasta da
  tabela de `extensoes/tipos.ts`, tipado com `ModulosExtensao`, ordenado por `ordem`, com funções `rotas()`,
  `globais()`, `menus()`, `topo()`, `avatar()`, `abasCelular()`, `cabecalhoQuadro()`, `menuQuadro()`, `layouts()`,
  `menuColuna()`, `entradaColuna()`, `selosCard()`, `interceptadoresSoltar()`, `secoesDemanda()`, `acoesDemanda()`,
  `menuDemanda()`, `dialogos()`, `comandos()`, `fontesBusca()`, `atalhos()`, `tratadores()` (vários por entidade, em
  ordem de id), `secoesInicio()`, `secoesConfig()`. Ids repetidos: erro no console em dev.
- **Roteador** (`App.tsx`): rotas de `telas/**/rota.tsx` com `acesso` e `layout`, cada tela por `React.lazy(carregar)`
  com `Suspense` (esqueleto); rotas `sobreposta` renderizam por cima da tela anterior (padrão "background location"
  do react-router); `/` redireciona para `eu.rotaInicial` (`/inicio`); rota desconhecida → "Página não encontrada";
  título da aba "<titulo> · <APP_NOME>" (`useTituloAba()` para títulos dinâmicos). Monta os `globais()` dentro do
  `QueryClientProvider` e do Router conforme o escopo. Rota pública nunca chama `/api/bootstrap` nem redireciona.
- **Cliente HTTP** (`api/cliente.ts`): `api<T>(metodo, caminho, { corpo?, ifMatch?, idempotencia?, sinal? })` com
  `credentials: 'same-origin'`, `X-Trace-Id` novo a cada mutação (exporta `ultimosTraces()` para o eco do SSE),
  erro tipado `ErroDaApi { status, codigo, mensagem, detalhes }`, 401 → `/entrar?volta=` (exceto em rota pública).
  `api/auth.ts`: `useEu` (o único; lê `['bootstrap'].eu` quando houver, senão `GET /api/auth/eu`), `useEntrar`,
  `useSair`, convite e redefinição.
- **Telas**: `/entrar`, `/convite`, `/redefinir` (layout vazio, `acesso: 'publica'`; leem o token de `location.hash`,
  apagam o fragmento com `history.replaceState`), `/dev/ui` (catálogo de todos os componentes nos dois temas, inclusive
  uma coluna de cada cor com cards e a GradeCalendario; só em `import.meta.env.DEV`). Tema em `prefs.tema` e em
  `localStorage` para pintar antes do login.

**Critérios de aceite:** `npm run build` sem aviso de chunk acima de 500 kB (telas em chunks próprios; TipTap e cmdk
fora do chunk inicial); `/dev/ui` no claro e no escuro passa no contraste AA (texto da coluna tingida e card sobre ela
inclusive) e navega só pelo teclado; login → `/inicio`; convite em janela anônima define a senha e entra (URL sem o
`#token`); com o servidor da Onda 1, o menu lista os quadros do bootstrap, a estrela leva o quadro para Favoritos e
arrastar reordena (persistindo); 390 px sem rolagem horizontal na casca; `[` recolhe o menu; nenhuma cor hex fora de
`estilos/`; `Markdown` com `[x](javascript:alert(1))` não gera link e com `@[Rafa](mencao:u1)` gera o `span`; build
servido com a CSP da API §1 sem violações no console.

---

## 2. Onda 2: NÚCLEO-WEB

Começa quando a Onda 1 estiver na branch principal. Branch principal, árvore própria. **Agente 3 · API 7313, Vite 5183.**

**Possui:** `web/src/api/**` (exceto `cliente.ts`, `auth.ts`, `bootstrap.ts` e `menu.ts`), `web/src/tempo-real/**`,
`web/src/quadro/**`, `web/src/demanda/**`, `web/src/paleta/**`, `web/src/dialogos/**`, `web/src/teclado/**`,
`web/src/telas/quadro/**` (`/q/:slug`), `web/src/telas/demanda/**` (`/d/:numero`), `shared/logica/filtros.ts` (só na
Onda 2: na Onda 3 passa ao F6), `shared/logica/sinal.ts` e todos os arquivos `nucleo{,-*}` em `web/src/extensoes/*/`.
Sem migrações.

**Entrega:**
- **Componentes globais** (`extensoes/global/`, escopo `autenticada`): `nucleo-tempo-real.tsx` (cliente SSE),
  `nucleo-dialogos.tsx` (host de diálogos: modal ou popover ancorado, folha no celular), `nucleo-paleta.tsx` (Cmd+K),
  `nucleo-teclado.tsx` (despachante). Nada é montado editando o `App.tsx` do DS.
- **Dados** (`api/`): chaves (§2.1); seletores e mutações otimistas com reversão e aviso (assinaturas fixas na §2.2).
- **Tempo real** (`tempo-real/`): EventSource em `/api/eventos?desde=<seq do bootstrap>`, reconexão 1 s → 30 s (× 4 com
  a aba oculta), polling em `/api/sync` se o SSE falhar, ignora o próprio eco, `resync` → recarrega o bootstrap,
  entrega a `tratadores()`. Tratadores do núcleo: demanda, quadro (arquivado → limpa; restaurado → recarrega o
  bootstrap), coluna, etiqueta, automacao, quadro_usuario, modelo_demanda e cadastros (cliente, contato, link do
  cliente, usuário, equipe, feriado). Demanda: `c` nulo insere o objeto inteiro; patch parcial de id desconhecido é
  ignorado; `descricaoAtualizadaEm` invalida `['demanda', numero]`. Patches recebidos durante um arraste esperam o fim;
  card que chega de outra pessoa pisca `--accent-soft` por 1,2 s.
- **Página do quadro** (`/q/:slug`, `?v=quadro|lista|calendario`, `?f=` filtros): cabeçalho com o nome (editável pelo
  admin), estrela (`useFavoritar` do DS), seletor **Quadro | Lista | Calendário** (`layouts()`; a escolha por quadro no
  `localStorage`; sem o layout instalado, o botão some), **Só as minhas** (Q), contador, slots `cabecalhoQuadro()` e o
  menu ··· (`menuQuadro()`; do núcleo: Seguir/Deixar de seguir, Copiar link do quadro). Filtros na URL com
  `shared/logica/filtros.ts` (`aplicarFiltros`, `codificarFiltros`, `decodificarFiltros`; testes mínimos de cada campo).
  Quadro arquivado ou slug desconhecido: estado da §4.1.
- **Layout `quadro`** (`extensoes/layouts/nucleo-quadro.tsx`), com dnd-kit:
  - colunas de 280 px com **fundo tingido** na cor (`--coluna-<cor>-bg`) e ponto no título; sem cor, `--surface-sunken`;
    contador "12" ou "6/5" em destaque acima do limite WIP; ícone discreto do papel (relógio = aguardando o cliente,
    check = concluída); recolher coluna (clique no título duplo, `\`, Shift+`\` todas) como pílula vertical de 44 px,
    salvo no `localStorage`;
  - **arrastar cards** entre colunas e dentro da coluna (rolagem automática nas bordas; Esc devolve em 200 ms);
    **arrastar colunas** pelo título; "+ Adicionar coluna" no fim (nome e Enter, como no Trello);
  - menu ··· da coluna do núcleo (`coluna-menu/nucleo.tsx`): Renomear, Cor, Papel, Limite WIP, Ordenar por…,
    Mover todos os cards…, Arquivar todos os cards, Arquivar coluna; mais o que vier de `menuColuna()`;
  - rodapé "+ Adicionar demanda" e a tecla **N** abrem `entradaColuna()` na coluna em foco;
  - concluídas antigas não aparecem (estão fora do bootstrap): rodapé "ver concluídas no Arquivo" nas colunas `concluida`;
  - celular (< 768 px): colunas em largura de tela com rolagem horizontal e **snap** por coluna; `useRolarParaColuna`.
- **Card** (`quadro/CardDemanda.tsx`, exportado na §2.2 para Início, Agenda, cliente e Lista): capa (cor ou imagem,
  `capaUrl`), etiquetas (chips; clicar recolhe todas para barras finas, como no Trello, no `localStorage`), título até
  3 linhas, número, chip do cliente; selos do núcleo: prazo com estado (`estadoPrazo`), **um** sinal
  (`shared/logica/sinal.ts`: atrasada > com o cliente há N > parado há N > rodada extra), checklist "3/5", anexos,
  comentários, check de concluída, prioridade (faixa de 3 px à esquerda em alta/urgente) e avatares dos membros (até
  3 + "+2"); depois os `selosCard()`. Lápis no hover e botão direito abrem o menu de contexto (`menuDemanda()` com
  `onde` card).
- **Mover** (`useMover`): aplica na hora, chama `interceptadoresSoltar()` (o primeiro cujo `quando` for true; card
  pendente enquanto decide), chama `POST /mover`, mostra "Movida para X · Desfazer" (com as `etiquetasRemovidas`, se
  houver) e reverte com aviso no erro. Interceptador do núcleo `soltar/nucleo-concluir.ts`: soltar numa coluna
  `concluida` com `repetir` mostra "Concluída. A próxima fica para sex, 24/10" (não pergunta).
- **Modal** (`demanda/`, rota sobreposta `/d/:numero`): abre do cache; Esc fecha; ←/→ e J/K abrem a vizinha da mesma
  coluna; topo com capa, título editável, "na coluna **Fazendo** do quadro **Criação**" (clique abre `mover-demanda`
  do F1), checkbox **Concluída** (`POST /concluir`, com o aviso da repetição), ações (`acoesDemanda()`, um primário
  laranja) e menu ··· (`menuDemanda()`; do núcleo `demanda-menu/nucleo.tsx`: Copiar link, Arquivar/Restaurar,
  Excluir para o admin com `confirmar` digitando o número); colunas principal/lateral com `secoesDemanda()`. No 409 de
  rev, mescla campo a campo com `ConflitoRevDetalhes` (inclusive a descrição) e avisa.
- **Paleta** (`paleta/`): Cmd/Ctrl+K e `/` com `cmdk`; recentes primeiro; seções Ações, Quadros, Demandas, Clientes,
  Pessoas a partir de `comandos()` e `fontesBusca()`; fontes locais do núcleo: quadros (favoritos primeiro), clientes e
  pessoas (do cache); comandos do núcleo: ir para cada quadro, alternar tema.
- **Diálogos** (`dialogos/`): host e `abrirDialogo()` (com `ancora`); id sem diálogo registrado → aviso "Disponível
  em breve"; diálogo do núcleo `confirmar`.
- **Teclado** (`teclado/`): despachante de `atalhos()` com escopos (`useEscopoAtalho`), acorde G de 1,5 s com o
  indicador "G…", sem atalho de uma letra dentro de campo de texto, desligável por `prefs.atalhos`. Atalhos do núcleo
  (`atalhos/nucleo.ts`): Cmd+K e `/`, setas e J/K entre cards, Enter abre, Esc fecha, `,` e `.` movem o card para a
  coluna anterior/próxima, **Espaço** entra/sai como membro, N criação rápida, Q Só as minhas, X limpa filtros, `\`
  recolhe a coluna. Foco de card por `useFocoDemanda`.
- Botão de busca no topo (`extensoes/topo/nucleo-busca.tsx`) e a aba Busca do celular (`extensoes/celular/nucleo-busca.tsx`).
- Textos de estado do núcleo (§4.1).

### 2.1 Chaves de cache (TanStack Query) que as funcionalidades usam

| Chave | Dado | Dono da consulta |
|---|---|---|
| `['bootstrap']` | `Bootstrap` (quadros, colunas, etiquetas, automações, modelos e demandas vivem aqui) | DS (consulta) / NW (cache e SSE) |
| `['demanda', numero]` | `DemandaDetalhe` | núcleo-web |
| `['demanda', id, 'comentarios']` · `['demanda', id, 'historico']` | `Comentario[]` · `Pagina<Atividade>` (infinita) | modal |
| `['demanda', id, 'links']` | `LinkPublicoComUrl[]` | ciclo |
| `['quadros', 'arquivados']` · `['quadro', id]` | `Quadro[]` · `QuadroCompleto` | cadastros |
| `['modelos-demanda']` | `ModeloDemanda[]` com inativos | entrada |
| `['clientes']` · `['cliente', sigla]` · `['cliente', id, 'aprovacoes']` | listas e detalhe | cadastros |
| `['pessoas']` · `['config', 'app']` · `['feriados', ano]` · `['arquivo', consulta]` | cadastros | cadastros |
| `['inicio']` · `['agenda', consulta]` · `['notificacoes']` | painéis | painéis |
| `['apontamentos', consulta]` | horas | modal |
| `['busca', q]` | `BuscaSaida` | entrada |

Toda mutação de uma funcionalidade atualiza o cache pelo retorno da API **e** pelo tratador SSE (idempotente).

**Critérios de aceite:** com `seed:demo`, `/q/criacao` com 300 demandas abre em menos de 1 s (medir no Performance);
arrastar card entre colunas e entre posições reflete em outra janela em menos de 1 s; arrastar coluna persiste; soltar
numa coluna `concluida` marca o check e, com `repetir`, a próxima aparece na coluna de entrada; Esc durante o arraste
devolve; recolher coluna persiste após recarregar; `/d/12` por cima de `/q/criacao` e Esc volta sem recarregar; `?f=`
e `?v=` sobrevivem ao recarregar; derrubar o servidor mostra "Sem conexão" e, ao voltar, ressincroniza sem duplicar
cards; 409 de rev mescla (inclusive a descrição) e avisa; arquivar um quadro numa janela tira o quadro do menu da
outra e restaurar o devolve; Espaço entra na demanda e o avatar aparece na outra janela; `/a/qualquer` não chama
`/api/bootstrap` nem abre SSE; tudo pelo teclado; 390 px com snap por coluna e sem rolagem horizontal da página.

### 2.2 API interna do núcleo-web (o que as funcionalidades importam)

Como a §1.1.1 para o servidor: caminhos e assinaturas fixos. Componentes de extensão não recebem utilitários por
props; usam estes hooks. Mudar uma assinatura é pedido (regra 0.1).

```ts
// web/src/api/chaves.ts  (as chaves da §2.1, tipadas)
export const chaves: {
  bootstrap: readonly ['bootstrap']; detalhe(numero: number): readonly ['demanda', number]
  comentarios(id: Id): readonly ['demanda', Id, 'comentarios']; historico(id: Id): readonly ['demanda', Id, 'historico']
  links(id: Id): readonly ['demanda', Id, 'links']; quadrosArquivados: readonly ['quadros', 'arquivados']
  quadro(id: Id): readonly ['quadro', Id]; modelosDemanda: readonly ['modelos-demanda']
  clientes: readonly ['clientes']; cliente(sigla: string): readonly ['cliente', string]
  aprovacoesCliente(id: Id): readonly ['cliente', Id, 'aprovacoes']; pessoas: readonly ['pessoas']
  configApp: readonly ['config', 'app']; feriados(ano: number): readonly ['feriados', number]
  arquivo(c: ListarArquivoConsulta): readonly ['arquivo', ListarArquivoConsulta]; inicio: readonly ['inicio']
  agenda(c: AgendaConsulta): readonly ['agenda', AgendaConsulta]; notificacoes: readonly ['notificacoes']
  apontamentos(c: ListarApontamentosConsulta): readonly ['apontamentos', ListarApontamentosConsulta]; busca(q: string): readonly ['busca', string]
}
// web/src/api/cache.ts
export function aplicarPatchDemanda(qc: QueryClient, id: Id, patch: Partial<Demanda>): boolean  // false = id desconhecido
export function inserirDemanda(qc: QueryClient, d: Demanda): void       // objeto inteiro (criação, restaurar)
export function removerDemanda(qc: QueryClient, id: Id): void
export function atualizarDetalhe(qc: QueryClient, demandaId: Id, fn: (d: DemandaDetalhe) => DemandaDetalhe): void
export function aplicarNoBootstrap<K extends 'quadros' | 'colunas' | 'etiquetas' | 'automacoes' | 'modelosDemanda'>(
  qc: QueryClient, lista: K, op: 'upsert' | 'delete', item: Bootstrap[K][number] | { id: string }): void
export function inserirOuAtualizar<T extends { id: unknown }>(lista: readonly T[], item: T): T[]
// web/src/api/seletores.ts  (todos leem ['bootstrap'] via useBootstrap do DS)
export function useDemandas(): Demanda[]; export function useDemandasDoQuadro(quadroId: Id): Demanda[]
export function useDemanda(id: Id | null): Demanda | undefined; export function useDemandaPorNumero(numero: number): Demanda | undefined
export function useQuadros(): Quadro[]; export function useQuadro(id: Id | null): Quadro | undefined
export function useQuadroPorSlug(slug: string): Quadro | undefined
export function useColunas(quadroId: Id): Coluna[]                       // ativas, em ordem
export function useColuna(id: Id | null): Coluna | undefined
export function useEtiquetas(quadroId: Id): Etiqueta[]; export function useAutomacoes(quadroId: Id): AutomacaoQuadro[]
export function useModelosDemanda(quadroId: Id | null): ModeloDemanda[]  // globais + do quadro, ativos, em ordem
export function useUsuarios(): UsuarioResumo[]; export function useUsuario(id: Id | null): UsuarioResumo | undefined
export function useClientes(): ClienteResumo[]; export function useCliente(id: Id | null): ClienteResumo | undefined
export function useEquipes(): Equipe[]; export function useFeriados(): ReadonlySet<string>; export function useConfig(): ConfigApp
// web/src/api/demandas.ts  (otimistas: aplicam na hora, revertem com aviso no erro; null = cancelado pelo usuário)
export function useDetalhe(numero: number): UseQueryResult<DemandaDetalhe, ErroDaApi>
export function useMover(): (d: Demanda, entrada: MoverEntrada, origem: PedidoSoltar['origem']) => Promise<MoverSaida | null>
  // interceptadores, "Movida para X · Desfazer" (o Desfazer volta com etiquetaIds originais entre quadros)
export function useEditarDemanda(): (d: Demanda, mudancas: EditarDemandaEntrada) => Promise<EditarDemandaSaida | null>
export function useConcluir(): (d: Demanda, concluida: boolean) => Promise<ConcluirSaida | null>
export function useMembros(): { entrar(d: Demanda, usuarioId: Id): Promise<Demanda | null>; sair(d: Demanda, usuarioId: Id): Promise<Demanda | null> }
export function useEtiquetasDemanda(): { por(d: Demanda, etiquetaId: Id): Promise<Demanda | null>; tirar(d: Demanda, etiquetaId: Id): Promise<Demanda | null> }
export function useArquivar(): (d: Demanda) => Promise<Demanda | null>  // "Arquivada · Desfazer"
export function useRestaurar(): (d: Demanda, colunaId?: Id) => Promise<Demanda | null>
export function useCriarDemanda(): (e: CriarDemandaEntrada) => Promise<CriarDemandaSaida | null>
// web/src/api/quadros.ts  (colunas e etiquetas: otimistas)
export function useColunasMutacoes(): { criar; editar; arquivar; restaurar; moverCards; arquivarCards; ordenar }
export function useEtiquetasMutacoes(): { criar; editar; excluir }
export function useEditarQuadro(): (q: Quadro, e: EditarQuadroEntrada) => Promise<Quadro | null>
// web/src/quadro/index.ts
export function CardDemanda(p: { demanda: Demanda; compacto?: boolean; mostrarQuadro?: boolean }): JSX.Element  // sem arrastar
export function useRolarParaColuna(): (colunaId: Id) => void            // celular: barra de chips do F6
// web/src/dialogos/index.ts
export function useAbrirDialogo(): AbrirDialogo                          // id sem diálogo registrado → "Disponível em breve"
export function useContextoAcao(): ContextoAcao                          // eu, navegar, abrirDialogo, demandaEmFoco, quadroAtual
// web/src/teclado/index.ts
export function useEscopoAtalho(escopo: EscopoAtalho, ativo?: boolean): void
export function useFocoDemanda(): [Demanda | null, (d: Demanda | null) => void]
// do DS: web/src/api/auth.ts useEu(); web/src/api/bootstrap.ts useBootstrap(); web/src/api/menu.ts useFavoritar(), useSeguir()
```

---

## 3. Onda 3: funcionalidades

Começa quando a Onda 2 estiver na branch principal. **Cada uma num git worktree e branch próprios**, a partir de `master`:

```
git worktree add ../melt-demandas-<nome> -b funcionalidade/<nome> master
cd ../melt-demandas-<nome> && npm ci
```

Regras da onda: dono único dos arquivos listados (extensões pelo glob `extensoes/*/<f>{,-*}.{ts,tsx}`); usa as APIs
internas do servidor (§1.1.1) e do front (§2.2); fala com as outras funcionalidades **só** por diálogos
(`abrirDialogo`), eventos SSE e cache (chaves da §2.1), nunca por rota HTTP ou import de arquivo de outra
funcionalidade. Depender de diálogo de outra funcionalidade é permitido: até o merge dela, o host mostra "Disponível em
breve". A `ordem` de cada contribuição está na §4; os textos de estado vazio e de erro, na §4.1.

| # | Funcionalidade | Branch | Agente N | API / Vite | Migrações | Rotas |
|---|---|---|---|---|---|---|
| F1 | Modal completo | `funcionalidade/modal` | 4 | 7314 / 5184 | 020–029 | 21 |
| F2 | Ciclo da peça + página pública + automações | `funcionalidade/ciclo` | 5 | 7315 / 5185 | 030–039 | 20 |
| F3 | Início, Agenda, notificações e jobs de prazo | `funcionalidade/paineis` | 6 | 7316 / 5186 | 040–049 | 4 + tarefa |
| F4 | Entrada: Nova demanda, rápida, Colar do WhatsApp, busca, atalhos, modelos | `funcionalidade/entrada` | 7 | 7317 / 5187 | 050–059 | 7 |
| F5 | Cadastros, Configurações, Novo quadro, Primeiros passos, Arquivo | `funcionalidade/cadastros` | 8 | 7318 / 5188 | 060–069 | 7 |
| F6 | Lista e Calendário do quadro, filtros, celular | `funcionalidade/lista` | 9 | 7319 / 5189 | 070–079 | 0 |

Integração e correções pós-merge: faixa **090–099**.

### F1 · Modal completo (`modal`)
- **Possui:** `server/src/rotas/modal-*.ts`, `server/src/servicos/modal-*.ts`, `server/test/modal-*.test.ts`,
  `server/test/modal-ajuda.ts`, `server/scripts/demo/modal.ts`, `web/src/funcionalidades/modal/**`,
  `web/src/extensoes/*/modal{,-*}.{ts,tsx}`.
- **Rotas (API §4.15, 21):** comentários (GET, POST, PATCH, DELETE), histórico, checklists (POST, PATCH, DELETE), itens
  (POST, PATCH, DELETE), anexos (POST, PATCH, DELETE), copiar, cronômetro (iniciar, parar), apontamentos (GET, POST,
  PATCH, DELETE).
- **Extensões:**
  - coluna principal: `demanda/modal-descricao` (Markdown com @ no `EditorMarkdown`, salva com Ctrl+Enter ou ao sair;
    "Texto original (WhatsApp)" recolhido como texto puro), `demanda/modal-checklists` (vários, barra e %, esconder
    marcados, arrastar itens, converter item em demanda fica para a v1; selo "Ajustes R2 · prazo sex, 17/10"),
    `demanda/modal-anexos` (links, caminhos `M:\` com [Copiar caminho], arquivos com Ctrl+V e arrastar; "Tornar capa"
    nas imagens), `demanda/modal-atividade` (abas Comentários | Atividade; compositor com @, Ctrl+Enter, "Visível ao
    cliente" só para atendimento/admin; atividade tipada "Rafa moveu de Fazendo para Revisão · há 2 h");
  - coluna lateral: `demanda/modal-membros`, `modal-etiquetas`, `modal-cliente` (cliente com "Criar cliente XYZ", AM
    para atendimento/admin, links do cliente, pasta de saída com Copiar, Acessos), `modal-datas` (início, prazo com
    hora, publicação, repetir), `modal-prioridade`, `modal-estimativa`, `modal-tempo` (cronômetro ▶/■ com o tempo
    correndo, [Lançar tempo], total e meus), `modal-capa`;
  - `demanda-menu/modal.tsx` (modal e card: Mover…, Copiar…, Enviar para ▸ (favoritos primeiro, depois por equipe;
    vai para o topo da coluna de entrada), Membros, Etiquetas, Datas, Capa); `quadro-menu/modal-etiquetas`
    (Etiquetas do quadro); `dialogos/modal-*` (`mover-demanda` com quadro, coluna e posição, etiquetas sem par
    [Criar lá | Remover] e o responsável do cliente na equipe do destino como membro sugerido; `copiar-demanda`;
    `membros`, `etiquetas`, `datas`, `capa` como popover ancorado; `lancar-tempo`); `card/modal-cronometro` (selo do
    meu cronômetro ligado neste card); `topo/modal-cronometro` ("⏱ 0:42 · #123" com ■, só com cronômetro ligado);
    `atalhos/modal.ts` (M membros, L etiquetas, D datas, T cronômetro, Shift+M mover; escopos card e modal; C não
    é usada, porque no Trello ela arquiva);
    `eventos/modal.ts` (comentario, checklist, checklist_item, anexo, apontamento).
- **Testes:** contadores `nCheck*`/`nAnexos`/`nComentarios` no evento de demanda; menção notifica o mencionado e não o
  autor, membros recebem `comentario` sem repetir quem foi mencionado, e editar só notifica a menção nova; editar
  comentário de outro → 403; equipe com `visivelCliente: true` (POST e PATCH) → 403 `campo_nao_permitido`; anexo
  `http://` → 400; `anexoIds` de outra demanda → 400; excluir o anexo da capa limpa a capa; copiar para outro quadro
  com `manter.etiquetas` mapeia por nome e com `manter.checklists` desmarca os itens e deixa o de rodada de fora;
  cronômetro: iniciar outro para o anterior e soma os minutos; dois inícios simultâneos da mesma pessoa → um 200 e o
  outro também 200 com o primeiro parado (nunca dois ligados); parar depois de 11 h grava 10 h e avisa; arquivar a
  demanda para o cronômetro; apontamento de outro (equipe) → 403; `minutosRegistrados` num evento com `a`/`t` nulos e
  o `apontamento` só ao dono e ao admin; histórico paginado em ordem decrescente, sem o `tempo.lancado` de outra pessoa.
- **Roteiro:** abrir uma demanda do quadro; escrever a descrição com @Rafa e conferir, como Rafa, `GET /api/notificacoes`;
  marcar itens e ver "3/5" no card; colar um print com Ctrl+V e torná-lo capa (o card mostra a imagem); M e Espaço
  mudam membros; D muda o prazo e o card muda de estado; T liga o cronômetro, o topo mostra o tempo, T de novo para;
  "Mover para…" leva ao quadro Social e avisa a etiqueta sem par; "Copiar…" cria a cópia na coluna escolhida.

### F2 · Ciclo da peça, página pública e automações (`ciclo`)
- **Possui:** `server/src/rotas/ciclo-*.ts`, `server/src/rotas/publico.ts`, `server/src/servicos/ciclo*.ts`,
  `server/src/servicos/drive.ts`, `server/test/ciclo-*.test.ts`, `server/test/publico-*.test.ts`,
  `server/test/ciclo-ajuda.ts`, `server/scripts/demo/ciclo.ts`, `shared/logica/texto-whatsapp.ts`,
  `web/src/funcionalidades/ciclo/**`, `web/src/telas/publico/**` (`/a/:token`), `web/src/extensoes/*/ciclo{,-*}.{ts,tsx}`.
- **Rotas (API §4.8, §4.16 e §4.17, 20):** automações (PUT, DELETE), entregar versão, editar versão, acrescentar itens,
  testar Drive (versão e avulso), enviar, retorno, aprovado pelo WhatsApp, anular, ajuste interno, extra, texto para
  WhatsApp, links da demanda, revogar link, e as 4 públicas. Serviço central: `registrarRetorno()` (link e AM), que
  chama `abrirRodada()` e `executarAutomacao()` do núcleo.
- **Extensões:** `demanda/ciclo-versoes` (linha do tempo V1…Vn com itens, prévia estática, iframe só no clique em hosts
  conhecidos, "enviada em… (link | por fora)", decisões, "Rodada 3 · 2 inclusas" + [Marcar como extra]; sem versão:
  texto da §4.1); `demanda-acoes/ciclo.tsx` (Entregar versão, Enviar ao cliente, Registrar retorno, Aprovado pelo
  WhatsApp, Pedir ajuste interno, Copiar para WhatsApp; o primário depende do estado: sem versão → Entregar; versão
  não enviada → Enviar; envio pendente → Registrar retorno); `dialogos/ciclo-*` (`entregar-versao`,
  `enviar-ao-cliente` com teste de Drive, "[Enviar arquivo (até 10 MB)]", "Copiar para WhatsApp" no fim e o aviso
  "Movida para Atendimento › Com o cliente" quando a automação rodar; `registrar-retorno` com Ctrl+V do print;
  `ajuste-interno`; `anular-aprovacao`; `copiar-whatsapp`; `automacoes-quadro` com as 4 linhas "Ao enviar ao cliente,
  mover para [quadro › coluna]"); `soltar/ciclo.ts` (soltar numa coluna `aguardando_cliente` com versão não enviada,
  sendo atendimento: "Enviar ao cliente agora?" [Enviar | Só mover | Cancelar]); `quadro-menu/ciclo-automacoes`;
  `card/ciclo.tsx` (selo "V2" e "R3/2" quando passa das inclusas); `atalhos/ciclo.ts` (Shift+R, Shift+E entregar);
  `eventos/ciclo.ts` (versao, rodada, envio, aprovacao, link_publico).
  Tela pública `/a/:token` (`acesso: 'publica'`, layout vazio, celular primeiro, logo do cliente por URL assinada e
  "por Melt", folha de confirmação ao aprovar, "um ajuste por linha", "Você é Fulana?" (ou o nome, obrigatório), nome
  lembrado no aparelho, 409 "Chegou a V3", 409 "Esta peça não aguarda mais sua decisão", link inativo).
- **Testes:** entregar não muda a coluna e notifica o AM; equipe que não é membro entregando → 403; enviar sem cliente
  ou sem versão → 422; enviar roda a automação `enviado_ao_cliente` (e sem automação não move); enviar por link
  reaproveita o link ativo do contato; contato de outro cliente → 400; Drive privado (fetch simulado) → 422
  `drive_privado`; acrescentar item a versão enviada → 409; `GET /api/publico/a/:token` não muda `acessos`; mesma
  `Idempotency-Key` 2× → uma aprovação e duas 200; mesma chave com outra decisão → 422; a mesma chave em outro link é
  outra decisão; decisão com `contatoId` diferente do link → 400; versão antiga → 409 com `versaoAtual`; última versão
  enviada por fora → 409 `conflito`; duas decisões simultâneas → uma 200 e uma 409 `ja_decidida`; aprovado pelo link
  com automação para o Social › Agendar → a demanda muda de quadro com etiquetas mapeadas e o Social recebe `chegou`;
  anular devolve à coluna de antes e não devolve se alguém moveu depois; ajuste abre a rodada 2 com checklist e prazo
  em dias úteis pulando feriado e roda `ajuste_pedido`; rodada 3 com 2 inclusas → `sugerirExtra`; demanda arquivada
  some do link (410 sem itens); URL assinada vencida → 403; 31ª requisição no minuto no mesmo IP+token → 429;
  equipe enviando → 403; `link_publico` não chega à equipe; automação só por admin/atendimento; destino arquivado → 400;
  headers `no-store`, `noindex`, `no-referrer` na API e no HTML de `/a/:token`.
- **Roteiro:** configurar as automações da Criação (enviado → Com o cliente; ajuste → Fila; aprovado → Social ›
  Agendar); entregar V1 (link do Drive) → enviar por link (o card vai sozinho para Com o cliente) → abrir o link no
  celular (390 px), pedir ajuste com 3 linhas → o card volta para Fila com "Ajustes R2" → entregar V2 → arrastar para
  Com o cliente oferece o envio → aprovar no celular → o card aparece no quadro Social › Agendar em outra janela;
  "Aprovado pelo WhatsApp" + Desfazer devolve o card.

### F3 · Início, Agenda, notificações e jobs (`paineis`)
- **Possui:** `server/src/rotas/paineis-*.ts`, `server/src/servicos/paineis*.ts`, `server/src/tarefas/paineis-*.ts`
  (prazo, 8h), `server/test/paineis-*.test.ts`, `server/test/paineis-ajuda.ts`, `shared/logica/paineis.ts`,
  `web/src/funcionalidades/paineis/**`, `web/src/telas/{inicio,agenda}/**`, `web/src/extensoes/*/paineis{,-*}.{ts,tsx}`.
- **Rotas (API §4.18, 4):** início, agenda, notificações, marcar lidas. Tarefa diária `paineis-prazo`.
- **Extensões e telas:** `/inicio` com `inicio/paineis-*` (Primeiros passos do admin com os critérios e caminhos da API
  §4.18; Minhas: Atrasadas, Hoje, Esta semana, Depois, Sem prazo, com `CardDemanda` e o quadro de cada uma; Com o
  cliente há mais de 2 dias úteis, só atendimento, com "Copiar lembrete" (`copiar-whatsapp`, F2) e "Registrar retorno"
  (F2); Menções recentes); `/agenda` (mês e semana com a `GradeCalendario` do DS, todos os quadros com a cor de cada
  um, "Só as minhas", filtro de quadros, prazo/início/publicação, concluídas riscadas, feriados; **arrastar muda o
  prazo** por `useEditarDemanda` mantendo a hora; clique abre `/d/:numero`); `topo/paineis-sino` (sino com contagem,
  lista, marcar lidas, link para a demanda); `menu/paineis.tsx` (Início com o número de atrasadas, Agenda);
  `celular/paineis-*` (Início, Agenda, Sino); `atalhos/paineis.ts` (G I, G A; escopo `agenda`: Shift+← e Shift+→
  mudam o período, Shift+T volta para hoje; as letras sozinhas ficam com o card em foco); `eventos/paineis-*.ts`
  (notificacao; demanda invalida `['inicio']` e `['agenda', …]` com debounce de 1 s). Textos de Início vazio, Agenda
  vazia e sino vazio (§4.1).
- **Testes:** "Minhas" inclui membro e AM e não inclui de quadro arquivado; com o cliente nunca entra em Atrasadas;
  "Esta semana" vai até domingo; "com o cliente há mais de 2 dias úteis" conta feriado e conta desde o envio; agenda
  com intervalo de 63 dias → 400, `soMinhas` e `quadroIds` filtram, concluída antiga vem em `extras`; tarefa de prazo
  notifica membros (ou o AM sem membros), não repete no mesmo dia (com `relogio()`) e ignora concluídas e de quadro
  arquivado; marcar lidas só emite ao dono; primeiros passos: cada passo vira `feito` pelo critério e o bloco some no fim.
- **Roteiro:** admin novo vê os primeiros passos; a Agenda mostra demandas de 3 quadros; arrastar de quarta para sexta
  muda o prazo e o card do quadro muda de estado na outra janela; "Só as minhas" filtra; o sino recebe a menção em
  menos de 1 s; demanda movida em outra janela entra e sai do Início em menos de 1 s.

### F4 · Entrada (`entrada`)
- **Possui:** `server/src/rotas/entrada*.ts`, `server/src/rotas/busca.ts`, `server/src/servicos/entrada*.ts`,
  `server/test/entrada-*.test.ts`, `server/test/entrada-ajuda.ts`, `shared/logica/rapida.ts`,
  `shared/logica/colar-whatsapp.ts`, `web/src/funcionalidades/entrada/**`, `web/src/extensoes/*/entrada{,-*}.{ts,tsx}`.
- **Rotas (API §4.9 e §4.13, 7):** modelos de demanda (GET, POST, PATCH), rápida, prévia, analisar (Colar do
  WhatsApp), busca. A Nova demanda usa `POST /api/demandas` (núcleo) e `POST /api/clientes` ("Criar cliente HE").
- **Extensões:** `dialogos/entrada-nova-demanda` (Colar do WhatsApp no topo; Quadro e Coluna (padrão: o quadro aberto e
  a coluna de entrada); grade de modelos (globais + do quadro) com ícone e descrição; Cliente com apelidos e "Criar
  cliente XYZ" quando vier `siglaNova`; Título; descrição pré-preenchida com o briefing do modelo; Membros (sugere o
  responsável do cliente na equipe do quadro); Etiquetas; Prioridade; Início, Prazo (sugerido pelo modelo) e
  Publicação; Estimativa; Repetir; AM só para atendimento/admin; Criar (Ctrl+Enter) e Criar e abrir);
  `topo/entrada-nova` (o botão laranja "+ Nova demanda"); `celular/entrada-mais` ("+" com foco no Colar);
  `coluna-entrada/entrada-rapida` (Enter cria e mantém o campo aberto, chips `HE:`/`@rafa`, prévia ao vivo,
  Backspace desfaz o chip, "Criar cliente XYZ", cliente herdado de um filtro de um só cliente); `busca/entrada-demandas`
  (fonte Demandas via `/api/busca`; busca vazia com o texto da §4.1); `comandos/entrada.ts` (Nova demanda, Nova
  demanda neste quadro); `atalhos/entrada.ts` (Shift+N e `?`); `dialogos/entrada-atalhos` (lista do `?` gerada de
  `atalhos()`); `config/entrada-modelos` (Configurações › Modelos de demanda: globais e por quadro, briefing em
  Markdown com prévia, checklist, etiquetas padrão, prazo, ativar/desativar e o botão "Revisei os modelos");
  `quadro-menu/entrada-modelos` (Modelos deste quadro → `/config/modelos?quadro=`).
- **Testes:** "HE: Carrossel @rafa @ana" → cliente HE, membros Rafa e Ana, título "Carrossel"; "he outubro" não vira
  marcador; "XYZ: Banner" com XYZ desconhecida → `siglaNova = 'XYZ'`; sem cliente cria normalmente; `clienteId` do
  contexto vale sem marcador e o marcador vence; coluna arquivada → 422; analisar reconhece "[14/10 15:32] Fulana:",
  o cliente por apelido sem acento e o modelo Carrossel por "carrossel"; busca "#12" acha pelo número, "he outubro"
  filtra o cliente, "acao" acha "Ação", arquivadas só com `incluirArquivadas`, resposta em menos de 150 ms com 5 mil
  demandas; modelo global por equipe → 403 e do quadro → 201; nome repetido no escopo → 409; desativar some do bootstrap.
- **Roteiro:** Shift+N, colar uma conversa do WhatsApp → cliente e modelo sugeridos, briefing preenchido, cria no
  quadro aberto; sigla nova "XYZ" → "Criar cliente XYZ" sem sair do formulário; no rodapé da coluna, três Enter
  seguidos criam três demandas; Cmd+K "#12" + Enter abre o modal; `?` lista os atalhos de todas as funcionalidades.

### F5 · Cadastros, Configurações, Novo quadro, Primeiros passos e Arquivo (`cadastros`)
- **Possui:** `server/src/rotas/cadastros-*.ts`, `server/src/rotas/arquivo.ts`, `server/src/servicos/cadastros*.ts`,
  `server/test/cadastros-*.test.ts`, `server/test/cadastros-ajuda.ts`, `web/src/funcionalidades/cadastros/**`,
  `web/src/telas/{clientes,config,arquivo,quadros}/**`, `web/src/extensoes/*/cadastros{,-*}.{ts,tsx}`.
- **Rotas (API §4.10 trilha, §4.11, §4.19; 7):** trilha de aprovações do cliente, feriados (GET, POST, DELETE), config
  da aplicação (GET, PATCH), arquivo. As telas usam as rotas do núcleo de pessoas, equipes, clientes, quadros, colunas
  e etiquetas.
- **Telas e extensões:** `/quadros/novo` (sobreposta, admin: nome, equipe, cor, fundo, modelo de quadro com as colunas
  sugeridas editáveis (desmarcar, renomear, cor, papel); com `?equipes=1` vira **"Criar os quadros das equipes"** dos
  Primeiros passos: uma linha por equipe ativa sem quadro, modelo sugerido, colunas expandidas com os membros, um
  `POST /api/quadros` por linha); `config/cadastros-*` (Pessoas com convite e "copiar link", redefinição e desativar;
  Equipes com membros e modelo sugerido; **Quadros**: ativos e arquivados, editar nome/slug/cor/fundo/equipe, colunas
  (cor, papel, limite WIP, ordem, arquivar), etiquetas, [Automações] (diálogo `automacoes-quadro` do F2), arquivar,
  restaurar, excluir vazio; Feriados; Aparência: tema e atalhos); `menu/cadastros.tsx` (Clientes, Arquivo,
  Configurações); `quadro-menu/cadastros.tsx` (Editar quadro, Arquivar quadro: admin); `/clientes` (lista com
  contadores e "Completar cadastro"), `/clientes/:sigla` (cabeçalho com logo, contatos, pasta de saída, links,
  responsáveis por equipe e pendências; abas Demandas (de todos os quadros, agrupadas por quadro, com `CardDemanda`),
  Aprovações, Configurações: rodadas, apelidos, grupo), `/arquivo` (cliente, quadro, mês, texto; arquivadas e
  concluídas que saíram do quadro; restaurar só as arquivadas; desmarcar concluída devolve ao quadro).
  Estados vazios de Clientes, Quadros arquivados e Arquivo (§4.1).
- **Testes:** feriado novo não muda prazos gravados e entra no próximo prazo de modelo; trilha inclui anuladas; arquivo
  filtra por mês, cliente e quadro e lista a concluída há 8 dias sem arquivar; `demandaNumeroInicial` menor que o
  maior número → 400; `conviteValidadeDias: 365` → 400; `uploadLimiteBytes` acima de 10 MB → 400; `modelosRevisados`
  grava o instante; equipe e atendimento no PATCH de config → 403.
- **Roteiro:** admin novo abre os Primeiros passos → "Criar os quadros das equipes" cria 6 quadros (Criação e Social
  com uma coluna por pessoa) e eles aparecem no menu de outra janela; convida uma pessoa e copia o link → janela
  anônima define a senha e entra; cria cliente com contato padrão e responsável da Criação e vê sumir "Completar
  cadastro"; muda a cor e o papel de uma coluna e o quadro na outra janela muda; restaura do Arquivo.

### F6 · Lista e Calendário do quadro, filtros e celular (`lista`)
- **Possui:** `web/src/funcionalidades/lista/**`, `web/src/extensoes/*/lista{,-*}.{ts,tsx}`, `server/test/lista-*.test.ts`
  (testes de lógica pura) e, **na Onda 3**, `shared/logica/filtros.ts` (recebe do NÚCLEO-WEB com testes mínimos;
  corrige o que os testes acharem).
- **Rotas:** nenhuma (usa o bootstrap, `PATCH /api/demandas/:id` e `POST /mover` do núcleo).
- **Extensões:** `layouts/lista-lista` (tabela virtualizada: #, Título, Cliente, Coluna, Membros, Etiquetas,
  Prioridade, Início, Prazo, Concluída; ordena pelo cabeçalho; agrupa por coluna, membro, cliente, prioridade ou prazo;
  arrastar entre grupos de coluna = mover; clique abre o modal; no celular vira lista de `CardDemanda` agrupada);
  `layouts/lista-calendario` (mês e semana com a `GradeCalendario`; arrastar entre dias muda o prazo mantendo a hora;
  faixa "Sem prazo" de onde se arrasta para um dia; concluídas riscadas); `quadro-cabecalho/lista-filtros` (chips
  Cliente, Membro, Etiqueta, Prazo, Prioridade, Com o cliente, Concluídas, texto; contador e Limpar; tudo na URL);
  `quadro-cabecalho/lista-colunas-celular` (no celular, barra de chips com as colunas e as contagens; toque rola até
  a coluna com `useRolarParaColuna`); folha de filtros no celular; `atalhos/lista.ts` (F abre os filtros; escopo quadro).
- **Testes:** `aplicarFiltros` coberto para cada campo de `FiltrosQuadro` (inclusive `membros: ['nenhum']`,
  `etiquetas: ['nenhuma']`, `concluidas: 'so'`, `soMinhas` com o AM), `prazo: 'atrasado'` não pega com o cliente,
  `codificar`/`decodificar` ida e volta e JSON inválido na URL vira filtro vazio. Estado "filtro sem resultado" (§4.1).
- **Roteiro:** Lista ordenada por prazo e agrupada por membro; arrastar na Lista entre grupos de coluna move o card no
  quadro da outra janela; Calendário: arrastar muda o prazo e a Agenda (F3, se mergeado) concorda; filtros sobrevivem ao
  recarregar e ao compartilhar a URL; em 390 px, a barra de chips pula para a coluna e o modal abre em tela cheia.

---

## 4. Pontos de extensão: quem fornece, quem usa

Contrato em `web/src/extensoes/tipos.ts`. O DESIGN-SYSTEM-WEB escreve os carregadores (`registro.ts`).

| Ponto | Mecanismo (consome) | Contribuem |
|---|---|---|
| `telas/**/rota.tsx` | DS (roteador, lazy) | DS (auth, dev), NW (quadro, demanda), F2 (pública), F3 (início, agenda), F5 (clientes, config, arquivo, quadros/novo) |
| `extensoes/global` | DS (App.tsx) | NW (tempo real, diálogos, paleta, teclado) |
| `extensoes/menu` | DS (menu lateral; a seção Quadros é da casca) | F3 (trabalho), F5 (agência) |
| `extensoes/topo` | DS | NW (busca), F1 (cronômetro), F3 (sino), F4 (Nova demanda) |
| `extensoes/avatar` | DS | DS (tema, sair) |
| `extensoes/celular` | DS | NW (busca), F3, F4 |
| `extensoes/quadro-cabecalho` | NW (página do quadro) | F6 (filtros, colunas no celular) |
| `extensoes/quadro-menu` | NW | NW (seguir, copiar link), F1 (etiquetas), F2 (automações), F4 (modelos), F5 (editar, arquivar) |
| `extensoes/layouts` | NW (página do quadro) | NW (quadro), F6 (lista, calendário) |
| `extensoes/coluna-menu` · `extensoes/coluna-entrada` | NW (quadro) | NW (menu da coluna), F4 (criação rápida) |
| `extensoes/card` | NW (CardDemanda) | F1 (cronômetro), F2 (versão e rodada) |
| `extensoes/soltar` | NW (useMover) | NW (concluir), F2 (enviar ao soltar em aguardando_cliente) |
| `extensoes/demanda` (seções) | NW (modal) | F1, F2 |
| `extensoes/demanda-acoes` | NW | F2 (e quem precisar) |
| `extensoes/demanda-menu` | NW (modal e card) | NW (copiar link, arquivar, excluir), F1 (mover, copiar, enviar para, membros, etiquetas, datas, capa) |
| `extensoes/dialogos` | NW (host + `abrirDialogo`) | NW (confirmar), F1, F2, F4 |
| `extensoes/comandos` · `extensoes/busca` | NW (paleta) | NW, F4 |
| `extensoes/atalhos` | NW (despachante) | NW, F1, F2, F3, F4, F6 |
| `extensoes/eventos` | NW (cliente SSE; vários por entidade) | NW, F1, F2, F3 |
| `extensoes/inicio` | F3 (tela Início) | F3 |
| `extensoes/config` | F5 (tela Configurações) | F4 (modelos), F5 |
| `server/src/rotas/*.ts` | NS (`criarApp`) | NS, F1–F5 |
| `server/src/tarefas/*.ts` | NS (`tarefas.ts`) | NS, F3 |
| `server/scripts/demo/*.ts` | NS (`seed-demo.ts`) | NS, F1, F2 |
| `server/migracoes/NNN_*.sql` | NS (`migrar`) | faixas da §3 |

DS = DESIGN-SYSTEM-WEB, NS = NÚCLEO-SERVIDOR, NW = NÚCLEO-WEB.

**`ordem` combinada** (quem não está aqui usa 100, 200… dentro do próprio arquivo; números novos entre os existentes):

| Ponto | Ordem |
|---|---|
| modal, coluna principal | `modal-descricao` 100 · `modal-checklists` 200 · `ciclo-versoes` 300 · `modal-anexos` 400 · `modal-atividade` 500 |
| modal, coluna lateral | `modal-membros` 100 · `modal-etiquetas` 150 · `modal-cliente` 200 · `modal-datas` 300 · `modal-prioridade` 350 · `modal-estimativa` 400 · `modal-tempo` 500 · `modal-capa` 600 |
| ações do modal | `ciclo` 100–199 (o primário sai daqui) · outras 200+ |
| menu ··· do modal e do card | `modal` 100–199 (mover 100, copiar 110, enviar para 120, membros 130, etiquetas 140, datas 150, capa 160) · `nucleo-copiar-link` 300 · `nucleo-arquivar` 900 · `nucleo-excluir` 950 |
| menu ··· do quadro | `nucleo` (seguir 100, copiar link 110) · `modal-etiquetas` 200 · `ciclo-automacoes` 300 · `entrada-modelos` 400 · `cadastros` (editar 800, arquivar 900) |
| menu da coluna | `nucleo` 100–900 (renomear 100, cor 110, papel 120, WIP 130, ordenar 200, mover todos 300, arquivar todos 800, arquivar coluna 900) |
| cabeçalho do quadro | esquerda: `lista-filtros` 100; direita: `lista-colunas-celular` 100 |
| layouts | `nucleo-quadro` 100 · `lista-lista` 200 · `lista-calendario` 300 |
| selos do card | rodapé: `ciclo` 100 · `modal-cronometro` 200 |
| soltar | `ciclo` 100 · `nucleo-concluir` 200 |
| celular | `paineis-inicio` 100 · `paineis-agenda` 200 · `entrada-mais` 300 · `nucleo-busca` 400 · `paineis-sino` 500 |
| menu lateral | grupo `trabalho`: `paineis` (Início 100, Agenda 200); seção Quadros (casca); grupo `agencia`: `cadastros` (Clientes 100, Arquivo 200, Configurações 300) |
| barra superior | esquerda: `nucleo-busca` 100; direita: `modal-cronometro` 50, `entrada-nova` 100, `paineis-sino` 200 |
| avatar | `nucleo-tema` 200 · `nucleo-sair` 900 |
| Início | `paineis-primeiros-passos` 50 · `paineis-minhas` 100 · `paineis-cliente-parado` 200 · `paineis-mencoes` 300 |
| Configurações | `cadastros-pessoas` 100 · `cadastros-equipes` 200 · `cadastros-quadros` 300 · `entrada-modelos` 400 · `cadastros-feriados` 500 · `cadastros-aparencia` 600 |
| globais | `nucleo-tempo-real` 100 · `nucleo-dialogos` 200 · `nucleo-teclado` 300 · `nucleo-paleta` 400 |

### 4.1 Estados vazios, carregamento e erro: texto e dono

| Estado | Texto ou comportamento | Dono |
|---|---|---|
| Carregamento do quadro e das telas | esqueleto com as colunas, depois os cards; nada de spinner na tela toda | NW (telas do DS: DS) |
| Sem quadros (começo do zero) | "Nenhum quadro ainda." [Criar os quadros das equipes] (admin) ou "Peça ao admin para criar os quadros." | DS (menu) + NW (`/`) |
| Quadro sem colunas | "Este quadro ainda não tem colunas." [+ Adicionar coluna] | NW |
| Quadro sem demandas | "Nenhuma demanda ainda. Crie a primeira no rodapé de uma coluna ou com Shift+N." | NW |
| Quadro arquivado ou inexistente | "Este quadro foi arquivado." [Ver quadros arquivados] (admin) / "Quadro não encontrado." | NW |
| Coluna vazia | área de soltar com "Solte aqui" só durante o arraste; fora dele, só o "+ Adicionar demanda" | NW |
| Filtro sem resultado | "Nenhuma demanda com estes filtros." [Limpar filtros] | NW (quadro), F6 (lista, calendário) |
| Sem conexão | faixa discreta "Sem conexão · tentando de novo"; ao voltar, ressincroniza | NW (estado) + DS (faixa) |
| Erro ao salvar | o card volta: "Não foi possível salvar." [Tentar de novo] | NW |
| Sem permissão | "Você não tem acesso a esta ação." + o motivo (`mensagem` do erro) | NW |
| 409 de rev | "Alguém mudou esta demanda ao mesmo tempo. Juntamos as mudanças." | NW |
| Arquivar | "Arquivada · Desfazer" | NW |
| Mover entre quadros | "Movida para Social › Agendar · Desfazer" (+ "2 etiquetas ficaram para trás") | NW |
| Início vazio | "Nada com você agora. Veja os seus quadros favoritos." | F3 |
| Agenda vazia | "Nenhuma demanda com prazo neste período." | F3 |
| Sino vazio | "Nenhuma notificação." | F3 |
| Busca vazia | "Nada encontrado para "termo". Tente a sigla do cliente ou o número." | F4 |
| Demanda sem versão | "Nenhuma versão entregue. Cole o link do Drive ou o caminho da pasta de saída." | F2 |
| Drive privado | "O cliente verá uma tela de login." [Abrir compartilhamento] [Testar de novo] [Enviar arquivo (até 10 MB)] | F2 |
| Link expirado ou revogado | "Este link de aprovação não está mais ativo. Peça um novo ao seu atendimento." | F2 |
| Versão substituída (409) | "Chegou a V3. Veja a versão nova antes de decidir." | F2 |
| Peça que não aguarda decisão (409) | "Esta peça não aguarda mais sua decisão." | F2 |
| Clientes vazio | "Nenhum cliente cadastrado." [Cadastrar cliente] | F5 |
| Quadros arquivados vazio | "Nenhum quadro arquivado." | F5 |
| Arquivo vazio | "Nada no Arquivo ainda. As concluídas saem do quadro depois de {quadroConcluidasDias} dias." | F5 |

---

## 5. Integração e verificação final

**Ordem de merge da Onda 3:** F5 → F4 → F1 → F2 → F3 → F6. Os roteiros de cada funcionalidade usam só superfícies
próprias e do núcleo (as checagens cruzadas ficam na verificação final), mas a ordem ainda importa para o rebase:
F5 primeiro porque traz o "Novo quadro" e os Primeiros passos (quadros reais em vez do seed); F4 traz a Nova demanda,
usada por todos os outros roteiros; F1 traz os diálogos de membros, etiquetas, datas e "Mover para", que o card e o
ciclo usam; F2 depois do F1 (selo "Ajustes R2" nos checklists); F3 depois do F2 (o Início usa `copiar-whatsapp` e
`registrar-retorno`); F6 por último porque recebe `shared/logica/filtros.ts`.

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
1. Primeiro boot com `ADMIN_EMAIL`/`ADMIN_SENHA` cria o admin; o Início do admin mostra os 4 primeiros passos.
2. "Criar os quadros das equipes" cria Atendimento, Criação, Social, Web, Tráfego e Produção (Criação e Social com uma
   coluna por pessoa depois de convidar a equipe; o admin renomeia "Revisão" para "Pronto" na Criação antes de criar).
3. Admin convida um AM, dois designers e um social; cada um define a senha pelo link (janelas separadas) e já segue o
   quadro da própria equipe. Cadastra o cliente HE com contato padrão, AM e o responsável da Criação; aperta "Revisei
   os modelos". Os primeiros passos somem.
4. Admin configura as automações da Criação: enviado ao cliente → Atendimento › Com o cliente; ajuste pedido →
   Criação › Fila; aprovado → Social › Fila.
5. AM cola uma conversa do WhatsApp na Nova demanda (quadro Criação, modelo Carrossel sugerido, briefing preenchido,
   designer sugerido como membro) → a demanda nasce na Fila; o designer recebe `membro` e os seguidores, `chegou`. No
   rodapé da coluna, "HE: Ideia de post @rafa" + Enter cria outra.
6. Designer arrasta para a coluna dele, liga o cronômetro (T), marca o checklist, entrega V1 com link do Drive; o AM
   recebe `versao_entregue`.
7. AM envia por link; o card vai sozinho para Atendimento › Com o cliente; no celular (390 px) o cliente pede ajuste
   com 2 linhas; o card volta para Criação › Fila com "Ajustes R2" e prazo novo; o designer recebe `ajuste_pedido`.
8. Designer entrega V2; AM envia; o cliente aprova; o card vai para Social › Fila com as etiquetas de mesmo nome e o
   social, que segue o quadro, recebe `chegou`; o social marca concluída numa demanda semanal e a próxima aparece.
9. A Agenda mostra as demandas dos 3 quadros; arrastar uma de dia muda o prazo e o card muda na outra janela. A Lista
   e o Calendário do quadro Criação funcionam com filtros na URL.
10. AM arquiva as concluídas da coluna; a busca do Arquivo encontra a demanda por "he" + palavra do título; restaurar a
    devolve e o card reaparece na outra janela. Uma concluída há mais de 7 dias sem arquivar também está no Arquivo.
11. Duas janelas abertas o tempo todo: tudo aparece na outra em menos de 1 s (inclusive o sino depois de uma menção e
    a estrela no menu); derrubar e subir o servidor ressincroniza.
12. Tema claro e escuro (colunas tingidas legíveis, vidro só na barra, no menu, nos popovers e no modal), teclado
    apenas no quadro e no modal, CSP da API §1 sem violações no console, `/api/publico/*` e `/a/*` com
    `no-store`/`noindex`/`no-referrer`, convite sem token na URL depois de aberto, backup diário em `DATA_DIR/backups`.
13. `docker build` e o container sobem com o volume em `/app/data` e respondem em `/api/saude`; atrás do Traefik, o
    limite de login conta o IP real (`TRUST_PROXY_HOPS=1`).

---

## 6. Dúvidas em aberto

Decisões tomadas no contrato que o dono do produto deve confirmar (nenhuma bloqueia o início):

1. **Automações entre quadros:** a ADAPTACOES cita "outro quadro" só para "quando o cliente aprovar". O contrato deixa
   **os 4 gatilhos** apontarem para qualquer quadro (ex.: enviado ao cliente → Atendimento › Com o cliente), porque o
   fluxo real passa por 2 a 6 quadros. Se for para travar, é um CHECK numa migração 090–099.
2. **Etiquetas ao mover entre quadros:** por padrão, as sem par de mesmo nome **saem** (o Trello recria e por isso a Melt
   tem ~500 etiquetas); o "Mover para…" oferece "Criar lá". Automação e "Enviar para" sempre removem.
3. **Entregar versão** fica com os membros da demanda, o AM, atendimento e admin (a ADAPTACOES diz "qualquer membro").
   Quem não é membro entra com Espaço antes.
4. **Sem prazo automático:** o modelo sugere o prazo na criação (dias úteis) e só. Feriado novo não recalcula prazos.
5. **Concluídas saem do quadro depois de 7 dias** (`quadroConcluidasDias`, mesmo sem arquivar) e ficam no Arquivo;
   desmarcar devolve ao quadro. Isso vale também para a concluída pelo checkbox fora de uma coluna `concluida`.
6. **Modelo "Por pessoa"** é literalmente Fila + uma coluna por pessoa (sem Concluído). As concluídas ficam marcadas
   no lugar até sair do quadro.
7. **Fundos de quadro** são gradientes da marca (`liso`, `grafite`, `berinjela`, `cobalto`, `aurora`); as fotos da
   marca §3.4 (fora do repositório) podem virar fundos na v1.
8. **Seguir quadro:** entrar numa equipe faz seguir os quadros dela; quem segue recebe `chegou` a cada demanda que
   entra (criada ou movida). Se virar ruído, a v1 limita a "chegou sem membros".
9. **Ajuste interno** (rodada interna) fica com atendimento e admin; a equipe pede ajuste pelo comentário.
10. **Visível ao cliente** só pode ser ligado por atendimento e admin (a equipe não fala com o cliente).
11. **Desativar uma pessoa** não a tira das demandas; alguém tira.
12. **Peça com o cliente nunca é "atrasada"** (estado `pausado`); o atraso do cliente aparece como "com o cliente há N"
    e no Início do AM.
13. **Branch principal:** o repositório usa `master`; o plano usa `master`.
14. **Feriados:** Carnaval e Corpus Christi entram como facultativos e contam como dia não útil; os municipais da sede
    não foram semeados (falta a cidade).
15. **Proxy:** `TRUST_PROXY_HOPS=1` supõe o Traefik do EasyPanel como único proxy; com Cloudflare na frente, 2.
16. **`style-src 'unsafe-inline'`** na CSP: o sonner e o TipTap injetam `<style>` em tempo de execução. Scripts
    continuam só `'self'`.

---

## 7. Críticas descartadas

Da revisão anterior do contrato (fidelidade, integridade e paralelismo), continuam recusadas no modelo de quadros:

1. **`422 validacao` para chave de idempotência repetida com outro corpo:** é `422 idempotencia`, porque no contrato
   inteiro `validacao` é o 400 do zod.
2. **`style-src 'self'` puro:** o sonner e o TipTap injetam `<style>`; o estilo aceita `'unsafe-inline'` e o script
   continua só `'self'`.
3. **Baixar logo por URL externa no cadastro:** seria o servidor buscando URL de usuário (risco de SSRF) por pouco
   ganho; o logo é só por upload.
4. **Liberar url/caminho de `versao_item` na exclusão:** abriria brecha na trilha imutável; excluir fica bloqueado com
   qualquer versão.
