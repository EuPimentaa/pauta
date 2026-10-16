# Pedidos do NÚCLEO-WEB (Onda 2)

Mudanças em arquivos de outros donos que o núcleo-web precisa. Nada aqui bloqueia a Onda 3: cada item diz o
contorno em uso.

## 1. Os exemplos de `/dev/extensoes` entram nas listas normais (DESIGN-SYSTEM-WEB · `web/src/extensoes/registro.ts`)

**Pedido:** nos `import.meta.glob` do registro, trocar o padrão negativo `'!./*/nucleo-exemplo*'` por
`'!**/nucleo-exemplo*'` (em todos os globs que separam os exemplos).

**Por quê:** com o Vite 8 deste repositório, `'!./*/nucleo-exemplo*'` não tira nada: os arquivos
`extensoes/*/nucleo-exemplo*` entram também nas listas normais, mesmo com `ligarExemplos(false)`. Conferido com um
arquivo de prova: `'!**/nucleo-exemplo*'` exclui; `'!./*/nucleo-exemplo*'` não. Sem o contorno abaixo, os exemplos
(seções do modal, ações, itens de menu, layouts, um interceptador que pergunta a cada arraste) apareceriam no app
inteiro em desenvolvimento e iriam para o build de produção.

**Contorno em uso:** cada contribuição de exemplo exporta `undefined` fora do DEV (`import.meta.env.DEV ? {...} :
undefined`, com o `lazy()` dentro do ramo de DEV) e, em DEV, só age com `exemplosAtivos()` verdadeiro (tela
`/dev/extensoes` aberta ou "Manter os exemplos ligados"). O build de produção não tem código de exemplo. O que o
contorno não cobre: a aba "Exemplo" do celular (`extensoes/celular/nucleo-exemplo.tsx`) aparece na barra do celular
em desenvolvimento, porque `ExtensaoAbaCelular` não tem `visivel`. Com o pedido feito, nada muda nos exemplos.

## 2. O proxy do Vite segura o SSE quando a API cai (DESIGN-SYSTEM-WEB · `web/vite.config.ts`)

**Pedido:** no proxy de `/api`, fechar a resposta do navegador quando a resposta da API fecha antes do fim:

```ts
proxy: {
  '/api': {
    target: API,
    // a API caiu no meio de um SSE: fecha a resposta do navegador também (sem isto o EventSource fica aberto e calado)
    configure: (proxy) => proxy.on('proxyRes', (res, _req, saida) => res.on('close', () => { if (!saida.writableEnded) saida.destroy() })),
  },
},
```

O `preview` usa o mesmo proxy.

**Por quê:** com o servidor derrubado, o `http-proxy` do Vite não fecha a resposta do `/api/eventos`: o EventSource
fica `OPEN`, sem erro, para sempre. Medido (dev e preview): nenhuma faixa "Sem conexão" e, depois que a API volta, o
quadro não recebe mais nada até recarregar. Com o Node servindo direto (produção) o navegador vê a queda na hora: a
faixa aparece em 2,5 s e a retomada não duplica cards. Com a configuração acima (testada com uma cópia do
`vite.config.ts`), o dev se comporta como a produção.

**Contorno em uso:** o cliente SSE (`web/src/tempo-real/conexao.ts`) dá o fluxo por morto depois de 45 s sem evento
nem ping (o servidor manda ping a cada 25 s), fecha, mostra a faixa e reabre com `?desde=`. Vale também para um proxy
de produção que segure a ligação. Em dev, sem o pedido, a faixa leva uns 45 s para aparecer.

## 3. Os layouts de exemplo usam os ids `lista` e `calendario` (F6 · `lista`)

**Pedido:** ao trazer os layouts Lista e Calendário de verdade, apague `web/src/extensoes/layouts/nucleo-exemplo-lista.tsx`
e `web/src/extensoes/layouts/nucleo-exemplo-calendario.tsx` (são do NÚCLEO-WEB; está autorizado).

**Por quê:** os exemplos usam os mesmos ids para o `?v=lista` e o `?v=calendario` serem testáveis em `/dev/extensoes`.
Com os de verdade, em DEV, o seletor de visão teria dois de cada enquanto os exemplos estiverem ligados.

**Contorno:** nenhum necessário até lá (os exemplos só aparecem com eles ligados, nunca em produção).

## Avisos para quem vem depois (não são pedidos)

- **Testes do núcleo-web** ficam em `server/test/nucleo-web-*.test.ts` (com `nucleo-web-ajuda.ts`): o único executor
  é o `node --test` do `npm test`. Módulos do `web/src` testados no Node importam `shared/**` por caminho relativo e
  tipos com `import type` (o alias `@shared` só existe no Vite).
- **`/a/:token` é do F2.** O critério "`/a/qualquer` não chama `/api/bootstrap` nem abre SSE nem baixa
  `registro.ts`" depende de a rota pública existir; hoje `/a/qualquer` cai em "Página não encontrada" dentro da área
  autenticada. O mecanismo foi conferido com `/convite` (rota pública): nenhuma chamada a `/api/*` e nenhum
  `registro-*.js`.
- **"Mover para…" é do F1** (`abrirDialogo('mover-demanda', …)`, usado pelos botões de coluna e quadro no topo do
  modal). Até o F1 registrar o diálogo, eles mostram "Disponível em breve". O critério "um interceptador que abre um
  diálogo de dentro do 'Mover para…' empilha e devolve o foco" foi conferido com o diálogo do interceptador de
  exemplo (que abre outro por cima); falta repetir com o diálogo do F1.
- **`PATCH /api/demandas/:id` ignora campo desconhecido** (`{ "descricao": … }` em vez de `descricaoMd`) e responde
  200 sem mudar nada nem subir o `rev`. Se algum dia virar `400 validacao`, erro de digitação no front aparece logo.
  Só observação para o NÚCLEO-SERVIDOR.
