# Pedidos do DESIGN-SYSTEM-WEB (Onda 1)

Mudanças em arquivos de outros donos que o design system precisa. Nada aqui bloqueia a Onda 2: cada item diz o
contorno em uso.

## 1. Nome do produto antes do login (NÚCLEO-SERVIDOR · `server/src/web.ts`)

**Pedido:** ao servir o `index.html` (fallback de SPA), trocar `Pauta` pelo `APP_NOME` em
`<meta name="application-name" content="Pauta" />` e em `<title>Pauta</title>`, com o valor escapado para HTML.
Ler o arquivo uma vez e guardar o resultado (ele já é servido com `Cache-Control: no-cache`).

**Por quê:** antes do login não há bootstrap; o front lê o nome do produto dessa meta (`web/src/lib/app.ts`) para
as telas de entrar, convite e redefinição e para o título da aba. Hoje o servidor entrega o arquivo como está, então
com `APP_NOME=Outro` essas telas ainda dizem "Pauta" (depois do login o nome certo chega pelo `bootstrap.app.nome`).

**Contorno:** nenhum necessário com o padrão (`APP_NOME` ausente = "Pauta").

## 2. Cor da pessoa no convite (contrato `shared/tipos/pessoas.ts` + NÚCLEO-SERVIDOR)

**Pedido:** `TokenAcessoInfo` ganhar `cor: Cor` (a cor da pessoa do convite ou da redefinição), devolvida por
`POST /api/auth/convite/consultar` e `POST /api/auth/redefinicao/consultar`.

**Por quê:** a tela `/convite` mostra o avatar de quem está sendo convidado. Sem a cor, o avatar sai com a cor
calculada pelo nome, e a pessoa se vê numa cor no convite e em outra dentro do app.

**Contorno em uso:** `Avatar` com a cor por hash do nome (`web/src/telas/auth/TelaDefinirSenha.tsx`). Quando o campo
existir, basta passar `cor: consulta.data.cor`.

## Avisos para quem vem depois (não são pedidos)

- `web/tsconfig.json` agora tem `noUnusedLocals: true`. Ele inclui `../shared`, então import ou variável sem uso em
  `shared/**` também derruba o `tsc -p web`.
- O build do front falha se o CSS perder o `light-dark()` nativo (plugin `pauta:light-dark-nativo` em
  `web/vite.config.ts`, com `build.cssTarget` nos navegadores de 2024). Sem isso, a barra superior escura saía com o
  logo laranja em produção.
- Portais das camadas: use `raizCamadas()` (`web/src/lib/camadas.ts`), nunca `document.getElementById('camadas')`;
  o contêiner agora é `#pauta-camadas`, sempre filho do `<body>`.
- Rota sobreposta: o App a desenha fora da árvore de rotas, quando a área autenticada está pronta
  (`marcarAreaPronta` em `web/src/sessao/sobreposta.tsx`). Telas sobrepostas usam `useFecharSobreposta()` e
  `useFundo()` como antes.
- Foco inicial de modal, folha e popover: `[data-autofocus]`; senão o primeiro focável que não seja o "Fechar" do
  cabeçalho (que leva `data-foco-por-ultimo`). Num diálogo de confirmação, ponha o Cancelar antes da ação no rodapé.
