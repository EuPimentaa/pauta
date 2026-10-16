# Pedidos do F1 · MODAL (Onda 3)

Mudanças em arquivos de outros donos que o modal completo precisa. Nada aqui bloqueia o merge: cada item diz o
contorno em uso.

## 1. Popover e menu abertos sobre um modal ficam atrás dele (DESIGN-SYSTEM-WEB · `web/src/estilos/tokens.css` ou `sobreposicoes.css`)

**Pedido:** a camada aberta depois de um modal tem de ficar acima dele. Hoje `.ui-popover` usa `--z-popover` (60) e
`.ui-modal-posicao`/`.ui-scrim` usam `--z-modal` (70); como as duas vão para `#pauta-camadas`, todo popover, menu ou
lista aberto de dentro de um modal fica **por trás** dele. Duas saídas, qualquer uma serve:
- regra em `sobreposicoes.css`: `.ui-modal-posicao ~ .ui-popover { z-index: calc(var(--z-modal) + 1); }`; ou
- `--z-popover` acima de `--z-modal` (popover nunca abre por baixo de um modal; a folha do celular já usa `--z-modal`).

**Por quê:** afeta o núcleo também. Medido no modal da demanda (`/d/22`, 1440 px): o menu ··· do NÚCLEO-WEB abria
com `z-index: 60` atrás da janela (`z-index: 70`) e não aparecia; o mesmo com os seletores do painel lateral
(membros, etiquetas, datas, capa), o `Combobox` e o `SeletorData` dentro de qualquer modal.

**Contorno em uso:** a primeira regra acima, em `web/src/funcionalidades/modal/cronometro.css` (viaja com o registro,
então vale desde a primeira abertura do modal). Com o pedido feito, apagar o bloco marcado "Contorno" de lá.

## 2. `Checkbox` sem texto: o ícone come o clique no meio da caixa (DESIGN-SYSTEM-WEB · `web/src/estilos/componentes.css`)

**Pedido:** `.ui-check-caixa svg { pointer-events: none; }`.

**Por quê:** sem `children` o `Checkbox` é só a `span.ui-check-caixa` (não é `label`); o `svg` do check fica por
cima do `input` invisível e recebe o clique no centro da caixa, que então não marca nada (`elementFromPoint` no
centro devolve o `svg`). Com texto o `label` resolve, por isso a pílula "Concluída" não sofre.

**Contorno em uso:** `.mdl-item .ui-check-caixa svg { pointer-events: none; }` em `web/src/funcionalidades/modal/modal.css`
(os itens do checklist).

## 3. Esc no título do modal fecha o modal inteiro (NÚCLEO-WEB · `web/src/demanda/ModalDemanda.tsx`)

**Pedido:** enquanto o título está em edição, registrar o campo como camada (`useCamada(editando, { aoEsc: cancelar })`,
de `web/src/lib/camadas.ts`), em vez do `onKeyDown` com `stopPropagation`.

**Por quê:** as camadas do DS escutam o Esc na captura da janela, antes de qualquer campo; o `stopPropagation` do
`textarea` chega tarde. Medido: clicar no título, apertar Esc → o modal fecha e a URL volta para `/q/criacao` (o
esperado é só sair da edição do título).

**Contorno no F1:** os campos que editam no lugar (itens e títulos de checklist, descrição, compositor e edição de
comentário, nome de anexo, "Link ou caminho") usam `useEscLocal()` (`web/src/funcionalidades/modal/comum.tsx`), que
faz exatamente isso. O título é do núcleo e segue com o problema.

## 4. O topo do modal mostra a coluna e o quadro de quando o detalhe foi lido (NÚCLEO-WEB · `web/src/demanda/ModalDemanda.tsx`)

**Pedido:** em `ConteudoModal`, montar o contexto com o quadro e a coluna do bootstrap quando a demanda está nele
(`detalhe.quadro`/`detalhe.coluna` só para a demanda fora do bootstrap), ou invalidar `['demanda', numero]` quando
`quadroId`/`colunaId` mudam.

**Por quê:** `montarContextoDemanda(boot, demanda, { quadro: detalhe?.quadro, coluna: detalhe?.coluna })` dá
preferência ao que veio do detalhe, que não muda com o mover. Medido: com o modal aberto, "Mover para…" levou a #125
para Social › Fila e o topo continuou "na coluna Fila do quadro Criação" (e o `ctx.quadro` das seções também). O
mesmo acontece ao arrastar um card e abrir o modal antes de o detalhe ficar velho (30 s), e quando a automação do
"Concluída" move a demanda.

**Contorno no F1:** a seção Descrição busca o detalhe de novo quando o quadro ou a coluna dele não batem com os da
demanda; o painel lateral usa `demanda.quadroId` e a coluna do bootstrap.

## Avisos (não são pedidos)

- **Painel lateral:** as linhas do F1 são filhas diretas de `.modal-demanda-lateral` (que tem `gap: 20px` para seções
  grandes). O `modal.css` do F1 fecha o espaço só quando há linhas do F1 (`.modal-demanda-lateral:has(> .mdl-prop)`).
- **Respostas sem forma no contrato:** `PATCH /api/checklists/:id` devolve `200 ChecklistComItens` e `DELETE /api/checklists/:id`
  emite também o `delete` de cada item (os tratadores do F1 tiram o checklist e os itens do detalhe aberto).
- **F3 (`GET /api/notificacoes`):** o roteiro do F1 conferiu a notificação de menção pela tabela `notificacao` (a rota
  é do F3 e não está nesta worktree). Os resumos saem como "Rafa mencionou você em #12 Carrossel: “trecho…”".
- **Tela `/horas` (F3):** o diálogo `lancar-tempo` só precisa de `{ demandaId }`; ele lança para quem está logado e
  atualiza `minutosRegistrados` do card e o "meu tempo" do detalhe aberto.
- **Atalhos do F1:** M, L, D, T e Shift+M nos escopos `card` e `modal`. Nenhuma outra funcionalidade deve usar essas
  teclas nesses escopos (C continua livre: no Trello ela arquiva).
