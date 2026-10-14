-- 001_base.sql: esquema completo do MVP em SQLite (node:sqlite), modelo de QUADROS SEPARADOS POR EQUIPE.
-- Referências: docs/ADAPTACOES.md ("Modelo de quadros" substitui o fluxo único da SPEC), docs/API.md, shared/tipos.
--
-- Convenções
-- * Tabelas STRICT. Ids TEXT (crypto.randomUUID(); nos seeds de configuração, slugs estáveis como 'mq-kanban').
-- * Instante: TEXT ISO 8601 UTC com ms ('2026-10-14T17:03:00.000Z'), gravado com agora() (server/src/db.ts).
-- * Data local (America/Sao_Paulo): TEXT 'YYYY-MM-DD'. Hora local: TEXT 'HH:MM'. Prazo sem hora = 18:00.
-- * Booleano: INTEGER 0/1. JSON: TEXT com json_valid. URL: só https.
-- * Nada se apaga: usuário, cliente e demanda não têm DELETE (gatilhos); arquivar, desativar ou anonimizar.
--   Quadro só se apaga se nunca teve demanda (senão, arquivar).
-- * Integridade de quadro: a coluna é do quadro da demanda (FK composta). demanda_etiqueta guarda a etiqueta COM o
--   quadro dela (FK composta com etiqueta): as etiquetas atuais da demanda são as do quadro em que ela está; as de
--   outros quadros ficam guardadas e voltam se ela voltar (o serviço mapeia por nome ao mudar de quadro; API.md §5.6).
-- * Regras de negócio (mover, concluir, repetir, automações, ciclo, notificações) ficam em server/src/servicos.
--   Gatilhos aqui só fazem integridade: imutabilidade, contadores, histórico de movimentação, rev, atualizado_em, busca.
-- * Toda UPDATE em demanda feita pelo app grava atualizado_por (o usuário do ator, ou NULL para cliente pelo link e
--   sistema) e atualizado_em = agora(); mudar de coluna grava status_desde = max(agora(), status_desde + 1 ms)
--   (o gatilho demanda_status_desde exige que cresça; o histórico usa esse instante; com o relógio dos testes parado,
--   criar e mover no mesmo instante continua valendo).
-- * Os DEFAULT strftime('now') e o 'now' dos gatilhos são só rede de segurança (os testes fixam o relógio do app).
-- * _migracoes é criada pelo runner (server/src/db.ts), não por esta migração.
-- * Cores (CORES em shared/tipos/nucleo.ts): ambar, amarelo, rosa, magenta, roxo, berinjela, verde, turquesa, azul,
--   grafite. O laranja da marca nunca é cor de etiqueta, coluna ou quadro.

-- ═════════════════════════════ configuração da aplicação ═════════════════════════════

CREATE TABLE configuracao (
  chave          TEXT PRIMARY KEY,                       -- 'prazo.hora_padrao', 'quadro.concluidas_dias', ...
  valor          TEXT NOT NULL CHECK (json_valid(valor)),
  atualizado_por TEXT REFERENCES usuario(id),
  atualizado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

-- ═════════════════════════════ pessoas, sessões e acesso ═════════════════════════════

CREATE TABLE usuario (
  id                TEXT PRIMARY KEY,
  nome              TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 120),
  apelido           TEXT CHECK (apelido IS NULL OR length(apelido) BETWEEN 1 AND 40),   -- "Rafa": usado em @
  email             TEXT NOT NULL CHECK (email LIKE '%_@_%' AND email = lower(trim(email))),
  senha_hash        TEXT,                                -- 'scrypt$N$r$p$sal_b64$hash_b64'; nulo até aceitar o convite
  senha_definida_em TEXT,
  papel             TEXT NOT NULL DEFAULT 'equipe' CHECK (papel IN ('admin','atendimento','equipe')),
  cor               TEXT NOT NULL DEFAULT 'azul'
                    CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  prefs             TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(prefs) AND json_type(prefs) = 'object'),
  ativo             INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  ultimo_acesso_em  TEXT,
  origem_trello_id  TEXT,
  criado_por        TEXT REFERENCES usuario(id),
  criado_em         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((senha_hash IS NULL) = (senha_definida_em IS NULL))
) STRICT;
CREATE UNIQUE INDEX usuario_email_uk   ON usuario (email);
CREATE UNIQUE INDEX usuario_apelido_uk ON usuario (lower(apelido)) WHERE apelido IS NOT NULL AND ativo = 1;
CREATE UNIQUE INDEX usuario_trello_uk  ON usuario (origem_trello_id) WHERE origem_trello_id IS NOT NULL;

CREATE TABLE sessao (
  id            TEXT PRIMARY KEY,
  usuario_id    TEXT NOT NULL REFERENCES usuario(id),
  token_hash    TEXT NOT NULL UNIQUE,                    -- sha256 hex do valor do cookie (randomBytes(32) em base64url)
  criada_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expira_em     TEXT NOT NULL,                           -- deslizante: 30 dias a partir do último uso
  ultimo_uso_em TEXT,
  revogada_em   TEXT,
  user_agent    TEXT,
  ip            TEXT
) STRICT;
CREATE INDEX sessao_usuario_ix ON sessao (usuario_id) WHERE revogada_em IS NULL;

CREATE TABLE token_acesso (                              -- convite (7 dias) e redefinição de senha (1 h), uso único
  id          TEXT PRIMARY KEY,
  usuario_id  TEXT NOT NULL REFERENCES usuario(id),
  finalidade  TEXT NOT NULL CHECK (finalidade IN ('convite','redefinicao')),
  token_hash  TEXT NOT NULL UNIQUE,                      -- sha256 hex do token (randomBytes(32) em base64url, no fragmento #)
  expira_em   TEXT NOT NULL,
  usado_em    TEXT,                                      -- consumir: UPDATE ... WHERE usado_em IS NULL AND revogado_em IS NULL
  revogado_em TEXT,                                      --   AND expira_em > agora, exigindo changes = 1
  criado_por  TEXT REFERENCES usuario(id),
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
-- no máximo um token pendente por pessoa e finalidade (gerar outro, desativar a pessoa ou trocar o e-mail revoga)
CREATE UNIQUE INDEX token_acesso_pendente_uk ON token_acesso (usuario_id, finalidade) WHERE usado_em IS NULL AND revogado_em IS NULL;

CREATE TABLE login_tentativa (                           -- limites somados (API.md §4.2): e-mail+IP 5/15 min,
  id        INTEGER PRIMARY KEY AUTOINCREMENT,           -- e-mail 20/h, IP 50/15 min; troca de senha: 5/15 min por pessoa
  tipo      TEXT NOT NULL DEFAULT 'login' CHECK (tipo IN ('login','senha')),
  email     TEXT NOT NULL,
  ip        TEXT NOT NULL,                               -- IP real: X-Forwarded-For conforme TRUST_PROXY_HOPS (API.md §1)
  ok        INTEGER NOT NULL CHECK (ok IN (0,1)),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX login_tentativa_ix       ON login_tentativa (email, ip, criado_em);
CREATE INDEX login_tentativa_email_ix ON login_tentativa (email, criado_em);
CREATE INDEX login_tentativa_ip_ix    ON login_tentativa (ip, criado_em);

-- ═════════════════════════════ modelos de quadro e equipes ═════════════════════════════

CREATE TABLE modelo_quadro (                             -- "Novo quadro": Kanban simples, Por pessoa, Semana, Em branco
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL UNIQUE CHECK (length(trim(nome)) BETWEEN 1 AND 60),
  descricao TEXT NOT NULL DEFAULT '' CHECK (length(descricao) <= 300),
  pos       REAL NOT NULL
) STRICT;

CREATE TABLE modelo_quadro_coluna (
  id         TEXT PRIMARY KEY,
  modelo_id  TEXT NOT NULL REFERENCES modelo_quadro(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 60),
  cor        TEXT CHECK (cor IS NULL OR cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  papel      TEXT NOT NULL DEFAULT 'normal' CHECK (papel IN ('normal','aguardando_cliente','concluida')),
  por_membro INTEGER NOT NULL DEFAULT 0 CHECK (por_membro IN (0,1)),   -- 1 = vira uma coluna por membro ativo da equipe
  pos        REAL NOT NULL,                                            --     (nome = apelido ou nome, cor = cor da pessoa,
  CHECK (por_membro = 0 OR papel = 'normal'),                          --      coluna.responsavel_id = a pessoa)
  UNIQUE (id, modelo_id)                                               -- alvo da FK de modelo_quadro_automacao
) STRICT;
CREATE INDEX modelo_quadro_coluna_ix ON modelo_quadro_coluna (modelo_id, pos);
CREATE UNIQUE INDEX modelo_quadro_coluna_membro_uk ON modelo_quadro_coluna (modelo_id) WHERE por_membro = 1;

CREATE TABLE modelo_quadro_automacao (                     -- automações sugeridas: nascem com o quadro quando a coluna
  modelo_id         TEXT NOT NULL REFERENCES modelo_quadro(id) ON DELETE CASCADE,   -- de destino foi mantida (API §4.5)
  gatilho           TEXT NOT NULL CHECK (gatilho IN ('enviado_ao_cliente','ajuste_pedido','aprovado','concluida')),
  destino_coluna_id TEXT NOT NULL,                         -- coluna do MESMO modelo (nunca a por_membro)
  PRIMARY KEY (modelo_id, gatilho),
  FOREIGN KEY (destino_coluna_id, modelo_id) REFERENCES modelo_quadro_coluna (id, modelo_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE equipe (
  id               TEXT PRIMARY KEY,
  nome             TEXT NOT NULL UNIQUE,
  slug             TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z]*' AND slug NOT GLOB '*[^a-z0-9-]*'),
  cor              TEXT NOT NULL DEFAULT 'grafite'
                   CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  modelo_quadro_id TEXT REFERENCES modelo_quadro(id),     -- sugestão dos Primeiros passos ("criar o quadro da equipe")
  ativa            INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0,1)),
  pos              REAL NOT NULL,
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE equipe_membro (
  equipe_id  TEXT NOT NULL REFERENCES equipe(id),
  usuario_id TEXT NOT NULL REFERENCES usuario(id),
  funcao     TEXT CHECK (funcao IS NULL OR length(funcao) <= 40),   -- design, vídeo, redação, social, dev, tráfego
  principal  INTEGER NOT NULL DEFAULT 0 CHECK (principal IN (0,1)),
  PRIMARY KEY (equipe_id, usuario_id)
) STRICT;
CREATE INDEX equipe_membro_usuario_ix ON equipe_membro (usuario_id);

-- ═════════════════════════════ quadros, colunas, etiquetas, favoritos, automações ═════════════════════════════

CREATE TABLE quadro (                                    -- /q/:slug. Todos os internos veem e editam; só admin cria,
  id               TEXT PRIMARY KEY,                     -- renomeia, arquiva e exclui
  nome             TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 80),
  slug             TEXT NOT NULL UNIQUE
                   CHECK (length(slug) BETWEEN 1 AND 60 AND slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*'),
  descricao        TEXT NOT NULL DEFAULT '' CHECK (length(descricao) <= 500),
  cor              TEXT NOT NULL DEFAULT 'grafite'
                   CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  fundo            TEXT NOT NULL DEFAULT 'liso' CHECK (fundo IN ('liso','grafite','berinjela','cobalto','aurora')),
  equipe_id        TEXT REFERENCES equipe(id),            -- agrupa no menu; seguidores padrão; responsável do cliente
  modelo_quadro_id TEXT REFERENCES modelo_quadro(id),     -- de onde vieram as colunas (informativo)
  coluna_por_membro INTEGER NOT NULL DEFAULT 0 CHECK (coluna_por_membro IN (0,1)),   -- 1 = quem entra na equipe ganha
                                                         -- a própria coluna aqui (modelo Por pessoa; API.md §4.3/§4.4)
  pos              REAL NOT NULL,                         -- ordem no menu lateral
  arquivado_em     TEXT,
  arquivado_por    TEXT REFERENCES usuario(id),
  origem_trello_id TEXT,
  criado_por       TEXT REFERENCES usuario(id),
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (arquivado_por IS NULL OR arquivado_em IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX quadro_nome_uk   ON quadro (lower(nome)) WHERE arquivado_em IS NULL;
CREATE UNIQUE INDEX quadro_trello_uk ON quadro (origem_trello_id) WHERE origem_trello_id IS NOT NULL;

CREATE TABLE quadro_usuario (                            -- estrela (favorito) e "Seguir" por pessoa
  usuario_id    TEXT NOT NULL REFERENCES usuario(id),
  quadro_id     TEXT NOT NULL REFERENCES quadro(id) ON DELETE CASCADE,
  favorito_pos  REAL,                                    -- não nulo = estrela; ordem entre os favoritos da pessoa
  seguindo      INTEGER NOT NULL DEFAULT 0 CHECK (seguindo IN (0,1)),   -- recebe 'chegou' quando entra demanda
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (usuario_id, quadro_id),
  CHECK (favorito_pos IS NOT NULL OR seguindo = 1)       -- sem estrela e sem seguir, o serviço apaga a linha
) STRICT;
CREATE INDEX quadro_usuario_seguidores_ix ON quadro_usuario (quadro_id) WHERE seguindo = 1;

CREATE TABLE coluna (                                    -- lista do quadro; qualquer interno cria, renomeia, colore,
  id               TEXT PRIMARY KEY,                     -- reordena e arquiva (recolher é preferência local)
  quadro_id        TEXT NOT NULL REFERENCES quadro(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 60),
  cor              TEXT CHECK (cor IS NULL OR cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  papel            TEXT NOT NULL DEFAULT 'normal' CHECK (papel IN ('normal','aguardando_cliente','concluida')),
                                                         -- aguardando_cliente: bola com o cliente, "parado há" pausado;
                                                         -- concluida: cards aqui contam como entregues (concluida_em)
  responsavel_id   TEXT REFERENCES usuario(id),          -- coluna de uma pessoa ("Rafa"): soltar aqui põe a pessoa
                                                         -- como membro e tira a da coluna de origem (API.md §5.1)
  limite_wip       INTEGER CHECK (limite_wip IS NULL OR limite_wip BETWEEN 1 AND 99),   -- só aviso, não bloqueia
  pos              REAL NOT NULL,
  arquivada_em     TEXT,                                 -- só vazia (gatilho coluna_arquivar_vazia)
  arquivada_por    TEXT REFERENCES usuario(id),
  origem_trello_id TEXT,
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (id, quadro_id),                                -- alvo das FKs (coluna_id, quadro_id)
  CHECK (arquivada_por IS NULL OR arquivada_em IS NOT NULL),
  CHECK (responsavel_id IS NULL OR papel = 'normal')
) STRICT;
CREATE INDEX coluna_quadro_ix ON coluna (quadro_id, pos) WHERE arquivada_em IS NULL;
-- uma coluna por pessoa entre as ativas do quadro
CREATE UNIQUE INDEX coluna_responsavel_uk ON coluna (quadro_id, responsavel_id)
  WHERE responsavel_id IS NOT NULL AND arquivada_em IS NULL;
CREATE UNIQUE INDEX coluna_trello_uk ON coluna (origem_trello_id) WHERE origem_trello_id IS NOT NULL;

CREATE TABLE etiqueta (                                  -- por quadro, como no Trello; várias por card
  id               TEXT PRIMARY KEY,
  quadro_id        TEXT NOT NULL REFERENCES quadro(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL DEFAULT '' CHECK (length(nome) <= 40 AND nome = trim(nome)),   -- '' = só a cor
  cor              TEXT NOT NULL CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  pos              REAL NOT NULL,
  origem_trello_id TEXT,
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (id, quadro_id)                                 -- alvo da FK composta de demanda_etiqueta
) STRICT;
CREATE INDEX etiqueta_quadro_ix ON etiqueta (quadro_id, pos);
CREATE UNIQUE INDEX etiqueta_nome_uk ON etiqueta (quadro_id, lower(nome)) WHERE nome <> '';

CREATE TABLE automacao_quadro (                          -- 4 gatilhos simples, cada um opcional (sem construtor de regras)
  quadro_id         TEXT NOT NULL REFERENCES quadro(id) ON DELETE CASCADE,
  gatilho           TEXT NOT NULL CHECK (gatilho IN ('enviado_ao_cliente','ajuste_pedido','aprovado','concluida')),
  destino_quadro_id TEXT NOT NULL,                       -- pode ser outro quadro ("aprovado → Social/Agendar")
  destino_coluna_id TEXT NOT NULL,
  membros           TEXT NOT NULL DEFAULT 'manter'       -- ao mudar de quadro: manter os membros ou trocar pelo
                    CHECK (membros IN ('manter','responsavel_destino')),   -- responsável do cliente na equipe destino
  ativa             INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0,1)),
  atualizado_por    TEXT REFERENCES usuario(id),
  atualizado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (quadro_id, gatilho),
  FOREIGN KEY (destino_coluna_id, destino_quadro_id) REFERENCES coluna (id, quadro_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX automacao_destino_ix ON automacao_quadro (destino_coluna_id);

-- ═════════════════════════════ clientes ═════════════════════════════

CREATE TABLE cliente (
  id               TEXT PRIMARY KEY,
  nome             TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 160),
  sigla            TEXT NOT NULL UNIQUE
                   CHECK (length(sigla) BETWEEN 1 AND 12 AND sigla = upper(sigla) AND sigla NOT GLOB '*[^A-Z0-9]*'),
  pai_id           TEXT REFERENCES cliente(id),            -- grupo: Bosque → Bosque Vida, Bosque PET
  status           TEXT NOT NULL DEFAULT 'recorrente' CHECK (status IN ('recorrente','pontual','negociacao','ex')),
  nivel            INTEGER CHECK (nivel IS NULL OR nivel BETWEEN 1 AND 3),
  cor              TEXT NOT NULL DEFAULT 'azul'
                   CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  logo_arquivo_id  TEXT REFERENCES arquivo(id),           -- logo só por upload (a CSP não aceita imagem de host qualquer)
  atendimento_id   TEXT REFERENCES usuario(id),            -- AM dono da conta (padrão do atendimento das demandas)
  rodadas_inclusas INTEGER NOT NULL DEFAULT 2 CHECK (rodadas_inclusas BETWEEN 0 AND 20),
  pasta_saida      TEXT,                                   -- M:\...\CLIENTES\<X>\...\SAÍDA: texto com Copiar, nunca href
  observacoes      TEXT,
  origem_trello_id TEXT,
  criado_por       TEXT REFERENCES usuario(id),
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (pai_id IS NULL OR pai_id <> id)
) STRICT;
CREATE INDEX cliente_am_ix ON cliente (atendimento_id);
CREATE UNIQUE INDEX cliente_trello_uk ON cliente (origem_trello_id) WHERE origem_trello_id IS NOT NULL;

CREATE TABLE cliente_alias (                              -- apelidos e grafias; a sigla também entra aqui
  alias_norm TEXT PRIMARY KEY CHECK (length(alias_norm) BETWEEN 1 AND 80 AND alias_norm = lower(trim(alias_norm))),
  cliente_id TEXT NOT NULL REFERENCES cliente(id),
  origem     TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','sigla','importacao')),
  criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX cliente_alias_cliente_ix ON cliente_alias (cliente_id);

CREATE TABLE cliente_responsavel (                        -- "na Criação, o HE é do Rafa": membro sugerido ao criar a
  cliente_id TEXT NOT NULL REFERENCES cliente(id),        -- demanda num quadro da equipe ou ao mover para ele
  equipe_id  TEXT NOT NULL REFERENCES equipe(id),
  usuario_id TEXT NOT NULL REFERENCES usuario(id),
  PRIMARY KEY (cliente_id, equipe_id)
) STRICT;
CREATE INDEX cliente_responsavel_usuario_ix ON cliente_responsavel (usuario_id);

CREATE TABLE cliente_contato (                            -- quem aprova do lado do cliente
  id            TEXT PRIMARY KEY,
  cliente_id    TEXT NOT NULL REFERENCES cliente(id),
  nome          TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 120),
  cargo         TEXT,
  whatsapp      TEXT,
  email         TEXT,
  aprova        INTEGER NOT NULL DEFAULT 1 CHECK (aprova IN (0,1)),
  padrao        INTEGER NOT NULL DEFAULT 0 CHECK (padrao IN (0,1)),   -- pré-selecionado no envio e no retorno
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (padrao = 0 OR (ativo = 1 AND aprova = 1)),
  UNIQUE (id, cliente_id)                                  -- alvo das FKs (contato_id, cliente_id)
) STRICT;
CREATE INDEX cliente_contato_cliente_ix ON cliente_contato (cliente_id);
CREATE UNIQUE INDEX cliente_contato_padrao_uk ON cliente_contato (cliente_id) WHERE padrao = 1;

CREATE TABLE cliente_link (                               -- Drive, marca, Acessos (cofre; nunca a senha), site, redes
  id         TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES cliente(id),
  tipo       TEXT NOT NULL CHECK (tipo IN ('drive','marca','acessos','site','redes','outro')),
  rotulo     TEXT NOT NULL CHECK (length(trim(rotulo)) BETWEEN 1 AND 80),
  url        TEXT NOT NULL CHECK (url LIKE 'https://%'),
  pos        REAL NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX cliente_link_cliente_ix ON cliente_link (cliente_id, pos);

-- ═════════════════════════════ modelos de demanda e feriados ═════════════════════════════

CREATE TABLE modelo_demanda (                             -- no lugar dos tipos de peça: briefing, checklist e etiquetas
  id               TEXT PRIMARY KEY,                      -- padrão, prazo padrão em dias úteis
  quadro_id        TEXT REFERENCES quadro(id) ON DELETE CASCADE,   -- nulo = global (aparece em todos os quadros)
  nome             TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 60),
  descricao        TEXT NOT NULL DEFAULT '' CHECK (length(descricao) <= 200),   -- linha de ajuda na grade da Nova demanda
  icone            TEXT CHECK (icone IS NULL OR (length(icone) BETWEEN 1 AND 40 AND icone NOT GLOB '*[^a-z0-9-]*')),  -- lucide
  briefing_md      TEXT NOT NULL DEFAULT '' CHECK (length(briefing_md) <= 20000),   -- vira a descrição da demanda
  prazo_dias_uteis INTEGER CHECK (prazo_dias_uteis IS NULL OR prazo_dias_uteis BETWEEN 0 AND 120),
  prioridade       TEXT CHECK (prioridade IS NULL OR prioridade IN ('baixa','media','alta','urgente')),
  estimativa_min   INTEGER CHECK (estimativa_min IS NULL OR estimativa_min BETWEEN 1 AND 100000),
  rodadas_inclusas INTEGER CHECK (rodadas_inclusas IS NULL OR rodadas_inclusas BETWEEN 0 AND 20),  -- nulo = do cliente
  ativo            INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),   -- "excluir" = desativar
  pos              REAL NOT NULL,
  criado_por       TEXT REFERENCES usuario(id),
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE UNIQUE INDEX modelo_demanda_nome_uk ON modelo_demanda (coalesce(quadro_id, ''), lower(nome)) WHERE ativo = 1;

CREATE TABLE modelo_demanda_item (                        -- checklist padrão (agrupado pelo nome do checklist)
  id        TEXT PRIMARY KEY,
  modelo_id TEXT NOT NULL REFERENCES modelo_demanda(id) ON DELETE CASCADE,
  checklist TEXT NOT NULL DEFAULT 'Checklist' CHECK (length(trim(checklist)) BETWEEN 1 AND 200),
  texto     TEXT NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 2000),
  pos       REAL NOT NULL
) STRICT;
CREATE INDEX modelo_demanda_item_ix ON modelo_demanda_item (modelo_id, pos);

CREATE TABLE modelo_demanda_etiqueta (                    -- etiquetas padrão por NOME: ao aplicar, casa com a etiqueta do
  modelo_id TEXT NOT NULL REFERENCES modelo_demanda(id) ON DELETE CASCADE,   -- quadro de mesmo nome ou cria com esta cor
  nome      TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 40 AND nome = trim(nome)),
  cor       TEXT NOT NULL CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  PRIMARY KEY (modelo_id, nome)
) STRICT;

CREATE TABLE feriado (                                    -- todo dia desta tabela é dia NÃO útil
  data TEXT PRIMARY KEY CHECK (data GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nacional' CHECK (tipo IN ('nacional','estadual','municipal','facultativo'))
) STRICT;

-- ═════════════════════════════ arquivos em disco ═════════════════════════════

CREATE TABLE arquivo (                                    -- DATA_DIR/uploads/<2 primeiros do id>/<id>
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),   -- nome original sanitizado (só no download)
  mime        TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','image/gif','application/pdf','application/zip')),
  bytes       INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 10485760),
  sha256      TEXT NOT NULL,
  enviado_por TEXT NOT NULL REFERENCES usuario(id),
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  excluido_em TEXT,                                        -- o job apaga do disco 30 dias depois (ou 24 h se órfão)
  apagado_em  TEXT                                         -- quando o job removeu do disco
) STRICT;
CREATE INDEX arquivo_lixo_ix ON arquivo (excluido_em) WHERE excluido_em IS NOT NULL AND apagado_em IS NULL;

-- ═════════════════════════════ demanda (card) ═════════════════════════════

CREATE TABLE demanda (
  id                      TEXT PRIMARY KEY,
  numero                  INTEGER NOT NULL UNIQUE CHECK (numero > 0),  -- #4521 global: max+1 no BEGIN IMMEDIATE; nunca muda
  quadro_id               TEXT NOT NULL REFERENCES quadro(id),
  coluna_id               TEXT NOT NULL,                   -- FK composta abaixo: a coluna é deste quadro
  posicao                 REAL NOT NULL,                   -- ordem dentro da coluna; o servidor calcula entre vizinhos
  titulo                  TEXT NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 500),
  descricao_md            TEXT NOT NULL DEFAULT '' CHECK (length(descricao_md) <= 100000),
  descricao_atualizada_em TEXT,                            -- no SSE, avisa para recarregar o detalhe (o texto não viaja)
  cliente_id              TEXT REFERENCES cliente(id),     -- opcional, mas sugerido
  atendimento_id          TEXT REFERENCES usuario(id),     -- AM; padrão: cliente.atendimento_id
  modelo_id               TEXT REFERENCES modelo_demanda(id),   -- modelo usado na criação (nome na página pública)
  prioridade              TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  inicio                  TEXT CHECK (inicio IS NULL OR inicio GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  inicio_hora             TEXT CHECK (inicio_hora IS NULL OR inicio_hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  prazo                   TEXT CHECK (prazo IS NULL OR prazo GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  prazo_hora              TEXT CHECK (prazo_hora IS NULL OR prazo_hora GLOB '[0-2][0-9]:[0-5][0-9]'),   -- nulo = 18:00
  publicacao_data         TEXT CHECK (publicacao_data IS NULL OR publicacao_data GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  publicacao_hora         TEXT CHECK (publicacao_hora IS NULL OR publicacao_hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  estimativa_min          INTEGER CHECK (estimativa_min IS NULL OR estimativa_min BETWEEN 1 AND 100000),
  minutos_registrados     INTEGER NOT NULL DEFAULT 0,      -- gatilho: soma dos apontamentos fechados
  repetir                 TEXT NOT NULL DEFAULT 'nenhuma' CHECK (repetir IN ('nenhuma','diaria','semanal','mensal')),
  capa_cor                TEXT CHECK (capa_cor IS NULL OR capa_cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  capa_anexo_id           TEXT,                            -- imagem anexada desta demanda (FK composta + gatilho)
  concluida_em            TEXT,                            -- "concluída" (checkbox ou coluna de papel concluida)
  concluida_por           TEXT REFERENCES usuario(id),     -- nulo = sistema
  status_desde            TEXT NOT NULL,                   -- última mudança de coluna (ou de quadro): base do "parado há"
  envio_pendente_em       TEXT,                            -- envio ao cliente sem decisão: a bola está com o cliente
  retorno_em              TEXT,                            -- última decisão válida do cliente (anular limpa): numa coluna
                                                           -- aguardando_cliente, a bola volta à equipe (API.md §5.4)
  rodada_atual            INTEGER NOT NULL DEFAULT 1 CHECK (rodada_atual >= 1),
  rodadas_inclusas        INTEGER NOT NULL DEFAULT 2 CHECK (rodadas_inclusas BETWEEN 0 AND 20),
  aprovada_em             TEXT,
  aprovada_versao_id      TEXT,
  versao_atual_id         TEXT,                            -- gatilho: última versão entregue
  versao_enviada_id       TEXT,                            -- gatilho: última versão enviada ao cliente
  n_versoes               INTEGER NOT NULL DEFAULT 0,
  n_anexos                INTEGER NOT NULL DEFAULT 0,
  n_check_total           INTEGER NOT NULL DEFAULT 0,
  n_check_feitos          INTEGER NOT NULL DEFAULT 0,
  n_comentarios           INTEGER NOT NULL DEFAULT 0,
  origem                  TEXT NOT NULL DEFAULT 'manual'
                          CHECK (origem IN ('manual','rapida','whatsapp','copia','repeticao','importacao')),
  origem_demanda_id       TEXT REFERENCES demanda(id),     -- de quem foi copiada ou repetida
  origem_texto            TEXT CHECK (origem_texto IS NULL OR length(origem_texto) <= 50000),  -- colado do WhatsApp (texto puro)
  criado_por              TEXT NOT NULL REFERENCES usuario(id),
  atualizado_por          TEXT REFERENCES usuario(id),     -- quem fez a última UPDATE (o app sempre grava)
  arquivado_em            TEXT,
  arquivado_por           TEXT REFERENCES usuario(id),
  excluido_em             TEXT,                            -- "excluir" = anonimizar (admin; bloqueado com versão, envio ou
                                                           -- aprovação; lista do que se limpa em API.md §4.12)
  origem_trello_id        TEXT,
  origem_trello_url       TEXT,
  rev                     INTEGER NOT NULL DEFAULT 1,      -- If-Match; gatilho sobe com os campos do PATCH
  criado_em               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (coluna_id, quadro_id)   REFERENCES coluna (id, quadro_id),
  FOREIGN KEY (capa_anexo_id, id)      REFERENCES anexo (id, demanda_id),
  FOREIGN KEY (aprovada_versao_id, id) REFERENCES versao (id, demanda_id),
  FOREIGN KEY (versao_atual_id, id)    REFERENCES versao (id, demanda_id),
  FOREIGN KEY (versao_enviada_id, id)  REFERENCES versao (id, demanda_id),
  CHECK (inicio_hora IS NULL OR inicio IS NOT NULL),
  CHECK (prazo_hora IS NULL OR prazo IS NOT NULL),
  CHECK (publicacao_hora IS NULL OR publicacao_data IS NOT NULL),
  CHECK (inicio IS NULL OR prazo IS NULL OR inicio <= prazo),
  CHECK (repetir = 'nenhuma' OR prazo IS NOT NULL),       -- a próxima nasce com o prazo seguinte
  CHECK (capa_cor IS NULL OR capa_anexo_id IS NULL),       -- capa: cor OU imagem
  CHECK (concluida_por IS NULL OR concluida_em IS NOT NULL),
  CHECK ((aprovada_em IS NULL) = (aprovada_versao_id IS NULL)),
  CHECK (envio_pendente_em IS NULL OR versao_enviada_id IS NOT NULL),
  CHECK ((origem IN ('copia','repeticao')) = (origem_demanda_id IS NOT NULL)),
  CHECK (arquivado_por IS NULL OR arquivado_em IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX demanda_trello_uk     ON demanda (origem_trello_id) WHERE origem_trello_id IS NOT NULL;
CREATE UNIQUE INDEX demanda_repeticao_uk  ON demanda (origem_demanda_id) WHERE origem = 'repeticao';  -- 1 próxima por demanda
CREATE INDEX demanda_coluna_ix    ON demanda (coluna_id, posicao)  WHERE arquivado_em IS NULL;
CREATE INDEX demanda_quadro_ix    ON demanda (quadro_id)           WHERE arquivado_em IS NULL AND excluido_em IS NULL;
CREATE INDEX demanda_prazo_ix     ON demanda (prazo)               WHERE arquivado_em IS NULL AND excluido_em IS NULL;
CREATE INDEX demanda_inicio_ix    ON demanda (inicio)              -- Agenda por início e por publicação (CampoAgenda)
  WHERE inicio IS NOT NULL AND arquivado_em IS NULL AND excluido_em IS NULL;
CREATE INDEX demanda_publicacao_ix ON demanda (publicacao_data)
  WHERE publicacao_data IS NOT NULL AND arquivado_em IS NULL AND excluido_em IS NULL;
CREATE INDEX demanda_am_ix        ON demanda (atendimento_id)      WHERE arquivado_em IS NULL;
CREATE INDEX demanda_cli_ix       ON demanda (cliente_id, criado_em);
CREATE INDEX demanda_pendente_ix  ON demanda (envio_pendente_em)   WHERE envio_pendente_em IS NOT NULL AND arquivado_em IS NULL;
CREATE INDEX demanda_concluida_ix ON demanda (concluida_em)        WHERE concluida_em IS NOT NULL AND arquivado_em IS NULL;
-- Arquivo (API.md §4.19): arquivadas + concluídas que já saíram do quadro, pela data coalesce(arquivado_em, concluida_em).
-- A consulta repete o WHERE destes índices (o SQLite só usa índice parcial quando o termo aparece na consulta).
CREATE INDEX demanda_arquivo_ix     ON demanda (coalesce(arquivado_em, concluida_em))
  WHERE excluido_em IS NULL AND (arquivado_em IS NOT NULL OR concluida_em IS NOT NULL);
CREATE INDEX demanda_arquivo_cli_ix ON demanda (cliente_id, coalesce(arquivado_em, concluida_em))
  WHERE excluido_em IS NULL AND (arquivado_em IS NOT NULL OR concluida_em IS NOT NULL);

CREATE TABLE demanda_membro (                              -- "Pessoas" / responsáveis (vários)
  demanda_id     TEXT NOT NULL REFERENCES demanda(id),
  usuario_id     TEXT NOT NULL REFERENCES usuario(id),
  adicionado_por TEXT REFERENCES usuario(id),
  adicionado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (demanda_id, usuario_id)
) STRICT;
CREATE INDEX demanda_membro_usuario_ix ON demanda_membro (usuario_id);

CREATE TABLE demanda_etiqueta (                            -- quadro_id = o quadro DA ETIQUETA (FK composta). As atuais
  demanda_id  TEXT NOT NULL REFERENCES demanda(id),        -- da demanda são as do quadro dela; as de outros quadros
  etiqueta_id TEXT NOT NULL,                               -- ficam guardadas e voltam se ela voltar (API.md §5.6)
  quadro_id   TEXT NOT NULL,
  PRIMARY KEY (demanda_id, etiqueta_id),
  FOREIGN KEY (etiqueta_id, quadro_id) REFERENCES etiqueta (id, quadro_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX demanda_etiqueta_etiqueta_ix ON demanda_etiqueta (etiqueta_id);

CREATE TABLE demanda_movimento (                           -- histórico de colunas e quadros (gatilhos); tempo por coluna
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id TEXT NOT NULL REFERENCES demanda(id),
  quadro_id  TEXT NOT NULL,
  coluna_id  TEXT NOT NULL,
  papel      TEXT NOT NULL CHECK (papel IN ('normal','aguardando_cliente','concluida')),   -- papel da coluna na entrada
  entrou_em  TEXT NOT NULL,                                -- = demanda.status_desde gravado pelo app
  saiu_em    TEXT,
  por        TEXT REFERENCES usuario(id),                  -- quem moveu (demanda.atualizado_por; na criação, criado_por).
                                                           -- Nulo = cliente pelo link (automação da decisão) ou sistema
  FOREIGN KEY (coluna_id, quadro_id) REFERENCES coluna (id, quadro_id)
) STRICT;
CREATE INDEX demanda_movimento_ix ON demanda_movimento (demanda_id, id);
CREATE INDEX demanda_movimento_quadro_ix ON demanda_movimento (quadro_id);
CREATE UNIQUE INDEX demanda_movimento_aberto_uk ON demanda_movimento (demanda_id) WHERE saiu_em IS NULL;

CREATE TABLE demanda_mencao (                              -- @ na descrição (validada no servidor; só as novas notificam)
  demanda_id TEXT NOT NULL REFERENCES demanda(id),
  usuario_id TEXT NOT NULL REFERENCES usuario(id),
  PRIMARY KEY (demanda_id, usuario_id)
) STRICT;

CREATE VIRTUAL TABLE demanda_fts USING fts5 (
  titulo, descricao_md,
  content = 'demanda', content_rowid = 'numero',
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

-- ═════════════════════════════ rodadas, versões, envios, links públicos, aprovações ═════════════════════════════

CREATE TABLE rodada (
  id                TEXT PRIMARY KEY,
  demanda_id        TEXT NOT NULL REFERENCES demanda(id),
  numero            INTEGER NOT NULL CHECK (numero >= 1),
  origem            TEXT NOT NULL CHECK (origem IN ('inicial','cliente','interna')),
  motivo            TEXT CHECK (motivo IS NULL OR motivo IN
                    ('cliente_mudou','briefing_incompleto','erro_execucao','erro_atendimento','outro')),
  motivo_texto      TEXT,
  extra             INTEGER NOT NULL DEFAULT 0 CHECK (extra IN (0,1)),
  extra_marcada_por TEXT REFERENCES usuario(id),
  extra_marcada_em  TEXT,
  prazo             TEXT CHECK (prazo IS NULL OR prazo GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  prazo_hora        TEXT CHECK (prazo_hora IS NULL OR prazo_hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  prazo_original    TEXT,                                    -- gravado na abertura; mostra renegociação
  aberta_em         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  aberta_por        TEXT REFERENCES usuario(id),
  fechada_em        TEXT,                                    -- ao abrir a próxima, ou ao aprovar
  UNIQUE (demanda_id, numero),
  UNIQUE (id, demanda_id),
  CHECK ((origem = 'inicial') = (numero = 1)),
  CHECK (origem = 'inicial' OR (motivo IS NOT NULL AND prazo IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX rodada_aberta_uk ON rodada (demanda_id) WHERE fechada_em IS NULL;

CREATE TABLE versao (
  id                 TEXT PRIMARY KEY,
  demanda_id         TEXT NOT NULL REFERENCES demanda(id),
  numero             INTEGER NOT NULL CHECK (numero >= 1),   -- V1, V2...
  rodada_id          TEXT NOT NULL,
  nota               TEXT,
  criada_por         TEXT NOT NULL REFERENCES usuario(id),
  criada_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  enviada_cliente_em TEXT,                                    -- primeiro envio
  enviada_via        TEXT CHECK (enviada_via IS NULL OR enviada_via IN ('link','fora')),
  UNIQUE (demanda_id, numero),
  UNIQUE (id, demanda_id),
  FOREIGN KEY (rodada_id, demanda_id) REFERENCES rodada (id, demanda_id),
  CHECK ((enviada_cliente_em IS NULL) = (enviada_via IS NULL))
) STRICT;
CREATE INDEX versao_rodada_ix ON versao (rodada_id);

CREATE TABLE versao_item (                                 -- o que foi entregue: link, caminho de rede ou arquivo
  id               TEXT PRIMARY KEY,
  versao_id        TEXT NOT NULL,
  demanda_id       TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('link','caminho','arquivo')),
  nome             TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),
  url              TEXT CHECK (url IS NULL OR url LIKE 'https://%'),
  caminho          TEXT,                                     -- M:\Drives compartilhados\MELT\CLIENTES\...\SAÍDA
  arquivo_id       TEXT REFERENCES arquivo(id),
  provedor         TEXT CHECK (provedor IS NULL OR provedor IN
                   ('drive','docs','figma','canva','wetransfer','youtube','vimeo','dropbox','rede','arquivo','outro')),
  drive_status     TEXT CHECK (drive_status IS NULL OR drive_status IN ('publico','privado','pasta','erro')),
  drive_testado_em TEXT,
  previa_url       TEXT CHECK (previa_url IS NULL OR previa_url LIKE 'https://%'),
  pos              REAL NOT NULL,
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (versao_id, demanda_id) REFERENCES versao (id, demanda_id),
  CHECK ((tipo = 'link' AND url IS NOT NULL) OR (tipo = 'caminho' AND caminho IS NOT NULL)
      OR (tipo = 'arquivo' AND arquivo_id IS NOT NULL))
) STRICT;
CREATE INDEX versao_item_ix ON versao_item (versao_id, pos);
CREATE INDEX versao_item_arquivo_ix ON versao_item (arquivo_id) WHERE arquivo_id IS NOT NULL;

CREATE TABLE link_publico (                                -- /a/:token (cliente aprova sem login)
  id               TEXT PRIMARY KEY,
  token_hash       TEXT NOT NULL UNIQUE,                    -- sha256 hex de 32 bytes aleatórios (base64url na URL)
  token_cifrado    TEXT NOT NULL,                           -- AES-256-GCM (chave derivada de SEGREDO): reexibir o link ao AM
  cliente_id       TEXT NOT NULL REFERENCES cliente(id),
  contato_id       TEXT,                                    -- "Você é Fulana?": contato do mesmo cliente (FK composta abaixo)
  titulo           TEXT,
  expira_em        TEXT NOT NULL,                           -- 30 dias
  revogado_em      TEXT,
  revogado_por     TEXT REFERENCES usuario(id),
  criado_por       TEXT NOT NULL REFERENCES usuario(id),
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ultimo_acesso_em TEXT,                                    -- só por POST /visto (o GET não tem efeito)
  acessos          INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (contato_id, cliente_id) REFERENCES cliente_contato (id, cliente_id),
  CHECK ((revogado_em IS NULL) = (revogado_por IS NULL))
) STRICT;
CREATE INDEX link_publico_cliente_ix ON link_publico (cliente_id);

CREATE TABLE link_publico_item (                           -- 1 item no MVP; vários = lote (v1). Demanda do cliente do
  link_id    TEXT NOT NULL REFERENCES link_publico(id),    -- link (gatilho link_item_do_cliente)
  demanda_id TEXT NOT NULL REFERENCES demanda(id),
  pos        REAL NOT NULL,
  PRIMARY KEY (link_id, demanda_id)                        -- alvo das FKs (link_id, demanda_id) de envio e aprovacao
) STRICT;
CREATE INDEX link_publico_item_demanda_ix ON link_publico_item (demanda_id);

CREATE TABLE envio (                                       -- cada "Enviar ao cliente" (link ou por fora)
  id                 TEXT PRIMARY KEY,
  demanda_id         TEXT NOT NULL REFERENCES demanda(id),
  quadro_id          TEXT NOT NULL REFERENCES quadro(id),  -- onde a demanda estava ao enviar (antes da automação): as
                                                           -- automações de ajuste e aprovação são as dele (API §5.5)
  versao_id          TEXT NOT NULL,
  via                TEXT NOT NULL CHECK (via IN ('link','fora')),
  canal              TEXT CHECK (canal IS NULL OR canal IN ('whatsapp','email','reuniao','outro')),
  link_id            TEXT,                                 -- link que contém a demanda (FK composta abaixo)
  contato_id         TEXT REFERENCES cliente_contato(id),
  prazo_retorno      TEXT CHECK (prazo_retorno IS NULL OR prazo_retorno GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  prazo_retorno_hora TEXT CHECK (prazo_retorno_hora IS NULL OR prazo_retorno_hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  enviado_por        TEXT NOT NULL REFERENCES usuario(id),
  enviado_em         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (versao_id, demanda_id) REFERENCES versao (id, demanda_id),
  FOREIGN KEY (link_id, demanda_id)   REFERENCES link_publico_item (link_id, demanda_id),
  CHECK ((via = 'link') = (link_id IS NOT NULL)),
  CHECK (via = 'link' OR canal IS NOT NULL)
) STRICT;
CREATE INDEX envio_demanda_ix ON envio (demanda_id, enviado_em);

CREATE TABLE aprovacao (                                   -- decisão do cliente (link) ou retorno registrado (manual)
  id                 TEXT PRIMARY KEY,
  demanda_id         TEXT NOT NULL REFERENCES demanda(id),
  versao_id          TEXT NOT NULL,
  decisao            TEXT NOT NULL CHECK (decisao IN ('aprovado','ajuste')),
  via                TEXT NOT NULL CHECK (via IN ('link','manual')),
  canal              TEXT CHECK (canal IS NULL OR canal IN ('whatsapp','email','reuniao','outro')),  -- via manual
  link_id            TEXT,                                   -- link que contém a demanda (FK composta abaixo)
  contato_id         TEXT REFERENCES cliente_contato(id),
  nome_informado     TEXT CHECK (nome_informado IS NULL OR length(nome_informado) <= 120),          -- texto puro
  registrado_por     TEXT REFERENCES usuario(id),
  comentario         TEXT CHECK (comentario IS NULL OR length(comentario) <= 20000),                -- linhas do ajuste
  motivo             TEXT CHECK (motivo IS NULL OR motivo IN
                     ('cliente_mudou','briefing_incompleto','erro_execucao','erro_atendimento','outro')),
  rodada_aberta_id   TEXT,                                   -- rodada desta demanda (FK composta abaixo)
  evidencia_anexo_id TEXT,                                   -- print do WhatsApp, anexo desta demanda (opcional; não sai:
                                                             -- gatilho anexo_evidencia_fixa)
  quadro_antes_id    TEXT NOT NULL,                          -- onde a demanda estava antes da decisão (e da automação):
  coluna_antes_id    TEXT NOT NULL,                          -- anular a aprovação devolve para cá (API.md §4.15)
  idempotency_key    TEXT,                                   -- só via link; única por link (aprovacao_idem_uk)
  idempotency_hash   TEXT,                                   -- sha256 de demandaId|versaoId|decisao|linhas|contatoId|nomeInformado
  ip_hmac            TEXT,                                   -- HMAC com SEGREDO; apagado após 12 meses
  user_agent         TEXT,
  criado_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  anulada_em         TEXT,
  anulada_por        TEXT REFERENCES usuario(id),
  FOREIGN KEY (versao_id, demanda_id) REFERENCES versao (id, demanda_id),
  FOREIGN KEY (coluna_antes_id, quadro_antes_id) REFERENCES coluna (id, quadro_id),
  FOREIGN KEY (link_id, demanda_id)            REFERENCES link_publico_item (link_id, demanda_id),
  FOREIGN KEY (rodada_aberta_id, demanda_id)   REFERENCES rodada (id, demanda_id),
  FOREIGN KEY (evidencia_anexo_id, demanda_id) REFERENCES anexo (id, demanda_id),
  CHECK (decisao = 'aprovado' OR comentario IS NOT NULL),
  CHECK (via = 'link' OR registrado_por IS NOT NULL),
  CHECK (via = 'manual' OR link_id IS NOT NULL),
  CHECK (via = 'manual' OR contato_id IS NOT NULL OR nome_informado IS NOT NULL),   -- pelo link, sempre se identifica
  CHECK ((idempotency_key IS NULL) = (idempotency_hash IS NULL)),
  CHECK ((anulada_em IS NULL) = (anulada_por IS NULL))
) STRICT;
CREATE UNIQUE INDEX aprovacao_uma_por_versao ON aprovacao (versao_id) WHERE anulada_em IS NULL;
CREATE UNIQUE INDEX aprovacao_idem_uk ON aprovacao (link_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX aprovacao_demanda_ix ON aprovacao (demanda_id, criado_em);

-- ═════════════════════════════ checklists, comentários, anexos ═════════════════════════════

CREATE TABLE checklist (
  id               TEXT PRIMARY KEY,
  demanda_id       TEXT NOT NULL REFERENCES demanda(id),
  titulo           TEXT NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 200),
  rodada_id        TEXT,                                     -- não nulo = "Ajustes R{N}"
  pos              REAL NOT NULL,
  criado_por       TEXT REFERENCES usuario(id),
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  origem_trello_id TEXT,
  UNIQUE (id, demanda_id),
  FOREIGN KEY (rodada_id, demanda_id) REFERENCES rodada (id, demanda_id)
) STRICT;
CREATE INDEX checklist_demanda_ix ON checklist (demanda_id, pos);

CREATE TABLE checklist_item (
  id               TEXT PRIMARY KEY,
  checklist_id     TEXT NOT NULL,
  demanda_id       TEXT NOT NULL,                           -- copiado do checklist (contadores sem join)
  texto            TEXT NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 2000),
  feito_em         TEXT,
  feito_por        TEXT REFERENCES usuario(id),
  pos              REAL NOT NULL,
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  origem_trello_id TEXT,
  FOREIGN KEY (checklist_id, demanda_id) REFERENCES checklist (id, demanda_id) ON DELETE CASCADE,
  CHECK ((feito_em IS NULL) = (feito_por IS NULL))
) STRICT;
CREATE INDEX checklist_item_ix ON checklist_item (checklist_id, pos);
CREATE INDEX checklist_item_demanda_ix ON checklist_item (demanda_id);

CREATE TABLE comentario (
  id               TEXT PRIMARY KEY,
  demanda_id       TEXT NOT NULL REFERENCES demanda(id),
  autor_id         TEXT REFERENCES usuario(id),              -- nulo = cliente pelo link
  autor_externo    TEXT,                                     -- nome informado pelo cliente (texto puro)
  link_id          TEXT REFERENCES link_publico(id),
  versao_id        TEXT,
  corpo_md         TEXT NOT NULL CHECK (length(corpo_md) <= 20000),   -- vazio só quando excluído (CHECK abaixo)
  visivel_cliente  INTEGER NOT NULL DEFAULT 0 CHECK (visivel_cliente IN (0,1)),   -- só atendimento/admin ligam
  editado_em       TEXT,
  excluido_em      TEXT,
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  origem_trello_id TEXT,
  UNIQUE (id, demanda_id),                                 -- alvo da FK (comentario_id, demanda_id) de anexo
  FOREIGN KEY (versao_id, demanda_id) REFERENCES versao (id, demanda_id),
  CHECK (autor_id IS NOT NULL OR autor_externo IS NOT NULL),
  CHECK (excluido_em IS NOT NULL OR length(corpo_md) >= 1)
) STRICT;
CREATE INDEX comentario_demanda_ix ON comentario (demanda_id, criado_em);
CREATE UNIQUE INDEX comentario_trello_uk ON comentario (origem_trello_id) WHERE origem_trello_id IS NOT NULL;

CREATE TABLE comentario_mencao (
  comentario_id TEXT NOT NULL REFERENCES comentario(id),
  usuario_id    TEXT NOT NULL REFERENCES usuario(id),
  PRIMARY KEY (comentario_id, usuario_id)
) STRICT;
CREATE INDEX comentario_mencao_usuario_ix ON comentario_mencao (usuario_id);

CREATE TABLE anexo (                                       -- links e arquivos de referência (fora das versões) e evidências
  id               TEXT PRIMARY KEY,
  demanda_id       TEXT NOT NULL REFERENCES demanda(id),
  comentario_id    TEXT,                                   -- comentário desta demanda (FK composta abaixo)
  finalidade       TEXT NOT NULL DEFAULT 'referencia' CHECK (finalidade IN ('referencia','evidencia')),
  tipo             TEXT NOT NULL CHECK (tipo IN ('link','caminho','arquivo')),
  nome             TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),
  url              TEXT CHECK (url IS NULL OR url LIKE 'https://%'),
  caminho          TEXT,
  arquivo_id       TEXT REFERENCES arquivo(id),
  provedor         TEXT CHECK (provedor IS NULL OR provedor IN
                   ('drive','docs','figma','canva','wetransfer','youtube','vimeo','dropbox','rede','arquivo','outro')),
  drive_status     TEXT CHECK (drive_status IS NULL OR drive_status IN ('publico','privado','pasta','erro')),
  drive_testado_em TEXT,
  pos              REAL NOT NULL,
  enviado_por      TEXT REFERENCES usuario(id),
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  excluido_em      TEXT,
  origem_trello_id TEXT,
  UNIQUE (id, demanda_id),                                 -- alvo das FKs da capa e da evidência da aprovação
  FOREIGN KEY (comentario_id, demanda_id) REFERENCES comentario (id, demanda_id),
  CHECK (excluido_em IS NOT NULL                         -- excluir a demanda limpa url/caminho/arquivo do anexo
      OR (tipo = 'link' AND url IS NOT NULL) OR (tipo = 'caminho' AND caminho IS NOT NULL)
      OR (tipo = 'arquivo' AND arquivo_id IS NOT NULL))
) STRICT;
CREATE INDEX anexo_demanda_ix ON anexo (demanda_id, pos);
CREATE INDEX anexo_arquivo_ix ON anexo (arquivo_id) WHERE arquivo_id IS NOT NULL;
CREATE INDEX anexo_comentario_ix ON anexo (comentario_id) WHERE comentario_id IS NOT NULL;
CREATE UNIQUE INDEX anexo_trello_uk ON anexo (origem_trello_id) WHERE origem_trello_id IS NOT NULL;

-- ═════════════════════════════ horas: lançar tempo e cronômetro ═════════════════════════════

CREATE TABLE apontamento (                                 -- "Lançar tempo" (manual) e cronômetro (iniciado_em aberto),
  id          TEXT PRIMARY KEY,                            -- sempre numa demanda (horas sem demanda: v1)
  usuario_id  TEXT NOT NULL REFERENCES usuario(id),
  demanda_id  TEXT NOT NULL REFERENCES demanda(id),
  cliente_id  TEXT REFERENCES cliente(id),               -- copiado da demanda; o gatilho demanda_cliente_horas acompanha
  data        TEXT NOT NULL CHECK (data GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),   -- dia local do início
  minutos     INTEGER CHECK (minutos IS NULL OR minutos BETWEEN 1 AND 1440),               -- nulo = cronômetro rodando
  iniciado_em TEXT,
  parado_em   TEXT,
  origem      TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','cronometro','importado')),
  nota        TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  excluido_em TEXT,
  CHECK (origem <> 'cronometro' OR iniciado_em IS NOT NULL),
  CHECK ((minutos IS NULL) = (origem = 'cronometro' AND parado_em IS NULL)),   -- rodando ⇔ sem minutos
  -- >=: com o relógio dos testes parado, ligar e parar (ou trocar de cronômetro) no mesmo instante vale (minutos ≥ 1)
  CHECK (parado_em IS NULL OR (iniciado_em IS NOT NULL AND parado_em >= iniciado_em))
) STRICT;
-- no máximo UM cronômetro ativo por pessoa (iniciar outro para o anterior no serviço, na mesma transação)
CREATE UNIQUE INDEX apontamento_um_cronometro_uk ON apontamento (usuario_id)
  WHERE origem = 'cronometro' AND parado_em IS NULL AND excluido_em IS NULL;
CREATE INDEX apontamento_demanda_ix ON apontamento (demanda_id) WHERE excluido_em IS NULL;
CREATE INDEX apontamento_cliente_ix ON apontamento (cliente_id, data);
CREATE INDEX apontamento_usuario_ix ON apontamento (usuario_id, data);

-- ═════════════════════════════ histórico e notificações ═════════════════════════════

CREATE TABLE atividade (                                   -- histórico tipado (shared/tipos/demandas.ts: TIPOS_ATIVIDADE)
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id TEXT REFERENCES demanda(id),
  cliente_id TEXT REFERENCES cliente(id),
  ator_id    TEXT REFERENCES usuario(id),
  ator_tipo  TEXT NOT NULL CHECK (ator_tipo IN ('usuario','cliente','sistema','importacao')),
  tipo       TEXT NOT NULL CHECK (tipo GLOB '[a-z]*.[a-z]*'),
  dados      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(dados) AND json_type(dados) = 'object'),
  antes      TEXT CHECK (antes IS NULL OR json_valid(antes)),   -- valores anteriores (como o `old` do Trello)
  trace_id   TEXT,
  criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX atividade_demanda_ix ON atividade (demanda_id, id DESC);
CREATE INDEX atividade_cliente_ix ON atividade (cliente_id, id DESC) WHERE cliente_id IS NOT NULL;
CREATE INDEX atividade_tipo_ix    ON atividade (tipo, criado_em);

CREATE TABLE notificacao (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   TEXT NOT NULL REFERENCES usuario(id),
  tipo         TEXT NOT NULL CHECK (tipo IN ('membro','mencao','comentario','versao_entregue','aprovada',
                                             'ajuste_pedido','prazo','atrasada','chegou')),
  demanda_id   TEXT REFERENCES demanda(id),
  atividade_id INTEGER REFERENCES atividade(id),
  ator_id      TEXT REFERENCES usuario(id),
  resumo       TEXT NOT NULL CHECK (length(resumo) BETWEEN 1 AND 300),
  lida_em      TEXT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX notificacao_naolida_ix ON notificacao (usuario_id, id DESC) WHERE lida_em IS NULL;
CREATE INDEX notificacao_usuario_ix ON notificacao (usuario_id, id DESC);
CREATE INDEX notificacao_demanda_ix ON notificacao (demanda_id);
-- job de prazo: consulta este índice para não repetir 'prazo' para a mesma pessoa e demanda no mesmo dia
CREATE INDEX notificacao_prazo_ix ON notificacao (usuario_id, demanda_id, criado_em) WHERE tipo = 'prazo';
-- e este para mandar 'atrasada' uma vez por pessoa, demanda e prazo (já avisou depois do prazo atual = não repete)
CREATE INDEX notificacao_atrasada_ix ON notificacao (usuario_id, demanda_id, criado_em) WHERE tipo = 'atrasada';

-- ═════════════════════════════ tempo real e tarefas ═════════════════════════════

CREATE TABLE evento (                                      -- fonte do SSE: gravado na MESMA transação da mutação
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,            -- nunca reaproveitado (AUTOINCREMENT): id do SSE
  entidade    TEXT NOT NULL,                                -- chave de MapaEntidades (shared/tipos/tempo-real.ts)
  entidade_id TEXT NOT NULL,
  demanda_id  TEXT,                                         -- sem FK: sobrevive e é podado sozinho
  op          TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  patch       TEXT CHECK (patch IS NULL OR json_valid(patch)),     -- camelCase; objeto inteiro quando campos é nulo
  campos      TEXT CHECK (campos IS NULL OR (json_valid(campos) AND json_type(campos) = 'array')),
  publico     TEXT NOT NULL DEFAULT 'interno'            -- gestao = atendimento + admin (link_publico)
              CHECK (publico IN ('interno','gestao','usuario','usuario_admin','admin')),
  usuario_id  TEXT,
  trace_id    TEXT,
  ator_id     TEXT,
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (publico IN ('interno','gestao','admin') OR usuario_id IS NOT NULL),
  CHECK (op = 'delete' OR patch IS NOT NULL)
) STRICT;
CREATE INDEX evento_tempo_ix ON evento (criado_em);        -- poda diária: guarda 7 dias e nunca apaga o último evento
-- seq atual = SELECT seq FROM sqlite_sequence WHERE name = 'evento' (sobrevive à poda; regras de retomada em API.md §3)

CREATE TABLE tarefa_execucao (                             -- jobs diários (backup, poda, lixo, prazo): última execução
  nome      TEXT PRIMARY KEY,
  ultima_em TEXT NOT NULL,
  ok        INTEGER NOT NULL CHECK (ok IN (0,1)),
  detalhe   TEXT
) STRICT;

-- ═════════════════════════════ gatilhos: nada se apaga ═════════════════════════════

CREATE TRIGGER usuario_sem_delete BEFORE DELETE ON usuario
BEGIN SELECT RAISE(ABORT, 'usuario_nao_se_apaga: desative'); END;
CREATE TRIGGER cliente_sem_delete BEFORE DELETE ON cliente
BEGIN SELECT RAISE(ABORT, 'cliente_nao_se_apaga: use status ex'); END;
CREATE TRIGGER demanda_sem_delete BEFORE DELETE ON demanda
BEGIN SELECT RAISE(ABORT, 'demanda_nao_se_apaga: arquive ou anonimize'); END;
-- quadro só se apaga se nunca teve demanda (nem arquivada, nem de passagem): senão, arquivar
CREATE TRIGGER quadro_sem_historico BEFORE DELETE ON quadro
WHEN EXISTS (SELECT 1 FROM demanda WHERE quadro_id = OLD.id)
  OR EXISTS (SELECT 1 FROM demanda_movimento WHERE quadro_id = OLD.id)
  OR EXISTS (SELECT 1 FROM aprovacao WHERE quadro_antes_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'quadro_com_historico: arquive o quadro'); END;

-- ═════════════════════════════ gatilhos: atualizado_em ═════════════════════════════

CREATE TRIGGER usuario_atualizado_em AFTER UPDATE ON usuario WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE usuario SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER equipe_atualizado_em AFTER UPDATE ON equipe WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE equipe SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER quadro_atualizado_em AFTER UPDATE ON quadro WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE quadro SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER coluna_atualizado_em AFTER UPDATE ON coluna WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE coluna SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER cliente_atualizado_em AFTER UPDATE ON cliente WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE cliente SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER cliente_contato_atualizado_em AFTER UPDATE ON cliente_contato WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE cliente_contato SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER modelo_demanda_atualizado_em AFTER UPDATE ON modelo_demanda WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE modelo_demanda SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER apontamento_atualizado_em AFTER UPDATE ON apontamento WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE apontamento SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER configuracao_atualizado_em AFTER UPDATE ON configuracao WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE configuracao SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chave = NEW.chave; END;
CREATE TRIGGER demanda_atualizado_em AFTER UPDATE ON demanda WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE demanda SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

-- ═════════════════════════════ gatilhos: quadro, coluna e etiqueta ═════════════════════════════

CREATE TRIGGER coluna_quadro_fixo BEFORE UPDATE OF quadro_id ON coluna WHEN NEW.quadro_id IS NOT OLD.quadro_id
BEGIN SELECT RAISE(ABORT, 'coluna_quadro_fixo'); END;
CREATE TRIGGER etiqueta_quadro_fixo BEFORE UPDATE OF quadro_id ON etiqueta WHEN NEW.quadro_id IS NOT OLD.quadro_id
BEGIN SELECT RAISE(ABORT, 'etiqueta_quadro_fixo'); END;

-- coluna só se arquiva vazia (as arquivadas podem continuar apontando para ela; restaurar escolhe outra coluna)
CREATE TRIGGER coluna_arquivar_vazia BEFORE UPDATE OF arquivada_em ON coluna
WHEN NEW.arquivada_em IS NOT NULL AND OLD.arquivada_em IS NULL
  AND EXISTS (SELECT 1 FROM demanda WHERE coluna_id = NEW.id AND arquivado_em IS NULL)
BEGIN SELECT RAISE(ABORT, 'coluna_com_demandas: mova ou arquive os cards antes'); END;

-- coluna que vira 'concluida' não pode ter demanda ativa sem concluida_em (o serviço conclui antes)
CREATE TRIGGER coluna_papel_concluida BEFORE UPDATE OF papel ON coluna
WHEN NEW.papel = 'concluida' AND OLD.papel IS NOT 'concluida'
  AND EXISTS (SELECT 1 FROM demanda WHERE coluna_id = NEW.id AND arquivado_em IS NULL AND concluida_em IS NULL)
BEGIN SELECT RAISE(ABORT, 'concluida_sem_data: conclua as demandas da coluna antes'); END;

-- ═════════════════════════════ gatilhos: demanda ═════════════════════════════

CREATE TRIGGER demanda_numero_fixo BEFORE UPDATE OF numero ON demanda WHEN NEW.numero IS NOT OLD.numero
BEGIN SELECT RAISE(ABORT, 'demanda_numero_fixo'); END;

-- demanda ativa não entra em coluna nem quadro arquivados (insert, mover, restaurar)
CREATE TRIGGER demanda_destino_ativo_ai BEFORE INSERT ON demanda
WHEN NEW.arquivado_em IS NULL AND (
     (SELECT arquivada_em FROM coluna WHERE id = NEW.coluna_id) IS NOT NULL
  OR (SELECT arquivado_em FROM quadro WHERE id = NEW.quadro_id) IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'destino_arquivado: coluna ou quadro arquivado'); END;
CREATE TRIGGER demanda_destino_ativo_au BEFORE UPDATE OF coluna_id, quadro_id, arquivado_em ON demanda
WHEN NEW.arquivado_em IS NULL
  AND (NEW.coluna_id IS NOT OLD.coluna_id OR NEW.quadro_id IS NOT OLD.quadro_id OR OLD.arquivado_em IS NOT NULL)
  AND ((SELECT arquivada_em FROM coluna WHERE id = NEW.coluna_id) IS NOT NULL
    OR (SELECT arquivado_em FROM quadro WHERE id = NEW.quadro_id) IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'destino_arquivado: coluna ou quadro arquivado'); END;

-- mudar de coluna (ou de quadro) grava status_desde maior que o anterior: é o instante do histórico e a base do
-- "parado há". O serviço grava max(agora(), status_desde + 1 ms), então o relógio parado dos testes não quebra.
CREATE TRIGGER demanda_status_desde BEFORE UPDATE OF coluna_id ON demanda
WHEN NEW.coluna_id IS NOT OLD.coluna_id AND NOT (NEW.status_desde > OLD.status_desde)
BEGIN SELECT RAISE(ABORT, 'demanda_status_desde: grave status_desde maior que o anterior ao mudar de coluna'); END;

-- depois do primeiro envio, o cliente não muda: o link e a trilha são do cliente que recebeu (copie a demanda)
CREATE TRIGGER demanda_cliente_fixo BEFORE UPDATE OF cliente_id ON demanda
WHEN NEW.cliente_id IS NOT OLD.cliente_id AND OLD.versao_enviada_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'cliente_fixo_apos_envio'); END;
-- as horas acompanham o cliente da demanda (horas por cliente)
CREATE TRIGGER demanda_cliente_horas AFTER UPDATE OF cliente_id ON demanda
WHEN NEW.cliente_id IS NOT OLD.cliente_id
BEGIN UPDATE apontamento SET cliente_id = NEW.cliente_id WHERE demanda_id = NEW.id; END;

-- demanda ativa numa coluna de papel 'concluida' está concluída (o serviço marca ao soltar e desmarca ao reabrir)
CREATE TRIGGER demanda_concluida_coluna_ai BEFORE INSERT ON demanda
WHEN NEW.concluida_em IS NULL AND NEW.arquivado_em IS NULL
  AND (SELECT papel FROM coluna WHERE id = NEW.coluna_id) = 'concluida'
BEGIN SELECT RAISE(ABORT, 'concluida_sem_data: demanda em coluna concluida precisa de concluida_em'); END;
CREATE TRIGGER demanda_concluida_coluna_au BEFORE UPDATE OF coluna_id, concluida_em, arquivado_em ON demanda
WHEN NEW.concluida_em IS NULL AND NEW.arquivado_em IS NULL
  AND (SELECT papel FROM coluna WHERE id = NEW.coluna_id) = 'concluida'
BEGIN SELECT RAISE(ABORT, 'concluida_sem_data: demanda em coluna concluida precisa de concluida_em'); END;

-- capa por imagem: anexo ativo de arquivo de imagem (a FK composta garante que é desta demanda)
CREATE TRIGGER demanda_capa_imagem_ai BEFORE INSERT ON demanda WHEN NEW.capa_anexo_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'capa_nao_e_imagem'); END;      -- na criação ainda não há anexo: capa só por cor
CREATE TRIGGER demanda_capa_imagem_au BEFORE UPDATE OF capa_anexo_id ON demanda
WHEN NEW.capa_anexo_id IS NOT NULL AND coalesce((
  SELECT ar.mime FROM anexo a JOIN arquivo ar ON ar.id = a.arquivo_id
   WHERE a.id = NEW.capa_anexo_id AND a.excluido_em IS NULL), '') NOT LIKE 'image/%'
BEGIN SELECT RAISE(ABORT, 'capa_nao_e_imagem'); END;

-- rev sobe só com os campos que o PATCH edita (contadores, posição, coluna, concluir e arquivar não contam).
-- Se o serviço já subiu o rev na mesma UPDATE, o gatilho não sobe de novo.
CREATE TRIGGER demanda_rev AFTER UPDATE OF
  titulo, descricao_md, cliente_id, atendimento_id, prioridade, inicio, inicio_hora, prazo, prazo_hora,
  publicacao_data, publicacao_hora, estimativa_min, repetir, capa_cor, capa_anexo_id, rodadas_inclusas
ON demanda
WHEN NEW.rev = OLD.rev AND (
     NEW.titulo IS NOT OLD.titulo OR NEW.descricao_md IS NOT OLD.descricao_md OR NEW.cliente_id IS NOT OLD.cliente_id
  OR NEW.atendimento_id IS NOT OLD.atendimento_id OR NEW.prioridade IS NOT OLD.prioridade
  OR NEW.inicio IS NOT OLD.inicio OR NEW.inicio_hora IS NOT OLD.inicio_hora
  OR NEW.prazo IS NOT OLD.prazo OR NEW.prazo_hora IS NOT OLD.prazo_hora
  OR NEW.publicacao_data IS NOT OLD.publicacao_data OR NEW.publicacao_hora IS NOT OLD.publicacao_hora
  OR NEW.estimativa_min IS NOT OLD.estimativa_min OR NEW.repetir IS NOT OLD.repetir
  OR NEW.capa_cor IS NOT OLD.capa_cor OR NEW.capa_anexo_id IS NOT OLD.capa_anexo_id
  OR NEW.rodadas_inclusas IS NOT OLD.rodadas_inclusas)
BEGIN UPDATE demanda SET rev = OLD.rev + 1 WHERE id = NEW.id; END;

-- histórico de movimentação entre colunas e quadros (instante = status_desde gravado pelo app)
CREATE TRIGGER demanda_mov_ai AFTER INSERT ON demanda
BEGIN
  INSERT INTO demanda_movimento (demanda_id, quadro_id, coluna_id, papel, entrou_em, por)
  VALUES (NEW.id, NEW.quadro_id, NEW.coluna_id, (SELECT papel FROM coluna WHERE id = NEW.coluna_id),
          NEW.status_desde, NEW.criado_por);
END;
CREATE TRIGGER demanda_mov_au AFTER UPDATE OF coluna_id ON demanda
WHEN NEW.coluna_id IS NOT OLD.coluna_id
BEGIN
  UPDATE demanda_movimento SET saiu_em = NEW.status_desde WHERE demanda_id = NEW.id AND saiu_em IS NULL;
  INSERT INTO demanda_movimento (demanda_id, quadro_id, coluna_id, papel, entrou_em, por)
  VALUES (NEW.id, NEW.quadro_id, NEW.coluna_id, (SELECT papel FROM coluna WHERE id = NEW.coluna_id),
          NEW.status_desde, NEW.atualizado_por);
END;

-- busca (FTS5, conteúdo externo, rowid = numero)
CREATE TRIGGER demanda_fts_ai AFTER INSERT ON demanda
BEGIN INSERT INTO demanda_fts (rowid, titulo, descricao_md) VALUES (NEW.numero, NEW.titulo, NEW.descricao_md); END;
CREATE TRIGGER demanda_fts_au AFTER UPDATE OF titulo, descricao_md ON demanda
WHEN NEW.titulo IS NOT OLD.titulo OR NEW.descricao_md IS NOT OLD.descricao_md
BEGIN
  INSERT INTO demanda_fts (demanda_fts, rowid, titulo, descricao_md) VALUES ('delete', OLD.numero, OLD.titulo, OLD.descricao_md);
  INSERT INTO demanda_fts (rowid, titulo, descricao_md) VALUES (NEW.numero, NEW.titulo, NEW.descricao_md);
END;

-- ═════════════════════════════ gatilhos: contadores desnormalizados ═════════════════════════════

CREATE TRIGGER checklist_item_contar_ai AFTER INSERT ON checklist_item
BEGIN
  UPDATE demanda SET
    n_check_total  = (SELECT count(*) FROM checklist_item WHERE demanda_id = NEW.demanda_id),
    n_check_feitos = (SELECT count(*) FROM checklist_item WHERE demanda_id = NEW.demanda_id AND feito_em IS NOT NULL)
  WHERE id = NEW.demanda_id;
END;
CREATE TRIGGER checklist_item_contar_au AFTER UPDATE OF feito_em ON checklist_item
WHEN NEW.feito_em IS NOT OLD.feito_em
BEGIN
  UPDATE demanda SET
    n_check_feitos = (SELECT count(*) FROM checklist_item WHERE demanda_id = NEW.demanda_id AND feito_em IS NOT NULL)
  WHERE id = NEW.demanda_id;
END;
CREATE TRIGGER checklist_item_contar_ad AFTER DELETE ON checklist_item
BEGIN
  UPDATE demanda SET
    n_check_total  = (SELECT count(*) FROM checklist_item WHERE demanda_id = OLD.demanda_id),
    n_check_feitos = (SELECT count(*) FROM checklist_item WHERE demanda_id = OLD.demanda_id AND feito_em IS NOT NULL)
  WHERE id = OLD.demanda_id;
END;
CREATE TRIGGER checklist_item_demanda_fixa BEFORE UPDATE OF checklist_id, demanda_id ON checklist_item
WHEN NEW.demanda_id IS NOT OLD.demanda_id
BEGIN SELECT RAISE(ABORT, 'checklist_item_nao_muda_de_demanda'); END;

CREATE TRIGGER comentario_contar_ai AFTER INSERT ON comentario
BEGIN
  UPDATE demanda SET n_comentarios = (SELECT count(*) FROM comentario WHERE demanda_id = NEW.demanda_id AND excluido_em IS NULL)
  WHERE id = NEW.demanda_id;
END;
CREATE TRIGGER comentario_contar_au AFTER UPDATE OF excluido_em ON comentario WHEN NEW.excluido_em IS NOT OLD.excluido_em
BEGIN
  UPDATE demanda SET n_comentarios = (SELECT count(*) FROM comentario WHERE demanda_id = NEW.demanda_id AND excluido_em IS NULL)
  WHERE id = NEW.demanda_id;
END;

CREATE TRIGGER anexo_contar_ai AFTER INSERT ON anexo
BEGIN
  UPDATE demanda SET n_anexos = (SELECT count(*) FROM anexo WHERE demanda_id = NEW.demanda_id AND excluido_em IS NULL)
  WHERE id = NEW.demanda_id;
END;
CREATE TRIGGER anexo_contar_au AFTER UPDATE OF excluido_em ON anexo WHEN NEW.excluido_em IS NOT OLD.excluido_em
BEGIN
  UPDATE demanda SET n_anexos = (SELECT count(*) FROM anexo WHERE demanda_id = NEW.demanda_id AND excluido_em IS NULL)
  WHERE id = NEW.demanda_id;
END;
CREATE TRIGGER anexo_sem_delete BEFORE DELETE ON anexo
BEGIN SELECT RAISE(ABORT, 'anexo_nao_se_apaga: marque excluido_em'); END;
-- o anexo que é capa não sai sem antes tirar a capa (o serviço faz os dois na mesma transação)
CREATE TRIGGER anexo_e_capa BEFORE UPDATE OF excluido_em ON anexo
WHEN NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL
  AND EXISTS (SELECT 1 FROM demanda WHERE capa_anexo_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'anexo_e_capa: tire a capa antes'); END;
-- o print que prova uma decisão do cliente nunca sai (a trilha de aprovação é imutável)
CREATE TRIGGER anexo_evidencia_fixa BEFORE UPDATE OF excluido_em ON anexo
WHEN NEW.excluido_em IS NOT NULL AND EXISTS (SELECT 1 FROM aprovacao WHERE evidencia_anexo_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'anexo_e_evidencia'); END;

CREATE TRIGGER apontamento_somar_ai AFTER INSERT ON apontamento
BEGIN
  UPDATE demanda SET minutos_registrados = (SELECT coalesce(sum(minutos), 0) FROM apontamento
    WHERE demanda_id = NEW.demanda_id AND excluido_em IS NULL AND minutos IS NOT NULL)
  WHERE id = NEW.demanda_id;
END;
CREATE TRIGGER apontamento_somar_au AFTER UPDATE OF minutos, excluido_em, demanda_id ON apontamento
BEGIN
  UPDATE demanda SET minutos_registrados = (SELECT coalesce(sum(minutos), 0) FROM apontamento
    WHERE demanda_id = demanda.id AND excluido_em IS NULL AND minutos IS NOT NULL)
  WHERE id IN (NEW.demanda_id, OLD.demanda_id);
END;
CREATE TRIGGER apontamento_sem_delete BEFORE DELETE ON apontamento
BEGIN SELECT RAISE(ABORT, 'apontamento_nao_se_apaga: marque excluido_em'); END;

CREATE TRIGGER versao_contar_ai AFTER INSERT ON versao
BEGIN
  UPDATE demanda SET n_versoes = (SELECT count(*) FROM versao WHERE demanda_id = NEW.demanda_id), versao_atual_id = NEW.id
  WHERE id = NEW.demanda_id;
END;
CREATE TRIGGER versao_enviada_au AFTER UPDATE OF enviada_cliente_em ON versao
WHEN NEW.enviada_cliente_em IS NOT NULL AND OLD.enviada_cliente_em IS NULL
BEGIN
  UPDATE demanda SET versao_enviada_id = NEW.id
  WHERE id = NEW.demanda_id
    AND (versao_enviada_id IS NULL OR (SELECT numero FROM versao WHERE id = demanda.versao_enviada_id) < NEW.numero);
END;

-- ═════════════════════════════ gatilhos: trilhas imutáveis ═════════════════════════════

CREATE TRIGGER atividade_sem_delete BEFORE DELETE ON atividade
BEGIN SELECT RAISE(ABORT, 'atividade_imutavel'); END;
CREATE TRIGGER atividade_imutavel BEFORE UPDATE ON atividade
WHEN NEW.id IS NOT OLD.id OR NEW.demanda_id IS NOT OLD.demanda_id OR NEW.cliente_id IS NOT OLD.cliente_id
  OR NEW.ator_id IS NOT OLD.ator_id OR NEW.ator_tipo IS NOT OLD.ator_tipo OR NEW.tipo IS NOT OLD.tipo
  OR NEW.trace_id IS NOT OLD.trace_id OR NEW.criado_em IS NOT OLD.criado_em
BEGIN SELECT RAISE(ABORT, 'atividade_imutavel: so dados/antes podem ser anonimizados'); END;

CREATE TRIGGER movimento_sem_delete BEFORE DELETE ON demanda_movimento
BEGIN SELECT RAISE(ABORT, 'demanda_movimento_imutavel'); END;
CREATE TRIGGER movimento_imutavel BEFORE UPDATE ON demanda_movimento
WHEN NEW.id IS NOT OLD.id OR NEW.demanda_id IS NOT OLD.demanda_id OR NEW.quadro_id IS NOT OLD.quadro_id
  OR NEW.coluna_id IS NOT OLD.coluna_id OR NEW.papel IS NOT OLD.papel OR NEW.entrou_em IS NOT OLD.entrou_em
  OR NEW.por IS NOT OLD.por OR OLD.saiu_em IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'demanda_movimento_imutavel: so fechar saiu_em uma vez'); END;

CREATE TRIGGER rodada_sem_delete BEFORE DELETE ON rodada
BEGIN SELECT RAISE(ABORT, 'rodada_imutavel'); END;
CREATE TRIGGER rodada_imutavel BEFORE UPDATE ON rodada
WHEN NEW.id IS NOT OLD.id OR NEW.demanda_id IS NOT OLD.demanda_id OR NEW.numero IS NOT OLD.numero
  OR NEW.origem IS NOT OLD.origem OR NEW.prazo_original IS NOT OLD.prazo_original
  OR NEW.aberta_em IS NOT OLD.aberta_em OR NEW.aberta_por IS NOT OLD.aberta_por
BEGIN SELECT RAISE(ABORT, 'rodada_imutavel: so extra, motivo, prazo e fechada_em'); END;

CREATE TRIGGER versao_sem_delete BEFORE DELETE ON versao
BEGIN SELECT RAISE(ABORT, 'versao_imutavel'); END;
CREATE TRIGGER versao_imutavel BEFORE UPDATE ON versao
WHEN NEW.id IS NOT OLD.id OR NEW.demanda_id IS NOT OLD.demanda_id OR NEW.numero IS NOT OLD.numero
  OR NEW.rodada_id IS NOT OLD.rodada_id OR NEW.criada_por IS NOT OLD.criada_por OR NEW.criada_em IS NOT OLD.criada_em
  OR (OLD.enviada_cliente_em IS NOT NULL AND (NEW.enviada_cliente_em IS NOT OLD.enviada_cliente_em
                                              OR NEW.enviada_via IS NOT OLD.enviada_via))
BEGIN SELECT RAISE(ABORT, 'versao_imutavel: so nota e o primeiro envio'); END;

CREATE TRIGGER versao_item_sem_delete BEFORE DELETE ON versao_item
BEGIN SELECT RAISE(ABORT, 'versao_item_imutavel'); END;
CREATE TRIGGER versao_item_imutavel BEFORE UPDATE ON versao_item
WHEN NEW.id IS NOT OLD.id OR NEW.versao_id IS NOT OLD.versao_id OR NEW.demanda_id IS NOT OLD.demanda_id
  OR NEW.tipo IS NOT OLD.tipo OR NEW.url IS NOT OLD.url OR NEW.caminho IS NOT OLD.caminho
  OR NEW.arquivo_id IS NOT OLD.arquivo_id
BEGIN SELECT RAISE(ABORT, 'versao_item_imutavel: so nome, posicao e teste do Drive'); END;

CREATE TRIGGER envio_sem_delete BEFORE DELETE ON envio
BEGIN SELECT RAISE(ABORT, 'envio_imutavel'); END;
CREATE TRIGGER envio_sem_update BEFORE UPDATE ON envio
BEGIN SELECT RAISE(ABORT, 'envio_imutavel'); END;

CREATE TRIGGER aprovacao_sem_delete BEFORE DELETE ON aprovacao
BEGIN SELECT RAISE(ABORT, 'aprovacao_imutavel'); END;
CREATE TRIGGER aprovacao_imutavel BEFORE UPDATE ON aprovacao
WHEN NEW.id IS NOT OLD.id OR NEW.demanda_id IS NOT OLD.demanda_id OR NEW.versao_id IS NOT OLD.versao_id
  OR NEW.decisao IS NOT OLD.decisao OR NEW.via IS NOT OLD.via OR NEW.canal IS NOT OLD.canal
  OR NEW.link_id IS NOT OLD.link_id OR NEW.contato_id IS NOT OLD.contato_id OR NEW.nome_informado IS NOT OLD.nome_informado
  OR NEW.registrado_por IS NOT OLD.registrado_por OR NEW.comentario IS NOT OLD.comentario OR NEW.motivo IS NOT OLD.motivo
  OR NEW.rodada_aberta_id IS NOT OLD.rodada_aberta_id OR NEW.evidencia_anexo_id IS NOT OLD.evidencia_anexo_id
  OR NEW.quadro_antes_id IS NOT OLD.quadro_antes_id OR NEW.coluna_antes_id IS NOT OLD.coluna_antes_id
  OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.idempotency_hash IS NOT OLD.idempotency_hash
  OR NEW.criado_em IS NOT OLD.criado_em
  OR (NEW.ip_hmac IS NOT OLD.ip_hmac AND NEW.ip_hmac IS NOT NULL)
  OR (NEW.user_agent IS NOT OLD.user_agent AND NEW.user_agent IS NOT NULL)
  OR (OLD.anulada_em IS NOT NULL AND NEW.anulada_em IS NOT OLD.anulada_em)
BEGIN SELECT RAISE(ABORT, 'aprovacao_imutavel: so anular uma vez e apagar ip/user-agent'); END;

-- ═════════════════════════════ gatilhos: identidade na trilha e arquivos em uso ═════════════════════════════

-- o contato de uma decisão ou de um envio é do cliente da demanda (a trilha "Aprovado V2 por Fulana" não é forjável)
CREATE TRIGGER aprovacao_contato_do_cliente BEFORE INSERT ON aprovacao
WHEN NEW.contato_id IS NOT NULL
  AND (SELECT cliente_id FROM cliente_contato WHERE id = NEW.contato_id)
      IS NOT (SELECT cliente_id FROM demanda WHERE id = NEW.demanda_id)
BEGIN SELECT RAISE(ABORT, 'contato_de_outro_cliente'); END;
CREATE TRIGGER envio_contato_do_cliente BEFORE INSERT ON envio
WHEN NEW.contato_id IS NOT NULL
  AND (SELECT cliente_id FROM cliente_contato WHERE id = NEW.contato_id)
      IS NOT (SELECT cliente_id FROM demanda WHERE id = NEW.demanda_id)
BEGIN SELECT RAISE(ABORT, 'contato_de_outro_cliente'); END;
-- o link só leva demandas do cliente dele (a página pública mostra o logo e o nome desse cliente)
CREATE TRIGGER link_item_do_cliente BEFORE INSERT ON link_publico_item
WHEN (SELECT cliente_id FROM demanda WHERE id = NEW.demanda_id)
     IS NOT (SELECT cliente_id FROM link_publico WHERE id = NEW.link_id)
BEGIN SELECT RAISE(ABORT, 'demanda_de_outro_cliente'); END;

-- arquivo usado por versão, logo ou anexo ativo não vai para o lixo (o job de órfãos usa a mesma lista)
CREATE TRIGGER arquivo_em_uso BEFORE UPDATE OF excluido_em ON arquivo
WHEN NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL AND (
     EXISTS (SELECT 1 FROM versao_item WHERE arquivo_id = NEW.id)
  OR EXISTS (SELECT 1 FROM cliente WHERE logo_arquivo_id = NEW.id)
  OR EXISTS (SELECT 1 FROM anexo WHERE arquivo_id = NEW.id AND excluido_em IS NULL))
BEGIN SELECT RAISE(ABORT, 'arquivo_em_uso'); END;
-- e o que já está no lixo não volta a ser usado (o job o apagaria do disco e o item de versão ficaria quebrado)
CREATE TRIGGER anexo_arquivo_no_lixo BEFORE INSERT ON anexo
WHEN NEW.arquivo_id IS NOT NULL AND (SELECT excluido_em FROM arquivo WHERE id = NEW.arquivo_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'arquivo_no_lixo'); END;
CREATE TRIGGER versao_item_arquivo_no_lixo BEFORE INSERT ON versao_item
WHEN NEW.arquivo_id IS NOT NULL AND (SELECT excluido_em FROM arquivo WHERE id = NEW.arquivo_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'arquivo_no_lixo'); END;
CREATE TRIGGER cliente_logo_no_lixo_ai BEFORE INSERT ON cliente
WHEN NEW.logo_arquivo_id IS NOT NULL AND (SELECT excluido_em FROM arquivo WHERE id = NEW.logo_arquivo_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'arquivo_no_lixo'); END;
CREATE TRIGGER cliente_logo_no_lixo_au BEFORE UPDATE OF logo_arquivo_id ON cliente
WHEN NEW.logo_arquivo_id IS NOT NULL AND NEW.logo_arquivo_id IS NOT OLD.logo_arquivo_id
  AND (SELECT excluido_em FROM arquivo WHERE id = NEW.logo_arquivo_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'arquivo_no_lixo'); END;
