# Fase 2: Claude (MCP), resultados da Windsor e agenda da Melt

Decisões do dono do produto em 19/10/2026. O Pauta está em produção em `https://demandas.meltcomunicacao.com.br`
(EasyPanel, Cloudflare na frente, `TRUST_PROXY_HOPS=2`). Tudo que valia na Fase 1 (`ARQUITETURA.md`, `ADAPTACOES.md`,
`API.md`, `PLANO.md` §0) continua valendo. Nada pode quebrar o que a equipe já usa.

## 1. MCP: o Claude opera o Pauta (toda a equipe, pelo claude.ai)

- **Servidor MCP remoto dentro do próprio Pauta**, transporte Streamable HTTP em `https://demandas.meltcomunicacao.com.br/mcp`.
  Funciona como **conector personalizado do claude.ai** (e também no Claude Code e no Claude Desktop).
- **Autorização OAuth 2.1 conforme a especificação de autorização do MCP:** o Pauta é o servidor de autorização e o de
  recurso. Metadados (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`), registro
  dinâmico de cliente (RFC 7591), código de autorização com PKCE S256 obrigatório, tokens opacos com hash no banco,
  token de atualização com rotação, `WWW-Authenticate` no 401 do `/mcp`.
- **Cada pessoa autoriza com o próprio login do Pauta** numa tela de consentimento bonita ("O Claude quer acessar o
  Pauta como você"). O Claude age **com as permissões da pessoa** (mesmos papéis e regras por campo da API), e tudo que
  ele fizer fica no histórico como a pessoa, com a marca "via Claude".
- **Configurações → Sua conta → Conexões:** lista as autorizações ativas (cliente, criada em, último uso) e permite
  revogar. O admin vê e revoga as de todos. Desativar a pessoa revoga as conexões dela.
- **Ferramentas** (descrições curtas e respostas enxutas: gastar poucos tokens; ids curtos legíveis como `#123`):
  buscar demandas (filtros), ler demanda completa, minhas demandas/início, agenda por período, criar demanda (com modelo,
  cliente, quadro/coluna, membros, prazo), editar campos, mover (coluna/quadro), comentar, checklist (acrescentar e
  marcar), concluir, arquivar, lançar horas, listar quadros/colunas/clientes/pessoas/modelos, resumo do cliente
  (abertas, com o cliente, atrasadas, aprovações recentes, horas do mês e **resultados da Windsor**), registrar retorno do
  cliente (ajuste/aprovado). Nada que apague definitivamente. Ações com efeito externo (enviar link ao cliente) ficam fora.

## 2. Windsor: resultados dos clientes dentro do Pauta

- A agência tem a Windsor.ai (plano Basic) com Meta Ads (16 contas), Google Ads (15) e GA4 (11).
- **Chave de API da Windsor só no servidor** (`WINDSOR_API_KEY` no EasyPanel). Nunca vai ao navegador nem aos logs.
- **Cada cliente é ligado às suas contas** (Configurações do cliente → "Contas de resultados"): escolhe numa lista que o
  Pauta busca da Windsor (conector + conta). Um cliente pode ter várias contas por conector.
- **Aba "Resultados" na página do cliente:** período (este mês, mês passado, últimos 7/30/90 dias), comparação com o
  período anterior, KPIs por canal — Meta Ads e Google Ads (investimento, impressões, alcance, cliques, CTR, CPC,
  conversões/leads, custo por resultado, valor/ROAS quando houver) e GA4 (usuários, sessões, engajamento, eventos-chave)
  —, evolução diária em gráfico leve (SVG próprio, sem biblioteca), principais campanhas. Estados: sem chave, sem contas
  ligadas, Windsor fora do ar, conta sem dados.
- **Cache no banco** por cliente+período (atualiza no máximo a cada 3 h e com "Atualizar agora"), para não estourar a
  cota da Windsor nem deixar a tela lenta.
- Todos os internos veem (o Tráfego é papel `equipe` e precisa ver). O resumo também vai para o MCP.

## 3. Agenda da Melt (Google Agenda) dentro do Pauta

- **Endereço secreto iCal** do(s) calendário(s) da agência, colado pelo admin em Configurações → "Agendas externas"
  (nome e cor por calendário). Guardado **cifrado** com o `SEGREDO`, nunca devolvido ao navegador depois de salvo.
- O servidor busca o iCal a cada 15 min (e "Atualizar agora"), entende eventos de dia inteiro, fuso horário, eventos
  recorrentes (RRULE com EXDATE e exceções), cancelados, e guarda as ocorrências de −30 a +180 dias.
- **Agenda do Pauta** mostra os eventos junto com os prazos (estilo distinto, só leitura, abre os detalhes: horário,
  local, link da reunião). O **Início** mostra "Hoje na agenda". Filtro para esconder/mostrar cada calendário.
- O MCP também lê esses eventos (agenda por período).

## Restrições

- Migrações novas na faixa **100–199** (só acrescentam). Testes para tudo. Regra 8 do PLANO verde.
- Dependências novas só com justificativa no commit (candidatas: SDK do MCP, biblioteca de iCal).
- O deploy segue igual (Dockerfile); variáveis novas documentadas em `.env.example` e no README.
