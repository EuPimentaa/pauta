# Pedidos do F8 (resultados da Windsor) ao integrador

Branch `fase2/resultados`. Nada aqui bloqueia o merge: cada item já tem o contorno local descrito.

## 1. Contrato (docs/API.md §F.8) — atualizar o texto para o que foi feito

1. **Lista de contas com reserva no endpoint de dados.** A API diz "Nunca o endpoint de dados". Por decisão do
   orquestrador (sem a chave real não deu para rodar a pesquisa §10), a lista vem do `ds-accounts` e, **se ele vier
   vazio**, do endpoint de dados com `fields=account_id,account_name` dos últimos 90 dias (traz só as contas com dados,
   então pode faltar conta parada; "Digitar o id" cobre). Sugestão de texto: "Origem: `ds-accounts`; vazio, o endpoint
   de dados com os campos de conta dos últimos 90 dias (incompleto: só contas com dados)".
2. **Chamada 5 (GA4 diário) leva também `active_users`**: a série diária de usuários (`PontoGa4.usuarios`, soma dos
   usuários de cada dia) não tinha de onde vir. O KPI `usuarios` continua vindo do total do período (chamadas 6–7).
   Mesmo número de chamadas.
3. **Carteira (panorama): a chamada do período atual de Meta e Google Ads é com `date`** (de `min(de, ate − 7)` a `ate`),
   não "sem `date`": assim os números da carteira são a mesma soma dos dias da aba (o total sem `date` da Windsor difere
   em centavos da soma dos dias, medido na fixture: 246,81 × 246,83) e dá para calcular o "parou de gastar" sem chamada a
   mais. A do período anterior e as do GA4 seguem sem `date`. Continua em 6 chamadas. GA4 na carteira: sessões e
   eventos-chave vêm do total do período (pode diferir em poucas unidades da soma diária da aba com a Windsor real).
4. **`parou_de_gastar` só quando o período termina ontem** (todos menos "Mês passado", que não fala de ontem).
5. **500 das rotas da Fase 2:** a §F.1 diz `500 erro_interno`, mas `CODIGOS_ERRO` não tem esse código (e "nenhum código
   novo"); as rotas do F8 devolvem `500 interno` (o que existe). Sugestão: trocar `erro_interno` por `interno` na §F.1.
6. **Depois de um erro, a busca automática espera 10 min** (para a Windsor fora do ar não levar uma chamada por abertura
   de tela); o "Atualizar agora" não espera. Vale acrescentar à regra do cache.

## 2. Migração 120 (faixa do F8) — conferência no `server/scripts/verificar-migracoes.ts`

`120_resultados_panorama.sql` cria `resultado_panorama_cache` (o cache da carteira, mesmas regras do `resultado_cache`)
e `windsor_lista` (quando a lista de cada conector foi buscada; sem ela, uma lista vazia seria buscada de novo a cada
abertura). Os testes do F8 conferem os CHECK (`server/test/resultados-provedor.test.ts`). Pedido: acrescentar ao
verificador (arquivo do integrador):
- `TABELAS_FASE2` += `resultado_panorama_cache`, `windsor_lista`;
- `mesmaLista('resultado_panorama_cache', 'conector', CONECTORES_WINDSOR)`, `mesmaLista('resultado_panorama_cache',
  'erro', ERROS_WINDSOR)`, `mesmaLista('windsor_lista', 'conector', CONECTORES_WINDSOR)`, `mesmaLista('windsor_lista',
  'erro', ERROS_WINDSOR)`;
- índice `resultado_panorama_cache_tentado_ix`.

## 3. Cores (FASE2-PLANO §0, regra 9)

**Nenhum par novo.** Tudo o que o F8 desenha usa pares que o `web/scripts/contraste.ts` já confere:

| Uso | Texto/marca | Fundo |
|---|---|---|
| Variação boa / ruim (cartões, carteira) | `--success-ink` / `--danger-ink` | `--surface` |
| Variação neutra, rótulos | `--text-2` | `--surface` |
| Faixa "Atenção" | `--warning-ink` | `--warning-bg` |
| Ícone de alerta na carteira | `--warning-ink` | `--surface` |
| Chip escolhido do gráfico | `--accent-ink` | `--accent-soft` |
| Linha do período atual (marca, 3:1) | `--accent` | `--surface` |
| Linha tracejada do anterior, eixo | `--text-3` | `--surface` |
| Aviso do canal ("A Windsor não respondeu…") | `--text` | `--surface-sunken` |

A paleta do gráfico (laranja + cinza, forma "ênfase") passou no validador da skill dataviz na separação para daltonismo
(ΔE 12,6 protan no claro, 13,8 no escuro), na visão normal e no contraste com a superfície; o "piso de croma" acusa o
cinza, que é de propósito (o anterior é contexto, e ainda vai tracejado: segunda codificação).

## 4. README (seção "Fase 2")

Levar `docs/fase2/operacao-resultados.md`. A variável `WINDSOR_API_KEY` já está no `.env.example` (sem mudança).

## 5. Para o F7 (MCP) e o teste de integração (§6, passo 3)

- `server/src/provedores/resultados.ts` exporta `provedor` (`tipo: 'resultados'`, `resultados` e `panorama`), nunca
  lança e respeita `esperarMs` e `buscar`. Com `WINDSOR_API_KEY=fixtures` (dev) e o `seed:demo`, a CLA tem as 3 contas das
  fixtures ligadas.
- Nos testes, `definirBuscaWindsor()` (server/src/servicos/resultados-windsor.ts) troca a busca; `esperarBuscas(db)`
  (server/src/servicos/resultados.ts) espera as buscas em segundo plano; `server/test/resultados-ajuda.ts` sobe um
  servidor falso da Windsor com as fixtures (`windsorFalsa()` + `definirEnderecosWindsor`).
- O `texto` dos alertas e os KPIs saem de `shared/logica/resultados-alertas.ts` e `resultados-formato.ts`: os mesmos na
  aba, na carteira e no provedor (teste em `resultados-provedor.test.ts`).
