-- 103_agenda_externa.sql (Fase 2, contrato; implementação no F9): agendas do Google pelo endereço secreto iCal e as
-- ocorrências em cache (docs/API.md §F.9). Só acrescenta tabelas.
--
-- * O endereço é segredo (quem o tem lê a agenda inteira sem login): guardado só cifrado (cifrar(url, 'agenda_ical'),
--   AES-256-GCM com chave derivada do SEGREDO), nunca volta ao navegador nem vai ao log. A tela mostra `url_dica`.
-- * A busca roda a cada 15 min (e "Atualizar agora"); uma busca boa SUBSTITUI as ocorrências da agenda numa transação.
--   Corpo igual ao anterior (hash sem as linhas DTSTAMP, que o Google regrava a cada pedido): nada é escrito.
-- * Ocorrências de hoje − 30 a hoje + 180 dias (São Paulo), já expandidas (RRULE, EXDATE, exceções, canceladas fora).
--   Convidados e organizador nunca são guardados. Evento privado vira "Ocupado", sem local, descrição nem link.
-- * Dia inteiro guarda só datas; o resto guarda instantes UTC. dia_inicio/dia_fim (São Paulo, inclusive) servem às duas
--   formas na consulta por período: dia_inicio <= :ate AND dia_fim >= :de.

CREATE TABLE agenda_externa (                              -- Configurações → Agendas externas (só admin)
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 60),
  cor            TEXT NOT NULL DEFAULT 'azul'
                 CHECK (cor IN ('ambar','amarelo','rosa','magenta','roxo','berinjela','verde','turquesa','azul','grafite')),
  url_cifrada    TEXT NOT NULL,                             -- "iv.tag.cifra" (servicos/cripto.ts); trocar = colar de novo
  url_dica       TEXT NOT NULL CHECK (length(url_dica) BETWEEN 1 AND 200),   -- "calendar.google.com · <id da agenda> · …a1b2"
  url_hash       TEXT NOT NULL UNIQUE,                      -- hmac da URL normalizada: a mesma agenda não entra duas vezes
  pos            REAL NOT NULL,
  ativa          INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0,1)),   -- pausada: não busca e some da Agenda
  criada_por     TEXT REFERENCES usuario(id),
  criada_em      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- estado da última busca: só contagens, nunca conteúdo
  buscada_em     TEXT,                                      -- última tentativa
  ok_em          TEXT,                                      -- última busca boa (as ocorrências são dela)
  erro           TEXT CHECK (erro IS NULL OR erro IN ('endereco_invalido','endereco_ilegivel','nao_e_ical',
                   'grande_demais','tempo_esgotado','fora_do_ar','teto_ocorrencias')),   -- da última tentativa
  hash_conteudo  TEXT,                                      -- sha256 do corpo sem as linhas DTSTAMP
  contagens      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(contagens) AND json_type(contagens) = 'object'),
                                                            -- ContagensAgenda (shared/tipos/agenda-externa.ts)
  ocorrencias_em TEXT,                                      -- quando as ocorrências mudaram (o front invalida por ele)
  CHECK (ok_em IS NULL OR buscada_em IS NOT NULL)
) STRICT;
CREATE INDEX agenda_externa_pos_ix ON agenda_externa (pos);

CREATE TRIGGER agenda_externa_atualizado_em AFTER UPDATE ON agenda_externa WHEN NEW.atualizado_em IS OLD.atualizado_em
BEGIN UPDATE agenda_externa SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TABLE agenda_ocorrencia (
  agenda_id    TEXT NOT NULL REFERENCES agenda_externa(id) ON DELETE CASCADE,
  chave        TEXT NOT NULL CHECK (length(chave) BETWEEN 1 AND 400),   -- UID + início original em UTC: estável entre
                                                                         -- buscas (o front não pisca)
  titulo       TEXT NOT NULL CHECK (length(titulo) BETWEEN 1 AND 300),  -- "(sem título)"; privado: "Ocupado"
  dia_inteiro  INTEGER NOT NULL CHECK (dia_inteiro IN (0,1)),
  inicio       TEXT,                                       -- instante UTC; nulo no dia inteiro
  fim          TEXT,                                       -- instante UTC, exclusivo (sem DTEND: = início)
  dia_inicio   TEXT NOT NULL,                              -- data de São Paulo do início (dia inteiro: a do evento)
  dia_fim      TEXT NOT NULL,                              -- último dia de São Paulo ocupado, inclusive
  local        TEXT CHECK (local IS NULL OR length(local) <= 300),
  link_reuniao TEXT CHECK (link_reuniao IS NULL OR (link_reuniao LIKE 'https://%' AND length(link_reuniao) <= 500)),
  descricao    TEXT CHECK (descricao IS NULL OR length(descricao) <= 2048),   -- texto puro (o HTML do Google vira texto)
  tentativo    INTEGER NOT NULL DEFAULT 0 CHECK (tentativo IN (0,1)),
  livre        INTEGER NOT NULL DEFAULT 0 CHECK (livre IN (0,1)),          -- TRANSP:TRANSPARENT
  privado      INTEGER NOT NULL DEFAULT 0 CHECK (privado IN (0,1)),        -- CLASS:PRIVATE/CONFIDENTIAL
  PRIMARY KEY (agenda_id, chave),
  CHECK (dia_inicio <= dia_fim),
  CHECK ((dia_inteiro = 1) = (inicio IS NULL) AND (inicio IS NULL) = (fim IS NULL)),
  CHECK (inicio IS NULL OR fim >= inicio),
  CHECK (privado = 0 OR (local IS NULL AND descricao IS NULL AND link_reuniao IS NULL))
) STRICT;
CREATE INDEX agenda_ocorrencia_dia_ix ON agenda_ocorrencia (dia_inicio, dia_fim);
