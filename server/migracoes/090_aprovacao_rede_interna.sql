-- 090_aprovacao_rede_interna.sql (integração, segurança da leva 2): a decisão pelo link que veio da mesma rede de uma
-- sessão interna das últimas 24 h (IPv4 igual, IPv6 no mesmo /64) guarda quem eram essas pessoas (API.md §4.17). Com o
-- endereço do link, alguém da agência pode decidir fora do app (aba anônima, outro aparelho, curl) como se fosse o
-- cliente; a marca não recusa (o cliente pode estar na rede da agência), mas deixa a decisão distinguível na trilha.
-- Só acrescenta: coluna anulável (JSON com a lista de ids) e o gatilho que a mantém imutável como o resto da decisão.

ALTER TABLE aprovacao ADD COLUMN rede_interna TEXT
  CHECK (rede_interna IS NULL OR (json_valid(rede_interna) AND json_type(rede_interna) = 'array'));

CREATE TRIGGER aprovacao_rede_interna_imutavel BEFORE UPDATE OF rede_interna ON aprovacao
WHEN NEW.rede_interna IS NOT OLD.rede_interna
BEGIN SELECT RAISE(ABORT, 'aprovacao_imutavel: so anular uma vez e apagar ip/user-agent'); END;
