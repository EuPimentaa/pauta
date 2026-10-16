# Integração da Onda 2

Feita sobre `0b55baf` (o NÚCLEO-WEB inteiro na `master`), com a revisão funcional e a revisão visual do NÚCLEO-WEB.
Commits da integração: `1e88577..` (lista no fim). A `master` fica pronta para a Onda 3: os worktrees partem daqui.

Ambiente da conferência: API 7329 + Vite 5199 (`DATA_DIR=./data/integrador`, `seed:demo` com `SEED_DEMANDAS=300` e
a Criação completada até 500 cards), build de produção servido pelo Node na 7330 com a CSP real, Chrome headless
próprio (perfil temporário) falando CDP. Credenciais em `.env.integrador` (não versionado). Os roteiros da revisão
(`r08`, `r10`, `r11`, `r12`, `r13`, `r21`, `r23`, `r24`, `r26`, `r27`, `r28`, `r32`) foram rodados de novo contra o
código corrigido.

## Pedidos (`docs/pedidos/*.md`)

| Pedido | O que foi feito | Commit |
|---|---|---|
| nucleo-web 1: exemplos fora das listas | `registro.ts`: padrão negativo `'!**/nucleo-exemplo*'` nos 22 globs. Em DEV a aba "Exemplo" sumiu da barra do celular e nenhum card ganha selo de exemplo; o `/dev/extensoes` continua com todos os exemplos (eles vêm pelo glob próprio). O contorno do núcleo (exportar `undefined` fora do DEV) fica, inofensivo. | `8039afb` |
| nucleo-web 2: proxy do Vite segurando o SSE | `vite.config.ts`: o proxy de `/api` fecha a resposta do navegador quando a da API fecha (o `preview` herda). Medido (r10 via Vite): faixa "Sem conexão" em 4,4 s depois da queda (era 43,8 s) e retomada sem duplicar (283/283). Junto: `api/cliente.ts` trata 502/503/504 sem o corpo de erro da API como falta de conexão (status 0, "Sem conexão com o servidor. Tente de novo em instantes." com "Tentar de novo"), que é o que o Traefik e a Cloudflare devolvem em produção com o container fora. | `8039afb` |
| nucleo-web 3: layouts de exemplo `lista` e `calendario` | Continua valendo, para o **F6**: ao trazer a Lista e o Calendário de verdade, apague `extensoes/layouts/nucleo-exemplo-lista.tsx` e `nucleo-exemplo-calendario.tsx`. | — |
| nucleo-web, "Avisos" | Não são pedidos; seguem valendo. O `PATCH` que ignora campo desconhecido fica como observação (mudar para `400` é contrato da API). | — |

Nenhum pedido pediu banco: nenhuma migração 090–099.

## Achados funcionais

| # | Achado | O que foi feito | Conferido (antes → depois) |
|---|---|---|---|
| 1 | alta: resposta velha da mutação pisa no evento mais novo | `cache.ts`: `aplicarDemandaDoServidor(qc, d, mutacao)` recebe os campos da mutação e a demanda como ficou na tela logo depois da mudança otimista. Com o cache mais novo que a resposta, `camposDaResposta` só corrige o campo que o cache ainda tem como a mutação deixou (nenhum evento o tocou depois) e o `rev` nunca desce (sobe se a resposta for de um rev maior). `acoes.ts`: mover, editar (também depois da mescla do 409), concluir e membros/etiquetas passam a mutação. Fora do bootstrap vale o detalhe aberto (`demandaConhecida`). | r08: mover "p1 Rafa, servidor Léo" → p1, p2 e servidor em Léo; título "p1 'Título de p1', servidor 'Título de p2' rev 3" → p1 'Título de p2' rev 3, e a edição seguinte de p1 vai com 200 direto (era 409 e depois 200). r28: avatares de p1 "1 de 2" → os 2. Testes novos: as três corridas (mover, título, membros), o caso de o evento de p2 mexer em outro campo (fica o título de p1, o lugar de p2 e o rev da resposta) e a resposta sem mutação. |
| 2 | média: soltar falha com 400 quando o vizinho saiu da coluna | `previsao.ts`: `posicaoValida` (a referência ainda está na coluna? senão refaz pela chave numérica prevista, logo depois do último card antes dela) e `posicaoPorChave`. `moverBase` confere no começo e de novo logo antes do POST (os eventos em espera do arraste já entraram no cache), e no `400` com `detalhes.campos.posicao` tenta uma vez pela chave prevista. O Desfazer de "Movida para…" e do concluir mandam a posição de antes como reserva. | r21 (a): "POST 400, servidor Fila" → POST 200, servidor e tela na Bia, no lugar certo. (b) Desfazer: "mover 400, servidor Rafa" → mover 200, servidor Fila. Teste novo de `posicaoValida`. |
| 3 | média: Enter e Espaço vão para o card sob o mouse com um botão em foco | `teclado/despachar.ts`: `EstadoTeclado.emControle`; com ele, atalho de uma tecla Enter ou Espaço (com ou sem Shift, sem Ctrl/Cmd/Alt) não dispara. `Despachante.tsx` marca `emControle` para botão, link, `summary`, `select`, caixas, rádios, `[role=button\|link\|menuitem*\|tab\|checkbox\|switch\|radio\|option]` e o cabeçalho arrastável da coluna (o card não conta: Enter nele abre). Vale também dentro do modal. | r11: Enter em "Só as minhas" → abria /d/103, agora alterna (`aria-pressed` true); Espaço → punha membro, agora alterna o botão e o membro não muda; Enter no link /q/social → vai para /q/social. Teste novo no despachante. |
| 4 | média: card pego pelo teclado fica preso quando a pessoa vai para o mouse | `LayoutQuadro.tsx`: durante um arraste começado pelo teclado, `pointerdown` em qualquer lugar cancela (`cancelarArrasteEmAndamento()` em `quadro/arrastar.ts`: os sensores do dnd-kit cancelam com `visibilitychange` na janela) e o clique logo depois não abre o card (`CardDemanda` também ignora clique com `data-arrastando`). O `DragOverlay` fica em z 55, abaixo dos popovers e do modal. | r23: depois do clique, "arrastando card, overlay, url /d/101" → nada arrastando, url /q/criacao; o movimento de p2 aparece; Ctrl+K abre a paleta. r24: um Esc basta. |
| 5 | baixa: no dev, "Sem conexão" só depois de ~44 s | Pedido 2 (acima). | r10: 43,8 s → 4,4 s; mover offline: "O servidor não respondeu como deveria" → "Sem conexão com o servidor… Tentar de novo". |
| 6 | baixa: "+ Adicionar coluna" fecha depois da primeira coluna | O aberto/fechado do `NovaColuna` passa a ser do layout: o do estado vazio e o do fim do quadro são o mesmo estado, então o do fim nasce aberto e com o foco no campo. | r32: depois do 1º Enter no quadro vazio, "campo fechado, foco no BODY, 'Dois' perdido" → campo aberto e focado, servidor ["Um","Dois"]. |
| 7 | baixa: Ctrl+K com a paleta aberta não fecha | `Paleta.tsx`: Cmd/Ctrl+K dentro da paleta fecha (antes de o cmdk usar o Ctrl+K como "subir"). | r12: 2º Ctrl+K → paleta fechada. |

Também: as etiquetas clicáveis do card saíram da ordem do Tab (`ChipEtiqueta` aceita `tabIndex`; o card usa -1). A
auditoria nova no quadro mostrou cada etiqueta como uma parada a mais: 120 → 46 paradas no Tab a 1440 px (o teclado
anda de card em card).

## Achados visuais

Medido com o mesmo critério da revisão (cards visíveis a 1440×900): altura **mediana 119 → 88 px** (mín. 62, máx.
112 com título de duas linhas), cards **8/18 → 10/10 px** das bordas da coluna, 0 faixas vazias de selo.

| # | O que foi feito | Commit |
|---|---|---|
| 1 alta: card alto | Etiquetas, cliente e número numa linha só (o número no fim); padding 8/12/9, gap 6, chips de 18 px, avatares de 20 px; sem metas e sem selos de rodapé registrados, os avatares sobem para a linha do topo. 62 px sem rodapé, 88 com prazo e título de uma linha. O catálogo `/dev/ui` usa a mesma marcação. | `c680014` |
| 2 alta: invólucros de selo vazios | O rodapé só existe quando pode ter algo; `.ui-cartao-rodape` sem metas nem avatares e `.cartao-selos-topo:empty` não ocupam espaço (selo que devolve `null` não deixa faixa). | `c680014` |
| 3 alta: card some na coluna no escuro | Token `--surface-card` (`#FFF` / `#222`) e `--border-card` (`#E6E6E6` / `#303030`); colunas do escuro com L 0,185–0,225 e croma perto do limite da gama. Card sobre a coluna 1,03–1,05 → **1,08–1,19:1**; coluna sobre o canvas até 1,16:1. **Parcial:** o `#262626` sugerido deixava o `--text-3` do card em 4,38:1 e as tintas roxo e berinjela abaixo de AA; com `#222` o `--text-3` fica em 4,61:1 e as tintas roxo e berinjela do escuro subiram um pouco (`#A378C9`, `#9384A5`). | `f778cde` |
| 4 média: cores de coluna parecidas | Claro e escuro separados pela claridade e pelo croma, na matiz da marca: rosa × magenta 0,013 → 0,029 (claro) / 0,031 (escuro); roxo × berinjela 0,019 → 0,049 / 0,043; âmbar × amarelo 0,026 → 0,036 / 0,011 → 0,033 (ΔE OKLab). Os valores claros são os da revisão; `--text-2` na coluna fica em 6,3:1 ou mais. | `f778cde` |
| 5 média: colunas somem nos fundos coloridos | Fora do fundo liso: contorno inset de 30% da cor da coluna e sombra leve (`--shadow-c1`). | `c680014` |
| 6 média: cards descentrados e barra sempre visível | A lista reserva a calha e completa com padding até 10 px dos dois lados: a largura real da calha é medida pelo quadro (`--calha-rolagem`, 0 com barras sobrepostas como no macOS, onde o padding cobre). A barra só aparece com o mouse ou o foco na coluna. O ponto do título alinha com o texto dos cards (23 px). | `c680014` |
| 7 média: algarismos de estilo antigo | `font-feature-settings: "lnum"` no `body` (o atalho `font:` usado nos componentes zera o `font-variant-numeric`, não esta propriedade) e `lining-nums tabular-nums` onde já era tabular. | `4a51d25` |
| 8 média: estados de arrastar | (a) a cópia sem o lápis; (b) a coluna de destino ganha `data-alvo` no `<section>` (a coluna onde a ordem local já pôs o card) com contorno de acento a 55%; (c) o lugar do card vira vaga tracejada sem o texto; (d) a coluna arrastada fica a .45 com contorno tracejado e a cópia leva o cabeçalho, o contador e os 4 primeiros cards na largura dela; (e) a cópia levanta numa animação curta e, ao soltar, pousa desfazendo o giro (`sideEffects` da animação de soltar). | `c680014` |
| 9 média: hierarquia do modal | Título 22/28 (18 no celular); títulos do Markdown no modal 16/15/14; lateral num painel (`--surface-sunken` a 55%, raio 14, preso ao rolar) em duas colunas com ícone e rótulo de 12 px sem caixa alta; sem as etiquetas repetidas; "Concluída" como pílula (o checkbox nativo continua por baixo; verde quando marcada). | `0e53d18` |
| 10 média: celular, fechar some ao rolar | Barra de ações (Concluída, ações, ···, fechar) própria, numa grade com áreas; no celular a janela tem a altura da tela, quem rola é o corpo e a barra fica presa no topo (medido: rolado 655 px, barra em y 0, fechar visível). O resumo vem antes da descrição. O foco entra no próprio modal (`data-autofocus` na raiz): Espaço, J/K e ←/→ valem de cara; Tab leva aos controles. | `0e53d18` |
| 11 média: faixa de colunas no celular | **Recusado aqui:** é do F6 (`quadro-cabecalho/lista-colunas-celular`, PLANO §3 e §4). O núcleo já entrega `useRolarParaColuna()` e cada coluna tem `section[data-coluna-id]` para o observador do chip ativo. A especificação da revisão vai como aviso ao F6 (abaixo). | — |
| 12 baixa: vidro no modal de leitura | Janela do modal da demanda sólida (`--surface-raised`) e scrim de leitura (`--overlay-leitura`, .48 no claro). O vidro continua nos popovers, menus, paleta e diálogos. A recusa da Onda 1 era sobre o Modal genérico; aqui é só o modal de texto longo. | `0e53d18` |
| 13 baixa: cliente e etiqueta com a mesma forma | No card o cliente é texto com ponto na tinta da cor (par novo no contraste.ts: `--label-<cor>-ink` sobre `--surface-card`); a etiqueta continua pílula. | `c680014` |
| 14 baixa: lista cortada seca | Degradê de 8 px no fim da lista (com 12 px de respiro, o anel de foco do último card não entra nele). | `c680014` |
| 15 baixa: cabeçalho no celular e descrição | No celular o ··· vai para o canto da segunda linha (classe `quadro-mais`); a descrição do quadro aparece sob o cabeçalho quando há. | `c680014` |
| 16 baixa: sem laranja de ação no quadro | Integração com o F4 e o F6 (avisos abaixo). | — |
| 17 baixa: ícone embolado e concluída repetida | Prazo em dia com `Calendar`; numa coluna `concluida` o card não desenha o círculo verde (o "Entregue em…" basta). | `c680014` |
| 18 baixa: exemplos no DEV | Pedido 1 (acima). | `8039afb` |

Fora deste relatório, como a revisão já marcou: `/inicio` (F3) e a paleta achar demanda pelo número (F4).

## Estado final (regra 8, na raiz)

- `npx tsc --noEmit -p server` e `-p web`: sem erros.
- `npm test`: 242 de 242 (eram 235; 7 testes novos: corridas do cache, `posicaoValida`, Enter/Espaço em controle).
  Uma única falha intermitente apareceu na primeira execução desta sessão (`actual: true, expected: false`, sem o
  nome do teste na saída cortada); não se repetiu em 8 execuções seguidas, inclusive com dois `tsc` em paralelo.
- `node server/scripts/verificar-migracoes.ts`: 420 checagens, 0 falhas.
- `npm run build`: ok, sem aviso de chunk.
- `npm run contraste --workspace web`: 276 pares, 0 abaixo do mínimo (menor razão de texto 4,61 claro / 4,60 escuro).
- `npm run auditoria --workspace web -- --url http://localhost:5199 --paginas /q/criacao,/d/32` com login: 0
  problemas nas 20 passagens (`/dev/ui`, casca, menu do avatar, quadro com 500 cards e modal; claro e escuro; 1440 e
  390 px).
- Produção (build servido pelo Node, CSP real, 500 cards na Criação): `/q/criacao` com os 500 cards no DOM em
  741–857 ms (4 medidas); arraste de 40 passos com o pior quadro de 35 ms e nenhuma tarefa longa; 0 violações de CSP
  e console limpo.
- Roteiros da revisão de novo, todos certos: r08, r10, r11, r12, r13 (modal e histórico), r21, r23, r24, r26 e r27
  (concluir e repetir), r28, r32, e r03/r04 (teclado).
- Capturas finais (build de produção): quadro Criação, Social e Atendimento e o modal, claro e escuro, 1440 e 390,
  mais o modal rolado no celular e o meio de um arraste (card e coluna).

## Avisos para a Onda 3

- **Tokens novos:** `--surface-card` e `--border-card` (o card do quadro e o que imitar um card), `--overlay-leitura`
  (scrim do modal da demanda). Algarismos: o `body` já liga `lnum`; contador e data usam `lining-nums tabular-nums`.
- **Card (`CardDemanda`):** etiquetas, cliente e número ficam numa linha. Selos `topo` vão acima dela e selos
  `rodape` dentro de `.ui-cartao-metas`; um selo sem nada a mostrar devolve `null` (o invólucro vazio some pelo CSS).
  Com selos de rodapé registrados (F1 cronômetro, F2 versão), os avatares ficam no rodapé.
- **Modal:** grade com as áreas `barra`, `capa`, `topo`, `faixa` e `corpo`; a coluna lateral é um painel. As seções
  laterais do F1 desenham linhas de propriedade (rótulo de 12 px com ícone, valor à direita; as classes
  `.modal-demanda-resumo` e `.modal-demanda-campo` do resumo do núcleo servem de referência), sem caixa alta
  empilhada. O foco inicial é o próprio modal: não ponha `data-autofocus` dentro das seções.
- **Atalhos:** Enter e Espaço de uma tecla não disparam com botão, link, aba ou caixa em foco (vale para os atalhos
  das funcionalidades também); as outras teclas continuam.
- **Erros de rede:** 502/503/504 sem o corpo de erro da API chegam como `ErroDaApi` com status 0 e código `rede`.
- **Arrastar:** `cancelarArrasteEmAndamento()` (`quadro/arrastar.ts`) cancela qualquer arraste como o Esc.
- **F6 — faixa de colunas no celular** (achado visual 11): só abaixo de 768 px, presa sob o cabeçalho;
  `display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 8px 16px 0; scroll-padding-inline: 16px`;
  chips de 32 px com o ponto, o nome e o contador; o ativo em `--accent-soft`/`--accent-ink` com contorno de 35% do
  acento; toque chama `useRolarParaColuna()(id)`; o ativo vem de um `IntersectionObserver` (threshold .6) sobre os
  `section[data-coluna-id]`. Junto, o pedido 3 do NÚCLEO-WEB (apagar os layouts de exemplo).
- **F4 e F6 no cabeçalho** (achado visual 16): um único primário laranja no quadro, "Nova demanda" (Shift+N) à
  direita do cabeçalho; "+ Adicionar demanda" em cada coluna pela `entradaColuna()` (o rodapé `.ui-coluna-adicionar`
  já está estilizado); o seletor Quadro | Lista | Calendário logo depois do nome.
- **Pronto:** quem mexe no quadro, no card ou no modal roda a auditoria com `--paginas /q/criacao,/d/<número>`
  (PLANO §0, regra 8).

## Commits

`1e88577` corrida do cache e vizinho perdido · `6e866c6` Enter/Espaço em controle · `8382627` Ctrl+K fecha a paleta ·
`7f5607d` arraste do teclado e nova coluna · `8039afb` pedidos 1 e 2 · `f778cde` tokens de coluna e card ·
`4a51d25` lnum · `c680014` card, colunas e arraste · `0e53d18` modal · `3f46ecc` auditoria com `--paginas` ·
`4d1a571` etiquetas fora do Tab.
