-- 101_mcp_via_claude.sql (Fase 2, contrato; implementação no F7): a marca "via Claude" no histórico, sem mexer em
-- `atividade` nem em `evento` (docs/API.md §F.6).
--
-- Cada chamada de ferramenta do MCP que escreve roda com um trace próprio, 'mcp-' + uuid v4 (o navegador nunca consegue
-- mandar esse formato: o anti-CSRF exige uuid v4 puro nas mutações). O /mcp grava a linha abaixo NA MESMA transação do
-- serviço (tx() é reentrante): se a ferramenta falha, o traço some junto. Tudo o que o serviço registra com esse trace
-- (atividade.trace_id, evento.trace_id, inclusive o que uma automação disparada por ele fizer) é "via Claude":
--
--   atividade a LEFT JOIN mcp_traco m ON m.trace_id = a.trace_id AND m.usuario_id = a.ator_id   → via = 'claude'
--
-- O traço é trilha como `atividade`: não muda nem se apaga.

CREATE TABLE mcp_traco (
  trace_id     TEXT PRIMARY KEY CHECK (trace_id GLOB 'mcp-*' AND length(trace_id) = 40),   -- 'mcp-' + uuid v4
  concessao_id TEXT NOT NULL REFERENCES oauth_concessao(id),
  usuario_id   TEXT NOT NULL REFERENCES usuario(id),        -- o dono da concessão (conferido abaixo)
  ferramenta   TEXT NOT NULL CHECK (length(ferramenta) BETWEEN 1 AND 64 AND ferramenta NOT GLOB '*[^a-z_]*'),
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX mcp_traco_concessao_ix ON mcp_traco (concessao_id, criado_em);

CREATE TRIGGER mcp_traco_da_pessoa BEFORE INSERT ON mcp_traco
WHEN NEW.usuario_id IS NOT (SELECT usuario_id FROM oauth_concessao WHERE id = NEW.concessao_id)
BEGIN SELECT RAISE(ABORT, 'mcp_traco_de_outra_pessoa'); END;
CREATE TRIGGER mcp_traco_concessao_ativa BEFORE INSERT ON mcp_traco
WHEN (SELECT revogada_em FROM oauth_concessao WHERE id = NEW.concessao_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'concessao_revogada'); END;
CREATE TRIGGER mcp_traco_sem_delete BEFORE DELETE ON mcp_traco
BEGIN SELECT RAISE(ABORT, 'mcp_traco_imutavel'); END;
CREATE TRIGGER mcp_traco_sem_update BEFORE UPDATE ON mcp_traco
BEGIN SELECT RAISE(ABORT, 'mcp_traco_imutavel'); END;
