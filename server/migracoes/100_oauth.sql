-- 100_oauth.sql (Fase 2, contrato; implementação no F7): o Pauta como servidor de autorização OAuth 2.1 do MCP
-- (docs/API.md §F.2 a §F.4). Só acrescenta tabelas.
--
-- * Registro dinâmico (RFC 7591): o claude.ai cria um cliente a cada conexão nova; a poda diária apaga os que ficaram
--   24 h sem concessão (a FK de oauth_concessao impede apagar cliente que já foi usado).
-- * Pedido de autorização → tela /autorizar?pedido=<id> → decisão → código (uso único, 5 min) → concessão + tokens.
-- * Código, tokens de acesso e de atualização: randomBytes(32) em base64url (com prefixo pauta_at_ / pauta_rt_ nos
--   tokens); o banco guarda só o sha256 hex, como sessão e convite. O id do pedido vai na URL da tela, mas não basta:
--   GET /oauth/autorizar grava no navegador o cookie do pedido (randomBytes(32), 10 min) e guarda só o sha256 em
--   oauth_pedido.navegador_hash; a tela e a decisão exigem sessão, o anti-CSRF de /api E esse cookie (um link
--   /autorizar?pedido= encaminhado a outra pessoa não abre noutro navegador).
-- * Concessão = a "conexão" que a pessoa vê em Configurações → Conexões. Nunca se apaga; revogar uma vez mata o acesso e
--   o refresh de uma vez (nenhum token novo nasce numa concessão revogada). As conexões seguem as sessões: trocar ou
--   redefinir a senha ('credenciais'), mudar o papel ('papel') e desativar ('desativacao') revogam todas as da pessoa.
-- * Conexões MCP ficam FORA da tabela sessao: o IP é o da Anthropic e não pode alimentar pessoasDaRede() (API.md §4.17).

CREATE TABLE oauth_cliente (                               -- registro dinâmico (POST /oauth/registrar)
  id            TEXT PRIMARY KEY,                          -- client_id: aleatório, não é segredo (cliente público)
  nome          TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 120),   -- client_name declarado (texto puro)
  redirect_uris TEXT NOT NULL CHECK (json_valid(redirect_uris) AND json_type(redirect_uris) = 'array'
                                     AND json_array_length(redirect_uris) BETWEEN 1 AND 10),
  tipo          TEXT NOT NULL DEFAULT 'web' CHECK (tipo IN ('web','native')),   -- application_type
  metodo_auth   TEXT NOT NULL DEFAULT 'none' CHECK (metodo_auth IN ('none')),   -- token_endpoint_auth_method
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ultimo_uso_em TEXT                                         -- último pedido de autorização ou troca de token
) STRICT;
CREATE INDEX oauth_cliente_criado_ix ON oauth_cliente (criado_em);

CREATE TABLE oauth_concessao (                             -- "conexão": pessoa + cliente (Configurações → Conexões)
  id               TEXT PRIMARY KEY,
  usuario_id       TEXT NOT NULL REFERENCES usuario(id),
  cliente_id       TEXT NOT NULL REFERENCES oauth_cliente(id),   -- sem cascade: cliente com concessão não é podado
  escopo           TEXT NOT NULL DEFAULT 'pauta' CHECK (escopo IN ('pauta')),
  redirect_uri     TEXT NOT NULL,                            -- o do pedido que a criou: a tela diz "claude.ai" ou
                                                             -- "Claude Code neste computador" (loopback); conferido
                                                             -- contra a lista atual no refresh e no /mcp
  resource         TEXT NOT NULL,                            -- o do pedido, normalizado (= APP_URL + '/mcp'): a
                                                             -- audiência, conferida no refresh e no /mcp
  criada_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ultimo_uso_em    TEXT,                                     -- gravado no máximo a cada 10 min (como a sessão)
  revogada_em      TEXT,
  revogada_por     TEXT REFERENCES usuario(id),              -- nulo: sistema (desativação, reuso, pedido do cliente)
  motivo_revogacao TEXT CHECK (motivo_revogacao IS NULL OR motivo_revogacao IN
                     ('usuario','admin','desativacao','credenciais','papel','reuso_refresh','codigo_reusado',
                      'pedido_cliente','substituida')),
  CHECK ((revogada_em IS NULL) = (motivo_revogacao IS NULL)),
  CHECK (revogada_por IS NULL OR revogada_em IS NOT NULL)
) STRICT;
CREATE INDEX oauth_concessao_usuario_ix ON oauth_concessao (usuario_id, criada_em);
CREATE INDEX oauth_concessao_cliente_ix ON oauth_concessao (cliente_id);
-- reautorizar com o mesmo cliente revoga a anterior ('substituida') antes de criar a nova; a troca do código também
-- revoga as ativas da pessoa com o mesmo destino quando a tela pediu (oauth_pedido.substituir = 1)
CREATE UNIQUE INDEX oauth_concessao_ativa_uk ON oauth_concessao (usuario_id, cliente_id) WHERE revogada_em IS NULL;

CREATE TABLE oauth_pedido (                                -- GET /oauth/autorizar → /autorizar?pedido=<id> → código
  id               TEXT PRIMARY KEY,                       -- randomBytes(32) base64url; vai na URL da tela
  cliente_id       TEXT NOT NULL REFERENCES oauth_cliente(id) ON DELETE CASCADE,
  redirect_uri     TEXT NOT NULL,                          -- um dos registrados (loopback comparado sem a porta)
  code_challenge   TEXT NOT NULL CHECK (length(code_challenge) = 43 AND code_challenge NOT GLOB '*[^A-Za-z0-9_-]*'),
                                                           -- base64url(sha256(verifier)) sem '=': só S256
  escopo           TEXT NOT NULL,                          -- o pedido ('pauta', 'pauta offline_access'); vale 'pauta'
  state            TEXT CHECK (state IS NULL OR length(state) <= 1024),
  resource         TEXT NOT NULL,                          -- normalizado; = APP_URL + '/mcp' (vai para a concessão)
  navegador_hash   TEXT NOT NULL CHECK (length(navegador_hash) = 64 AND navegador_hash NOT GLOB '*[^0-9a-f]*'),
                                                           -- sha256 hex do cookie do pedido gravado no navegador
                                                           -- que abriu /oauth/autorizar (a tela e a decisão exigem)
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expira_em        TEXT NOT NULL,                          -- 10 min
  decisao          TEXT CHECK (decisao IS NULL OR decisao IN ('permitido','negado')),
  decidido_em      TEXT,
  usuario_id       TEXT REFERENCES usuario(id),            -- quem decidiu (a pessoa logada na tela)
  substituir       INTEGER CHECK (substituir IS NULL OR (substituir IN (0,1) AND decisao IS 'permitido')),
                                                           -- 1: a troca do código revoga ('substituida') as conexões
                                                           -- ativas da pessoa com o mesmo destino
  codigo_hash      TEXT UNIQUE,                            -- sha256 do código; só com decisao 'permitido'
  codigo_expira_em TEXT,                                   -- 5 min depois da decisão
  codigo_usado_em  TEXT,                                   -- uso único: UPDATE ... WHERE codigo_usado_em IS NULL, changes = 1
  concessao_id     TEXT REFERENCES oauth_concessao(id),    -- o que o código emitiu (segundo uso revoga: 'codigo_reusado')
  CHECK ((decisao IS NULL) = (decidido_em IS NULL) AND (decisao IS NULL) = (usuario_id IS NULL)),
  CHECK ((codigo_hash IS NOT NULL) = (decisao IS 'permitido')),
  CHECK ((codigo_hash IS NULL) = (codigo_expira_em IS NULL)),
  CHECK (codigo_usado_em IS NULL OR codigo_hash IS NOT NULL),
  CHECK (concessao_id IS NULL OR codigo_usado_em IS NOT NULL)
) STRICT;
CREATE INDEX oauth_pedido_expira_ix ON oauth_pedido (expira_em);
CREATE INDEX oauth_pedido_cliente_ix ON oauth_pedido (cliente_id);

CREATE TABLE oauth_token (                                 -- acesso (1 h) e atualização (sessaoValidadeDias, deslizante)
  hash         TEXT PRIMARY KEY,                           -- sha256 hex do token
  concessao_id TEXT NOT NULL REFERENCES oauth_concessao(id),
  tipo         TEXT NOT NULL CHECK (tipo IN ('acesso','atualizacao')),
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expira_em    TEXT NOT NULL,
  trocado_em   TEXT,                                       -- refresh já usado (rotação). Reuso até 60 s depois: devolve
                                                           -- o MESMO par (filho_cifrado), sem emitir outro; depois
                                                           -- disso: revoga a concessão ('reuso_refresh')
  filho_cifrado TEXT,                                      -- cifrar(JSON {at, rt}, 'oauth_refresh') do par emitido na
                                                           -- troca; só durante a tolerância (a poda e o reuso tardio
                                                           -- apagam): um refresh copiado não abre um ramo novo
  CHECK (trocado_em IS NULL OR tipo = 'atualizacao'),
  CHECK (filho_cifrado IS NULL OR trocado_em IS NOT NULL),
  CHECK (expira_em > criado_em)
) STRICT;
CREATE INDEX oauth_token_concessao_ix ON oauth_token (concessao_id);
CREATE INDEX oauth_token_expira_ix ON oauth_token (expira_em);   -- poda diária dos vencidos

-- a concessão nunca se apaga; muda só o último uso (enquanto ativa) e a revogação (uma vez)
CREATE TRIGGER oauth_concessao_sem_delete BEFORE DELETE ON oauth_concessao
BEGIN SELECT RAISE(ABORT, 'oauth_concessao_imutavel'); END;
CREATE TRIGGER oauth_concessao_imutavel BEFORE UPDATE ON oauth_concessao
WHEN NEW.id IS NOT OLD.id OR NEW.usuario_id IS NOT OLD.usuario_id OR NEW.cliente_id IS NOT OLD.cliente_id
  OR NEW.escopo IS NOT OLD.escopo OR NEW.redirect_uri IS NOT OLD.redirect_uri OR NEW.resource IS NOT OLD.resource
  OR NEW.criada_em IS NOT OLD.criada_em
  OR (OLD.revogada_em IS NOT NULL AND (NEW.revogada_em IS NOT OLD.revogada_em OR NEW.revogada_por IS NOT OLD.revogada_por
      OR NEW.motivo_revogacao IS NOT OLD.motivo_revogacao OR NEW.ultimo_uso_em IS NOT OLD.ultimo_uso_em))
BEGIN SELECT RAISE(ABORT, 'oauth_concessao_imutavel: so ultimo uso e revogar uma vez'); END;

-- nenhum token nasce numa concessão revogada (a corrida entre "Revogar" e uma troca de token perde para a revogação)
CREATE TRIGGER oauth_token_concessao_ativa BEFORE INSERT ON oauth_token
WHEN (SELECT revogada_em FROM oauth_concessao WHERE id = NEW.concessao_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'concessao_revogada'); END;
