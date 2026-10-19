# Operação: resultados da Windsor (F8)

O que a equipe e quem administra o Pauta precisam saber dos resultados de mídia e do site (Fase 2, `docs/FASE2.md` §2;
contrato em `docs/API.md` §F.8). O integrador leva este texto ao `README.md` (seção "Fase 2").

## Ligar

1. No EasyPanel, a variável `WINDSOR_API_KEY` com a chave de API da conta da agência na Windsor.ai. Ela fica só no
   servidor: nunca vai ao navegador, a uma resposta, a um log nem a um commit. Vazia = a aba Resultados mostra "A
   integração com a Windsor não está configurada." (o admin vê "Defina WINDSOR_API_KEY no EasyPanel.").
2. Configurações › **Resultados (Windsor)** (admin e atendimento): a lista de contas da Windsor (Meta Ads, Google Ads e
   GA4), o uso de hoje e, em cada conta, o **"Ligar a…"** com os clientes que a pessoa pode editar. Quando o nome da conta
   tem a sigla, o nome ou um apelido de um cliente, ele já vem marcado (sugestão). Dá para ligar as 42 contas numa tela.
3. Ou na página do cliente › Configurações › **Contas de resultados**: [Ligar conta] (busca na lista ou "Digitar o id"
   para conta que não está nela) e [Desligar].
4. Quem liga e desliga: o admin e o atendimento do cliente (os da carteira e os sem AM), a mesma regra de editar o
   cliente. O Tráfego (papel equipe) vê tudo e usa "Atualizar agora", mas não liga contas.

## O que aparece

- **Aba Resultados** do cliente: período (este mês, mês passado, 7, 30 e 90 dias; todos terminam ontem; na URL
  `?periodo=`), comparação com o período anterior, a faixa **Atenção** (conta que não gastou ontem e gastou nos 7 dias
  antes; custo por resultado ou por conversão +30%; conta não conectada na Windsor), os 4 números principais de cada
  canal (12 cartões), "Mais métricas", a evolução diária (gráfico com o período anterior tracejado, [Ver como tabela]),
  as 10 campanhas de maior investimento e os eventos-chave do GA4.
- **Carteira** (`/resultados`, menu "Resultados"): uma linha por cliente e canal com conta ligada, os mesmos números da
  aba, e a faixa Atenção da carteira inteira.
- **Claude (MCP)**: o `resumo_cliente` lê os mesmos números pelo provedor `server/src/provedores/resultados.ts` (espera
  até 20 s pela Windsor; passou disso, responde com o que houver).

Definições: Meta "Resultados" = leads + conversas iniciadas (o "Resultado" do Gerenciador, que muda com o objetivo, não
vem pela Windsor); alcance (Meta) e usuários (GA4) são o total do período de cada conta, somados entre as contas do
cliente (quem foi alcançado por duas contas conta duas vezes); conversões do Google Ads são fracionárias; ROAS só com
valor > 0.

## Cota, cache e frescor

- Até 8 chamadas por cliente e período (Meta 3, Google Ads 1, GA4 4); a carteira, até 6 para todos os clientes.
- Cache no banco: 3 h; período que terminou há mais de 3 dias, 24 h. Ligar ou desligar uma conta vence o cache do canal.
  Depois de um erro, a próxima tentativa automática só 10 min depois (os dados de antes continuam na tela, com a hora),
  mesmo que os dados de antes ainda estejam na validade: a Windsor voltou, a tela volta sozinha.
- A carteira sem dados de um canal (a busca dela falhou ou ainda não terminou) usa o cache da aba de cada cliente, sem
  chamada a mais: nunca diz "A Windsor não respondeu" para um cliente que a aba mostra.
- O Claude (MCP) busca na Windsor no máximo 10 vezes por pessoa por hora, contando só busca de verdade (ler o cache não
  gasta). Acima disso responde do cache e, no canal sem número, "ainda sem dados (limite de buscas da hora; pergunte de
  novo às HH:MM)".
- "Atualizar agora": 1 por cliente a cada 5 min. O plano Basic da Windsor não força a atualização na fonte: o botão relê
  o que a Windsor tem, e os 3 últimos dias podem chegar com até ~6 h de atraso.
- Teto do Pauta: 8.000 chamadas por dia (São Paulo); a Windsor aceita 10.000. O uso de hoje aparece em Configurações ›
  Resultados (Windsor).
- Lista de contas: cache de 24 h; [Recarregar lista] só o admin, 1 a cada 10 min. A origem é o `ds-accounts` da
  Windsor; se ele vier vazio, o Pauta usa o endpoint de dados com `account_id,account_name` dos últimos 90 dias (traz as
  contas com dados no período). Conta que faltar: "Digitar o id" na página do cliente.
- Tarefa `resultados-poda` (03:40): apaga o cache sem uso há 7 dias e o uso de mais de 90 dias.

## Quando algo dá errado

| Na tela | O que é | O que fazer |
|---|---|---|
| "A chave da Windsor foi recusada. Avise o admin." | 400/401/403 da Windsor (chave errada ou revogada) | Conferir `WINDSOR_API_KEY` no EasyPanel |
| "A Windsor não respondeu. Mostrando os dados de 14:05." | 5xx, rede, 60 s sem resposta, redirecionamento, 429 ou o teto do dia | Esperar; o Pauta tenta de novo depois de 10 min |
| Atenção "a conta X não está conectada na Windsor" | nenhuma das contas pedidas está conectada na Windsor | Reconectar a conta na Windsor, ou desligar no Pauta |
| "Nenhum dado neste período" | a conta não teve entrega (a Windsor devolveu `data: []`) | Nada (conta parada) |

O log do servidor tem uma linha fixa por chamada que falhou, sem a URL nem o texto da Windsor (o erro de chave inválida
devolve a chave no texto): `windsor <conector> http=<status> code=<code>` (ex.: `windsor facebook http=429
code=rate_limit_exceeded`). Exceção inesperada: `resultados <rota>: <erro mascarado>`.

## Desenvolvimento

`WINDSOR_API_KEY=fixtures` (ignorado com `NODE_ENV=production`) faz a busca ler `server/test/fixtures/resultados/` (as
fixtures da pesquisa, com os 7 dias repetidos pelo período pedido e um fator por dia e por conta; `contas-demo.json`
traz contas com nomes dos clientes do `seed:demo` para a sugestão do "Ligar a…"). O `seed:demo` liga as 3 contas das
fixtures à CLA. Os testes usam um servidor falso local (`server/test/resultados-ajuda.ts`) com os erros medidos.

## Pendente com a chave real (depois do deploy)

Os 5 comandos da `docs/fase2/pesquisa-windsor.md` §10, no terminal de quem tem a chave (a chave só no ambiente do
shell), anotando aqui só o resultado (formato, contagens, nomes dos cabeçalhos de cota, tempo), nunca a chave nem nomes
de clientes:

1. `ds-accounts` devolve as 16 + 15 + 11 contas? (se vier `[]`, o Pauta já cai para o endpoint de dados; anotar quantas
   contas cada caminho trouxe);
2. `/{conector}/options` traz a lista de contas?
3. uma chamada de dados igual à `meta-diario-campanha.json`: só `{"data":[...]}`, mesmo arredondamento, tempo;
4. os nomes dos cabeçalhos de cota de uma resposta;
5. `options` pela REST sem erro.

E ainda: o formato real do erro "nenhuma das contas selecionadas está conectada" (não foi medido; o Pauta o reconhece
por um 400/404 cujo texto fala de "account" e, sem isso, mostra "resposta inesperada"); e 2 clientes conferidos contra o
painel da Windsor (investimento e cliques do mesmo período batem; alcance e usuários batem com o total do período).
