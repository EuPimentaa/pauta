-- 102_resultados_windsor.sql (Fase 2, contrato; implementação no F8): contas da Windsor ligadas a cada cliente e o
-- cache dos resultados (docs/API.md §F.8). Só acrescenta tabelas.
--
-- * A chave da Windsor (WINDSOR_API_KEY) fica só no ambiente do servidor; nada aqui a guarda.
-- * Conectores = CONECTORES_WINDSOR (shared/tipos/resultados.ts). Ids de conta só com dígitos e hífen: vão separados
--   por vírgula em select_accounts (Meta sem o "act_", Google Ads "000-000-0001", GA4 o id da propriedade).
-- * O cache guarda o ResultadoConector JÁ CALCULADO (KPIs dos dois períodos, série diária, campanhas; shared/tipos),
--   por cliente, conector e datas explícitas de São Paulo (não pelo nome do período: "este mês" muda de datas a cada
--   dia). `contas` diferente das ligadas agora = desatualizado (ligar ou desligar uma conta invalida sozinho).

CREATE TABLE windsor_conta (                               -- lista de contas da Windsor (cache de 24 h, "Recarregar lista")
  conector TEXT NOT NULL CHECK (conector IN ('facebook','google_ads','googleanalytics4')),
  conta_id TEXT NOT NULL CHECK (length(conta_id) BETWEEN 1 AND 40 AND conta_id NOT GLOB '*[^0-9-]*'),
  nome     TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),
  status   TEXT CHECK (status IS NULL OR length(status) <= 40),   -- como a Windsor devolve (só exibido)
  vista_em TEXT NOT NULL,                                   -- última lista que a trouxe (a que sumir fica com o nome antigo)
  PRIMARY KEY (conector, conta_id)
) STRICT;

CREATE TABLE cliente_conta_resultados (                    -- "Contas de resultados" do cliente (várias por conector)
  id         TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES cliente(id),
  conector   TEXT NOT NULL CHECK (conector IN ('facebook','google_ads','googleanalytics4')),
  conta_id   TEXT NOT NULL CHECK (length(conta_id) BETWEEN 1 AND 40 AND conta_id NOT GLOB '*[^0-9-]*'),
  nome       TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),   -- o nome da conta quando foi ligada
  ligada_por TEXT REFERENCES usuario(id),
  ligada_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (cliente_id, conector, conta_id)                  -- desligar = DELETE (a atividade cliente.editado registra)
) STRICT;
CREATE INDEX cliente_conta_resultados_conta_ix ON cliente_conta_resultados (conector, conta_id);

CREATE TABLE resultado_cache (
  cliente_id   TEXT NOT NULL REFERENCES cliente(id),
  conector     TEXT NOT NULL CHECK (conector IN ('facebook','google_ads','googleanalytics4')),
  de           TEXT NOT NULL,                               -- período atual (A), datas de São Paulo, inclusive
  ate          TEXT NOT NULL,
  de_anterior  TEXT NOT NULL,                               -- período de comparação (B), logo antes de A
  ate_anterior TEXT NOT NULL,
  contas       TEXT NOT NULL CHECK (json_valid(contas) AND json_type(contas) = 'array'),   -- ids usados, em ordem
  dados        TEXT CHECK (dados IS NULL OR (json_valid(dados) AND json_type(dados) = 'object')),
                                                            -- ResultadoConector sem conector/estado/buscadoEm (colunas)
  buscado_em   TEXT,                                        -- última busca boa (a tela diz "dados de 14:05")
  tentado_em   TEXT NOT NULL,                               -- última tentativa, boa ou não
  erro         TEXT CHECK (erro IS NULL OR erro IN
                 ('chave_invalida','fora_do_ar','limite','conta_nao_conectada','resposta_invalida')),
                                                            -- da última tentativa; os dados de antes continuam valendo
  PRIMARY KEY (cliente_id, conector, de, ate, de_anterior, ate_anterior),
  CHECK (de <= ate AND de_anterior <= ate_anterior AND ate_anterior < de),
  CHECK ((dados IS NULL) = (buscado_em IS NULL))
) STRICT;
CREATE INDEX resultado_cache_tentado_ix ON resultado_cache (tentado_em);   -- poda diária (7 dias sem uso)

CREATE TABLE windsor_uso (                                 -- cota da Windsor (10.000/dia; o Pauta para em 8.000) e saúde
  dia            TEXT PRIMARY KEY,                          -- data de São Paulo
  chamadas       INTEGER NOT NULL DEFAULT 0 CHECK (chamadas >= 0),
  erros          INTEGER NOT NULL DEFAULT 0 CHECK (erros >= 0),
  ultimo_erro    TEXT CHECK (ultimo_erro IS NULL OR ultimo_erro IN
                   ('chave_invalida','fora_do_ar','limite','conta_nao_conectada','resposta_invalida')),
  ultimo_erro_em TEXT,
  CHECK ((ultimo_erro IS NULL) = (ultimo_erro_em IS NULL))
) STRICT;
