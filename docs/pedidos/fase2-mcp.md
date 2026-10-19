# Pedidos do F7 (MCP) ao integrador — Fase 2

Branch `fase2/mcp`. Cada item tem o contorno local que já está no código.

1. **Log do id do pedido** (`server/src/app.ts`, `caminhoParaLog`): o log de requisição imprime
   `/api/oauth/pedidos/<id>` e `/api/oauth/pedidos/<id>/decisao`. O id sozinho não abre nada (exige a sessão e o cookie
   do pedido, amarrado ao navegador), mas é melhor não ficar no log. Pedido: acrescentar
   `.replace(/^\/api\/oauth\/pedidos\/[^/]+/, '/api/oauth/pedidos/***')`. Contorno: nenhum (o teste
   `mcp-seguranca.test.ts` não conta o id como segredo e cita este pedido).

2. **`ErroOAuth` sem `invalid_target` e `server_error`** (`shared/tipos/mcp.ts`): a API §F.3 usa `invalid_target`
   (RFC 8707: `resource` de outro servidor no autorizar, na troca do código e no refresh) e o `500` de `/oauth/*` sai
   como `server_error` (§F.1). Pedido: acrescentar os dois à união de `ErroOAuth.error`. Contorno: o tipo local
   `CodigoErroOAuth` em `server/src/servicos/oauth.ts`.

3. **Plano B do protocolo** (FASE2-PLANO §0 regra 5 e §3.F7; API §F.5 item 4): a SDK `@modelcontextprotocol/server`
   2.3.1 não pôde ser integrada no ambiente desta worktree, então o `/mcp` é o JSON-RPC à mão (só a era 2025; um cliente
   só-2026 recebe `400` e volta ao `initialize`). `server/package.json` e `package-lock.json` não mudaram. Pedido:
   registrar a decisão na API §F.5 (o `server/discover` da era 2026 fica para quando a SDK entrar; troca só
   `servicos/mcp.ts`).

4. **Detalhe novo no 410 da tela** (`GET /api/oauth/pedidos/:id` e a decisão): `detalhes.motivo` =
   `outro_navegador` | `vencido` | `decidido`, para a tela escolher o texto ("Abra a conexão pelo Claude neste
   navegador." / "Este pedido expirou."). Acréscimo, nada muda para quem ignora. Pedido: anotar na API §F.3.

5. **Formato da `agenda` e do `listar`** (API §F.5, só exemplos): para caber no `ORCAMENTO_MCP` com o seed (300 cards
   na Criação), a linha de demanda da `agenda` não repete a coluna e, quando só um campo é pedido, não repete o nome dele
   (uma linha "Prazos das demandas por dia." no topo). O `listar` mostra até 60 itens e "+N (use texto para filtrar)",
   sem cursor (o esquema da §F.5 não tem `cursor` no `listar`). Pedido: anotar ou recusar.

6. **Leitura de arquivos do F5** (sem editar): a seção Conexões usa `Painel` de `funcionalidades/cadastros/comum.tsx` e
   o `cadastros.css` para ficar igual às outras seções de Configurações. Se esses mudarem de lugar, a seção acompanha.

7. **README** (§6 passo 4): levar `docs/fase2/operacao-mcp.md` à seção "Fase 2", com o checklist da Cloudflare antes do
   deploy.

8. **Teste de integração** (§6 passo 3): `resumo_cliente` e `agenda` chamam `provedorResultados()` e `provedorAgenda()`
   (`servicos/mcp-provedores.ts`, descoberta de `server/src/provedores/*.ts` no boot). Uma exceção do provedor vira
   "Algo deu errado nesta ferramenta (ref mcp-…)" (API §F.5); o provedor de resultados nunca deve lançar.
