-- 001_base.sql: esquema completo do MVP em SQLite (node:sqlite).
-- Referências: docs/ADAPTACOES.md (vale sobre a SPEC), docs/pesquisa/SPEC.md §6, docs/API.md.
--
-- Convenções
-- * Tabelas STRICT. Ids TEXT (crypto.randomUUID(); nos seeds de configuração, slugs estáveis como 'et-fila').
-- * Instante: TEXT ISO 8601 UTC com ms ('2026-10-14T17:03:00.000Z'), gravado com new Date().toISOString().
-- * Data local (America/Sao_Paulo): TEXT 'YYYY-MM-DD'. Hora local: TEXT 'HH:MM'. Prazo sem hora = 18:00.
-- * Booleano: INTEGER 0/1. JSON: TEXT com json_valid. URL: só https.
-- * Nada se apaga: usuário, cliente e demanda não têm DELETE (gatilhos abaixo); arquivar/desativar/anonimizar.
-- * Regras de negócio (mover, bola, prazo, rodadas, notificações) ficam em server/src/servicos.
--   Gatilhos aqui só fazem integridade: imutabilidade, contadores, histórico de etapa, rev, atualizado_em e busca.
-- * Toda UPDATE em demanda feita pelo app grava atualizado_por (o histórico de etapa usa esse valor).
-- * _migracoes é criada pelo runner (server/src/db.ts), não por esta migração.

-- ═════════════════════════════ configuração da aplicação ═════════════════════════════

CREATE TABLE configuracao (
  chave          TEXT PRIMARY KEY,                       -- 'prazo.hora_padrao', 'demanda.numero_inicial', ...
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
  papel             TEXT NOT NULL DEFAULT 'executor' CHECK (papel IN ('admin','atendimento','executor','agente')),
  cor               TEXT NOT NULL DEFAULT 'azul'
                    CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  horas_semana      REAL NOT NULL DEFAULT 40 CHECK (horas_semana BETWEEN 0 AND 80),
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
  token_hash    TEXT NOT NULL UNIQUE,                    -- sha256 hex do valor do cookie sid
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
  token_hash  TEXT NOT NULL UNIQUE,                      -- sha256 hex do token da URL
  expira_em   TEXT NOT NULL,
  usado_em    TEXT,
  revogado_em TEXT,                                      -- gerar outro do mesmo tipo revoga o anterior
  criado_por  TEXT REFERENCES usuario(id),
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX token_acesso_usuario_ix ON token_acesso (usuario_id, finalidade) WHERE usado_em IS NULL AND revogado_em IS NULL;

CREATE TABLE login_tentativa (                           -- limite: 5 falhas em 15 min por e-mail+IP
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  email     TEXT NOT NULL,
  ip        TEXT NOT NULL,
  ok        INTEGER NOT NULL CHECK (ok IN (0,1)),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX login_tentativa_ix ON login_tentativa (email, ip, criado_em);

-- ═════════════════════════════ fluxo, etapas e transições ═════════════════════════════

CREATE TABLE fluxo (
  id     TEXT PRIMARY KEY,
  nome   TEXT NOT NULL UNIQUE,
  padrao INTEGER NOT NULL DEFAULT 0 CHECK (padrao IN (0,1))
) STRICT;
CREATE UNIQUE INDEX fluxo_padrao_uk ON fluxo (padrao) WHERE padrao = 1;

CREATE TABLE etapa (
  id                TEXT PRIMARY KEY,
  fluxo_id          TEXT NOT NULL REFERENCES fluxo(id),
  nome              TEXT NOT NULL,
  categoria         TEXT NOT NULL CHECK (categoria IN
                    ('triagem','fila','producao','revisao','cliente','ajuste','aprovado','publicacao','concluido','cancelado')),
  bola              TEXT NOT NULL DEFAULT 'agencia' CHECK (bola IN ('agencia','cliente','terceiro')),
  pausa_sla         INTEGER NOT NULL DEFAULT 0 CHECK (pausa_sla IN (0,1)),
  aplica_se         TEXT NOT NULL DEFAULT 'sempre' CHECK (aplica_se IN ('sempre','aprovacao_cliente','publicacao')),
  responsavel_regra TEXT CHECK (responsavel_regra IS NULL OR responsavel_regra IN ('social_do_cliente')),
  cor               TEXT NOT NULL CHECK (cor IN ('grafite','roxo','info','warning','turquesa','success','danger')),
  pos               REAL NOT NULL,
  UNIQUE (fluxo_id, nome),
  UNIQUE (id, fluxo_id)
) STRICT;

CREATE TABLE transicao (                                  -- única fonte das regras de movimento (SPEC §7.1)
  de_categoria   TEXT NOT NULL CHECK (de_categoria IN
                 ('triagem','fila','producao','revisao','cliente','ajuste','aprovado','publicacao','concluido','cancelado','*')),
  para_categoria TEXT NOT NULL CHECK (para_categoria IN
                 ('triagem','fila','producao','revisao','cliente','ajuste','aprovado','publicacao','concluido','cancelado','anterior')),
  quem           TEXT NOT NULL CHECK (json_valid(quem) AND json_type(quem) = 'array'),   -- QuemTransicao[]
  requer         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(requer) AND json_type(requer) = 'array'), -- RequisitoTransicao[]
  negado         TEXT NOT NULL,                            -- motivo exibido a quem não pode ("Só o atendimento envia ao cliente.")
  PRIMARY KEY (de_categoria, para_categoria)
) STRICT;

-- ═════════════════════════════ equipes e ausências ═════════════════════════════

CREATE TABLE equipe (
  id                  TEXT PRIMARY KEY,
  nome                TEXT NOT NULL UNIQUE,
  slug                TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z]*' AND slug NOT GLOB '*[^a-z0-9-]*'),
  cor                 TEXT NOT NULL DEFAULT 'grafite'
                      CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  fluxo_id            TEXT NOT NULL REFERENCES fluxo(id),
  executora           INTEGER NOT NULL DEFAULT 1 CHECK (executora IN (0,1)),   -- recebe demandas (fila, visão)
  aprovador_padrao_id TEXT REFERENCES usuario(id),        -- nulo = o AM da demanda aprova
  distribuidor_id     TEXT REFERENCES usuario(id),        -- avisado quando chega demanda sem responsável
  ativa               INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0,1)),
  pos                 REAL NOT NULL,
  criado_em           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE equipe_membro (
  equipe_id  TEXT NOT NULL REFERENCES equipe(id),
  usuario_id TEXT NOT NULL REFERENCES usuario(id),
  funcao     TEXT,                                         -- design, video, redacao, social, dev, trafego, atendimento
  principal  INTEGER NOT NULL DEFAULT 0 CHECK (principal IN (0,1)),
  PRIMARY KEY (equipe_id, usuario_id)
) STRICT;
CREATE INDEX equipe_membro_usuario_ix ON equipe_membro (usuario_id);

CREATE TABLE ausencia (                                   -- "ausente de 20/10 a 31/10, substituto Samara"
  id            TEXT PRIMARY KEY,
  usuario_id    TEXT NOT NULL REFERENCES usuario(id),
  de            TEXT NOT NULL CHECK (de  GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  ate           TEXT NOT NULL CHECK (ate GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  substituto_id TEXT NOT NULL REFERENCES usuario(id),
  motivo        TEXT,
  criado_por    TEXT NOT NULL REFERENCES usuario(id),
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cancelada_em  TEXT,
  CHECK (ate >= de),
  CHECK (substituto_id <> usuario_id)
) STRICT;
CREATE INDEX ausencia_usuario_ix    ON ausencia (usuario_id, de)    WHERE cancelada_em IS NULL;
CREATE INDEX ausencia_substituto_ix ON ausencia (substituto_id, de) WHERE cancelada_em IS NULL;

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
  logo_url         TEXT CHECK (logo_url IS NULL OR logo_url LIKE 'https://%'),
  logo_arquivo_id  TEXT REFERENCES arquivo(id),
  atendimento_id   TEXT REFERENCES usuario(id),            -- AM dono da conta
  criativo_id      TEXT REFERENCES usuario(id),
  social_id        TEXT REFERENCES usuario(id),            -- recebe a etapa Agendar
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
  CHECK (padrao = 0 OR (ativo = 1 AND aprova = 1))
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

-- ═════════════════════════════ tipos de peça e feriados ═════════════════════════════

CREATE TABLE tipo_peca (
  id                    TEXT PRIMARY KEY,
  nome                  TEXT NOT NULL UNIQUE,
  slug                  TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z]*' AND slug NOT GLOB '*[^a-z0-9-]*'),
  equipe_id             TEXT REFERENCES equipe(id),        -- equipe executora padrão; nulo = escolher na criação
  aprovacao_cliente     INTEGER NOT NULL DEFAULT 1 CHECK (aprovacao_cliente IN (0,1)),  -- 0: Revisão → Entregue
  publicacao            INTEGER NOT NULL DEFAULT 0 CHECK (publicacao IN (0,1)),         -- 1: Aprovado → Agendar
  com_horario           INTEGER NOT NULL DEFAULT 0 CHECK (com_horario IN (0,1)),        -- gravação, reunião
  sla_dias_uteis        INTEGER NOT NULL DEFAULT 2 CHECK (sla_dias_uteis BETWEEN 0 AND 120),
  sla_ajuste_dias_uteis INTEGER NOT NULL DEFAULT 1 CHECK (sla_ajuste_dias_uteis BETWEEN 0 AND 60),
  folga_aprovacao_dias  INTEGER NOT NULL DEFAULT 1 CHECK (folga_aprovacao_dias BETWEEN 0 AND 30),
  estimativa_min        INTEGER CHECK (estimativa_min IS NULL OR estimativa_min >= 0),
  rodadas_inclusas      INTEGER CHECK (rodadas_inclusas IS NULL OR rodadas_inclusas BETWEEN 0 AND 20),  -- nulo = do cliente
  checklist_padrao      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(checklist_padrao) AND json_type(checklist_padrao) = 'array'),
  ativo                 INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  pos                   REAL NOT NULL,
  criado_em             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE tipo_peca_campo (
  id           TEXT PRIMARY KEY,
  tipo_peca_id TEXT NOT NULL REFERENCES tipo_peca(id),
  chave        TEXT NOT NULL CHECK (chave GLOB '[a-z]*' AND chave NOT GLOB '*[^a-z0-9_]*'),
  rotulo       TEXT NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('texto','texto_longo','numero','data','selecao','multipla','url','sim_nao')),
  opcoes       TEXT CHECK (opcoes IS NULL OR (json_valid(opcoes) AND json_type(opcoes) = 'array')),
  obrigatorio  INTEGER NOT NULL DEFAULT 0 CHECK (obrigatorio IN (0,1)),    -- até 3 por tipo (gatilho)
  ajuda        TEXT,
  pos          REAL NOT NULL,
  UNIQUE (tipo_peca_id, chave),
  CHECK ((tipo IN ('selecao','multipla')) = (opcoes IS NOT NULL))
) STRICT;

CREATE TABLE feriado (                                    -- todo dia desta tabela é dia NÃO útil no cálculo de prazo
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

-- ═════════════════════════════ demanda ═════════════════════════════

CREATE TABLE demanda (
  id                      TEXT PRIMARY KEY,
  numero                  INTEGER NOT NULL UNIQUE CHECK (numero > 0),  -- #4521: max+1 dentro do BEGIN IMMEDIATE; nunca muda
  titulo                  TEXT NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 500),
  cliente_id              TEXT REFERENCES cliente(id),
  tipo_peca_id            TEXT REFERENCES tipo_peca(id),
  equipe_id               TEXT REFERENCES equipe(id),
  fluxo_id                TEXT NOT NULL REFERENCES fluxo(id),
  etapa_id                TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN
                          ('triagem','fila','producao','revisao','cliente','ajuste','aprovado','publicacao','concluido','cancelado')),
                                                           -- = etapa.categoria (gatilho confere)
  status_desde            TEXT NOT NULL,                   -- muda só com a etapa; base do "parado há"
  bola                    TEXT NOT NULL CHECK (bola IN ('agencia','cliente','terceiro')),
  com_quem_id             TEXT REFERENCES usuario(id),     -- pessoa com a bola (sem resolver ausência); nulo se cliente/terceiro
  bloqueio                TEXT CHECK (bloqueio IS NULL OR bloqueio IN ('cliente','interno','fornecedor')),
  bloqueio_motivo         TEXT,
  bloqueio_desde          TEXT,
  responsavel_id          TEXT REFERENCES usuario(id),
  responsavel_sugerido_id TEXT REFERENCES usuario(id),
  atendimento_id          TEXT REFERENCES usuario(id),     -- padrão: cliente.atendimento_id
  aprovador_id            TEXT REFERENCES usuario(id),     -- padrão: equipe.aprovador_padrao_id; nulo = o AM aprova
  solicitante_id          TEXT NOT NULL REFERENCES usuario(id),
  criado_por              TEXT NOT NULL REFERENCES usuario(id),
  atualizado_por          TEXT REFERENCES usuario(id),     -- quem fez a última UPDATE (o app sempre grava)
  briefing_md             TEXT NOT NULL DEFAULT '' CHECK (length(briefing_md) <= 100000),
  briefing_campos         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(briefing_campos) AND json_type(briefing_campos) = 'object'),
  briefing_completo       INTEGER NOT NULL DEFAULT 0 CHECK (briefing_completo IN (0,1)),
  prioridade              INTEGER NOT NULL DEFAULT 0 CHECK (prioridade IN (0,1,2)),   -- normal, urgente, fura-pauta
  prioridade_motivo       TEXT,
  prazo                   TEXT CHECK (prazo IS NULL OR prazo GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),  -- prazo interno
  prazo_hora              TEXT CHECK (prazo_hora IS NULL OR prazo_hora GLOB '[0-2][0-9]:[0-5][0-9]'),            -- nulo = 18:00
  prazo_manual            INTEGER NOT NULL DEFAULT 0 CHECK (prazo_manual IN (0,1)),   -- 0 = calculado pela publicação/SLA
  publicacao_data         TEXT CHECK (publicacao_data IS NULL OR publicacao_data GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  publicacao_hora         TEXT CHECK (publicacao_hora IS NULL OR publicacao_hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  planejada_para          TEXT CHECK (planejada_para IS NULL OR planejada_para GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  agendada_inicio         TEXT CHECK (agendada_inicio IS NULL OR agendada_inicio GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T*Z'),
  agendada_fim            TEXT CHECK (agendada_fim IS NULL OR agendada_fim GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T*Z'),
  local                   TEXT,
  estimativa_min          INTEGER CHECK (estimativa_min IS NULL OR estimativa_min >= 0),
  minutos_registrados     INTEGER NOT NULL DEFAULT 0,      -- gatilho: soma dos apontamentos
  rodada_atual            INTEGER NOT NULL DEFAULT 1 CHECK (rodada_atual >= 1),
  rodadas_inclusas        INTEGER NOT NULL DEFAULT 2 CHECK (rodadas_inclusas >= 0),
  aprovada_em             TEXT,
  aprovada_versao_id      TEXT,
  versao_atual_id         TEXT,                            -- gatilho: última versão entregue
  versao_enviada_id       TEXT,                            -- gatilho: última versão enviada ao cliente
  n_versoes               INTEGER NOT NULL DEFAULT 0,
  posicao                 REAL NOT NULL,                   -- ordem global; o servidor calcula entre vizinhos
  origem                  TEXT NOT NULL DEFAULT 'manual'
                          CHECK (origem IN ('manual','rapida','whatsapp','repeticao','agente','importacao','cliente')),
  origem_texto            TEXT CHECK (origem_texto IS NULL OR length(origem_texto) <= 50000),  -- só texto puro
  repetida_de_id          TEXT REFERENCES demanda(id),
  n_anexos                INTEGER NOT NULL DEFAULT 0,
  n_check_total           INTEGER NOT NULL DEFAULT 0,
  n_check_feitos          INTEGER NOT NULL DEFAULT 0,
  concluida_em            TEXT,
  cancelada_motivo        TEXT,
  arquivado_em            TEXT,
  arquivado_por           TEXT REFERENCES usuario(id),
  excluido_em             TEXT,                            -- "excluir" = anonimizar título e briefing (admin, sem aprovação)
  origem_trello_id        TEXT,
  origem_trello_url       TEXT,
  rev                     INTEGER NOT NULL DEFAULT 1,      -- If-Match; gatilho sobe com campos editados por pessoas
  criado_em               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (etapa_id, fluxo_id)          REFERENCES etapa (id, fluxo_id),
  FOREIGN KEY (aprovada_versao_id, id)      REFERENCES versao (id, demanda_id),
  FOREIGN KEY (versao_atual_id, id)         REFERENCES versao (id, demanda_id),
  FOREIGN KEY (versao_enviada_id, id)       REFERENCES versao (id, demanda_id),
  CHECK (cliente_id IS NOT NULL OR status IN ('triagem','cancelado')),
  CHECK (prioridade = 0 OR prioridade_motivo IS NOT NULL),
  CHECK (prazo_hora IS NULL OR prazo IS NOT NULL),
  CHECK (publicacao_hora IS NULL OR publicacao_data IS NOT NULL),
  CHECK (agendada_fim IS NULL OR (agendada_inicio IS NOT NULL AND agendada_fim > agendada_inicio)),
  CHECK ((bloqueio IS NULL) = (bloqueio_desde IS NULL)),
  CHECK ((aprovada_em IS NULL) = (aprovada_versao_id IS NULL)),
  CHECK (status <> 'concluido' OR concluida_em IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX demanda_trello_uk ON demanda (origem_trello_id) WHERE origem_trello_id IS NOT NULL;
CREATE INDEX demanda_posicao_ix  ON demanda (posicao);
CREATE INDEX demanda_quadro_ix   ON demanda (etapa_id, posicao)           WHERE arquivado_em IS NULL;
CREATE INDEX demanda_abertas_ix  ON demanda (status, concluida_em)        WHERE arquivado_em IS NULL AND excluido_em IS NULL;
CREATE INDEX demanda_equipe_ix   ON demanda (equipe_id, status)           WHERE arquivado_em IS NULL;
CREATE INDEX demanda_comquem_ix  ON demanda (com_quem_id, status)         WHERE arquivado_em IS NULL;
CREATE INDEX demanda_resp_ix     ON demanda (responsavel_id, status)      WHERE arquivado_em IS NULL;
CREATE INDEX demanda_am_ix       ON demanda (atendimento_id, status)      WHERE arquivado_em IS NULL;
CREATE INDEX demanda_cli_ix      ON demanda (cliente_id, criado_em);
CREATE INDEX demanda_prazo_ix    ON demanda (prazo)                       WHERE arquivado_em IS NULL AND status NOT IN ('concluido','cancelado');
CREATE INDEX demanda_semana_ix   ON demanda (responsavel_id, coalesce(planejada_para, prazo)) WHERE arquivado_em IS NULL;
CREATE INDEX demanda_agenda_ix   ON demanda (agendada_inicio)             WHERE agendada_inicio IS NOT NULL;
CREATE INDEX demanda_arquivo_ix  ON demanda (cliente_id, arquivado_em)    WHERE arquivado_em IS NOT NULL;
CREATE INDEX demanda_arquivo_mes_ix ON demanda (arquivado_em)             WHERE arquivado_em IS NOT NULL;
CREATE INDEX demanda_triagem_ix  ON demanda (equipe_id, criado_em)        WHERE status = 'triagem' AND arquivado_em IS NULL;

CREATE TABLE demanda_etapa_hist (                          -- tempo por etapa, bola e pessoa (gatilhos)
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id     TEXT NOT NULL REFERENCES demanda(id),
  etapa_id       TEXT NOT NULL REFERENCES etapa(id),
  status         TEXT NOT NULL,
  bola           TEXT NOT NULL,
  com_quem_id    TEXT REFERENCES usuario(id),
  responsavel_id TEXT REFERENCES usuario(id),
  bloqueio       TEXT,
  pausa_sla      INTEGER NOT NULL CHECK (pausa_sla IN (0,1)),   -- copiado no momento
  entrou_em      TEXT NOT NULL,
  saiu_em        TEXT,
  por            TEXT REFERENCES usuario(id),
  parcial        INTEGER NOT NULL DEFAULT 0 CHECK (parcial IN (0,1))   -- importado sem as ações antigas
) STRICT;
CREATE INDEX demanda_etapa_hist_ix ON demanda_etapa_hist (demanda_id, entrou_em);
CREATE UNIQUE INDEX demanda_etapa_hist_aberta_uk ON demanda_etapa_hist (demanda_id) WHERE saiu_em IS NULL;

CREATE TABLE demanda_mencao (                              -- @ no briefing (validada no servidor)
  demanda_id TEXT NOT NULL REFERENCES demanda(id),
  usuario_id TEXT NOT NULL REFERENCES usuario(id),
  PRIMARY KEY (demanda_id, usuario_id)
) STRICT;

CREATE VIRTUAL TABLE demanda_fts USING fts5 (
  titulo, briefing_md,
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
  fechada_em        TEXT,                                    -- ao abrir a próxima, ou ao aprovar/concluir
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

CREATE TABLE link_publico (                                -- /a/:token (cliente aprova sem login)
  id               TEXT PRIMARY KEY,
  token_hash       TEXT NOT NULL UNIQUE,                    -- sha256 hex de 32 bytes aleatórios (base64url na URL)
  token_cifrado    TEXT NOT NULL,                           -- AES-256-GCM (chave derivada de SEGREDO): reexibir o link ao AM
  cliente_id       TEXT NOT NULL REFERENCES cliente(id),
  contato_id       TEXT REFERENCES cliente_contato(id),     -- "Você é Fulana?"
  titulo           TEXT,
  expira_em        TEXT NOT NULL,                           -- 30 dias
  revogado_em      TEXT,
  revogado_por     TEXT REFERENCES usuario(id),
  criado_por       TEXT NOT NULL REFERENCES usuario(id),
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ultimo_acesso_em TEXT,                                    -- só por POST /visto (o GET não tem efeito)
  acessos          INTEGER NOT NULL DEFAULT 0,
  CHECK ((revogado_em IS NULL) = (revogado_por IS NULL))
) STRICT;
CREATE INDEX link_publico_cliente_ix ON link_publico (cliente_id);

CREATE TABLE link_publico_item (                           -- 1 item no MVP; vários = lote (v1)
  link_id    TEXT NOT NULL REFERENCES link_publico(id),
  demanda_id TEXT NOT NULL REFERENCES demanda(id),
  pos        REAL NOT NULL,
  PRIMARY KEY (link_id, demanda_id)
) STRICT;
CREATE INDEX link_publico_item_demanda_ix ON link_publico_item (demanda_id);

CREATE TABLE envio (                                       -- cada "Enviar ao cliente" (link ou por fora)
  id                 TEXT PRIMARY KEY,
  demanda_id         TEXT NOT NULL REFERENCES demanda(id),
  versao_id          TEXT NOT NULL,
  via                TEXT NOT NULL CHECK (via IN ('link','fora')),
  canal              TEXT CHECK (canal IS NULL OR canal IN ('whatsapp','email','reuniao','outro')),
  link_id            TEXT REFERENCES link_publico(id),
  contato_id         TEXT REFERENCES cliente_contato(id),
  prazo_retorno      TEXT CHECK (prazo_retorno IS NULL OR prazo_retorno GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  prazo_retorno_hora TEXT CHECK (prazo_retorno_hora IS NULL OR prazo_retorno_hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  enviado_por        TEXT NOT NULL REFERENCES usuario(id),
  enviado_em         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (versao_id, demanda_id) REFERENCES versao (id, demanda_id),
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
  link_id            TEXT REFERENCES link_publico(id),
  contato_id         TEXT REFERENCES cliente_contato(id),
  nome_informado     TEXT CHECK (nome_informado IS NULL OR length(nome_informado) <= 120),          -- texto puro
  registrado_por     TEXT REFERENCES usuario(id),
  comentario         TEXT CHECK (comentario IS NULL OR length(comentario) <= 20000),                -- linhas do ajuste
  motivo             TEXT CHECK (motivo IS NULL OR motivo IN
                     ('cliente_mudou','briefing_incompleto','erro_execucao','erro_atendimento','outro')),
  rodada_aberta_id   TEXT REFERENCES rodada(id),
  evidencia_anexo_id TEXT REFERENCES anexo(id),              -- print do WhatsApp (opcional)
  idempotency_key    TEXT UNIQUE,
  ip_hmac            TEXT,                                   -- HMAC com SEGREDO; apagado após 12 meses
  user_agent         TEXT,
  criado_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  anulada_em         TEXT,
  anulada_por        TEXT REFERENCES usuario(id),
  FOREIGN KEY (versao_id, demanda_id) REFERENCES versao (id, demanda_id),
  CHECK (decisao = 'aprovado' OR comentario IS NOT NULL),
  CHECK (via = 'link' OR registrado_por IS NOT NULL),
  CHECK (via = 'manual' OR link_id IS NOT NULL),
  CHECK ((anulada_em IS NULL) = (anulada_por IS NULL))
) STRICT;
CREATE UNIQUE INDEX aprovacao_uma_por_versao ON aprovacao (versao_id) WHERE anulada_em IS NULL;
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
  FOREIGN KEY (checklist_id, demanda_id) REFERENCES checklist (id, demanda_id) ON DELETE CASCADE,  -- único cascade
  CHECK ((feito_em IS NULL) = (feito_por IS NULL))
) STRICT;
CREATE INDEX checklist_item_ix ON checklist_item (checklist_id, pos);
CREATE INDEX checklist_item_demanda_ix ON checklist_item (demanda_id);

CREATE TABLE comentario (
  id              TEXT PRIMARY KEY,
  demanda_id      TEXT NOT NULL REFERENCES demanda(id),
  autor_id        TEXT REFERENCES usuario(id),               -- nulo = cliente pelo link
  autor_externo   TEXT,                                      -- nome informado pelo cliente (texto puro)
  link_id         TEXT REFERENCES link_publico(id),
  versao_id       TEXT,
  corpo_md        TEXT NOT NULL CHECK (length(corpo_md) BETWEEN 1 AND 20000),
  visivel_cliente INTEGER NOT NULL DEFAULT 0 CHECK (visivel_cliente IN (0,1)),
  editado_em      TEXT,
  excluido_em     TEXT,
  criado_em       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  origem_trello_id TEXT,
  FOREIGN KEY (versao_id, demanda_id) REFERENCES versao (id, demanda_id),
  CHECK (autor_id IS NOT NULL OR autor_externo IS NOT NULL)
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
  comentario_id    TEXT REFERENCES comentario(id),
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
  CHECK ((tipo = 'link' AND url IS NOT NULL) OR (tipo = 'caminho' AND caminho IS NOT NULL)
      OR (tipo = 'arquivo' AND arquivo_id IS NOT NULL))
) STRICT;
CREATE INDEX anexo_demanda_ix ON anexo (demanda_id, pos);
CREATE INDEX anexo_comentario_ix ON anexo (comentario_id) WHERE comentario_id IS NOT NULL;
CREATE UNIQUE INDEX anexo_trello_uk ON anexo (origem_trello_id) WHERE origem_trello_id IS NOT NULL;

-- ═════════════════════════════ horas ═════════════════════════════

CREATE TABLE apontamento (                                 -- "Lançar tempo" (MVP); timer na v1
  id            TEXT PRIMARY KEY,
  usuario_id    TEXT NOT NULL REFERENCES usuario(id),
  demanda_id    TEXT REFERENCES demanda(id),
  cliente_id    TEXT REFERENCES cliente(id),               -- copiado da demanda
  data          TEXT NOT NULL CHECK (data GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  minutos       INTEGER CHECK (minutos IS NULL OR minutos BETWEEN 1 AND 1440),
  inicio        TEXT,                                      -- timer (v1)
  fim           TEXT,
  origem        TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','timer','importado')),
  nota          TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  excluido_em   TEXT,
  CHECK (minutos IS NOT NULL OR (inicio IS NOT NULL AND fim IS NULL)),
  CHECK (fim IS NULL OR (inicio IS NOT NULL AND fim > inicio)),
  CHECK (demanda_id IS NOT NULL OR cliente_id IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX apontamento_um_timer_uk ON apontamento (usuario_id) WHERE minutos IS NULL AND excluido_em IS NULL;
CREATE INDEX apontamento_demanda_ix ON apontamento (demanda_id) WHERE excluido_em IS NULL;
CREATE INDEX apontamento_cliente_ix ON apontamento (cliente_id, data);
CREATE INDEX apontamento_usuario_ix ON apontamento (usuario_id, data);

-- ═════════════════════════════ histórico, notificações, mural, visões ═════════════════════════════

CREATE TABLE atividade (                                   -- histórico tipado (shared/tipos/demandas.ts: TIPOS_ATIVIDADE)
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id TEXT REFERENCES demanda(id),
  cliente_id TEXT REFERENCES cliente(id),
  ator_id    TEXT REFERENCES usuario(id),
  ator_tipo  TEXT NOT NULL CHECK (ator_tipo IN ('usuario','cliente','sistema','agente','importacao')),
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
  usuario_id   TEXT NOT NULL REFERENCES usuario(id),        -- já resolvido para o substituto, se houver
  cobrindo_id  TEXT REFERENCES usuario(id),                 -- "cobrindo Samara"
  tipo         TEXT NOT NULL CHECK (tipo IN ('atribuida','voltou','mencao','aprovada','ajuste_pedido',
                                             'triagem','fila_sem_responsavel','prazo','cobertura')),
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

CREATE TABLE aviso (                                       -- Mural (por equipe; equipe nula = da agência)
  id               TEXT PRIMARY KEY,
  equipe_id        TEXT REFERENCES equipe(id),
  titulo           TEXT NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 200),
  corpo_md         TEXT NOT NULL DEFAULT '' CHECK (length(corpo_md) <= 50000),
  fixado           INTEGER NOT NULL DEFAULT 0 CHECK (fixado IN (0,1)),
  pos              REAL NOT NULL,
  criado_por       TEXT NOT NULL REFERENCES usuario(id),
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_por   TEXT REFERENCES usuario(id),
  atualizado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  arquivado_em     TEXT,
  origem_trello_id TEXT
) STRICT;
CREATE INDEX aviso_equipe_ix ON aviso (equipe_id, fixado DESC, pos) WHERE arquivado_em IS NULL;

CREATE TABLE visao (                                       -- semeadas no MVP; pessoais (dono_id) na v1
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z]*' AND slug NOT GLOB '*[^a-z0-9-]*'),
  equipe_id   TEXT REFERENCES equipe(id),                   -- abre por padrão para os membros
  dono_id     TEXT REFERENCES usuario(id),
  layout      TEXT NOT NULL DEFAULT 'quadro' CHECK (layout IN ('quadro','lista','semana')),
  agrupar_por TEXT NOT NULL DEFAULT 'etapa' CHECK (agrupar_por IN ('etapa','responsavel','cliente','dia')),
  filtros     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(filtros) AND json_type(filtros) = 'object'),     -- FiltrosVisao
  recolhidas  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recolhidas) AND json_type(recolhidas) = 'array'), -- Categoria[]
  icone       TEXT,                                          -- nome do ícone lucide
  pos         REAL NOT NULL,
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

-- ═════════════════════════════ tempo real e tarefas ═════════════════════════════

CREATE TABLE evento (                                      -- fonte do SSE: gravado na MESMA transação da mutação
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,            -- nunca reaproveitado (AUTOINCREMENT): id do SSE
  entidade    TEXT NOT NULL,                                -- chave de MapaEntidades (shared/tipos/tempo-real.ts)
  entidade_id TEXT NOT NULL,
  demanda_id  TEXT,                                         -- sem FK: sobrevive e é podado sozinho
  op          TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  patch       TEXT CHECK (patch IS NULL OR json_valid(patch)),     -- camelCase; objeto inteiro quando campos é nulo
  campos      TEXT CHECK (campos IS NULL OR (json_valid(campos) AND json_type(campos) = 'array')),
  publico     TEXT NOT NULL DEFAULT 'interno' CHECK (publico IN ('interno','usuario','usuario_admin','admin')),
  usuario_id  TEXT,
  trace_id    TEXT,
  ator_id     TEXT,
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (publico IN ('interno','admin') OR usuario_id IS NOT NULL),
  CHECK (op = 'delete' OR patch IS NOT NULL)
) STRICT;
CREATE INDEX evento_tempo_ix ON evento (criado_em);        -- poda diária: guarda 7 dias

CREATE TABLE tarefa_execucao (                             -- jobs diários (backup, poda, lixo, prazo): última execução
  nome    TEXT PRIMARY KEY,
  ultima_em TEXT NOT NULL,
  ok      INTEGER NOT NULL CHECK (ok IN (0,1)),
  detalhe TEXT
) STRICT;

-- ═════════════════════════════ gatilhos: nada se apaga ═════════════════════════════

CREATE TRIGGER usuario_sem_delete BEFORE DELETE ON usuario
BEGIN SELECT RAISE(ABORT, 'usuario_nao_se_apaga: desative'); END;
CREATE TRIGGER cliente_sem_delete BEFORE DELETE ON cliente
BEGIN SELECT RAISE(ABORT, 'cliente_nao_se_apaga: use status ex'); END;
CREATE TRIGGER demanda_sem_delete BEFORE DELETE ON demanda
BEGIN SELECT RAISE(ABORT, 'demanda_nao_se_apaga: arquive ou anonimize'); END;

-- ═════════════════════════════ gatilhos: atualizado_em ═════════════════════════════

CREATE TRIGGER usuario_atualizado_em AFTER UPDATE ON usuario WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE usuario SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER equipe_atualizado_em AFTER UPDATE ON equipe WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE equipe SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER cliente_atualizado_em AFTER UPDATE ON cliente WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE cliente SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER cliente_contato_atualizado_em AFTER UPDATE ON cliente_contato WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE cliente_contato SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER tipo_peca_atualizado_em AFTER UPDATE ON tipo_peca WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE tipo_peca SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER visao_atualizado_em AFTER UPDATE ON visao WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE visao SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER aviso_atualizado_em AFTER UPDATE ON aviso WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE aviso SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER apontamento_atualizado_em AFTER UPDATE ON apontamento WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE apontamento SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER configuracao_atualizado_em AFTER UPDATE ON configuracao WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE configuracao SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chave = NEW.chave; END;
CREATE TRIGGER demanda_atualizado_em AFTER UPDATE ON demanda WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE demanda SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

-- ═════════════════════════════ gatilhos: integridade de configuração ═════════════════════════════

CREATE TRIGGER etapa_categoria_fixa BEFORE UPDATE OF categoria ON etapa WHEN NEW.categoria IS NOT OLD.categoria
BEGIN SELECT RAISE(ABORT, 'etapa_categoria_fixa'); END;

CREATE TRIGGER tipo_peca_campo_max3_ai AFTER INSERT ON tipo_peca_campo WHEN NEW.obrigatorio = 1
BEGIN
  SELECT RAISE(ABORT, 'tipo_peca_max_3_obrigatorios')
  WHERE (SELECT count(*) FROM tipo_peca_campo WHERE tipo_peca_id = NEW.tipo_peca_id AND obrigatorio = 1) > 3;
END;
CREATE TRIGGER tipo_peca_campo_max3_au AFTER UPDATE OF obrigatorio, tipo_peca_id ON tipo_peca_campo WHEN NEW.obrigatorio = 1
BEGIN
  SELECT RAISE(ABORT, 'tipo_peca_max_3_obrigatorios')
  WHERE (SELECT count(*) FROM tipo_peca_campo WHERE tipo_peca_id = NEW.tipo_peca_id AND obrigatorio = 1) > 3;
END;

CREATE TRIGGER ausencia_sem_sobreposicao_ai BEFORE INSERT ON ausencia WHEN NEW.cancelada_em IS NULL
BEGIN
  SELECT RAISE(ABORT, 'ausencia_sobreposta')
  WHERE EXISTS (SELECT 1 FROM ausencia a WHERE a.usuario_id = NEW.usuario_id AND a.cancelada_em IS NULL
                AND a.de <= NEW.ate AND a.ate >= NEW.de);
END;
CREATE TRIGGER ausencia_sem_sobreposicao_au BEFORE UPDATE OF de, ate, usuario_id, cancelada_em ON ausencia
WHEN NEW.cancelada_em IS NULL
BEGIN
  SELECT RAISE(ABORT, 'ausencia_sobreposta')
  WHERE EXISTS (SELECT 1 FROM ausencia a WHERE a.usuario_id = NEW.usuario_id AND a.cancelada_em IS NULL
                AND a.id <> NEW.id AND a.de <= NEW.ate AND a.ate >= NEW.de);
END;

-- ═════════════════════════════ gatilhos: demanda ═════════════════════════════

CREATE TRIGGER demanda_numero_fixo BEFORE UPDATE OF numero ON demanda WHEN NEW.numero IS NOT OLD.numero
BEGIN SELECT RAISE(ABORT, 'demanda_numero_fixo'); END;

CREATE TRIGGER demanda_status_confere_ai BEFORE INSERT ON demanda
WHEN NEW.status IS NOT (SELECT categoria FROM etapa WHERE id = NEW.etapa_id)
BEGIN SELECT RAISE(ABORT, 'demanda_status_diferente_da_categoria_da_etapa'); END;
CREATE TRIGGER demanda_status_confere_au BEFORE UPDATE OF etapa_id, status ON demanda
WHEN NEW.status IS NOT (SELECT categoria FROM etapa WHERE id = NEW.etapa_id)
BEGIN SELECT RAISE(ABORT, 'demanda_status_diferente_da_categoria_da_etapa'); END;

-- rev sobe só com campos editados por pessoas (contadores, posição e minutos não contam).
-- Se o serviço já subiu o rev na mesma UPDATE, o gatilho não sobe de novo.
CREATE TRIGGER demanda_rev AFTER UPDATE OF
  titulo, cliente_id, tipo_peca_id, equipe_id, etapa_id, bloqueio, bloqueio_motivo, responsavel_id, atendimento_id,
  aprovador_id, briefing_md, briefing_campos, prioridade, prioridade_motivo, prazo, prazo_hora, publicacao_data,
  publicacao_hora, planejada_para, agendada_inicio, agendada_fim, local, estimativa_min, rodadas_inclusas, arquivado_em
ON demanda
WHEN NEW.rev = OLD.rev AND (
     NEW.titulo IS NOT OLD.titulo OR NEW.cliente_id IS NOT OLD.cliente_id OR NEW.tipo_peca_id IS NOT OLD.tipo_peca_id
  OR NEW.equipe_id IS NOT OLD.equipe_id OR NEW.etapa_id IS NOT OLD.etapa_id OR NEW.bloqueio IS NOT OLD.bloqueio
  OR NEW.bloqueio_motivo IS NOT OLD.bloqueio_motivo OR NEW.responsavel_id IS NOT OLD.responsavel_id
  OR NEW.atendimento_id IS NOT OLD.atendimento_id OR NEW.aprovador_id IS NOT OLD.aprovador_id
  OR NEW.briefing_md IS NOT OLD.briefing_md OR NEW.briefing_campos IS NOT OLD.briefing_campos
  OR NEW.prioridade IS NOT OLD.prioridade OR NEW.prioridade_motivo IS NOT OLD.prioridade_motivo
  OR NEW.prazo IS NOT OLD.prazo OR NEW.prazo_hora IS NOT OLD.prazo_hora OR NEW.publicacao_data IS NOT OLD.publicacao_data
  OR NEW.publicacao_hora IS NOT OLD.publicacao_hora OR NEW.planejada_para IS NOT OLD.planejada_para
  OR NEW.agendada_inicio IS NOT OLD.agendada_inicio OR NEW.agendada_fim IS NOT OLD.agendada_fim
  OR NEW.local IS NOT OLD.local OR NEW.estimativa_min IS NOT OLD.estimativa_min
  OR NEW.rodadas_inclusas IS NOT OLD.rodadas_inclusas OR NEW.arquivado_em IS NOT OLD.arquivado_em)
BEGIN UPDATE demanda SET rev = OLD.rev + 1 WHERE id = NEW.id; END;

-- histórico de etapa, bola e pessoa
CREATE TRIGGER demanda_hist_ai AFTER INSERT ON demanda
BEGIN
  INSERT INTO demanda_etapa_hist (demanda_id, etapa_id, status, bola, com_quem_id, responsavel_id, bloqueio, pausa_sla, entrou_em, por)
  VALUES (NEW.id, NEW.etapa_id, NEW.status, NEW.bola, NEW.com_quem_id, NEW.responsavel_id, NEW.bloqueio,
          CASE WHEN NEW.bloqueio = 'cliente' THEN 1 ELSE (SELECT pausa_sla FROM etapa WHERE id = NEW.etapa_id) END,
          NEW.status_desde, NEW.criado_por);
END;
CREATE TRIGGER demanda_hist_au AFTER UPDATE OF etapa_id, bola, com_quem_id, responsavel_id, bloqueio ON demanda
WHEN NEW.etapa_id IS NOT OLD.etapa_id OR NEW.bola IS NOT OLD.bola OR NEW.com_quem_id IS NOT OLD.com_quem_id
  OR NEW.responsavel_id IS NOT OLD.responsavel_id OR NEW.bloqueio IS NOT OLD.bloqueio
BEGIN
  UPDATE demanda_etapa_hist SET saiu_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE demanda_id = NEW.id AND saiu_em IS NULL;
  INSERT INTO demanda_etapa_hist (demanda_id, etapa_id, status, bola, com_quem_id, responsavel_id, bloqueio, pausa_sla, entrou_em, por)
  VALUES (NEW.id, NEW.etapa_id, NEW.status, NEW.bola, NEW.com_quem_id, NEW.responsavel_id, NEW.bloqueio,
          CASE WHEN NEW.bloqueio = 'cliente' THEN 1 ELSE (SELECT pausa_sla FROM etapa WHERE id = NEW.etapa_id) END,
          strftime('%Y-%m-%dT%H:%M:%fZ','now'), NEW.atualizado_por);
END;

-- busca (FTS5, conteúdo externo, rowid = numero)
CREATE TRIGGER demanda_fts_ai AFTER INSERT ON demanda
BEGIN INSERT INTO demanda_fts (rowid, titulo, briefing_md) VALUES (NEW.numero, NEW.titulo, NEW.briefing_md); END;
CREATE TRIGGER demanda_fts_au AFTER UPDATE OF titulo, briefing_md ON demanda
WHEN NEW.titulo IS NOT OLD.titulo OR NEW.briefing_md IS NOT OLD.briefing_md
BEGIN
  INSERT INTO demanda_fts (demanda_fts, rowid, titulo, briefing_md) VALUES ('delete', OLD.numero, OLD.titulo, OLD.briefing_md);
  INSERT INTO demanda_fts (rowid, titulo, briefing_md) VALUES (NEW.numero, NEW.titulo, NEW.briefing_md);
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

CREATE TRIGGER apontamento_somar_ai AFTER INSERT ON apontamento WHEN NEW.demanda_id IS NOT NULL
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

CREATE TRIGGER hist_sem_delete BEFORE DELETE ON demanda_etapa_hist
BEGIN SELECT RAISE(ABORT, 'demanda_etapa_hist_imutavel'); END;
CREATE TRIGGER hist_imutavel BEFORE UPDATE ON demanda_etapa_hist
WHEN NEW.id IS NOT OLD.id OR NEW.demanda_id IS NOT OLD.demanda_id OR NEW.etapa_id IS NOT OLD.etapa_id
  OR NEW.status IS NOT OLD.status OR NEW.bola IS NOT OLD.bola OR NEW.com_quem_id IS NOT OLD.com_quem_id
  OR NEW.responsavel_id IS NOT OLD.responsavel_id OR NEW.bloqueio IS NOT OLD.bloqueio OR NEW.pausa_sla IS NOT OLD.pausa_sla
  OR NEW.entrou_em IS NOT OLD.entrou_em OR NEW.por IS NOT OLD.por OR NEW.parcial IS NOT OLD.parcial
BEGIN SELECT RAISE(ABORT, 'demanda_etapa_hist_imutavel: so saiu_em'); END;

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
  OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.criado_em IS NOT OLD.criado_em
  OR (NEW.ip_hmac IS NOT OLD.ip_hmac AND NEW.ip_hmac IS NOT NULL)
  OR (NEW.user_agent IS NOT OLD.user_agent AND NEW.user_agent IS NOT NULL)
  OR (OLD.anulada_em IS NOT NULL AND NEW.anulada_em IS NOT OLD.anulada_em)
BEGIN SELECT RAISE(ABORT, 'aprovacao_imutavel: so anular uma vez e apagar ip/user-agent'); END;
