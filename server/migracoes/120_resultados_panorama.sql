-- 120_resultados_panorama.sql (Fase 2, F8): o que faltou no contrato (102) para a carteira e a lista de contas. Só
-- acrescenta tabelas.
--
-- * resultado_panorama_cache: a carteira (GET /api/resultados/panorama) faz uma chamada por conector e período com todas
--   as contas ligadas a algum cliente; guarda as somas de cada conta nos dois períodos (DadosPanorama,
--   shared/tipos/ext/resultados.ts), com as mesmas regras do resultado_cache: `contas` diferente das ligadas agora =
--   vencido; erro mantém os dados e o buscado_em de antes.
-- * windsor_lista: quando a lista de contas de cada conector foi buscada (cache de 24 h). Sem ela, uma lista vazia
--   (conta nova na Windsor, chave sem acesso) seria buscada de novo a cada abertura da tela.

CREATE TABLE resultado_panorama_cache (
  conector     TEXT NOT NULL CHECK (conector IN ('facebook','google_ads','googleanalytics4')),
  de           TEXT NOT NULL,                               -- período atual (A), datas de São Paulo, inclusive
  ate          TEXT NOT NULL,
  de_anterior  TEXT NOT NULL,                               -- período de comparação (B)
  ate_anterior TEXT NOT NULL,
  contas       TEXT NOT NULL CHECK (json_valid(contas) AND json_type(contas) = 'array'),   -- ids usados, em ordem
  dados        TEXT CHECK (dados IS NULL OR (json_valid(dados) AND json_type(dados) = 'object')),
  buscado_em   TEXT,                                        -- última busca boa
  tentado_em   TEXT NOT NULL,                               -- última tentativa, boa ou não
  erro         TEXT CHECK (erro IS NULL OR erro IN
                 ('chave_invalida','fora_do_ar','limite','conta_nao_conectada','resposta_invalida')),
  PRIMARY KEY (conector, de, ate, de_anterior, ate_anterior),
  CHECK (de <= ate AND de_anterior <= ate_anterior AND ate_anterior < de),
  CHECK ((dados IS NULL) = (buscado_em IS NULL))
) STRICT;
CREATE INDEX resultado_panorama_cache_tentado_ix ON resultado_panorama_cache (tentado_em);   -- poda diária

CREATE TABLE windsor_lista (
  conector   TEXT PRIMARY KEY CHECK (conector IN ('facebook','google_ads','googleanalytics4')),
  origem     TEXT CHECK (origem IS NULL OR origem IN ('ds_accounts','dados')),   -- de onde veio a última lista boa
  buscada_em TEXT,                                          -- última lista boa
  tentada_em TEXT NOT NULL,                                 -- última tentativa
  erro       TEXT CHECK (erro IS NULL OR erro IN
               ('chave_invalida','fora_do_ar','limite','conta_nao_conectada','resposta_invalida')),
  CHECK ((origem IS NULL) = (buscada_em IS NULL))
) STRICT;
