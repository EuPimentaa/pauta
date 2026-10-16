# Pedidos da ENTRADA (F4, Onda 3)

Mudanças em arquivos de outros donos que a Entrada precisa. Nada aqui bloqueia: cada item diz o contorno em uso.

## 1. O "placeholder" do editor fica por cima do texto trocado de fora (DESIGN-SYSTEM-WEB · `web/src/ui/editor/EditorInterno.tsx`)

**Pedido:** recalcular `vazio` depois do `setContent` do efeito "valor trocado de fora" (um estado `vazio` atualizado
no `onUpdate` e também logo depois do `setContent`, ou forçar um render ao trocar o conteúdo).

**Por quê:** `const vazio = editor?.isEmpty ?? !valor` é lido no render em que o `valor` novo chega, mas o
`setContent(…, { emitUpdate: false })` só roda no efeito, depois desse render, e não provoca outro. Quem troca o
`valor` de um editor vazio (a Nova demanda põe o briefing do modelo e a conversa colada; a mescla do 409 do modal,
com a descrição vazia antes) vê o texto de ajuda por cima da primeira linha até a próxima tecla. Reproduzir: um
`EditorMarkdown` montado com `valor=""` que depois recebe um Markdown pela prop (visto na Nova demanda antes do
contorno: escolher o modelo Post com a descrição vazia).

**Contorno em uso:** a Nova demanda monta o `EditorMarkdown` de novo (`key`) quando ela mesma troca a descrição
(`versaoDescricao` em `web/src/funcionalidades/entrada/NovaDemanda.tsx`). Com o pedido feito, o `key` pode sair.

## 2. Texto da busca vazia da paleta (NÚCLEO-WEB · `web/src/paleta/Paleta.tsx`)

**Pedido:** no estado vazio da paleta com termo, usar o texto da PLANO §4.1: `Nada encontrado para "termo". Tente a
sigla do cliente ou o número.` (hoje: `Nada encontrado para "termo".`).

**Por quê:** a §4.1 dá o texto à Entrada, mas o estado vazio da paleta inteira é do núcleo.

**Contorno em uso:** a fonte Demandas (`extensoes/busca/entrada-demandas.ts`) devolve uma linha com esse texto
quando a busca não acha demanda e nenhuma outra fonte (quadros, clientes, pessoas) casa o termo; assim o estado
vazio do núcleo não chega a aparecer. Com o pedido feito, essa linha pode sair.

## Avisos (não são pedidos)

- **F5 · diálogo `criar-cliente`:** a Nova demanda (cliente, sigla da conversa) e a criação rápida (sigla nova no
  rodapé da coluna) abrem `abrirDialogo('criar-cliente', { sigla })` (ou `{ nome }` quando o que foi digitado é um
  nome) e esperam `{ cliente }` de volta: o cliente entra direto no campo (a Nova demanda guarda o `ClienteResumo`
  devolvido mesmo antes de ele chegar ao bootstrap). Até o merge do F5, o host mostra "Disponível em breve".
- **Botão laranja:** o "+ Nova demanda" fica na barra superior, à direita (`topo/entrada-nova`, ordem 100, PLANO §4),
  e é o único primário da casca, inclusive no quadro (o "+ Adicionar demanda" de cada coluna é a criação rápida). A
  Entrada não põe outro botão no cabeçalho do quadro (INTEGRACAO-2, achado visual 16).
- **Prazo pela conversa:** além do que `AnaliseTexto` traz, a Nova demanda lê "até sexta", "para amanhã" e "entrega
  dia 24/10" na conversa colada (`prazoDaConversa` em `shared/logica/colar-whatsapp.ts`, puro, no front) e sugere esse
  prazo no lugar do prazo do modelo. Não muda o contrato da rota.
